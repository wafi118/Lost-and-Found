'use strict';
// Pages that need a script or stylesheet must actually reference it (a view once passed its
// scripts to the wrong include and they silently never loaded), and everything a page
// references must exist.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, Client, signedIn } = require('./helpers');

const NEEDS = [
  ['student', '/report', { scripts: ['/js/dropzone.js', '/js/wizard.js', '/js/report-form.js'], styles: [] }],
  ['student', '/track', { scripts: ['/js/live-filter.js'], styles: [] }],
  ['student', '/items/SF-2026-0009/claim', { scripts: ['/js/dropzone.js'], styles: [] }],
  ['security', '/security/queue', { scripts: ['/js/live-filter.js'], styles: [] }],
  ['security', '/security/intake', { scripts: ['/js/dropzone.js'], styles: [] }],
  ['security', '/security/handover', { scripts: ['/vendor/jsqr.js', '/js/handover-scanner.js'], styles: [] }],
  ['admin', '/admin/analytics', { scripts: ['/vendor/chart.js', '/vendor/leaflet/leaflet.js', '/js/analytics.js'], styles: ['/vendor/leaflet/leaflet.css'] }]
];

test('pages load the scripts and styles they need, libraries before the code that uses them', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  for (const [who, url, need] of NEEDS) {
    const html = (await (await signedIn(srv.base, who)).get(url)).text;
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(scripts.includes('/js/site.js'), `${url}: site.js`);
    for (const s of need.scripts) assert.ok(scripts.includes(s), `${url} must load ${s}, but loads: ${scripts.join(', ')}`);
    need.scripts.slice(1).forEach((s, i) => assert.ok(scripts.indexOf(need.scripts[i]) < scripts.indexOf(s), `${url}: ${need.scripts[i]} must come before ${s}`));
    for (const href of need.styles) assert.ok(html.includes(`href="${href}"`), `${url} must link ${href}`);
  }
  // The ID card form uses the photo uploader and nothing else extra; the other registration form needs no script.
  const regScripts = (html) => [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(regScripts((await new Client(srv.base).get('/auth/register/id-card')).text).includes('/js/dropzone.js'));
  assert.ok(!regScripts((await new Client(srv.base).get('/auth/register')).text).includes('/js/dropzone.js'));
  // The administrator only reads the handover desk, so the camera scanner is not loaded for them.
  const adminDesk = (await (await signedIn(srv.base, 'admin')).get('/security/handover')).text;
  assert.ok(!adminDesk.includes('handover-scanner.js') && !adminDesk.includes('jsqr'));
  // Pages that need nothing extra load nothing extra. Signed-in pages add only the live-alert pair
  // (the Socket.io client, then our code); a visitor who is not signed in gets no socket code at all.
  const scriptsOf = (html) => [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  const plain = (await (await signedIn(srv.base, 'student')).get('/dashboard')).text;
  assert.deepEqual(scriptsOf(plain), ['/js/theme-init.js', '/js/site.js', '/socket.io/socket.io.js', '/js/realtime.js']);
  assert.deepEqual(scriptsOf((await new Client(srv.base).get('/about')).text), ['/js/theme-init.js', '/js/site.js']);
  // The home page adds its one small script; a visitor still gets no socket code.
  assert.deepEqual(scriptsOf((await new Client(srv.base).get('/')).text), ['/js/theme-init.js', '/js/site.js', '/js/home.js']);
  // The public board needs only the live filter.
  assert.deepEqual(scriptsOf((await new Client(srv.base).get('/browse')).text), ['/js/theme-init.js', '/js/site.js', '/js/live-filter.js']);
});

test('every local script, stylesheet, image and font that a page uses can be fetched, and every icon exists', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const anon = new Client(srv.base);
  const pages = {
    anon: ['/', '/browse', '/about', '/auth/login', '/auth/register', '/auth/register/id-card', '/auth/forgot', '/items/SF-2026-0009', '/nope'],
    student: ['/dashboard', '/report', '/track', '/claims', '/notifications', '/account', '/items/SF-2026-0001', '/items/SF-2026-0009/claim'],
    security: ['/security', '/security/queue', '/security/records', '/security/inventory', '/security/intake', '/security/matches', '/security/claims', '/security/handover', '/security/handover/history', '/security/unclaimed'],
    approver: ['/approver', '/approver/cases/SF-2026-0003'],
    admin: ['/admin', '/admin/users', '/admin/id-reviews', '/admin/categories', '/admin/locations', '/admin/settings', '/admin/analytics', '/admin/audit', '/security/records', '/security/handover/history']
  };
  const local = new Set();
  for (const [who, list] of Object.entries(pages)) {
    const c = who === 'anon' ? anon : await signedIn(srv.base, who);
    for (const url of list) {
      const html = (await c.get(url)).text;
      for (const m of html.matchAll(/\b(?:src|href)="(\/(?:css|js|vendor|images)\/[^"?#]+)"/g)) local.add(m[1]);
      const symbols = new Set([...html.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
      for (const m of html.matchAll(/<use href="#([^"]+)"/g)) assert.ok(symbols.has(m[1]), `${url}: icon ${m[1]} has no symbol`);
    }
  }
  assert.ok(local.size >= 8, `only ${local.size} assets found`);

  // Fonts and background images are named inside the stylesheets, not in the HTML.
  const css = ['/css/style.css', '/vendor/leaflet/leaflet.css'];
  for (const sheet of css) {
    const text = (await anon.get(sheet)).text;
    for (const m of text.matchAll(/url\(\s*['"]?([^)'"]+?)['"]?\s*\)/g)) {
      if (/^(data:|https?:|#)/.test(m[1])) continue;
      local.add(new URL(m[1].split(/[?#]/)[0], `http://x${sheet}`).pathname);
    }
  }
  const types = { '.js': /javascript/, '.css': /css/, '.png': /image\/png/, '.jpg': /image\/jpeg/, '.svg': /image\/svg/, '.woff2': /font\/woff2|application\/font-woff2|octet-stream/ };
  for (const path of local) {
    const res = await anon.get(path, { raw: true });
    assert.equal(res.status, 200, `${path} -> ${res.status}`);
    assert.ok(res.buffer.length > 100, `${path} is empty`);
    const ext = path.slice(path.lastIndexOf('.'));
    if (types[ext]) assert.match(res.headers.get('content-type') || '', types[ext], `${path} content-type`);
  }
});

test('the stylesheet lets the hidden attribute win over any display rule', () => {
  // .flash and .btn set display, which would otherwise keep a hidden approval note and a hidden
  // "stop camera" button on screen. This was found by looking at the rendered pages.
  const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'css', 'style.css'), 'utf8');
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
});
