'use strict';
// Registration with an ID card photo (AUTH-8 to AUTH-12): for people who have no university e-mail address.
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, Client, signedIn, tinyPng } = require('./helpers');
const config = require('../config');
const userModel = require('../models/user.model');
const proofModel = require('../models/identityProof.model');
const auditModel = require('../models/audit.model');
const mailer = require('../services/mailer.service');
const identity = require('../services/identity.service');
const images = require('../utils/images');

let srv;
test.before(async () => { srv = await startServer(); });
test.after(async () => { await srv.close(); });

const DAY = 86400000;
let counter = 0;
const next = () => { counter += 1; return counter; };
const png = (n = 0) => ({ field: 'idcard', buffer: tinyPng([40 + n, 90, 160]), type: 'image/png', name: 'card.png' });

// Fills the ID card form the way a browser does and sends it.
async function register(client, over = {}, file = png(), from = '/auth/register/id-card') {
  const n = next();
  const fields = {
    name: 'Rafi Ahmed', email: `rafi${n}@gmail.example`, affiliation: 'student', universityId: `2024${String(7000 + n).padStart(7, '0')}`,
    password: 'Testing@123', confirm: 'Testing@123', attest: 'on', ...over
  };
  const res = await client.multipart('/auth/register/id-card', fields, file, { from });
  return { res, fields };
}

// Registers and confirms the e-mail address, so the person is waiting for the administrator.
async function waiting(over = {}) {
  const client = new Client(srv.base);
  const { res, fields } = await register(client, over);
  assert.equal(res.status, 302, `registration should be accepted (got ${res.status})`);
  const linkPath = new URL(mailer.latestLinkFor(fields.email)).pathname;
  const done = await client.post(linkPath, {}, { from: linkPath });
  assert.equal(done.status, 200);
  const user = await userModel.findByEmail(fields.email);
  const proof = await proofModel.latestByUser(user.id);
  return { client, fields, user, proof, email: fields.email, password: fields.password };
}

const loginAs = (email, password) => new Client(srv.base).post('/auth/login', { email, password }, { from: '/auth/login' });
const formError = (html) => { const m = /class="form-error"[^>]*>([^<]*)</.exec(html); return m ? m[1].trim() : null; };
const storedFiles = () => { try { return fs.readdirSync(config.upload.dir).length; } catch { return 0; } };

test('the registration page offers both ways, and the ID card page asks for a photo and a Gmail-type address', async () => {
  const c = new Client(srv.base);
  const first = await c.get('/auth/register');
  assert.equal(first.status, 200);
  assert.match(first.text, /href="\/auth\/register\/id-card"/, 'the other way is one click away');
  const second = await c.get('/auth/register/id-card');
  assert.equal(second.status, 200);
  assert.match(second.text, /name="idcard"/);
  assert.match(second.text, /enctype="multipart\/form-data"/);
  assert.match(second.text, /action="\/auth\/register\/id-card\?_csrf=[A-Za-z0-9_-]+"/, 'the CSRF token rides in the query string of an upload form');
  assert.match(second.text, /Only the system administrator can see this photo/);
  assert.match(second.text, /deleted 30 days after the decision/);
  assert.match((await c.get('/auth/login')).text, /Joined with an ID card/);
});

test('whole path: register, confirm the address, wait, administrator approves, person signs in with the same address (AUTH-8 to AUTH-10)', async () => {
  const anon = new Client(srv.base);
  const { res, fields } = await register(anon);
  assert.equal(res.status, 302);
  assert.match(res.location, /^\/auth\/check-email\?email=.+&via=id$/);

  const user = await userModel.findByEmail(fields.email);
  assert.equal(user.verificationMethod, 'id_card');
  assert.equal(user.status, 'pending');
  assert.equal(user.emailVerified, false);
  assert.equal(user.role, 'member');
  const proof = await proofModel.latestByUser(user.id);
  assert.equal(proof.status, 'submitted');
  assert.match(proof.file, /^[a-f0-9]{32}\.png$/, 'stored under a random name');
  assert.ok(fs.existsSync(path.join(config.upload.dir, proof.file)));
  assert.match((await new Client(srv.base).get(res.location)).text, /administrator checks your ID card/);

  // Cannot sign in before the address is confirmed, and is not in the administrator's list yet.
  const early = await loginAs(fields.email, fields.password);
  assert.equal(early.status, 403);
  assert.match(formError(early.text), /Confirm your email/);
  const admin = await signedIn(srv.base, 'admin');
  assert.ok(!(await admin.get('/admin/id-reviews')).text.includes(fields.email), 'an unconfirmed address is not queued');

  // Confirming the address does NOT open the account.
  const linkPath = new URL(mailer.latestLinkFor(fields.email)).pathname;
  const done = await anon.post(linkPath, {}, { from: linkPath });
  assert.match(done.text, /administrator will now check your ID card/);
  assert.equal((await userModel.findByEmail(fields.email)).status, 'pending');
  const stillOut = await loginAs(fields.email, fields.password);
  assert.equal(stillOut.status, 403);
  assert.match(formError(stillOut.text), /still checking your ID card/);
  const wrongPw = await loginAs(fields.email, 'Wrong@12345');
  assert.equal(wrongPw.status, 401, 'the state is revealed only after the right password');
  assert.doesNotMatch(formError(wrongPw.text), /ID card|administrator/, 'a wrong password says nothing about the account');

  // Now it is in the list, with what the person typed.
  const queue = await admin.get('/admin/id-reviews');
  assert.ok(queue.text.includes(fields.email));
  const page = await admin.get(`/admin/id-reviews/${proof.id}`);
  assert.equal(page.status, 200);
  assert.ok(page.text.includes(fields.universityId) && page.text.includes('Rafi Ahmed'));
  assert.match(page.text, new RegExp(`src="/admin/id-reviews/${proof.id}/image"`));
  const who = /<p class="who">([^<]*)<\/p>/.exec(page.text);
  assert.ok(who && who[1] !== 'Rafi Ahmed', 'the sidebar shows the signed-in administrator, not the applicant');
  assert.doesNotMatch(page.text, /\$2[aby]\$/, 'no password hash on the page');

  // The photo is served to the administrator only, never cached, and the viewing is audited.
  const img = await admin.get(`/admin/id-reviews/${proof.id}/image`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.match(img.headers.get('cache-control'), /no-store/);
  assert.match(img.headers.get('content-security-policy'), /sandbox/);
  assert.deepEqual([...img.buffer.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], 'the bytes sent are the stored PNG');
  const viewed = await auditModel.list({ action: 'admin.id_viewed' });
  assert.ok(viewed.rows.some((r) => r.entity === fields.email), 'who looked at the photo is on record');

  // Approving needs the box ticked.
  const untick = await admin.post(`/admin/id-reviews/${proof.id}/approve`, {}, { from: `/admin/id-reviews/${proof.id}` });
  assert.equal(untick.status, 302);
  assert.match((await admin.get(untick.location)).text, /Tick the box/);
  assert.equal((await userModel.findByEmail(fields.email)).status, 'pending');

  const ok = await admin.post(`/admin/id-reviews/${proof.id}/approve`, { checked: 'on' }, { from: `/admin/id-reviews/${proof.id}` });
  assert.equal(ok.status, 302);
  assert.equal(ok.location, '/admin/id-reviews');
  assert.equal((await userModel.findByEmail(fields.email)).status, 'active');
  assert.equal((await proofModel.findById(proof.id)).status, 'approved');

  // The person signs in with the address they gave, from now on.
  const signedIn1 = await loginAs(fields.email, fields.password);
  assert.equal(signedIn1.status, 302);
  assert.equal(signedIn1.location, '/dashboard');
  const approvedAudit = await auditModel.list({ action: 'admin.id_approved' });
  assert.ok(approvedAudit.rows.some((r) => r.entity === fields.email));
  assert.equal((await admin.post(`/admin/id-reviews/${proof.id}/approve`, { checked: 'on' }, { from: '/admin/id-reviews' })).status, 302);
  assert.ok((await auditModel.list({ action: 'admin.id_approved' })).rows.filter((r) => r.entity === fields.email).length === 1, 'a second approval does nothing');
});

test('the form refuses what it should and creates nothing (AUTH-8)', async () => {
  const c = new Client(srv.base);
  const before = { users: await userModel.count(), files: storedFiles() };

  const uni = await register(c, { email: 'someone@bup.edu.bd' });
  assert.equal(uni.res.status, 400);
  assert.match(uni.res.text, /university address/);

  const noPhoto = await register(c, {}, null);
  assert.equal(noPhoto.res.status, 400);
  assert.match(formError(noPhoto.res.text) || noPhoto.res.text, /Add a photo of your ID card/);

  const notImage = await register(c, {}, { field: 'idcard', buffer: Buffer.from('this is not an image, it is text '.repeat(4)), type: 'image/png', name: 'x.png' });
  assert.equal(notImage.res.status, 400);
  assert.match(notImage.res.text, /Upload a JPG, PNG or WebP image/);

  assert.equal((await register(c, { universityId: 'abc' })).res.status, 400);
  assert.equal((await register(c, { attest: '' })).res.status, 400);
  assert.equal((await register(c, { confirm: 'Different@123' })).res.status, 400);
  assert.equal((await register(c, { email: 'not-an-email' })).res.status, 400);

  const wrong = await register(c, { email: 'x@gmail.example' });
  assert.equal(wrong.res.status, 302);
  const again = await register(c, { email: 'y@gmail.example', universityId: wrong.fields.universityId });
  assert.equal(again.res.status, 400, 'an ID number already in use is refused');

  assert.equal(await userModel.count(), before.users + 1, 'only the one valid registration created an account');
  assert.equal(storedFiles(), before.files + 1, 'and only one photo was stored');
  const retry = await register(c, { universityId: 'abc' });
  assert.match(retry.res.text, /choose the photo again/i, 'the person is told the browser forgot the file');
});

test('an address that is already registered gets the same answer and no photo is stored (no account enumeration)', async () => {
  const c = new Client(srv.base);
  const filesBefore = storedFiles();
  const proofsBefore = (await proofModel.all()).length;
  const { res } = await register(c, { email: 'student@safefind.example' });
  assert.equal(res.status, 302);
  assert.match(res.location, /^\/auth\/check-email/);
  assert.equal(storedFiles(), filesBefore);
  assert.equal((await proofModel.all()).length, proofsBefore);
});

test('a rejected photo: reason by e-mail, the person sends a new one, and a final rejection ends it (AUTH-10)', async () => {
  const w = await waiting();
  const admin = await signedIn(srv.base, 'admin');

  const noReason = await admin.post(`/admin/id-reviews/${w.proof.id}/reject`, { reason: '' }, { from: `/admin/id-reviews/${w.proof.id}` });
  assert.match((await admin.get(noReason.location)).text, /Choose a reason/);
  const noNote = await admin.post(`/admin/id-reviews/${w.proof.id}/reject`, { reason: 'other', note: '' }, { from: `/admin/id-reviews/${w.proof.id}` });
  assert.match((await admin.get(noNote.location)).text, /short note/);
  assert.equal((await proofModel.findById(w.proof.id)).status, 'submitted');

  const rej = await admin.post(`/admin/id-reviews/${w.proof.id}/reject`, { reason: 'unreadable', note: 'The ID number is blurred.' }, { from: `/admin/id-reviews/${w.proof.id}` });
  assert.equal(rej.status, 302);
  assert.equal((await proofModel.findById(w.proof.id)).status, 'rejected');
  assert.equal((await userModel.findByEmail(w.email)).status, 'pending');

  // The e-mail carries the reason and a link for a new photo.
  const link = mailer.latestLinkFor(w.email);
  assert.match(link, /\/auth\/id-card\/resubmit\//);
  const resubmitPath = new URL(link).pathname;

  // Signing in with the right password goes straight to the same page.
  const bounce = await loginAs(w.email, w.password);
  assert.equal(bounce.status, 302);
  assert.match(bounce.location, /^\/auth\/id-card\/resubmit\//);
  const newPath = bounce.location;
  const page = await new Client(srv.base).get(newPath);
  assert.equal(page.status, 200);
  assert.match(page.text, /The photo cannot be read/);
  assert.match(page.text, /blurred/);
  assert.equal((await new Client(srv.base).get(resubmitPath)).text.includes('name="idcard"'), false, 'a new link replaces the old one');

  // A bad file keeps the link usable; a good one is queued again.
  const person = new Client(srv.base);
  const bad = await person.multipart(newPath, {}, { field: 'idcard', buffer: Buffer.from('plain text pretending to be a photo'), name: 'x.png' }, { from: newPath });
  assert.equal(bad.status, 400);
  const good = await person.multipart(newPath, {}, png(5), { from: newPath });
  assert.equal(good.status, 302);
  assert.equal(good.location, '/auth/login');
  assert.equal((await proofModel.countByUser(w.user.id)), 2);
  const again = await proofModel.latestByUser(w.user.id);
  assert.equal(again.status, 'submitted');
  assert.equal((await person.post(newPath, {}, { from: '/auth/login' })).status, 400, 'the link works once');
  assert.match((await admin.get('/admin/id-reviews')).text, new RegExp(w.email.replace('.', '\\.')));

  // Reject for good: the university ID is released and no new photo can be sent.
  const final = await admin.post(`/admin/id-reviews/${again.id}/reject`, { reason: 'not_bup_card', permanent: 'on' }, { from: `/admin/id-reviews/${again.id}` });
  assert.equal(final.status, 302);
  assert.equal((await proofModel.findById(again.id)).final, true);
  assert.equal((await userModel.findByEmail(w.email)).universityId, null, 'the ID number is free for its real owner');
  const stopped = await loginAs(w.email, w.password);
  assert.equal(stopped.status, 403);
  assert.match(formError(stopped.text), /could not be completed/);
  const owner = await register(new Client(srv.base), { universityId: w.fields.universityId });
  assert.equal(owner.res.status, 302, 'the real owner can now register');
});

test('after the allowed number of photos a rejection is final', async () => {
  const keep = config.auth.idCard.maxAttempts;
  config.auth.idCard.maxAttempts = 1;
  try {
    const w = await waiting();
    const admin = await signedIn(srv.base, 'admin');
    await admin.post(`/admin/id-reviews/${w.proof.id}/reject`, { reason: 'unreadable' }, { from: `/admin/id-reviews/${w.proof.id}` });
    assert.equal((await proofModel.findById(w.proof.id)).final, true);
    assert.equal(await identity.peekResubmit('x'.repeat(30)), null);
    assert.match(formError((await loginAs(w.email, w.password)).text), /could not be completed/);
  } finally {
    config.auth.idCard.maxAttempts = keep;
  }
});

test('no shortcut opens an ID-card account: not the old Approve button, not suspend and reactivate (AUTH-10)', async () => {
  const w = await waiting();
  const admin = await signedIn(srv.base, 'admin');

  const viaUsers = await admin.post(`/admin/users/${w.user.id}/approve`, {}, { from: '/admin/users' });
  assert.equal(viaUsers.status, 302);
  assert.match((await admin.get(viaUsers.location)).text, /Decide on its photo under ID checks/);
  assert.equal((await userModel.findById(w.user.id)).status, 'pending');

  const users = await admin.get(`/admin/users?q=${encodeURIComponent(w.email)}`);
  assert.doesNotMatch(users.text, new RegExp(`/admin/users/${w.user.id}/approve`), 'no Approve button for this person');
  assert.match(users.text, new RegExp(`/admin/id-reviews/${w.proof.id}`), 'a Review link instead');

  await admin.post(`/admin/users/${w.user.id}/suspend`, {}, { from: '/admin/users' });
  assert.equal((await userModel.findById(w.user.id)).status, 'suspended');
  await admin.post(`/admin/users/${w.user.id}/reactivate`, {}, { from: '/admin/users' });
  assert.equal((await userModel.findById(w.user.id)).status, 'pending', 'reactivating does not skip the ID check');

  // After approval, suspend and reactivate work as for anyone.
  await admin.post(`/admin/id-reviews/${w.proof.id}/approve`, { checked: 'on' }, { from: '/admin/id-reviews' });
  await admin.post(`/admin/users/${w.user.id}/suspend`, {}, { from: '/admin/users' });
  await admin.post(`/admin/users/${w.user.id}/reactivate`, {}, { from: '/admin/users' });
  assert.equal((await userModel.findById(w.user.id)).status, 'active');
});

test('only an administrator can see the photo, and no other route serves it (AUTH-11)', async () => {
  const w = await waiting();
  const url = `/admin/id-reviews/${w.proof.id}/image`;
  assert.equal((await new Client(srv.base).get(url)).status, 302, 'anonymous: sent to sign in');
  for (const who of ['student', 'student2', 'staff', 'security', 'approver']) {
    const c = await signedIn(srv.base, who);
    assert.equal((await c.get(url)).status, 403, who);
    assert.equal((await c.get(`/admin/id-reviews/${w.proof.id}`)).status, 403, who);
    assert.equal((await c.post(`/admin/id-reviews/${w.proof.id}/approve`, { checked: 'on' }, { from: '/account' })).status, 403, who);
  }
  const admin = await signedIn(srv.base, 'admin');
  assert.equal((await admin.get(`/uploads/${w.proof.file}`)).status, 404, 'the case-photo route does not know ID photos');
  const owner = await loginAs(w.email, w.password);
  assert.equal(owner.status, 403, 'not even the owner has a session yet');
  assert.equal((await admin.get('/admin/id-reviews/999999')).status, 404);
  assert.equal((await admin.get('/admin/id-reviews/abc/image')).status, 404);
});

test('photos are deleted after the retention time, the decision stays (AUTH-12)', async () => {
  const w = await waiting();
  const admin = await signedIn(srv.base, 'admin');
  const file = w.proof.file;
  await identity.purgeDue(new Date(Date.now() + 365 * DAY)); // other tests' decided photos may go; this undecided one must stay
  assert.ok(fs.existsSync(path.join(config.upload.dir, file)), 'nothing is deleted before a decision');

  await admin.post(`/admin/id-reviews/${w.proof.id}/approve`, { checked: 'on' }, { from: '/admin/id-reviews' });
  const decided = await proofModel.findById(w.proof.id);
  const days = (new Date(decided.purgeAfter) - Date.now()) / DAY;
  assert.ok(days > 29 && days <= 30, `kept for the set number of days (${days.toFixed(2)})`);
  assert.equal(await identity.purgeDue(new Date(Date.now() + 10 * DAY)), 0);
  assert.ok(fs.existsSync(path.join(config.upload.dir, file)), 'still there inside the window');

  assert.equal(await identity.purgeDue(new Date(Date.now() + 31 * DAY)) >= 1, true);
  assert.ok(!fs.existsSync(path.join(config.upload.dir, file)), 'the file is gone');
  const after = await proofModel.findById(w.proof.id);
  assert.equal(after.file, null);
  assert.ok(after.purgedAt);
  assert.equal(after.status, 'approved', 'the decision stays on record');
  const page = await admin.get(`/admin/id-reviews/${w.proof.id}`);
  assert.match(page.text, /Photo deleted/);
  assert.equal((await admin.get(`/admin/id-reviews/${w.proof.id}/image`)).status, 404);
  assert.equal(await identity.purgeDue(new Date(Date.now() + 400 * DAY)), 0, 'running it again does nothing');
});

test('deleteStored refuses names that are not ours and tolerates a missing file', async () => {
  assert.equal(await images.deleteStored('../../etc/passwd'), false);
  assert.equal(await images.deleteStored(''), false);
  assert.equal(await images.deleteStored(`${'a'.repeat(32)}.png`), false, 'a file that is already gone is not an error');
});

test('Cloudinary copy of an ID photo is removed too', async () => {
  const keep = { enabled: config.cloudinary.enabled, folder: config.cloudinary.folder };
  const real = images._state.destroy;
  const calls = [];
  config.cloudinary.enabled = true;
  config.cloudinary.folder = 'safefind-test';
  images._state.destroy = async (id, opts) => { calls.push({ id, opts }); return { result: 'ok' }; };
  try {
    const name = `${'b'.repeat(32)}.jpg`;
    assert.equal(await images.deleteStored(name), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].id, `safefind-test/${'b'.repeat(32)}`);
    assert.equal(calls[0].opts.type, 'authenticated');
  } finally {
    config.cloudinary.enabled = keep.enabled;
    config.cloudinary.folder = keep.folder;
    images._state.destroy = real;
  }
});

test('the switch: with ID card registration off, the page, the tab and the form are gone', async () => {
  config.auth.idCard.enabled = false;
  try {
    const c = new Client(srv.base);
    assert.equal((await c.get('/auth/register/id-card')).status, 404);
    assert.doesNotMatch((await c.get('/auth/register')).text, /register\/id-card/);
    assert.doesNotMatch((await c.get('/auth/login')).text, /Joined with an ID card/);
    const { res } = await register(c, {}, png(), '/auth/login');
    assert.equal(res.status, 404);
  } finally {
    config.auth.idCard.enabled = true;
  }
});

test('authority accounts still need a university address (AUTH-5 is unchanged)', async () => {
  const admin = await signedIn(srv.base, 'admin');
  const r = await admin.post('/admin/users/invite', { name: 'Guard Two', email: 'guard2@gmail.example', role: 'security' }, { from: '/admin/users' });
  assert.equal(r.status, 302);
  assert.equal(await userModel.findByEmail('guard2@gmail.example'), null);
  assert.match((await admin.get(r.location)).text, /Use your university email address/);
});

test('a person who joined by university e-mail is not affected', async () => {
  const c = new Client(srv.base);
  const form = { name: 'Plain Student', email: `plain${next()}@bup.edu.bd`, affiliation: 'student', universityId: `2024${String(9000 + counter).padStart(7, '0')}`, password: 'Testing@123', confirm: 'Testing@123', attest: 'on' };
  assert.equal((await c.post('/auth/register', form, { from: '/auth/register' })).status, 302);
  const linkPath = new URL(mailer.latestLinkFor(form.email)).pathname;
  const done = await c.post(linkPath, {}, { from: linkPath });
  assert.match(done.text, /Email confirmed/);
  const u = await userModel.findByEmail(form.email);
  assert.equal(u.verificationMethod, 'university_email');
  assert.equal(u.status, 'active');
});

test('the administrator is told, the list and the dashboard show the count, and Bangla pages render', async () => {
  const w = await waiting();
  const admin = await signedIn(srv.base, 'admin');
  assert.match((await admin.get('/admin')).text, /ID card\(s\) waiting for review/);
  assert.match((await admin.get('/admin/id-reviews?status=rejected')).text, /ID checks/);
  assert.equal((await admin.get('/admin/id-reviews?status=nonsense')).status, 200, 'an unknown filter falls back to the waiting list');
  const bn = new Client(srv.base);
  await bn.get('/lang/bn?next=/');
  const page = await bn.get('/auth/register/id-card');
  assert.equal(page.status, 200);
  assert.match(page.text, /আইডি কার্ড/);
  assert.ok(w.proof.id > 0);
});
