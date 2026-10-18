'use strict';
// The whole case lifecycle through the real forms: report, review, intake, match, claim,
// verification, QR handover and closing, with the attempts that must fail along the way.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, Client, signedIn, tinyPng, decodeQr, refFrom } = require('./helpers');
const { toInputValue } = require('../utils/format');

const FORM = '/account'; // any page that shows a form, to read the session's CSRF token from
const hoursAgo = (h) => toInputValue(new Date(Date.now() - h * 3600e3));
const photo = () => ({ field: 'photo', buffer: tinyPng(), type: 'image/png', name: 'photo.png' });

test('lifecycle: report, match, claim, verify, QR handover, close', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const caseModel = require('../models/case.model');
  const claimModel = require('../models/claim.model');
  const matchModel = require('../models/match.model');
  const handoverModel = require('../models/handover.model');
  const matching = require('../services/matching.service');

  const owner = await signedIn(srv.base, 'student2');
  const rival = await signedIn(srv.base, 'student');
  const staffA = await signedIn(srv.base, 'security');
  const staffB = await signedIn(srv.base, 'security2');
  const admin = await signedIn(srv.base, 'admin');
  const anon = new Client(srv.base);

  let lost; let found; let claim; let rivalClaim; let token; let shortCode;

  await t.test('a member reports a lost item with a photo; it waits for review and is not public', async () => {
    const res = await owner.multipart('/report', {
      type: 'lost', categoryId: 14, locationId: 4, title: 'Tortoiseshell reading glasses',
      description: 'Brown tortoiseshell frame reading glasses in a grey fabric case, left on a table near the window.',
      locationDetail: 'Tables by the window', occurredAt: hoursAgo(5)
    }, photo(), { from: FORM });
    assert.equal(res.status, 302, res.text.slice(0, 300));
    const ref = refFrom(res.location);
    assert.ok(ref, 'redirects to the new case');
    lost = await caseModel.findByRef(ref);
    assert.equal(lost.status, 'under_review');
    assert.ok(lost.photo, 'photo stored');
    assert.ok(!(await anon.get('/browse?q=tortoiseshell')).text.includes(ref), 'not public before review');
    assert.equal((await anon.get(`/items/${ref}`)).status, 404, 'anonymous cannot open it');
  });

  await t.test('Security Cell accepts it; the public board then shows only the public fields', async () => {
    const res = await staffA.post(`/security/cases/${lost.ref}/review`, { decision: 'accept' }, { from: FORM });
    assert.equal(res.status, 302);
    lost = await caseModel.findById(lost.id);
    assert.equal(lost.status, 'open');
    const board = await anon.get('/browse?q=tortoiseshell');
    assert.ok(board.text.includes(lost.ref));
    assert.ok(!board.text.includes('grey fabric case'), 'description stays private');
    assert.ok(!board.text.includes('Tables by the window'), 'exact spot stays private');
    assert.ok(!board.text.includes(lost.photo), 'photo stays private');
  });

  await t.test('a walk-in found item is recorded; the engine suggests the pair with an explainable score', async () => {
    const res = await staffA.multipart('/security/intake', {
      categoryId: 14, locationId: 4, title: 'Reading glasses with tortoiseshell frame',
      description: 'Tortoiseshell frame reading glasses with a grey fabric case, found on a table by the window in the reading hall.',
      locationDetail: 'Table by the window', occurredAt: hoursAgo(3),
      finderName: 'Library attendant', storageSlot: 'S-14'
    }, photo(), { from: FORM });
    assert.equal(res.status, 302, res.text.slice(0, 300));
    found = await caseModel.findByRef(refFrom(res.location));
    assert.equal(found.status, 'open');
    assert.equal(found.storageSlot, 'S-14');

    const m = await matchModel.findPair(lost.id, found.id);
    assert.ok(m, 'pair suggested');
    assert.equal(m.status, 'suggested');
    assert.ok(m.score >= 40, `score ${m.score}`);
    assert.deepEqual(Object.keys(m.breakdown).sort(), ['category', 'description', 'location', 'time']);
    assert.ok(m.reasons.length >= 2, 'reasons are listed');
    assert.equal((await matching.forCaseView(lost.id, 'member')).length, 0, 'the owner sees nothing until staff confirm');
  });

  await t.test('staff confirm the match; the owner gets coarse reasons, never the score', async () => {
    const m = await matchModel.findPair(lost.id, found.id);
    const res = await staffA.post(`/security/matches/${m.id}/confirm`, {}, { from: FORM });
    assert.equal(res.status, 302);
    assert.equal((await caseModel.findById(lost.id)).status, 'matched');
    assert.equal((await caseModel.findById(found.id)).status, 'matched');
    const seen = await matching.forCaseView(lost.id, 'member');
    assert.equal(seen.length, 1);
    assert.ok(seen[0].publicReasons.length > 0);
    assert.equal(seen[0].score, undefined);
    assert.equal(seen[0].breakdown, undefined);
    assert.ok((await owner.get('/notifications')).text.includes(lost.ref), 'owner is notified');
  });

  await t.test('two members claim the item; staff see private details, the claimant does not see the shelf', async () => {
    const statement = 'They are my reading glasses, tortoiseshell frame, grey fabric case with a small tear on one side.';
    let res = await owner.multipart(`/items/${found.ref}/claim`, { statement, lostRef: lost.ref }, null, { from: FORM });
    assert.equal(res.status, 302, res.text.slice(0, 300));
    claim = await claimModel.get(Number(/\/claims\/(\d+)/.exec(res.location)[1]));
    assert.equal(claim.status, 'submitted');

    res = await rival.multipart(`/items/${found.ref}/claim`, { statement: 'I think these are mine, I lost glasses in the library last week.' }, null, { from: FORM });
    assert.equal(res.status, 302, res.text.slice(0, 300));
    rivalClaim = await claimModel.get(Number(/\/claims\/(\d+)/.exec(res.location)[1]));

    assert.equal((await caseModel.findById(found.id)).status, 'claim_pending');
    const staffView = await staffA.get(`/security/claims/${claim.id}`);
    assert.equal(staffView.status, 200);
    assert.ok(staffView.text.includes('grey fabric case'), 'staff compare against the private description');
    const ownView = await owner.get(`/claims/${claim.id}`);
    assert.equal(ownView.status, 200);
    assert.ok(!ownView.text.includes('S-14'), 'storage slot is staff-only');
    assert.equal((await rival.get(`/claims/${claim.id}`)).status, 404, 'another member cannot open the claim');
  });

  await t.test('verification: the claim is verified once, a second verified claim is refused', async () => {
    const res = await staffA.post(`/security/claims/${claim.id}/verify`, { note: 'Described the case and the tear correctly.' }, { from: FORM });
    assert.equal(res.status, 302);
    claim = await claimModel.get(claim.id);
    assert.equal(claim.status, 'verified');
    assert.equal((await caseModel.findById(found.id)).status, 'ready_for_handover');
    assert.equal((await handoverModel.byClaim(claim.id)).status, 'pending');

    await staffA.post(`/security/claims/${rivalClaim.id}/verify`, {}, { from: FORM });
    assert.equal((await claimModel.get(rivalClaim.id)).status, 'submitted', 'a second claimant is not verified for the same item');
  });

  await t.test('only the claimant sees the QR image, and it decodes to a signed token', async () => {
    const page = await owner.get(`/claims/${claim.id}`);
    shortCode = /class="code-big">([A-Z0-9-]+)</.exec(page.text)[1];
    assert.match(shortCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const qr = await owner.get(`/claims/${claim.id}/qr.png`, { raw: true });
    assert.equal(qr.status, 200);
    assert.equal(qr.headers.get('content-type'), 'image/png');
    assert.match(qr.headers.get('cache-control'), /no-store/);
    token = decodeQr(qr.buffer);
    assert.match(token, /^sf1\.[\w-]+\.[\w-]+$/);

    assert.equal((await rival.get(`/claims/${claim.id}/qr.png`, { raw: true })).status, 404);
    assert.equal((await anon.get(`/claims/${claim.id}/qr.png`, { raw: true })).status, 302, 'anonymous is sent to sign in');
  });

  await t.test('handover refuses a missing ID check, a changed token and the wrong roles', async () => {
    const before = JSON.stringify(await handoverModel.byClaim(claim.id));
    const stillPending = async () => assert.equal(JSON.stringify(await handoverModel.byClaim(claim.id)), before);

    let res = await staffB.post('/security/handover/complete', { code: token }, { from: FORM });
    assert.equal(res.status, 400, 'ID check is required');
    await stillPending();

    const tampered = token.slice(0, -2) + (token.endsWith('AA') ? 'BB' : 'AA');
    res = await staffB.post('/security/handover/complete', { code: tampered, idChecked: 'on' }, { from: FORM });
    assert.equal(res.status, 400, 'a changed token is refused');
    await stillPending();

    assert.equal((await owner.post('/security/handover/complete', { code: token, idChecked: 'on' }, { from: FORM })).status, 403, 'the claimant cannot complete it');
    assert.equal((await admin.post('/security/handover/complete', { code: token, idChecked: 'on' }, { from: FORM })).status, 403, 'the administrator only reads');
    await stillPending();
  });

  await t.test('staff look up the scanned code and see who should receive the item', async () => {
    const res = await staffB.post('/security/handover/lookup', { code: token }, { from: FORM });
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('Reading glasses with tortoiseshell frame'));
    assert.ok(res.text.includes('S-14'));
    assert.ok(res.text.includes('student2@safefind.example'));
  });

  await t.test('completing the handover closes both cases and ends the competing claim', async () => {
    const res = await staffB.post('/security/handover/complete', { code: token, idChecked: 'on' }, { from: FORM });
    assert.equal(res.status, 302, res.text.slice(0, 300));
    assert.equal((await claimModel.get(claim.id)).status, 'completed');
    const f = await caseModel.findById(found.id);
    const l = await caseModel.findById(lost.id);
    assert.equal(f.status, 'closed');
    assert.equal(f.closeReason, 'returned');
    assert.equal(l.status, 'closed');
    assert.equal(l.closeReason, 'recovered');
    assert.equal((await claimModel.get(rivalClaim.id)).status, 'rejected');
    assert.ok((await rival.get('/notifications')).text.includes(found.ref), 'the other claimant is told');
  });

  await t.test('the code works once: a replay of the token or the short code fails', async () => {
    let res = await staffA.post('/security/handover/complete', { code: token, idChecked: 'on' }, { from: FORM });
    assert.equal(res.status, 400);
    res = await staffA.post('/security/handover/complete', { code: shortCode, idChecked: 'on' }, { from: FORM });
    assert.equal(res.status, 400);
    assert.equal((await handoverModel.byClaim(claim.id)).status, 'completed');
  });

  await t.test('closed cases leave the public board and every step is in the audit trail', async () => {
    const board = await anon.get('/browse?q=reading');
    assert.ok(!board.text.includes(found.ref) && !board.text.includes(lost.ref));
    assert.equal((await anon.get(`/items/${found.ref}`)).status, 404);

    for (const action of ['case.created', 'case.review_accepted', 'case.intake', 'match.confirmed', 'claim.submitted', 'claim.verified', 'handover.completed']) {
      const page = await admin.get(`/admin/audit?action=${action}`);
      assert.equal(page.status, 200, action);
      assert.ok(page.text.includes(action), `audit page lists ${action}`);
    }
    const done = await admin.get('/admin/audit?action=handover.completed');
    assert.ok(done.text.includes(found.ref), 'the completed handover names the case');
  });
});

test('handover codes expire and staff can issue a new one', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const claimModel = require('../models/claim.model');
  const handoverModel = require('../models/handover.model');
  const handovers = require('../services/handover.service');
  const staff = await signedIn(srv.base, 'security');

  // The seeded water bottle claim is verified and waiting for pickup.
  const verified = (await claimModel.listByStatuses(['verified']))[0];
  assert.ok(verified, 'seed has a verified claim');
  const h = await handoverModel.byClaim(verified.id);
  await handoverModel.update(h.id, { expiresAt: new Date(Date.now() - 1000) });

  const expired = await staff.post('/security/handover/lookup', { code: handovers.shortCode(h) }, { from: FORM });
  assert.equal(expired.status, 400, 'an expired code is refused');

  const renewed = await staff.post(`/security/claims/${verified.id}/renew`, {}, { from: FORM });
  assert.equal(renewed.status, 302);
  const fresh = await handoverModel.byClaim(verified.id);
  assert.ok(new Date(fresh.expiresAt) > new Date());
  assert.notEqual(fresh.nonce, h.nonce, 'the old code no longer works');
  const old = await staff.post('/security/handover/lookup', { code: handovers.makeToken(h) }, { from: FORM });
  assert.equal(old.status, 400);
  const ok = await staff.post('/security/handover/lookup', { code: handovers.shortCode(fresh) }, { from: FORM });
  assert.equal(ok.status, 200);
});
