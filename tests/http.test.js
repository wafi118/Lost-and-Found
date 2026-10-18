'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { startServer, Client, ACCOUNTS, signedIn } = require('./helpers');
const userModel = require('../models/user.model');
const auth = require('../services/auth.service');
const mailer = require('../services/mailer.service');
const wrap = require('../utils/wrapController');
const errors = require('../middleware/errors');

let srv;
test.before(async () => { srv = await startServer(); });
test.after(async () => { await srv.close(); });

const formError = (html) => { const m = /class="form-error"[^>]*>([^<]*)</.exec(html); return m ? m[1].trim() : null; };
const scratchUser = async (email, password, extra = {}) => userModel.create({
  name: 'Scratch User', email, passwordHash: await auth.hashPassword(password), role: 'member', affiliation: 'student',
  universityId: String(Math.floor(Math.random() * 1e9) + 1e9), status: 'active', emailVerified: true, ...extra
});

test('the public pages set no cookie for an anonymous visitor (D2)', async () => {
  const c = new Client(srv.base);
  for (const p of ['/', '/browse', '/about', '/browse?q=bag']) {
    const r = await c.get(p);
    assert.equal(r.status, 200, p);
    assert.deepEqual(r.setCookie, [], `${p} must not set a cookie`);
  }
});

test('security headers: strict CSP without inline script or style allowances', async () => {
  const r = await new Client(srv.base).get('/');
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-powered-by'), null);
  assert.match(r.headers.get('permissions-policy'), /camera=\(self\)/);
});

test('no rendered page contains inline scripts, style attributes or event handlers', async () => {
  const pages = { anon: ['/', '/browse', '/about', '/auth/login', '/auth/register', '/auth/forgot', '/nope'],
    student: ['/dashboard', '/report', '/track', '/claims', '/notifications', '/account'],
    security: ['/security', '/security/queue', '/security/records', '/security/matches', '/security/claims', '/security/handover', '/security/handover/history', '/security/unclaimed', '/security/intake'],
    approver: ['/approver'], admin: ['/admin', '/admin/users', '/admin/categories', '/admin/locations', '/admin/settings', '/admin/analytics', '/admin/audit', '/security/records', '/security/handover/history'] };
  for (const [who, list] of Object.entries(pages)) {
    const c = who === 'anon' ? new Client(srv.base) : await signedIn(srv.base, who);
    for (const p of list) {
      const { text } = await c.get(p);
      for (const m of text.matchAll(/<script\b([^>]*)>/g)) assert.ok(/\bsrc=/.test(m[1]) || /type="application\/json"/.test(m[1]), `${who} ${p}: inline script ${m[0]}`);
      assert.doesNotMatch(text, /<[a-z][^>]*\sstyle="/i, `${who} ${p}: style attribute`);
      assert.doesNotMatch(text, /<[a-z][^>]*\son[a-z]+="/i, `${who} ${p}: inline event handler`);
      assert.doesNotMatch(text, /<style\b/i, `${who} ${p}: style element`);
      assert.doesNotMatch(text, /fonts\.googleapis|cdn\.jsdelivr|unpkg\.com/i, `${who} ${p}: third-party host`);
    }
  }
});

test('role-based access: every protected route answers correctly for every role', async () => {
  const roles = ['anon', 'student', 'security', 'approver', 'admin'];
  const clients = { anon: new Client(srv.base) };
  for (const r of roles.slice(1)) clients[r] = await signedIn(srv.base, r);
  // path: [anon, student, security, approver, admin]
  const matrix = {
    '/dashboard': [302, 200, 302, 302, 302],
    '/report': [302, 200, 200, 200, 200],
    '/track': [302, 200, 200, 200, 200],
    '/claims': [302, 200, 200, 200, 200],
    '/notifications': [302, 200, 200, 200, 200],
    '/account': [302, 200, 200, 200, 200],
    '/security': [302, 403, 200, 403, 200],
    '/security/queue': [302, 403, 200, 403, 200],
    '/security/matches': [302, 403, 200, 403, 200],
    '/security/claims': [302, 403, 200, 403, 200],
    '/security/handover': [302, 403, 200, 403, 200],
    '/security/handover/history': [302, 403, 200, 403, 200],
    '/security/records': [302, 403, 200, 403, 200],
    '/security/unclaimed': [302, 403, 200, 403, 200],
    '/security/intake': [302, 403, 200, 403, 403],
    '/approver': [302, 403, 403, 200, 200],
    '/approver/history': [302, 403, 403, 200, 200],
    '/admin': [302, 403, 403, 403, 200],
    '/admin/users': [302, 403, 403, 403, 200],
    '/admin/settings': [302, 403, 403, 403, 200],
    '/admin/audit': [302, 403, 403, 403, 200],
    '/admin/analytics': [302, 403, 403, 403, 200]
  };
  for (const [p, expected] of Object.entries(matrix)) {
    for (let i = 0; i < roles.length; i += 1) {
      const r = await clients[roles[i]].get(p);
      assert.equal(r.status, expected[i], `${roles[i]} GET ${p}`);
    }
  }
});

test('role-based access: actions are refused for the wrong role even with a valid CSRF token', async () => {
  const student = await signedIn(srv.base, 'student');
  const approver = await signedIn(srv.base, 'approver');
  const security = await signedIn(srv.base, 'security');
  const admin = await signedIn(srv.base, 'admin');
  const refused = [
    [student, '/security/matches/1/confirm'], [student, '/approver/cases/SF-2026-0001/decision'], [student, '/admin/users/1/suspend'],
    [student, '/admin/users/1/delete'], [security, '/admin/users/1/delete'],
    [approver, '/security/cases/SF-2026-0001/review'], [admin, '/security/handover/complete'], [admin, '/security/matches/1/confirm'],
    [security, '/admin/users/1/suspend'], [security, '/approver/cases/SF-2026-0001/decision'], [security, '/admin/settings']
  ];
  for (const [client, url] of refused) {
    const r = await client.post(url, { decision: 'approve', code: 'X', idChecked: 'on' }, { from: '/account' });
    assert.equal(r.status, 403, url);
  }
});

test('CSRF: a POST without the token, with a wrong token, or from another origin is refused', async () => {
  const c = new Client(srv.base);
  const [email, password] = ACCOUNTS.student;
  assert.equal((await c.request('/auth/login', { method: 'POST', form: { email, password } })).status, 403);
  assert.equal((await c.post('/auth/login', { email, password }, { token: 'wrong-token' })).status, 403);
  const token = await c.csrf('/auth/login');
  const foreign = await c.request('/auth/login', { method: 'POST', form: { _csrf: token, email, password }, headers: { origin: 'http://evil.example' } });
  assert.equal(foreign.status, 403);
  const ok = await c.request('/auth/login', { method: 'POST', form: { _csrf: token, email, password } });
  assert.equal(ok.status, 302);
});

test('login only redirects inside the app (D3)', async () => {
  const [email, password] = ACCOUNTS.student;
  for (const next of ['/\\evil.com', '//evil.com', 'https://evil.com', 'javascript:alert(1)']) {
    const r = await new Client(srv.base).post('/auth/login', { email, password, next }, { from: '/auth/login' });
    assert.equal(r.status, 302);
    assert.equal(r.location, '/dashboard', `next=${next}`);
  }
  const good = await new Client(srv.base).post('/auth/login', { email, password, next: '/report?type=found' }, { from: '/auth/login' });
  assert.equal(good.location, '/report?type=found');
});

test('a protected page sends you to sign in and brings you back afterwards', async () => {
  const c = new Client(srv.base);
  const r = await c.get('/report?type=found');
  assert.equal(r.status, 302);
  assert.equal(r.location, `/auth/login?next=${encodeURIComponent('/report?type=found')}`);
  const page = await c.get(r.location);
  assert.match(page.text, /name="next" value="\/report\?type=found"/);
});

test('sign-in does not reveal whether an address has an account, and locks after repeated failures (AUTH-6)', async () => {
  const unknown = await new Client(srv.base).post('/auth/login', { email: 'nobody@safefind.example', password: 'Whatever@123' }, { from: '/auth/login' });
  const wrong = await new Client(srv.base).post('/auth/login', { email: ACCOUNTS.student[0], password: 'Wrong@12345' }, { from: '/auth/login' });
  assert.equal(unknown.status, 401);
  assert.equal(wrong.status, 401);
  assert.equal(formError(unknown.text), formError(wrong.text));
  assert.equal(formError(wrong.text), 'Email or password is not correct.');

  await scratchUser('lockme@safefind.example', 'Locked@12345');
  const c = new Client(srv.base);
  for (let i = 0; i < 7; i += 1) await c.post('/auth/login', { email: 'lockme@safefind.example', password: 'nope' }, { from: '/auth/login' });
  const late = await c.post('/auth/login', { email: 'lockme@safefind.example', password: 'Locked@12345' }, { from: '/auth/login' });
  assert.equal(late.status, 403, 'even the right password is refused while locked');
  assert.match(formError(late.text), /Too many wrong attempts/);
});

test('the session id changes at sign-in, and sign-out ends the session (D9)', async () => {
  const c = new Client(srv.base);
  await c.csrf('/auth/login');
  const before = c.cookies.get('sf.sid');
  assert.ok(before);
  await c.login(...ACCOUNTS.student);
  const after = c.cookies.get('sf.sid');
  assert.ok(after && after !== before, 'session id must be new after login');
  assert.equal((await c.get('/dashboard')).status, 200);

  const out = await c.post('/auth/logout', {}, { from: '/account' });
  assert.equal(out.status, 302);
  assert.equal(out.location, '/auth/login?out=1');
  assert.equal(c.cookies.has('sf.sid'), false, 'the cookie is cleared');
  assert.equal((await c.get('/dashboard')).status, 302);
});

test('suspending an account ends its session at the next request (D7)', async () => {
  const u = await scratchUser('suspendme@safefind.example', 'Suspend@12345');
  const c = new Client(srv.base);
  await c.login('suspendme@safefind.example', 'Suspend@12345');
  assert.equal((await c.get('/dashboard')).status, 200);
  const admin = await signedIn(srv.base, 'admin');
  assert.equal((await admin.post(`/admin/users/${u.id}/suspend`, {}, { from: '/admin/users' })).status, 302);
  const after = await c.get('/dashboard');
  assert.equal(after.status, 302);
  assert.match(after.location, /\/auth\/login/);
  const again = await new Client(srv.base).post('/auth/login', { email: 'suspendme@safefind.example', password: 'Suspend@12345' }, { from: '/auth/login' });
  assert.equal(again.status, 403);
  assert.match(formError(again.text), /suspended/i);
});

test('an administrator can edit an account, but not its password or ID', async () => {
  const u = await scratchUser('editme@safefind.example', 'Editme@12345', { universityId: '2024999001', phone: '01700000000' });
  const admin = await signedIn(srv.base, 'admin');
  const page = await admin.get(`/admin/users/${u.id}`);
  assert.equal(page.status, 200);
  assert.match(page.text, /2024999001/);
  assert.doesNotMatch(page.text, /name="universityId"|name="password"/);
  const saved = await admin.post(`/admin/users/${u.id}`, {
    name: 'Edited Name', email: 'editme@safefind.example', phone: '01811111111',
    role: 'member', affiliation: 'staff', lang: 'bn', universityId: '9999999999', password: 'Stolen@12345'
  }, { from: `/admin/users/${u.id}` });
  assert.equal(saved.status, 302, saved.text);
  const after = await userModel.findById(u.id);
  assert.equal(after.name, 'Edited Name');
  assert.equal(after.phone, '01811111111');
  assert.equal(after.affiliation, 'staff');
  assert.equal(after.lang, 'bn');
  assert.equal(after.universityId, '2024999001');
  const login = await new Client(srv.base).post('/auth/login', { email: 'editme@safefind.example', password: 'Editme@12345' }, { from: '/auth/login' });
  assert.equal(login.status, 302);
  assert.doesNotMatch(login.location || '', /\/auth\/login/);
});

test('an administrator can delete an account and free the email and ID, but not their own', async () => {
  const u = await scratchUser('deleteme@safefind.example', 'Delete@12345', { universityId: '2024999002' });
  const victim = new Client(srv.base);
  await victim.login('deleteme@safefind.example', 'Delete@12345');
  const admin = await signedIn(srv.base, 'admin');
  const self = await userModel.findByEmail('admin@safefind.example');
  const refused = await admin.post(`/admin/users/${self.id}/delete`, {}, { from: '/admin/users' });
  assert.equal(refused.status, 302);
  assert.equal((await userModel.findById(self.id)).deletedAt, null);
  const listed = await admin.get('/admin/users');
  assert.match(listed.text, /At least one active administrator must remain/);

  const yes = await admin.post(`/admin/users/${u.id}/delete`, {}, { from: `/admin/users/${u.id}` });
  assert.equal(yes.status, 302);
  const gone = await userModel.findById(u.id);
  assert.ok(gone.deletedAt);
  assert.equal(gone.universityId, null);
  assert.equal(gone.passwordHash, null);
  assert.notEqual(gone.email, 'deleteme@safefind.example');
  assert.equal((await victim.get('/dashboard')).status, 302);
  const again = await new Client(srv.base).post('/auth/login', { email: 'deleteme@safefind.example', password: 'Delete@12345' }, { from: '/auth/login' });
  assert.equal(again.status, 401);
  const hidden = await admin.get('/admin/users');
  assert.doesNotMatch(hidden.text, /Deleted account/);
  const archive = await admin.get('/admin/users?status=deleted');
  assert.match(archive.text, /Deleted account/);
  const reuse = await scratchUser('deleteme@safefind.example', 'Delete@12345', { universityId: '2024999002' });
  assert.notEqual(reuse.id, u.id);
});

test('the admin dashboard does not show the waiting-accounts panel', async () => {
  const admin = await signedIn(srv.base, 'admin');
  const page = await admin.get('/admin');
  assert.equal(page.status, 200);
  assert.match(page.text, /Recent activity/);
  assert.doesNotMatch(page.text, /Accounts waiting for approval/);
  assert.doesNotMatch(page.text, /REQUIRE_ADMIN_APPROVAL/);
});

test('security and admin can read every case status and past handovers together', async () => {
  for (const who of ['security', 'admin']) {
    const c = await signedIn(srv.base, who);
    const records = await c.get('/security/records');
    assert.equal(records.status, 200);
    assert.match(records.text, /Grey hoodie/);
    assert.match(records.text, /Black smartphone/);
    assert.match(records.text, /Blue umbrella/);
    const closed = await c.get('/security/records?status=closed');
    assert.match(closed.text, /Grey hoodie/);
    assert.doesNotMatch(closed.text, /Blue umbrella/);
    const history = await c.get('/security/handover/history');
    assert.equal(history.status, 200);
    assert.match(history.text, /Grey hoodie/);
    assert.match(history.text, /Completed/);
    const done = await c.get('/security/handover/history?status=completed&q=hoodie');
    assert.match(done.text, /Grey hoodie/);
    assert.doesNotMatch(done.text, /Blue steel water bottle/);
  }
});

test('changing the password ends other sessions but keeps this one', async () => {
  await scratchUser('pwchange@safefind.example', 'Before@12345');
  const a = new Client(srv.base);
  const b = new Client(srv.base);
  await a.login('pwchange@safefind.example', 'Before@12345');
  await b.login('pwchange@safefind.example', 'Before@12345');
  const r = await a.post('/account/password', { current: 'Before@12345', password: 'After@123456', confirm: 'After@123456' }, { from: '/account' });
  assert.equal(r.status, 302);
  assert.equal((await a.get('/account')).status, 200, 'this session stays');
  assert.equal((await b.get('/account')).status, 302, 'the other session ends');
  assert.equal((await new Client(srv.base).post('/auth/login', { email: 'pwchange@safefind.example', password: 'Before@12345' }, { from: '/auth/login' })).status, 401);
  assert.equal((await new Client(srv.base).post('/auth/login', { email: 'pwchange@safefind.example', password: 'After@123456' }, { from: '/auth/login' })).status, 302);
});

test('registration: university address only, confirmed by an e-mailed link, no account enumeration (AUTH-1 to AUTH-3)', async () => {
  const c = new Client(srv.base);
  const form = { name: 'New Student', email: 'new.student@bup.edu.bd', affiliation: 'student', universityId: '20249990001', password: 'Testing@123', confirm: 'Testing@123', attest: 'on' };

  const wrongDomain = await c.post('/auth/register', { ...form, email: 'new.student@gmail.com' }, { from: '/auth/register' });
  assert.equal(wrongDomain.status, 400);
  assert.match(wrongDomain.text, /university email address/i);
  assert.ok(!(await userModel.findByEmail('new.student@gmail.com')));

  const badId = await c.post('/auth/register', { ...form, universityId: 'abc' }, { from: '/auth/register' });
  assert.equal(badId.status, 400);
  assert.match(badId.text, /student ID/i);

  const noAttest = await c.post('/auth/register', { ...form, attest: '' }, { from: '/auth/register' });
  assert.equal(noAttest.status, 400);

  const created = await c.post('/auth/register', form, { from: '/auth/register' });
  assert.equal(created.status, 302);
  assert.match(created.location, /^\/auth\/check-email\?email=/);
  const stored = await userModel.findByEmail(form.email);
  assert.ok(stored && stored.status === 'pending' && stored.emailVerified === false && stored.role === 'member');
  assert.notEqual(stored.passwordHash, form.password, 'the password is stored hashed');

  const early = await new Client(srv.base).post('/auth/login', { email: form.email, password: form.password }, { from: '/auth/login' });
  assert.equal(early.status, 403, 'cannot sign in before confirming the address');
  assert.match(formError(early.text), /Confirm your email/);

  const link = mailer.latestLinkFor(form.email);
  assert.ok(link, 'a confirmation link was sent');
  const linkPath = new URL(link).pathname;
  const page1 = await c.get(linkPath);
  const page2 = await c.get(linkPath);
  assert.equal(page1.status, 200);
  assert.equal(page2.status, 200);
  assert.match(page2.text, /Confirm email address/, 'opening the link twice (a mail scanner) does not use it up');
  const done = await c.post(linkPath, {}, { from: linkPath });
  assert.equal(done.status, 200);
  assert.match(done.text, /Email confirmed/);
  assert.equal((await userModel.findByEmail(form.email)).status, 'active');
  const reuse = await c.post(linkPath, {}, { from: '/auth/login' });
  assert.equal(reuse.status, 400, 'the link works once');

  const again = await new Client(srv.base).post('/auth/register', form, { from: '/auth/register' });
  assert.equal(again.status, 302, 'registering an existing address looks the same as a new one');
  assert.match(again.location, /^\/auth\/check-email/);

  const signedInAfter = await new Client(srv.base).post('/auth/login', { email: form.email, password: form.password }, { from: '/auth/login' });
  assert.equal(signedInAfter.status, 302);
  assert.equal(signedInAfter.location, '/dashboard');
});

test('password reset: one-hour link, single use, old password stops working', async () => {
  await scratchUser('resetme@safefind.example', 'Oldpass@123');
  const c = new Client(srv.base);
  const asked = await c.post('/auth/forgot', { email: 'resetme@safefind.example' }, { from: '/auth/forgot' });
  assert.equal(asked.status, 200);
  const unknown = await c.post('/auth/forgot', { email: 'ghost@safefind.example' }, { from: '/auth/forgot' });
  assert.equal(unknown.status, 200);
  assert.match(unknown.text, /If an account exists/, 'same answer for an unknown address');

  const linkPath = new URL(mailer.latestLinkFor('resetme@safefind.example')).pathname;
  assert.equal((await c.post(linkPath, { password: 'weak', confirm: 'weak' }, { from: linkPath })).status, 400);
  const ok = await c.post(linkPath, { password: 'Newpass@123', confirm: 'Newpass@123' }, { from: linkPath });
  assert.equal(ok.status, 302);
  assert.equal((await c.post(linkPath, { password: 'Another@123', confirm: 'Another@123' }, { from: '/auth/forgot' })).status, 400, 'single use');
  assert.equal((await new Client(srv.base).post('/auth/login', { email: 'resetme@safefind.example', password: 'Oldpass@123' }, { from: '/auth/login' })).status, 401);
  assert.equal((await new Client(srv.base).post('/auth/login', { email: 'resetme@safefind.example', password: 'Newpass@123' }, { from: '/auth/login' })).status, 302);
});

test('staff accounts are created by an administrator invitation only (AUTH-5)', async () => {
  const anon = new Client(srv.base);
  const tryRole = await anon.post('/auth/register', { name: 'Sneaky', email: 'sneaky@bup.edu.bd', affiliation: 'student', universityId: '20249990002', password: 'Testing@123', confirm: 'Testing@123', attest: 'on', role: 'admin' }, { from: '/auth/register' });
  assert.equal(tryRole.status, 302);
  assert.equal((await userModel.findByEmail('sneaky@bup.edu.bd')).role, 'member', 'a role field in the form is ignored');

  const admin = await signedIn(srv.base, 'admin');
  const r = await admin.post('/admin/users/invite', { name: 'New Guard', email: 'guard@bup.edu.bd', role: 'security' }, { from: '/admin/users' });
  assert.equal(r.status, 302);
  const invited = await userModel.findByEmail('guard@bup.edu.bd');
  assert.equal(invited.role, 'security');
  assert.ok(!invited.passwordHash, 'no password until the invitation is accepted');
  const linkPath = new URL(mailer.latestLinkFor('guard@bup.edu.bd')).pathname;
  assert.equal((await new Client(srv.base).post('/auth/login', { email: 'guard@bup.edu.bd', password: 'Anything@123' }, { from: '/auth/login' })).status, 401);
  const accept = new Client(srv.base);
  assert.equal((await accept.post(linkPath, { password: 'Guard@123456', confirm: 'Guard@123456' }, { from: linkPath })).status, 302);
  const login = await new Client(srv.base).post('/auth/login', { email: 'guard@bup.edu.bd', password: 'Guard@123456' }, { from: '/auth/login' });
  assert.equal(login.location, '/security');
});

test('an error inside an async handler ends in a 500 page instead of a hung request (D4)', async () => {
  const app = express();
  app.set('views', path.join(__dirname, '..', 'views'));
  app.set('view engine', 'ejs');
  app.set('view options', { root: path.join(__dirname, '..', 'views') });
  app.use(require('../middleware/locale'));
  app.use(require('../middleware/viewHelpers'));
  app.get('/boom', wrap.wrap(async () => { await new Promise((r) => setTimeout(r, 5)); throw new Error('boom'); }));
  app.use(errors.handler);
  const server = await new Promise((resolve) => { const s = http.createServer(app).listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/boom`, { signal: AbortSignal.timeout(3000) });
    assert.equal(res.status, 500);
    assert.match(await res.text(), /Something went wrong on our side/);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('the 404 page is a real page in the visitor language', async () => {
  const c = new Client(srv.base);
  await c.get('/lang/bn?next=/');
  const r = await c.get('/no/such/page');
  assert.equal(r.status, 404);
  assert.match(r.text, /পৃষ্ঠা পাওয়া যায়নি/);
});

test('language switch works without JavaScript and only returns to local pages', async () => {
  const c = new Client(srv.base);
  const r = await c.get('/lang/bn?next=//evil.com');
  assert.equal(r.status, 302);
  assert.equal(r.location, '/');
  assert.equal(c.cookies.get('lang'), 'bn');
  const home = await c.get('/');
  assert.match(home.text, /<html lang="bn"/);
});
