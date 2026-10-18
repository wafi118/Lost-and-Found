'use strict';
// Walks every page as every role and reports anything that is not what it should be.
// Usage: NODE_ENV=test node scripts/smoke.js
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
const { startServer, Client, ACCOUNTS, signedIn } = require('../tests/helpers');

const problems = [];
const check = (label, res, expected) => {
  const ok = Array.isArray(expected) ? expected.includes(res.status) : res.status === expected;
  if (!ok) problems.push(`${label}: got ${res.status}, expected ${expected}${res.location ? ` (-> ${res.location})` : ''}`);
  if (!/^anon GET \/(vendor|js|css)/.test(label) && /ReferenceError|TypeError|SyntaxError|is not defined|Cannot read/.test(res.text)) problems.push(`${label}: error text in body`);
};

(async () => {
  const srv = await startServer();
  const anon = new Client(srv.base);
  const pub = ['/', '/browse', '/browse?q=backpack', '/browse?type=found&page=1', '/browse?building=Library&type=found', '/browse?partial=1', '/browse?partial=1&q=zzzz', '/auth/login?out=1', '/about', '/auth/login', '/auth/register', '/auth/register/id-card', '/auth/forgot', '/healthz',
    '/css/style.css', '/js/site.js', '/vendor/chart.js', '/vendor/jsqr.js', '/vendor/leaflet/leaflet.js', '/vendor/leaflet/leaflet.css',
    '/vendor/fonts/inter/inter-latin-400-normal.woff2', '/vendor/fonts/bengali/noto-sans-bengali-bengali-400-normal.woff2', '/images/safefind-logo.png'];
  for (const p of pub) check(`anon GET ${p}`, await anon.get(p), 200);
  check('anon 404', await anon.get('/nope'), 404);
  check('anon /items/bad', await anon.get('/items/bad'), 404);
  for (const p of ['/dashboard', '/report', '/track', '/claims', '/notifications', '/account', '/security', '/admin', '/approver']) check(`anon GET ${p}`, await anon.get(p), 302);
  check('anon upload', await anon.get('/uploads/' + 'a'.repeat(32) + '.jpg'), 302);

  const pages = {
    student: ['/dashboard', '/report', '/report?type=found', '/track', '/claims', '/track?type=lost&status=open', '/track?partial=1&status=open', '/items/SF-2026-0009/claim', '/notifications', '/account', '/items/SF-2026-0001'],
    security: ['/security', '/security/queue', '/security/queue?status=open&type=found', '/security/queue?partial=1&status=open', '/security/queue?partial=1&status=rejected', '/security/records', '/security/records?status=closed', '/security/records?partial=1&status=open', '/security/inventory', '/security/intake', '/security/matches', '/security/claims', '/security/claims?tab=verified', '/security/claims?tab=closed',
      '/security/handover', '/security/handover/history', '/security/handover/history?status=completed', '/security/unclaimed', '/report', '/track', '/claims', '/notifications', '/account', '/items/SF-2026-0001'],
    approver: ['/approver', '/approver/history', '/track', '/claims', '/notifications', '/account'],
    admin: ['/admin', '/approver', '/approver/history', '/admin/users', '/admin/id-reviews', '/admin/id-reviews?status=approved', '/admin/id-reviews?status=rejected', '/admin/users?role=security&status=active&q=a', '/admin/categories', '/admin/locations', '/admin/settings', '/admin/analytics', '/admin/audit', '/admin/audit?action=auth.login',
      '/security', '/security/queue', '/security/records', '/security/matches', '/security/handover', '/security/handover/history', '/security/unclaimed', '/security/inventory', '/security/claims', '/claims', '/account']
  };
  for (const [who, list] of Object.entries(pages)) {
    const c = await signedIn(srv.base, who);
    for (const p of list) check(`${who} GET ${p}`, await c.get(p), 200);
    // every case ref linked from the lists should open for this role
    for (const listUrl of who === 'security' ? ['/security/queue?status=open', '/security/queue?status=under_review', '/security/inventory'] : []) {
      const page = await c.get(listUrl);
      const refs = [...new Set([...page.text.matchAll(/\/security\/cases\/(SF-\d{4}-\d{4})/g)].map((m) => m[1]))];
      for (const ref of refs.slice(0, 6)) check(`security GET /security/cases/${ref}`, await c.get(`/security/cases/${ref}`), 200);
    }
  }
  // every case on the student's own list must open
  const me = await signedIn(srv.base, 'student');
  const mine = [...new Set([...(await me.get('/track')).text.matchAll(/\/items\/(SF-\d{4}-\d{4})/g)].map((m) => m[1]))];
  if (!mine.length) problems.push('student has no cases on /track');
  for (const ref of mine) check(`student GET /items/${ref}`, await me.get(`/items/${ref}`), 200);
  const claimLinks = [...new Set([...(await me.get('/track')).text.matchAll(/\/claims\/(\d+)/g)].map((m) => m[1]))];
  for (const id of claimLinks) check(`student GET /claims/${id}`, await me.get(`/claims/${id}`), 200);

  // forbidden combinations
  const student = await signedIn(srv.base, 'student');
  for (const p of ['/security', '/admin', '/approver', '/admin/users', '/security/handover']) check(`student GET ${p} is 403`, await student.get(p), 403);
  const security = await signedIn(srv.base, 'security');
  for (const p of ['/admin', '/approver', '/security/intake']) check(`security GET ${p}`, await security.get(p), p === '/security/intake' ? 200 : 403);
  const admin = await signedIn(srv.base, 'admin');
  check('admin GET /security/intake is 403', await admin.get('/security/intake'), 403);

  // languages
  const bn = new Client(srv.base);
  await bn.get('/lang/bn?next=/');
  check('bn home', await bn.get('/'), 200);
  const bnHome = await bn.get('/');
  if (!/ক্যাম্পাসে/.test(bnHome.text)) problems.push('bn home does not show Bangla');

  await srv.close();
  console.log(problems.length ? `PROBLEMS (${problems.length}):\n` + problems.join('\n') : 'smoke: all pages behaved');
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
