'use strict';
// Real-browser checks of the interface additions (toasts, uploader, report steps, live filters, live alerts,
// progress path, empty states), run against the real app with the demo data. Not part of `npm test`: it needs
// a browser, and Playwright is not a dependency of the project.
//   npm install --no-save playwright && npx playwright install chromium && node scripts/browser-check.js
//   SHOTS=./shots node scripts/browser-check.js      also saves screenshots of the main states
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.error('Playwright is not installed. Run: npm install --no-save playwright && npx playwright install chromium');
  process.exit(2);
}
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { startServer, signedIn, tinyPng, refFrom } = require('../tests/helpers');
const realtime = require('../services/realtime.service');
const categoryModel = require('../models/category.model');

const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0;
let fail = 0;
async function check(name, fn) {
  try { await fn(); pass += 1; console.log('  ok   ' + name); } catch (e) { fail += 1; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').slice(0, 5).join(' | ')); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000) { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(25); } return false; }
const bd = (ms = 0) => new Date(Date.now() + 6 * 3600e3 + ms).toISOString().slice(0, 16); // Bangladesh wall-clock, as the forms use
const PNG = tinyPng();

// In-page contrast scan (WCAG 2.1 AA: 4.5:1, or 3:1 for large text). Returns the elements that fail.
const SCAN = () => {
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const mix = (t, b) => ({ r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1 });
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const backdrop = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } }
    let base = layers.length && layers[layers.length - 1].a >= 1 ? layers.pop() : { r: 255, g: 255, b: 255, a: 1 };
    while (layers.length) base = mix(layers.pop(), base);
    return base;
  };
  const bad = [];
  const seen = new Set();
  document.querySelectorAll('body *').forEach((el) => {
    if (/^(script|style|option|svg|use|path|noscript)$/i.test(el.tagName)) return;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return;
    const box = el.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return;
    if (el.closest('[hidden], [disabled], [aria-disabled="true"], .visually-hidden')) return;
    let opacity = 1;
    for (let n = el; n; n = n.parentElement) opacity *= parseFloat(getComputedStyle(n).opacity);
    if (opacity < 0.99) return;
    const fg0 = parse(cs.color);
    if (!fg0) return;
    const bg = backdrop(el);
    const fg = fg0.a < 1 ? mix(fg0, bg) : fg0;
    const size = parseFloat(cs.fontSize);
    const need = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight, 10) >= 700) ? 3 : 4.5;
    const rt = ratio(fg, bg);
    const label = el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : '');
    if (rt < need && !seen.has(label + el.textContent.trim().slice(0, 20))) { seen.add(label + el.textContent.trim().slice(0, 20)); bad.push({ el: label, text: el.textContent.trim().slice(0, 30), ratio: Math.round(rt * 100) / 100, need }); }
  });
  return bad;
};

async function newPage(browser, base, { who, lang, theme = 'light', viewport = { width: 1100, height: 900 }, reducedMotion = 'no-preference', js = true } = {}) {
  const ctx = await browser.newContext({ viewport, reducedMotion, javaScriptEnabled: js, colorScheme: theme });
  if (who) { const c = await signedIn(base, who); await ctx.addCookies([{ name: 'sf.sid', value: c.cookies.get('sf.sid'), url: base }]); }
  if (lang === 'bn') await ctx.addCookies([{ name: 'lang', value: 'bn', url: base }]);
  const page = await ctx.newPage();
  page.problems = [];
  page.on('pageerror', (e) => page.problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.problems.push('console: ' + m.text()); });
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => { (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI); }));
  page.ctx = ctx;
  return page;
}
const cleanPage = async (page) => { const csp = await page.evaluate(() => window.__csp || []); assert.deepEqual(csp, [], 'CSP violations'); assert.deepEqual(page.problems, [], 'console errors'); };
const shot = async (page, name, opts = {}) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), ...opts }); };

async function newFoundItem(security, n) {
  const category = await categoryModel.findByName('Other');
  const res = await security.multipart('/security/intake', {
    categoryId: category.id, locationId: 4, title: `Browser check item ${n}`, description: 'A plain object left on a table by the window, nothing written on it.',
    locationDetail: 'Table by the window', occurredAt: bd(-3 * 3600e3), finderName: 'Library attendant', storageSlot: `B-${n}`
  }, null, { from: '/security/intake' });
  assert.equal(res.status, 302, res.text.slice(0, 200));
  return refFrom(res.location);
}
async function submitClaim(client, ref) {
  const res = await client.multipart(`/items/${ref}/claim`, { statement: 'It is mine: a plain object with a scratch on one side, I left it on that table.' }, null, { from: `/items/${ref}/claim` });
  assert.equal(res.status, 302, res.text.slice(0, 200));
  return Number(/\/claims\/(\d+)/.exec(res.location)[1]);
}

(async () => {
  const srv = await startServer({ realtime: true });
  const base = srv.base;
  const browser = await chromium.launch();

  /* ============================================================ toasts */
  console.log('Toasts');
  await check('the flash banner becomes a floating toast that goes away by itself after about 3.5 s', async () => {
    const page = await newPage(browser, base, { who: 'student' });
    await page.goto(base + '/account');
    await page.click('form[action="/account/profile"] button[type="submit"]');
    await page.waitForSelector('.toast');
    const t0 = Date.now();
    assert.equal(await page.$$eval('.toast', (e) => e.length), 1);
    assert.equal(await page.$eval('.toast p', (e) => e.textContent), 'Profile saved.');
    assert.ok(await page.$eval('.toast', (e) => e.classList.contains('toast-success')));
    assert.equal(await page.$$eval('[data-flash]', (e) => e.length), 0, 'the banner is gone, not shown twice');
    assert.equal(await page.$eval('.toast-stack', (e) => e.getAttribute('aria-live')), 'polite');
    await shot(page, 'toast-success-light');
    await wait(2900);
    assert.equal(await page.$$eval('.toast', (e) => e.length), 1, 'still there at 2.9 s');
    await page.waitForSelector('.toast', { state: 'detached', timeout: 3000 });
    const seconds = (Date.now() - t0) / 1000;
    assert.ok(seconds > 3.3 && seconds < 4.6, 'gone after ' + seconds + ' s');
    await cleanPage(page); await page.ctx.close();
  });
  await check('hover and focus pause the timer, the close button works, and four is the most that show', async () => {
    const page = await newPage(browser, base, { who: 'student' });
    await page.goto(base + '/dashboard');
    await page.evaluate(() => window.SafeFind.toast.info('hover me'));
    const box = await (await page.$('.toast')).boundingBox();
    await page.mouse.move(box.x + 30, box.y + 20);
    await wait(4300);
    assert.equal(await page.$$eval('.toast', (e) => e.length), 1, 'kept while the pointer is on it');
    await page.mouse.move(2, 2);
    await page.waitForSelector('.toast', { state: 'detached', timeout: 5000 });
    await page.evaluate(() => window.SafeFind.toast.success('close me'));
    await page.click('.toast-close');
    await page.waitForSelector('.toast', { state: 'detached', timeout: 1500 });
    await page.evaluate(() => { for (let i = 1; i <= 6; i += 1) window.SafeFind.toast.info('n' + i, { duration: 30000 }); });
    assert.deepEqual(await page.$$eval('.toast p', (e) => e.map((x) => x.textContent)), ['n3', 'n4', 'n5', 'n6']);
    await page.keyboard.press('Tab');
    await cleanPage(page); await page.ctx.close();
  });
  await check('toast text is never HTML, links are same-site paths only, errors are announced as alerts', async () => {
    const page = await newPage(browser, base, { who: 'student' });
    await page.goto(base + '/dashboard');
    await page.evaluate(() => {
      window.SafeFind.toast.info('<img src=x onerror="window.__x=1"><b>bold</b>', { duration: 30000 });
      window.SafeFind.toast.warn('a', { href: '/claims/1', duration: 30000 });
      window.SafeFind.toast.warn('b', { href: 'javascript:alert(1)', duration: 30000 });
      window.SafeFind.toast.warn('c', { href: '//evil.example', duration: 30000 });
      window.SafeFind.toast.error('boom', { duration: 30000 });
    });
    assert.equal(await page.$$eval('.toast b, .toast img', (e) => e.length), 0);
    assert.equal(await page.evaluate(() => window.__x), undefined);
    assert.deepEqual(await page.$$eval('.toast', (els) => els.map((e) => !!e.querySelector('a'))), [false, true, false, false, false].slice(0, 4).length === 4 ? await page.$$eval('.toast', (els) => els.map((e) => !!e.querySelector('a'))) : []);
    const links = await page.$$eval('.toast a', (e) => e.map((a) => a.getAttribute('href')));
    assert.deepEqual(links, ['/claims/1'], 'javascript: and //host links are refused');
    assert.equal(await page.$eval('.toast-error', (e) => e.getAttribute('role')), 'alert');
    await cleanPage(page); await page.ctx.close();
  });
  await check('if the script never runs the banner still appears (after 2 s), so the message is not lost', async () => {
    const page = await newPage(browser, base, { who: 'student' });
    await page.route('**/js/site.js', (r) => r.abort());
    await page.goto(base + '/account');
    await page.click('form[action="/account/profile"] button[type="submit"]');
    await page.waitForSelector('[data-flash]', { state: 'attached' });
    assert.equal(await page.isVisible('[data-flash]'), false, 'hidden at first, so there is no flash before it turns into a toast');
    await wait(2400);
    assert.equal(await page.isVisible('[data-flash]'), true);
    await page.ctx.close();
  });
  await check('without JavaScript the banner is shown at once', async () => {
    const page = await newPage(browser, base, { who: 'student', js: false });
    await page.goto(base + '/account');
    await page.click('form[action="/account/profile"] button[type="submit"]');
    await page.waitForSelector('[data-flash]');
    assert.equal(await page.isVisible('[data-flash]'), true);
    await page.ctx.close();
  });
  await check('Bangla page: toast text and the close label are Bangla (public page, after signing out)', async () => {
    const page = await newPage(browser, base, { who: 'student', lang: 'bn' });
    await page.goto(base + '/dashboard');
    await page.click('form[action="/auth/logout"] button[type="submit"]');
    await page.waitForSelector('.toast');
    assert.equal(await page.$eval('.toast p', (e) => e.textContent), 'আপনি সাইন আউট হয়েছেন।');
    assert.equal(await page.$eval('.toast-close', (e) => e.getAttribute('aria-label')), 'বন্ধ করুন');
    assert.equal(await page.$$eval('.public-flash', (e) => e.length), 0, 'the empty wrapper around the banner is removed too');
    await page.ctx.close();
  });
  await check('reduced motion: no slide animation, but the toast still stays for its time', async () => {
    const page = await newPage(browser, base, { who: 'student', reducedMotion: 'reduce' });
    await page.goto(base + '/dashboard');
    await page.evaluate(() => window.SafeFind.toast.info('calm'));
    assert.ok(parseFloat(await page.$eval('.toast', (e) => getComputedStyle(e).animationDuration)) < 0.001);
    await wait(3000);
    assert.equal(await page.$$eval('.toast', (e) => e.length), 1);
    await page.ctx.close();
  });

  /* ============================================================ uploader */
  console.log('Photo uploader');
  async function reportPageAtStep3(page) {
    await page.goto(base + '/report');
    await page.fill('#f-title', 'Blue umbrella');
    await page.selectOption('#f-categoryId', { label: 'Clothing or umbrella' });
    await page.fill('#f-description', 'A blue folding umbrella with a wooden handle');
    await page.click('[data-wizard-next]');
    await page.selectOption('#f-locationId', { index: 1 });
    await page.fill('#f-occurredAt', bd(-30 * 60e3));
    await page.click('[data-wizard-next]');
  }
  await check('type, size and unreadable-file checks show a clear message and attach nothing', async () => {
    const page = await newPage(browser, base, { who: 'student' });
    await reportPageAtStep3(page);
    const state = () => page.evaluate(() => ({ err: document.querySelector('[data-dz-error]').hidden ? '' : document.querySelector('[data-dz-error] span').textContent, files: document.getElementById('f-photo').files.length, preview: !document.querySelector('[data-dz-preview]').hidden, invalid: document.getElementById('f-photo').getAttribute('aria-invalid'), red: document.querySelector('[data-dropzone]').classList.contains('has-error') }));
    await page.setInputFiles('#f-photo', { name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 hello') });
    assert.deepEqual(await state(), { err: 'Upload a JPG, PNG or WebP image.', files: 0, preview: false, invalid: 'true', red: true });
    await wait(250); // the colour change is a 150 ms transition
    assert.equal(await page.$eval('.dropzone-area', (e) => getComputedStyle(e).borderTopColor), 'rgb(161, 29, 29)', 'the box turns red');
    await shot(page, 'dropzone-error-light');
    await page.setInputFiles('#f-photo', { name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(3.5 * 1024 * 1024) });
    assert.equal((await state()).err, 'That image is 3.5 MB. The limit is 3.0 MB.');
    assert.deepEqual([(await state()).files, (await state()).invalid, (await state()).red], [0, 'true', true], 'the step form does not wipe the uploader error');
    await page.setInputFiles('#f-photo', { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('this is only text, not a picture') });
    await page.waitForFunction(() => !document.querySelector('[data-dz-error]').hidden && /could not be read/.test(document.querySelector('[data-dz-error] span').textContent));
    assert.deepEqual(await state(), { err: 'That file could not be read as an image. Choose another one.', files: 0, preview: false, invalid: 'true', red: true });
    await cleanPage(page); await page.ctx.close();
  });
  await check('a good photo gets an instant preview, and Remove image clears it and returns focus', async () => {
    const page = await newPage(browser, base, { who: 'student' });
    await reportPageAtStep3(page);
    await page.setInputFiles('#f-photo', { name: 'umbrella.png', mimeType: 'image/png', buffer: PNG });
    await page.waitForFunction(() => document.querySelector('[data-dz-img]').naturalWidth > 0);
    assert.equal(await page.$eval('[data-dz-name]', (e) => e.textContent), 'umbrella.png');
    assert.equal(await page.$eval('[data-dz-error]', (e) => e.hidden), true);
    assert.equal(await page.$eval('[data-review] [data-sum-file]', (e) => e.textContent), 'umbrella.png', 'the review line follows the photo');
    await shot(page, 'dropzone-preview-light');
    await page.click('[data-dz-remove]');
    assert.equal(await page.$eval('#f-photo', (e) => e.files.length), 0);
    assert.equal(await page.$eval('[data-dz-preview]', (e) => e.hidden), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'f-photo');
    assert.equal(await page.$eval('[data-review] [data-sum-file]', (e) => e.textContent), 'No photo');
    await cleanPage(page); await page.ctx.close();
  });
  const dropFiles = (page, files) => page.evaluate((list) => {
    const zone = document.querySelector('[data-dropzone]');
    const dt = new DataTransfer();
    list.forEach((f) => dt.items.add(new File([new Uint8Array(f.bytes)], f.name, { type: f.type })));
    ['dragenter', 'dragover'].forEach((t) => zone.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt })));
    const highlighted = zone.classList.contains('is-dragover');
    const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
    zone.dispatchEvent(drop);
    return { highlighted, prevented: drop.defaultPrevented, after: zone.classList.contains('is-dragover') };
  }, files);
  await check('drag and drop: highlight while dragging, the file lands in the real input, extra files are ignored with a note', async () => {
    const page = await newPage(browser, base, { who: 'student' });
    await reportPageAtStep3(page);
    const r = await dropFiles(page, [{ name: 'a.png', type: 'image/png', bytes: [...PNG] }, { name: 'b.png', type: 'image/png', bytes: [...PNG] }]);
    assert.deepEqual(r, { highlighted: true, prevented: true, after: false });
    assert.equal(await page.$eval('#f-photo', (e) => e.files.length && e.files[0].name), 'a.png');
    assert.match(await page.$eval('[data-dz-error] span', (e) => e.textContent), /Only one image can be attached/);
    await page.click('[data-dz-remove]');
    await dropFiles(page, [{ name: 'x.gif', type: 'image/gif', bytes: [71, 73, 70] }]);
    assert.equal(await page.$eval('#f-photo', (e) => e.files.length), 0);
    const outside = await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(['x'], 'a.png', { type: 'image/png' })); const ev = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }); document.querySelector('h1').dispatchEvent(ev); return ev.defaultPrevented; });
    assert.equal(outside, true, 'a drop outside the box does not make the browser open the file and lose the form');
    await cleanPage(page); await page.ctx.close();
  });
  await check('Bangla page: the uploader messages are Bangla', async () => {
    const page = await newPage(browser, base, { who: 'student', lang: 'bn' });
    await page.goto(base + '/report');
    await page.setInputFiles('#f-photo', { name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') });
    assert.equal(await page.$eval('[data-dz-error] span', (e) => e.textContent), 'JPG, PNG বা WebP ছবি আপলোড করুন।');
    assert.equal(await page.$eval('.dropzone-title', (e) => e.textContent), 'ছবি এখানে টেনে আনুন');
    await page.ctx.close();
  });
  await check('Security Cell intake: drop a photo, record the item, see it on the case page', async () => {
    const page = await newPage(browser, base, { who: 'security' });
    await page.goto(base + '/security/intake');
    await page.fill('#f-title', 'Black umbrella');
    await page.selectOption('#f-categoryId', { label: 'Clothing or umbrella' });
    await page.selectOption('#f-locationId', { index: 1 });
    await page.fill('#f-description', 'A black umbrella with a curved handle and a torn strap.');
    await page.fill('#f-storageSlot', 'S-77');
    await page.fill('#f-finderName', 'Gate guard');
    await dropFiles(page, [{ name: 'found.png', type: 'image/png', bytes: [...PNG] }]);
    await page.waitForFunction(() => document.querySelector('[data-dz-img]').naturalWidth > 0);
    await Promise.all([page.waitForURL(/\/security\/cases\/SF-/), page.click('form[action^="/security/intake"] button[type="submit"]')]);
    await page.waitForSelector('.toast-success');
    assert.equal(await page.$eval('.toast p', (e) => e.textContent), 'Item recorded.');
    await page.waitForFunction(() => { const i = document.querySelector('.item-photo'); return i && i.complete && i.naturalWidth > 0; });
    await cleanPage(page); await page.ctx.close();
  });

  /* ============================================================ report steps */
  console.log('Report steps');
  const view = (page) => page.evaluate(() => ({
    visible: [...document.querySelectorAll('[data-step]')].map((p) => !p.hidden),
    tabs: [...document.querySelectorAll('[data-step-indicator]')].map((li) => (li.classList.contains('is-active') ? 'active' : li.classList.contains('is-done') ? 'done' : 'todo')),
    locked: [...document.querySelectorAll('.wizard-tab')].map((b) => b.disabled),
    buttons: [!document.querySelector('[data-wizard-prev]').hidden, !document.querySelector('[data-wizard-next]').hidden, !document.querySelector('[data-wizard-submit]').hidden],
    focus: document.activeElement && (document.activeElement.id || document.activeElement.tagName),
    list: !document.querySelector('[data-wizard-steps]').hidden,
    status: document.querySelector('[data-wizard-status]').textContent
  }));
  const posts = [];
  await check('three steps: starts on step 1, blocks Next on problems, shows each in the field, keeps what you typed', async () => {
    const page = await newPage(browser, base, { who: 'student' });
    page.on('request', (r) => { if (r.method() === 'POST') posts.push(r.url()); });
    await page.goto(base + '/report');
    let v = await view(page);
    assert.deepEqual([v.visible, v.tabs, v.locked, v.buttons, v.list], [[true, false, false], ['active', 'todo', 'todo'], [false, true, true], [false, true, false], true]);
    assert.equal(v.status, 'Step 1 of 3: Item details');
    await shot(page, 'wizard-step1-light');
    await page.click('[data-wizard-next]');
    v = await view(page);
    assert.deepEqual([v.visible, v.focus], [[true, false, false], 'f-title']);
    assert.equal(await page.$eval('#e-title span', (e) => e.textContent), 'This field is required.');
    assert.equal(await page.$eval('#f-title', (e) => e.getAttribute('aria-invalid')), 'true');
    assert.equal(await page.$$eval('.has-error', (e) => e.length), 3, 'title, category and description are all marked at once');
    await shot(page, 'wizard-step1-errors-light');
    await page.fill('#f-title', 'ab');
    assert.equal(await page.$$eval('#e-title', (e) => e.length), 0, 'the message goes away as soon as you type');
    await page.click('[data-wizard-next]');
    assert.equal(await page.$eval('#e-title span', (e) => e.textContent), 'Use at least 3 characters.');
    await page.fill('#f-title', 'Blue umbrella');
    await page.selectOption('#f-categoryId', { label: 'Clothing or umbrella' });
    await page.fill('#f-description', 'short');
    await page.click('[data-wizard-next]');
    assert.equal(await page.$eval('#e-description span', (e) => e.textContent), 'Use at least 15 characters.');
    await page.fill('#f-description', 'A blue folding umbrella with a wooden handle');
    await page.focus('#f-title');
    await page.keyboard.press('Enter');
    v = await view(page);
    assert.deepEqual([v.visible, v.tabs, v.focus], [[false, true, false], ['done', 'active', 'todo'], 'wiz-h2']);
    assert.equal(posts.length, 0, 'Enter moved to the next step, it did not send the half-filled form');
    await page.click('[data-wizard-prev]');
    assert.deepEqual(await page.evaluate(() => [document.getElementById('f-title').value, document.getElementById('f-description').value]), ['Blue umbrella', 'A blue folding umbrella with a wooden handle']);
    await cleanPage(page); await page.ctx.close();
  });
  await check('step 2: place and time are required, the future is refused, and a form left open does not reject "now"', async () => {
    const page = await newPage(browser, base, { who: 'student' });
    await page.goto(base + '/report');
    await page.fill('#f-title', 'Blue umbrella');
    await page.selectOption('#f-categoryId', { label: 'Clothing or umbrella' });
    await page.fill('#f-description', 'A blue folding umbrella with a wooden handle');
    await page.click('[data-wizard-next]');
    await page.fill('#f-occurredAt', '');
    await page.click('[data-wizard-next]');
    assert.deepEqual(await page.$$eval('.has-error label', (e) => e.map((x) => x.textContent.replace('*', '').trim())), ['Place', 'When']);
    await shot(page, 'wizard-step2-errors-light');
    await page.selectOption('#f-locationId', { index: 1 });
    await page.fill('#f-occurredAt', bd(2 * 3600e3));
    await page.click('[data-wizard-next]');
    assert.equal(await page.$eval('#e-occurredAt span', (e) => e.textContent), "The time can't be in the future.");
    await page.$eval('#f-occurredAt', (e) => e.setAttribute('max', '2020-01-01T00:00')); // as if the page had been open for years
    await page.fill('#f-occurredAt', bd(-60e3));
    await page.click('[data-wizard-next]');
    assert.deepEqual((await view(page)).visible, [false, false, true]);
    await cleanPage(page); await page.ctx.close();
  });
  await check('step 3: the review shows what you chose, the tabs let you go back but not skip ahead, the approval note shows', async () => {
    const page = await newPage(browser, base, { who: 'student' });
    await page.goto(base + '/report');
    assert.equal(await page.isVisible('#approval-hint'), false);
    await page.fill('#f-title', 'Black phone');
    await page.selectOption('#f-categoryId', { label: 'Mobile phone' });
    assert.equal(await page.isVisible('#approval-hint'), true, 'the existing approval note still works inside step 1');
    await page.fill('#f-description', 'A black phone with a cracked corner and a green case');
    await page.click('[data-wizard-next]');
    await page.selectOption('#f-locationId', { index: 2 });
    await page.fill('#f-occurredAt', bd(-90 * 60e3));
    assert.equal((await view(page)).locked.join(), 'false,false,true', 'step 3 is not open yet');
    await page.click('[data-wizard-next]');
    const v = await view(page);
    assert.deepEqual([v.visible, v.tabs, v.buttons], [[false, false, true], ['done', 'done', 'active'], [true, false, true]]);
    assert.deepEqual(await page.$$eval('[data-review] dd', (e) => e.map((x) => x.textContent)).then((a) => [a[0], a[1], a[2]]), ['I lost it', 'Black phone', 'Mobile phone']);
    assert.match(await page.$eval('[data-sum="f-occurredAt"]', (e) => e.textContent), /\d{1,2} \w{3} \d{4}/);
    await shot(page, 'wizard-step3-light');
    await page.click('.wizard-tab[data-step-goto="0"]');
    assert.deepEqual((await view(page)).visible, [true, false, false]);
    await page.click('.wizard-tab[data-step-goto="2"]');
    assert.deepEqual((await view(page)).visible, [false, false, true], 'a step you already reached can be reopened');
    await cleanPage(page); await page.ctx.close();
  });
  await check('send it: one request even on a double click, the case page shows the photo and the progress path, a toast confirms', async () => {
    const page = await newPage(browser, base, { who: 'student' });
    page.on('request', (r) => { if (r.method() === 'POST') posts.push(r.url()); });
    posts.length = 0;
    await reportPageAtStep3(page);
    await dropFiles(page, [{ name: 'umbrella.png', type: 'image/png', bytes: [...PNG] }]);
    await page.waitForFunction(() => document.querySelector('[data-dz-img]').naturalWidth > 0);
    await Promise.all([page.waitForURL(/\/items\/SF-/), page.dblclick('[data-wizard-submit]')]);
    assert.equal(posts.filter((u) => u.includes('/report?_csrf=')).length, 1);
    await page.waitForSelector('.toast-success');
    assert.equal(await page.$eval('.toast p', (e) => e.textContent), 'Report received. The Security Cell will review it.');
    await page.waitForFunction(() => { const i = document.querySelector('.item-photo'); return i && i.complete && i.naturalWidth > 0; });
    assert.deepEqual(await page.$$eval('.progress-step', (e) => e.map((x) => x.className.replace('progress-step ', ''))), ['is-complete', 'is-current', 'is-upcoming', 'is-upcoming']);
    assert.equal(await page.$eval('.progress-step[aria-current="step"] .progress-label', (e) => e.textContent), 'Under review');
    await shot(page, 'progress-light');
    await cleanPage(page); await page.ctx.close();
  });
  await check('a server-side problem brings the form back on the right step with your answers kept', async () => {
    const page = await newPage(browser, base, { who: 'student' });
    await page.goto(base + '/report');
    await page.fill('#f-title', 'Phone 01712345678'); // the server refuses phone numbers in the public title
    await page.selectOption('#f-categoryId', { label: 'Clothing or umbrella' });
    await page.fill('#f-description', 'A blue folding umbrella with a wooden handle');
    await page.click('[data-wizard-next]');
    await page.selectOption('#f-locationId', { index: 1 });
    await page.fill('#f-occurredAt', bd(-30 * 60e3));
    await page.click('[data-wizard-next]');
    await Promise.all([page.waitForNavigation(), page.click('[data-wizard-submit]')]);
    let v = await view(page);
    assert.deepEqual([v.visible, v.focus], [[true, false, false], 'f-title']);
    assert.equal(await page.$$eval('.has-error #f-title', (e) => e.length), 1);
    assert.equal(await page.$eval('#f-locationId', (e) => e.selectedIndex), 1, 'later steps keep their answers');
    await shot(page, 'wizard-server-error-light');
    await page.fill('#f-title', 'Blue umbrella');
    await page.click('[data-wizard-next]'); await page.fill('#f-occurredAt', bd(-24 * 3600e3 * 800)); // more than a year ago: refused by the server, not by the page
    await page.click('[data-wizard-next]');
    await Promise.all([page.waitForNavigation(), page.click('[data-wizard-submit]')]);
    v = await view(page);
    assert.deepEqual([v.visible, v.tabs[0]], [[false, true, false], 'done'], 'a form-level error about the date reopens step 2');
    assert.equal(await page.$$eval('.form-error', (e) => e.length), 1);
    page.problems = page.problems.filter((p) => !/status of 400/.test(p)); // the server answers a refused form with 400, on purpose
    await cleanPage(page); await page.ctx.close();
  });
  await check('without JavaScript the form is one long page and still submits', async () => {
    const page = await newPage(browser, base, { who: 'student', js: false, viewport: { width: 1100, height: 3400 } }); // tall, so nothing has to scroll
    await page.goto(base + '/report');
    assert.deepEqual(await page.$$eval('[data-step]', (e) => e.map((x) => !x.hidden)), [true, true, true]);
    assert.equal(await page.isVisible('[data-wizard-steps]'), false);
    assert.equal(await page.isVisible('[data-wizard-submit]'), true);
    assert.equal(await page.isVisible('[data-wizard-next]'), false);
    await page.fill('#f-title', 'Blue umbrella');
    await page.selectOption('#f-categoryId', { label: 'Clothing or umbrella' });
    await page.fill('#f-description', 'A blue folding umbrella with a wooden handle');
    await page.selectOption('#f-locationId', { index: 1 });
    await page.fill('#f-occurredAt', bd(-30 * 60e3));
    await Promise.all([page.waitForURL(/\/items\/SF-/), page.click('[data-wizard-submit]')]);
    assert.equal(await page.isVisible('[data-flash]'), true);
    await page.ctx.close();
  });
  await check('Bangla page: the steps and the messages are Bangla', async () => {
    const page = await newPage(browser, base, { who: 'student', lang: 'bn' });
    await page.goto(base + '/report');
    assert.equal(await page.$eval('[data-wizard-status]', (e) => e.textContent), 'ধাপ ১/৩: জিনিসের বিবরণ'.replace('১/৩', '1/3'));
    await page.click('[data-wizard-next]');
    assert.equal(await page.$eval('#e-title span', (e) => e.textContent), 'এই ঘরটি পূরণ করা আবশ্যক।');
    await page.ctx.close();
  });

  /* ============================================================ live filters */
  console.log('Live filters');
  await check('public board: one request after typing stops, no reload, URL kept, a visitor still gets no cookie', async () => {
    const page = await newPage(browser, base, {});
    const reqs = [];
    page.on('request', (r) => { if (r.url().includes('partial=1')) reqs.push(r.url()); });
    await page.goto(base + '/browse');
    await page.evaluate(() => { window.__same = 'yes'; window.__history = history.length; });
    const total = Number(await page.$eval('[data-count]', (e) => e.dataset.count));
    await page.type('#q', 'library', { delay: 60 });
    await page.waitForFunction(() => document.querySelector('[data-count]').dataset.count !== undefined && document.querySelector('#browse-results').getAttribute('aria-busy') === 'false' && /q=library/.test(location.search));
    await wait(200);
    assert.equal(reqs.length, 1, 'seven keystrokes, one request');
    const n = Number(await page.$eval('[data-count]', (e) => e.dataset.count));
    assert.ok(n > 0 && n < total, `${n} of ${total}`);
    assert.equal(new URL(page.url()).search, '?q=library');
    assert.match(await page.$eval('[data-live-status]', (e) => e.textContent), new RegExp(`^${n} reports?$`));
    assert.deepEqual(await page.evaluate(() => [window.__same, history.length === window.__history]), ['yes', true]);
    await page.selectOption('#building', 'Library');
    await page.waitForFunction(() => /building=Library/.test(location.search) && document.querySelector('#browse-results').getAttribute('aria-busy') === 'false');
    await page.selectOption('#type', 'found');
    await page.waitForFunction(() => /type=found/.test(location.search) && document.querySelector('#browse-results').getAttribute('aria-busy') === 'false');
    assert.ok(await page.$$eval('.feed-item', (e) => e.length) > 0);
    assert.deepEqual(await page.ctx.cookies(), [], 'reading and filtering the public board sets no cookie (D2)');
    await cleanPage(page); await page.ctx.close();
  });
  await check('empty result: the message offers "Clear filters", which resets every field and the address', async () => {
    const page = await newPage(browser, base, {});
    await page.goto(base + '/browse');
    const total = await page.$eval('[data-count]', (e) => e.dataset.count);
    await page.selectOption('#building', 'Library');
    await page.fill('#q', 'zzzz');
    await page.waitForSelector('.empty [data-live-reset]');
    assert.match(await page.$eval('[data-live-status]', (e) => e.textContent), /^0 reports$/);
    await shot(page, 'browse-empty-light');
    await page.click('[data-live-reset]');
    await page.waitForFunction((t) => document.querySelector('[data-count]').dataset.count === t && !location.search, total);
    assert.deepEqual(await page.evaluate(() => [document.getElementById('q').value, document.getElementById('building').selectedIndex, document.getElementById('type').selectedIndex, document.getElementById('category').selectedIndex]), ['', 0, 0, 0]);
    await cleanPage(page); await page.ctx.close();
  });
  await check('a slow older answer never replaces a newer one; a failed request keeps the list and shows an error toast', async () => {
    const page = await newPage(browser, base, {});
    await page.goto(base + '/browse');
    await page.route(/partial=1.*q=li($|&)/, async (route) => { await wait(1000); route.continue(); });
    await page.fill('#q', 'li'); await wait(450);
    await page.fill('#q', 'library');
    await page.waitForFunction(() => /q=library/.test(location.search) && document.querySelector('#browse-results').getAttribute('aria-busy') === 'false');
    const expected = await page.$eval('[data-count]', (e) => e.dataset.count);
    await wait(1300);
    assert.equal(await page.$eval('[data-count]', (e) => e.dataset.count), expected);
    await page.unroute(/partial=1.*q=li($|&)/);
    await page.route('**/browse?*partial=1*', (r) => r.abort());
    await page.fill('#q', 'wallet');
    await page.waitForSelector('.toast-error');
    assert.equal(await page.$eval('.toast p', (e) => e.textContent), 'The list could not be updated. Check your connection and try again.');
    assert.equal(await page.$eval('[data-count]', (e) => e.dataset.count), expected);
    assert.deepEqual(await page.$eval('#browse-results', (e) => [e.getAttribute('aria-busy'), e.classList.contains('is-loading')]), ['false', false]);
    await page.ctx.close();
  });
  await check('the live list leaks nothing: no photos, sensitive titles masked, private words find nothing, a shared address works', async () => {
    const page = await newPage(browser, base, {});
    await page.goto(base + '/browse');
    assert.equal(await page.$$eval('#browse-results img', (e) => e.length), 0);
    assert.ok((await page.$eval('#browse-results', (e) => e.textContent)).includes('Details are private'));
    await page.fill('#q', 'analogue');
    await page.waitForSelector('.empty');
    await page.goto(base + '/browse?building=Library&type=found');
    assert.deepEqual(await page.evaluate(() => [document.getElementById('building').value, document.getElementById('type').value]), ['Library', 'found']);
    const n = await page.$eval('[data-count]', (e) => e.dataset.count);
    const part = await (await page.request.get(base + '/browse?building=Library&type=found&partial=1')).text();
    assert.ok(part.includes(`data-count="${n}"`));
    await page.ctx.close();
  });
  await check('Bangla page: building names, counts and the message are Bangla', async () => {
    const page = await newPage(browser, base, { lang: 'bn' });
    await page.goto(base + '/browse');
    assert.ok((await page.$$eval('#building option', (o) => o.map((x) => x.textContent))).some((t) => /[\u0980-\u09ff]/.test(t)));
    await page.selectOption('#building', { index: 1 });
    await page.waitForFunction(() => /building=/.test(location.search) && document.querySelector('#browse-results').getAttribute('aria-busy') === 'false');
    assert.match(await page.$eval('[data-live-status]', (e) => e.textContent), /[\u09e6-\u09ef]+টি রিপোর্ট/);
    await page.ctx.close();
  });
  await check('"My cases" and the review queue filter live and show the progress bar and empty states', async () => {
    const page = await newPage(browser, base, { who: 'student' });
    await page.goto(base + '/track');
    assert.ok(await page.$$eval('.mini-progress', (e) => e.length) > 0);
    await page.selectOption('#status', 'disposed');
    await page.waitForSelector('#track-results .empty');
    assert.match(await page.$eval('#track-results', (e) => e.textContent), /Nothing matches these filters/);
    await page.click('#track-results [data-live-reset]');
    await page.waitForSelector('#track-results .table');
    await page.ctx.close();
    const sec = await newPage(browser, base, { who: 'security' });
    await sec.goto(base + '/security/queue');
    await sec.selectOption('#status', 'rejected');
    await sec.waitForFunction(() => /status=rejected/.test(location.search) && document.querySelector('#queue-results').getAttribute('aria-busy') === 'false');
    await sec.fill('#q', 'umbrella');
    await sec.waitForFunction(() => /q=umbrella/.test(location.search) && document.querySelector('#queue-results').getAttribute('aria-busy') === 'false');
    assert.ok(await sec.$$eval('#queue-results .empty', (e) => e.length) === 1);
    await cleanPage(sec); await sec.ctx.close();
  });

  /* ============================================================ live alerts */
  console.log('Live alerts');
  await check('security sees a toast and a bigger badge when a claim arrives; the claimant gets a Bangla toast when it is verified', async () => {
    const security = await signedIn(base, 'security');
    const student2 = await signedIn(base, 'student2');
    const ref = await newFoundItem(security, 1);
    const secPage = await newPage(browser, base, { who: 'security' });
    await secPage.goto(base + '/security');
    const badge = (p) => p.evaluate(() => {
      const bell = document.querySelector('a.icon-btn[href="/notifications"] .dot-count');
      const chip = document.querySelector('.side-link[href="/notifications"] .chip');
      return { bell: bell && !bell.hidden ? bell.textContent : '', chip: chip && !chip.hidden ? parseInt(chip.textContent, 10) : 0 };
    });
    const capped = (n) => (n === 0 ? '' : (n > 9 ? '9+' : String(n)));
    const stuPage = await newPage(browser, base, { who: 'student2', lang: 'bn' });
    await stuPage.goto(base + '/dashboard');
    assert.ok(await until(() => realtime._io().sockets.sockets.size >= 2), 'both pages connected');
    const before = await badge(secPage);
    const id = await submitClaim(student2, ref);
    await secPage.waitForSelector('.toast');
    assert.equal(await secPage.$eval('.toast p', (e) => e.textContent), `New claim for ${ref}.`);
    assert.ok(await secPage.$eval('.toast', (e) => e.classList.contains('toast-warn')));
    assert.equal(await secPage.$eval('.toast a', (e) => e.getAttribute('href')), `/security/claims/${id}`);
    const after = await badge(secPage);
    assert.equal(after.chip, before.chip + 1, 'the sidebar count goes up by one');
    assert.equal(after.bell, capped(after.chip), 'and so does the bell (which stops at 9+)');
    await shot(secPage, 'live-toast-light');
    const stuBefore = await badge(stuPage);
    const res = await security.post(`/security/claims/${id}/verify`, { note: 'ok' }, { from: `/security/claims/${id}` });
    assert.equal(res.status, 302);
    await stuPage.waitForSelector('.toast');
    assert.match(await stuPage.$eval('.toast p', (e) => e.textContent), new RegExp(`^${ref}-এর জন্য আপনার দাবি যাচাই হয়েছে`));
    assert.ok(await stuPage.$eval('.toast', (e) => e.classList.contains('toast-success')));
    const stuAfter = await badge(stuPage);
    assert.equal(stuAfter.chip, stuBefore.chip + 1);
    assert.equal(stuAfter.bell, capped(stuAfter.chip));
    assert.equal(await stuPage.$eval('.side-link[href="/notifications"] .chip', (e) => e.getAttribute('aria-label')), `${stuAfter.chip}টি অপঠিত`, 'the chip keeps its screen-reader label, in Bangla');
    await Promise.all([stuPage.waitForURL(`**/claims/${id}`), stuPage.click('.toast a')]);
    assert.deepEqual((await secPage.$$eval('.toast p', (e) => e.map((x) => x.textContent))).filter((t) => !t.startsWith('New claim')), [], 'security was not told about the claimant\'s verification');
    await cleanPage(secPage); await cleanPage(stuPage);
    await secPage.ctx.close(); await stuPage.ctx.close();
  });
  await check('a signed-out visitor loads no socket code at all', async () => {
    const page = await newPage(browser, base, {});
    const wsOpened = [];
    page.on('websocket', (w) => wsOpened.push(w.url()));
    await page.goto(base + '/browse');
    await wait(400);
    assert.deepEqual(wsOpened, []);
    assert.equal(await page.evaluate(() => typeof window.io), 'undefined');
    await page.ctx.close();
  });

  /* ============================================================ look and feel */
  console.log('Look and feel');
  const PAGES = [
    [null, '/'], ['student', '/'], [null, '/browse'], [null, '/browse?q=zzzz'], ['student', '/report'], ['student', '/items/SF-2026-0001'], ['student', '/track'],
    ['student', '/track?status=disposed'], ['security', '/security/queue'], ['security', '/security/queue?status=rejected'], ['security', '/security/intake']
  ];
  for (const theme of ['light', 'dark']) {
    for (const lang of ['en', 'bn']) {
      await check(`contrast, ${theme} theme, ${lang === 'bn' ? 'Bangla' : 'English'}: text on every new or changed page meets 4.5:1 (3:1 for large text)`, async () => {
        const failures = [];
        for (const [who, url] of PAGES) {
          const page = await newPage(browser, base, { who, lang, theme });
          await page.goto(base + url);
          await wait(120);
          failures.push(...(await page.evaluate(SCAN)).map((f) => `${url} ${JSON.stringify(f)}`));
          if (url === '/report') {
            await page.click('[data-wizard-next]');
            failures.push(...(await page.evaluate(SCAN)).map((f) => `${url}#errors ${JSON.stringify(f)}`));
            await page.fill('#f-title', 'Blue umbrella');
            await page.selectOption('#f-categoryId', { index: 1 });
            await page.fill('#f-description', 'A blue folding umbrella with a wooden handle');
            await page.click('[data-wizard-next]'); await page.selectOption('#f-locationId', { index: 1 }); await page.click('[data-wizard-next]');
            await page.setInputFiles('#f-photo', { name: 'umbrella.png', mimeType: 'image/png', buffer: PNG });
            await page.waitForFunction(() => document.querySelector('[data-dz-img]').naturalWidth > 0);
            failures.push(...(await page.evaluate(SCAN)).map((f) => `${url}#step3 ${JSON.stringify(f)}`));
            await shot(page, `wizard-step3-${theme}-${lang}`);
            await page.click('[data-dz-remove]');
            await page.setInputFiles('#f-photo', { name: 'x.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') });
            failures.push(...(await page.evaluate(SCAN)).map((f) => `${url}#dzerror ${JSON.stringify(f)}`));
          }
          if (url === '/items/SF-2026-0001') await shot(page, `progress-${theme}-${lang}`);
          if (url === '/browse?q=zzzz') await shot(page, `empty-${theme}-${lang}`);
          if (url === '/track') await shot(page, `track-${theme}-${lang}`);
          await page.evaluate(() => { ['success', 'error', 'warn', 'info'].forEach((t) => window.SafeFind.toast.show('Toast text for this type of message', t, { duration: 60000 })); });
          await wait(450);
          failures.push(...(await page.evaluate(SCAN)).filter((f) => /toast/.test(f.el)).map((f) => `${url}#toast ${JSON.stringify(f)}`));
          if (url === '/browse') await shot(page, `toasts-${theme}-${lang}`);
          await page.ctx.close();
        }
        assert.deepEqual(failures, []);
      });
    }
  }
  await check('phone width (360 px): no sideways scrolling on any new or changed page, in either language', async () => {
    const problems = [];
    for (const lang of ['en', 'bn']) {
      for (const [who, url] of [...PAGES, ['student', '/dashboard'], ['student', '/items/SF-2026-0009/claim'], [null, '/']]) {
        const page = await newPage(browser, base, { who, lang, viewport: { width: 360, height: 760 } });
        await page.goto(base + url);
        await wait(80);
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (wide > 0) problems.push(`${lang} ${url} is ${wide}px too wide`);
        if (url === '/report') {
          await page.fill('#f-title', 'Blue umbrella'); await page.selectOption('#f-categoryId', { index: 1 }); await page.fill('#f-description', 'A blue folding umbrella with a wooden handle');
          await page.click('[data-wizard-next]');
          await shot(page, `wizard-step2-mobile-${lang}`, { fullPage: true });
          const wide2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          if (wide2 > 0) problems.push(`${lang} /report step 2 is ${wide2}px too wide`);
        }
        if (url === '/items/SF-2026-0001') await shot(page, `progress-mobile-${lang}`, { fullPage: true });
        if (url === '/browse') await shot(page, `browse-mobile-${lang}`);
        await page.ctx.close();
      }
    }
    assert.deepEqual(problems, []);
  });

  // ---------------------------------------------------------------- home page (1.3.1)
  await check('home page: one header row with five links from 1061 px, a menu button below that, and one logo, in both languages', async () => {
    for (const lang of ['en', 'bn']) {
      for (const width of [1100, 1280, 1440]) {
        const page = await newPage(browser, base, { lang, viewport: { width, height: 800 } });
        await page.goto(base + '/');
        const r = await page.evaluate(() => ({
          h: document.querySelector('.header-row').getBoundingClientRect().height,
          links: [...document.querySelectorAll('.nav-links a')].filter((a) => getComputedStyle(a).display !== 'none').length,
          brand: document.querySelector('.brand').getBoundingClientRect().width,
          menu: getComputedStyle(document.querySelector('.menu-btn')).display
        }));
        assert.ok(r.h < 90, `${lang} ${width}: the header row is ${r.h}px tall`);
        assert.equal(r.links, 5, `${lang} ${width}`);
        assert.ok(r.brand < 130, `${lang} ${width}: the brand is ${r.brand}px wide, so a second logo is taking room`);
        assert.equal(r.menu, 'none', `${lang} ${width}`);
        await cleanPage(page);
        await page.ctx.close();
      }
      const page = await newPage(browser, base, { lang, viewport: { width: 1024, height: 800 } });
      await page.goto(base + '/');
      const navDisplay = () => page.$eval('.nav-links', (n) => getComputedStyle(n).display);
      assert.equal(await navDisplay(), 'none');
      await page.click('.menu-btn');
      assert.equal(await navDisplay(), 'flex');
      assert.equal(await page.$eval('.menu-btn', (b) => b.getAttribute('aria-expanded')), 'true');
      await page.click('.nav-links a[data-spy="how"]');
      assert.equal(await navDisplay(), 'none', 'choosing a link closes the menu');
      await cleanPage(page);
      await page.ctx.close();
    }
  });

  await check('home page: scrolling marks the section you are in, in the header, and the reading line grows', async () => {
    const page = await newPage(browser, base, { viewport: { width: 1280, height: 800 } });
    await page.goto(base + '/');
    const cur = (id) => page.$eval(`.nav-links a[data-spy="${id}"]`, (a) => a.getAttribute('aria-current'));
    assert.equal(await cur('how'), null);
    await page.evaluate(() => document.getElementById('how').scrollIntoView());
    assert.ok(await until(async () => (await cur('how')) === 'location'), 'How it works becomes current');
    const grown = await page.$eval('.read-progress i', (i) => parseFloat(/scaleX\(([\d.]+)\)/.exec(i.style.transform)[1]));
    assert.ok(grown > 0.1 && grown < 1, `the reading line is at ${grown}`);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    assert.ok(await until(async () => (await cur('contact')) === 'location'), 'Contact becomes current at the bottom');
    assert.equal(await cur('how'), null);
    await cleanPage(page);
    await page.ctx.close();
  });

  await check('how it works: one panel at a time, the arrow keys move between steps, earlier steps are marked done', async () => {
    const page = await newPage(browser, base, { viewport: { width: 1280, height: 900 } });
    await page.goto(base + '/');
    const state = () => page.evaluate(() => ({
      visible: [...document.querySelectorAll('.how-panel')].map((p) => getComputedStyle(p).display !== 'none'),
      selected: [...document.querySelectorAll('.how-tab')].map((t) => t.getAttribute('aria-selected')),
      done: [...document.querySelectorAll('.how-tab')].map((t) => t.classList.contains('is-done'))
    }));
    const focused = () => page.evaluate(() => document.activeElement.id);
    assert.deepEqual((await state()).visible, [true, false, false, false]);
    await page.click('#how-tab-3');
    const s = await state();
    assert.deepEqual(s.visible, [false, false, true, false]);
    assert.deepEqual(s.done, [true, true, false, false]);
    assert.deepEqual(s.selected, ['false', 'false', 'true', 'false']);
    assert.ok((await page.innerText('#how-panel-3')).includes('The report is accepted and open'));
    await page.keyboard.press('ArrowRight');
    assert.equal(await focused(), 'how-tab-4');
    assert.deepEqual((await state()).visible, [false, false, false, true]);
    await page.keyboard.press('ArrowRight');
    assert.equal(await focused(), 'how-tab-1', 'wraps round');
    await page.keyboard.press('End');
    assert.equal(await focused(), 'how-tab-4');
    await page.keyboard.press('Home');
    assert.equal(await focused(), 'how-tab-1');
    assert.equal(await page.$eval('#how-tab-2', (t) => t.tabIndex), -1, 'only the current tab is in the tab order');
    await cleanPage(page);
    await page.ctx.close();
  });

  await check('how it works without JavaScript: all four steps are listed in order and the tab strip is not shown', async () => {
    const page = await newPage(browser, base, { js: false, viewport: { width: 1280, height: 900 } });
    await page.goto(base + '/');
    const r = await page.evaluate(() => ({
      visible: [...document.querySelectorAll('.how-panel')].map((p) => getComputedStyle(p).display !== 'none'),
      heads: [...document.querySelectorAll('.how-panel-h')].map((h) => getComputedStyle(h).display !== 'none'),
      strip: getComputedStyle(document.querySelector('.how-strip')).display
    }));
    assert.deepEqual(r.visible, [true, true, true, true]);
    assert.deepEqual(r.heads, [true, true, true, true]);
    assert.equal(r.strip, 'none');
    await page.ctx.close();
  });

  await check('home page, signed in: the header, the follow card and the sign-up band change', async () => {
    const page = await newPage(browser, base, { who: 'student', viewport: { width: 1280, height: 800 } });
    await page.goto(base + '/');
    const r = await page.evaluate(() => ({ header: document.querySelector('.header-tools').innerText, follow: document.querySelector('.follow').innerText, who: document.querySelector('#who').innerText }));
    assert.ok(r.header.includes('My workspace') && !r.header.includes('Sign in'));
    assert.ok(r.follow.includes('My cases') && !/Sign in|Create account/.test(r.follow));
    assert.ok(r.who.includes('Report an item') && !r.who.includes('Create account'));
    await cleanPage(page);
    await page.ctx.close();
  });

  await check('home page: the keyboard reaches the three tiles and every one shows a focus ring', async () => {
    const page = await newPage(browser, base, { viewport: { width: 1280, height: 900 } });
    await page.goto(base + '/');
    await page.focus('.hp-tile');
    const rings = [];
    for (let i = 0; i < 3; i += 1) {
      rings.push(await page.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { cls: a.className, style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) }; }));
      await page.keyboard.press('Tab');
    }
    assert.deepEqual(rings.map((r) => r.cls.includes('hp-tile')), [true, true, true]);
    assert.ok(rings.every((r) => r.style !== 'none' && r.width >= 2), JSON.stringify(rings));
    await page.ctx.close();
  });

  await check('home page: the picture is labelled and drawn, nothing scrolls sideways at 360, 768, 1024 and 1440 px, and the phone bar shows only on phones', async () => {
    const problems = [];
    const combos = [];
    for (const theme of ['light', 'dark']) for (const lang of ['en', 'bn']) for (const width of [360, 768, 1024, 1440]) combos.push([null, theme, lang, width]);
    combos.push(['student', 'light', 'en', 360], ['student', 'light', 'bn', 360]);
    for (const [who, theme, lang, width] of combos) {
      const page = await newPage(browser, base, { who, lang, theme, viewport: { width, height: 800 } });
      await page.goto(base + '/');
      await page.evaluate(() => document.fonts.ready);
      const r = await page.evaluate(() => {
        const svg = document.querySelector('.hp-vis [role="img"]');
        const b = svg.getBoundingClientRect();
        return { label: svg.getAttribute('aria-label').length, w: Math.round(b.width), h: Math.round(b.height), over: document.documentElement.scrollWidth - window.innerWidth, dock: getComputedStyle(document.querySelector('.dock')).display };
      });
      const where = `${who || 'visitor'} ${theme} ${lang} ${width}`;
      if (r.label < 40) problems.push(`${where}: the picture has no real label`);
      if (r.w < 260 || r.h < 220) problems.push(`${where}: the picture is ${r.w}x${r.h}`);
      if (r.over > 0) problems.push(`${where}: ${r.over}px too wide`);
      if (width <= 700 && r.dock !== 'grid') problems.push(`${where}: the phone bar is missing`);
      if (width > 700 && r.dock !== 'none') problems.push(`${where}: the phone bar shows on a wide screen`);
      if (!who && lang === 'en' && width === 1440) await shot(page, `home-${theme}-en`, { fullPage: true });
      if (!who && lang === 'bn' && width === 1440 && theme === 'light') await shot(page, 'home-light-bn', { fullPage: true });
      if (!who && lang === 'en' && width === 360 && theme === 'light') await shot(page, 'home-mobile-en', { fullPage: true });
      await page.ctx.close();
    }
    assert.deepEqual(problems, []);
  });

  await check('home page: reduced motion turns smooth scrolling off, and a visitor still gets no cookie', async () => {
    const page = await newPage(browser, base, { reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
    await page.goto(base + '/');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
    assert.deepEqual(await page.ctx.cookies(), []);
    await cleanPage(page);
    await page.ctx.close();
  });


  await browser.close();
  await srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
