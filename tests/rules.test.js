'use strict';
// Business rules that protect against misuse by insiders: nobody decides on their own case or
// claim, staff do not claim items, daily limits hold, and unclaimed items are flagged, never
// removed automatically.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, signedIn, refFrom } = require('./helpers');
const { toInputValue } = require('../utils/format');

const FORM = '/account';
const DAY = 86400000;
const hoursAgo = (h) => toInputValue(new Date(Date.now() - h * 3600e3));
const lostForm = (extra = {}) => ({
  type: 'lost', categoryId: 12, locationId: 6, title: 'Steel lunch box', occurredAt: hoursAgo(2),
  description: 'Steel lunch box with a red strap and two compartments, left near the dining area.', ...extra
});

test('nobody reviews, approves or confirms a match on their own case', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const caseModel = require('../models/case.model');
  const matchModel = require('../models/match.model');
  const staffA = await signedIn(srv.base, 'security');
  const staffB = await signedIn(srv.base, 'security2');
  const approver = await signedIn(srv.base, 'approver');

  // Security Cell staff can report their own lost things, but cannot review them.
  const mine = await staffB.multipart('/report', lostForm({ categoryId: 14, locationId: 4, title: 'Folding reading glasses', description: 'Black folding reading glasses with a thin metal frame in a hard case.' }), null, { from: FORM });
  const ref = refFrom(mine.location);
  assert.equal((await caseModel.findByRef(ref)).status, 'under_review');
  await staffB.post(`/security/cases/${ref}/review`, { decision: 'accept' }, { from: FORM });
  assert.equal((await caseModel.findByRef(ref)).status, 'under_review', 'own report cannot be accepted by its reporter');
  await staffA.post(`/security/cases/${ref}/review`, { decision: 'accept' }, { from: FORM });
  assert.equal((await caseModel.findByRef(ref)).status, 'open', 'a colleague can');

  // A match that involves that report cannot be confirmed by its reporter either.
  await staffA.multipart('/security/intake', {
    categoryId: 14, locationId: 4, title: 'Black folding glasses in hard case', occurredAt: hoursAgo(1),
    description: 'Black folding reading glasses, thin metal frame, found inside a hard case on a reading table.',
    finderName: 'Library attendant', storageSlot: 'S-20'
  }, null, { from: FORM });
  const lost = await caseModel.findByRef(ref);
  const found = (await caseModel.all()).find((c) => c.type === 'found' && c.storageSlot === 'S-20');
  const m = await matchModel.findPair(lost.id, found.id);
  assert.ok(m, 'engine suggested the pair');
  await staffB.post(`/security/matches/${m.id}/confirm`, {}, { from: FORM });
  assert.equal((await matchModel.get(m.id)).status, 'suggested', 'reporter cannot confirm');
  await staffA.post(`/security/matches/${m.id}/confirm`, {}, { from: FORM });
  assert.equal((await matchModel.get(m.id)).status, 'confirmed');

  // The approver cannot approve a report they filed themselves.
  const phone = await approver.multipart('/report', lostForm({ categoryId: 3, locationId: 1, title: 'Grey smartphone', description: 'Grey smartphone with a cracked clear case and a green sticker on the back.' }), null, { from: FORM });
  const phoneRef = refFrom(phone.location);
  assert.equal((await caseModel.findByRef(phoneRef)).status, 'pending_approval');
  await approver.post(`/approver/cases/${phoneRef}/decision`, { decision: 'approve' }, { from: FORM });
  assert.equal((await caseModel.findByRef(phoneRef)).status, 'pending_approval', 'approver cannot approve their own report');
});

test('Security Cell and administrator accounts cannot claim items, even by posting directly', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const claimModel = require('../models/claim.model');
  const userModel = require('../models/user.model');
  const keys = 'SF-2026-0009'; // an open found item in the seed

  for (const who of ['security', 'admin']) {
    const c = await signedIn(srv.base, who);
    const form = await c.get(`/items/${keys}/claim`);
    assert.equal(form.status, 302, `${who}: the form redirects`);
    const res = await c.multipart(`/items/${keys}/claim`, { statement: 'These are my keys, they have a green tag and two brass keys.' }, null, { from: FORM });
    assert.equal(res.status, 400, `${who}: the claim is refused`);
    const user = await userModel.findByEmail(`${who}@safefind.example`);
    assert.equal((await claimModel.forUser(user.id)).length, 0, `${who}: no claim stored`);
  }
  // Members, and the approver (who cannot see a found item's private details), may.
  const member = await signedIn(srv.base, 'student2');
  const ok = await member.multipart(`/items/${keys}/claim`, { statement: 'These are my keys, they have a green tag and two brass keys.' }, null, { from: FORM });
  assert.equal(ok.status, 302);
});

test('a finder cannot claim the item they found, and one person cannot claim an item twice', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const caseModel = require('../models/case.model');
  const claimModel = require('../models/claim.model');
  const finder = await signedIn(srv.base, 'student');
  const staff = await signedIn(srv.base, 'security');

  const sent = await finder.multipart('/report', lostForm({ type: 'found', title: 'Umbrella with wooden handle', categoryId: 13, description: 'Black umbrella with a curved wooden handle, found at the library entrance.' }), null, { from: FORM });
  const ref = refFrom(sent.location);
  await staff.post(`/security/cases/${ref}/review`, { decision: 'accept', storageSlot: 'U-01' }, { from: FORM });
  assert.equal((await caseModel.findByRef(ref)).status, 'open');

  await finder.multipart(`/items/${ref}/claim`, { statement: 'This is the umbrella I found, so I am claiming it myself.' }, null, { from: FORM });
  const found = await caseModel.findByRef(ref);
  assert.equal((await claimModel.forCase(found.id)).length, 0, 'finder claim refused');

  const other = await signedIn(srv.base, 'student2');
  const stmt = { statement: 'It is my black umbrella, the wooden handle has a small chip near the top.' };
  assert.equal((await other.multipart(`/items/${ref}/claim`, stmt, null, { from: FORM })).status, 302);
  assert.equal((await other.multipart(`/items/${ref}/claim`, stmt, null, { from: FORM })).status, 400, 'second claim by the same person');
  assert.equal((await claimModel.forCase(found.id)).length, 1);
});

test('daily limits stop report floods', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const config = require('../config');
  const caseModel = require('../models/case.model');
  const keep = config.limits.reportsPerDay;
  config.limits.reportsPerDay = 2;
  t.after(() => { config.limits.reportsPerDay = keep; });
  const member = await signedIn(srv.base, 'student2');
  const before = (await caseModel.all()).filter((c) => c.userId === 6 && Date.now() - c.createdAt < DAY).length;
  const room = Math.max(0, 2 - before);
  for (let i = 0; i < room; i += 1) assert.equal((await member.multipart('/report', lostForm({ title: `Lunch box number ${i}` }), null, { from: FORM })).status, 302);
  const over = await member.multipart('/report', lostForm({ title: 'One too many' }), null, { from: FORM });
  assert.equal(over.status, 400);
  assert.ok(!(await caseModel.all()).some((c) => c.title === 'One too many'));
});

test('the own-claim guards hold at the service level, for every staff action', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const claimModel = require('../models/claim.model');
  const userModel = require('../models/user.model');
  const handoverModel = require('../models/handover.model');
  const claims = require('../services/claim.service');
  const handovers = require('../services/handover.service');

  // A member makes a claim and is later given a Security Cell account: they must not process it.
  const member = await userModel.findByEmail('student2@safefind.example');
  const claim = await claims.submit(member, 'SF-2026-0010', { statement: 'These are my white wireless earbuds, the case has a blue sticker.' }, null);
  const promoted = { ...member, role: 'security' };
  for (const [name, run] of [
    ['verify', () => claims.verify(promoted, claim.id, { note: '' })],
    ['requestProof', () => claims.requestProof(promoted, claim.id, 'x')],
    ['reject', () => claims.reject(promoted, claim.id, 'reason')]
  ]) await assert.rejects(run, { code: 'OWN_CLAIM' }, name);
  assert.equal((await claimModel.get(claim.id)).status, 'submitted');

  // The same for the handover itself, on the seeded verified claim.
  const verified = (await claimModel.listByStatuses(['verified']))[0];
  const claimant = { ...(await userModel.findById(verified.userId)), role: 'security' };
  const h = await handoverModel.byClaim(verified.id);
  await assert.rejects(() => handovers.complete(claimant, handovers.makeToken(h), { idChecked: true }), { code: 'OWN_CLAIM' });
  await assert.rejects(() => handovers.renewAs(claimant, verified.id), { code: 'OWN_CLAIM' });
  assert.equal((await handoverModel.byClaim(verified.id)).status, 'pending');
});

test('unclaimed items are flagged after the retention period; staff decide, nothing is removed automatically', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const caseModel = require('../models/case.model');
  const userModel = require('../models/user.model');
  const retention = require('../services/retention.service');
  const staff = await signedIn(srv.base, 'security');
  const admin = await signedIn(srv.base, 'admin');
  const member = await signedIn(srv.base, 'student');

  // Three walk-in found items. Two are made 100 days old (the limit is 90), one stays fresh.
  const intake = async (title, slot) => {
    const res = await staff.multipart('/security/intake', {
      categoryId: 15, locationId: 12, title, occurredAt: hoursAgo(2), finderName: 'Gate guard', storageSlot: slot,
      description: `${title}, handed in at the gate without any other information about the owner.`
    }, null, { from: FORM });
    assert.equal(res.status, 302, res.text.slice(0, 200));
    return caseModel.findByRef(refFrom(res.location));
  };
  const old1 = await intake('Zip pouch with pens', 'R-01');
  const old2 = await intake('Cloth shopping bag', 'R-02');
  const fresh = await intake('Plastic ruler set', 'R-03');
  for (const c of [old1, old2]) await caseModel.update(c.id, { createdAt: new Date(Date.now() - 100 * DAY) });

  assert.ok(!old1.retentionFlaggedAt && !old2.retentionFlaggedAt && !fresh.retentionFlaggedAt);
  const n = await retention.sweep();
  assert.ok(n >= 2, `flagged ${n}`);
  assert.ok((await caseModel.findByRef(old1.ref)).retentionFlaggedAt);
  assert.ok((await caseModel.findByRef(old2.ref)).retentionFlaggedAt);
  assert.ok(!(await caseModel.findByRef(fresh.ref)).retentionFlaggedAt, 'a recent item is not flagged');
  assert.equal((await caseModel.findByRef(old1.ref)).status, 'open', 'flagged is not disposed');
  assert.equal(await retention.sweep(), 0, 'a second sweep flags nothing new');

  const board = await staff.get('/security/unclaimed');
  assert.equal(board.status, 200);
  assert.ok(board.text.includes(old1.ref) && board.text.includes(old2.ref));

  // Disposal needs a known method, and only Security Cell staff can do it.
  await staff.post(`/security/unclaimed/${old1.ref}/dispose`, { method: 'burn' }, { from: FORM });
  assert.equal((await caseModel.findByRef(old1.ref)).status, 'open', 'unknown method refused');
  assert.equal((await admin.post(`/security/unclaimed/${old1.ref}/dispose`, { method: 'donate' }, { from: FORM })).status, 403);
  assert.equal((await member.post(`/security/unclaimed/${old1.ref}/dispose`, { method: 'donate' }, { from: FORM })).status, 403);
  await staff.post(`/security/unclaimed/${old1.ref}/dispose`, { method: 'donate', note: 'Given to the library' }, { from: FORM });
  const done = await caseModel.findByRef(old1.ref);
  const decider = await userModel.findByEmail('security@safefind.example');
  assert.equal(done.status, 'disposed');
  assert.equal(done.disposal.method, 'donate');
  assert.equal(done.disposal.by, decider.id, 'who decided is recorded');
  assert.equal(done.disposal.byName, decider.name);
  assert.ok(!(await new (require('./helpers').Client)(srv.base).get('/browse')).text.includes(old1.ref), 'disposed items leave the public board');

  // An item that was not flagged cannot be disposed of.
  await staff.post(`/security/unclaimed/${fresh.ref}/dispose`, { method: 'donate' }, { from: FORM });
  assert.equal((await caseModel.findByRef(fresh.ref)).status, 'open');

  // Keeping an item restarts its clock.
  await staff.post(`/security/unclaimed/${old2.ref}/extend`, { note: 'Owner contacted' }, { from: FORM });
  const kept = await caseModel.findByRef(old2.ref);
  assert.equal(kept.retentionFlaggedAt, null);
  assert.ok(kept.retentionResetAt);
  assert.equal(await retention.sweep(), 0, 'and it is not flagged again straight away');
});

test('an administrator can approve or reject a report that is waiting for approval', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const caseModel = require('../models/case.model');
  const student = await signedIn(srv.base, 'student');
  const admin = await signedIn(srv.base, 'admin');

  const phone = lostForm({
    categoryId: 3, locationId: 1, title: 'Black campus phone',
    description: 'Black phone in a clear case with a blue sticker and a cracked top corner.'
  });
  const sent = await student.multipart('/report', phone, null, { from: FORM });
  const ref = refFrom(sent.location);
  assert.equal((await caseModel.findByRef(ref)).status, 'pending_approval');

  const page = await admin.get(`/security/cases/${ref}`);
  assert.equal(page.status, 200);
  assert.match(page.text, /Waiting for approval/);
  assert.match(page.text, /name="decision" value="approve"/);

  const decided = await admin.post(`/approver/cases/${ref}/decision`, { decision: 'approve' }, { from: `/security/cases/${ref}` });
  assert.equal(decided.status, 302);
  assert.equal((await caseModel.findByRef(ref)).status, 'under_review');

  const laptop = await student.multipart('/report', lostForm({
    categoryId: 4, locationId: 2, title: 'Silver campus laptop',
    description: 'Silver laptop with a dent on the left corner and a sticker of a book on the lid.'
  }), null, { from: FORM });
  const laptopRef = refFrom(laptop.location);
  const rejected = await admin.post(`/approver/cases/${laptopRef}/decision`, { decision: 'reject', remarks: 'Not enough detail to approve.' }, { from: `/approver/cases/${laptopRef}` });
  assert.equal(rejected.status, 302);
  assert.equal((await caseModel.findByRef(laptopRef)).status, 'rejected');

  const own = await admin.multipart('/report', lostForm({
    categoryId: 3, locationId: 1, title: 'Admin own phone',
    description: 'Black phone with a green case that the administrator reported themselves.'
  }), null, { from: FORM });
  const ownRef = refFrom(own.location);
  await admin.post(`/approver/cases/${ownRef}/decision`, { decision: 'approve' }, { from: FORM });
  assert.equal((await caseModel.findByRef(ownRef)).status, 'pending_approval', 'an administrator cannot approve their own report');
});
