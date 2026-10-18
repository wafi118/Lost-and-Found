'use strict';
// Claims and tiered ownership verification (FR-14, FR-15, FR-24).
//   Tier 1: staff compare the claimant's statement with the private details of the found item.
//   Tier 2: for high-value categories the claimant must also upload a photo or document.
// Nobody verifies their own claim.
const claimModel = require('../models/claim.model');
const caseModel = require('../models/case.model');
const categoryModel = require('../models/category.model');
const locationModel = require('../models/location.model');
const userModel = require('../models/user.model');
const handoverModel = require('../models/handover.model');
const config = require('../config');
const { CASE, CLAIM, CLAIM_ACTIVE } = require('../config/statuses');
const { ROLES } = require('../config/roles');
const { saveImage } = require('../utils/images');
const audit = require('./audit.service');
const notifications = require('./notification.service');
const handovers = require('./handover.service');
const matching = require('./matching.service');
const { ServiceError } = require('./errors');

const CLAIMABLE = [CASE.OPEN, CASE.MATCHED, CASE.CLAIM_PENDING];
const DAY = 86400000;

async function loadClaim(id) {
  const claim = await claimModel.get(id);
  if (!claim) throw new ServiceError('NOT_FOUND');
  const found = await caseModel.findById(claim.foundCaseId);
  if (!found) throw new ServiceError('NOT_FOUND');
  return { claim, found };
}

async function event(claim, key, params = {}, staffOnly = false) {
  const events = [...claim.events, { at: new Date(), key, params, staffOnly }];
  await claimModel.update(claim.id, { events });
}

// After a claim ends without a handover, the found item returns to the board.
async function release(foundId) {
  const found = await caseModel.findById(foundId);
  if (!found || ![CASE.CLAIM_PENDING, CASE.READY].includes(found.status)) return;
  const stillActive = (await claimModel.forCase(foundId)).some((c) => CLAIM_ACTIVE.includes(c.status));
  if (stillActive) {
    const verified = (await claimModel.forCase(foundId)).some((c) => c.status === CLAIM.VERIFIED);
    await caseModel.update(foundId, { status: verified ? CASE.READY : CASE.CLAIM_PENDING });
    return;
  }
  await caseModel.update(foundId, { status: CASE.OPEN });
  await matching.recomputeStatus(foundId);
}

async function releaseLost(lostId) {
  if (!lostId) return;
  const lost = await caseModel.findById(lostId);
  if (!lost || ![CASE.CLAIM_PENDING, CASE.READY].includes(lost.status)) return;
  await caseModel.update(lostId, { status: CASE.OPEN });
  await matching.recomputeStatus(lostId);
}

async function savePhoto(file) {
  if (!file) return null;
  try {
    const saved = await saveImage(file.buffer);
    return { file: saved.file, mime: saved.mime, at: new Date() };
  } catch (err) {
    if (err.message === 'UPLOAD_TYPE' || err.message === 'UPLOAD_STORAGE') throw new ServiceError(err.message);
    throw err;
  }
}

// ---------------------------------------------------------------- claimant actions
// Security Cell and Administrator accounts can read the private details of found items, so they
// cannot also claim one. A staff member who loses something uses a separate member account.
const STAFF_ROLES = [ROLES.SECURITY, ROLES.ADMIN];

async function submit(user, foundRef, { statement, lostRef, proofNote }, file, ip = '') {
  if (STAFF_ROLES.includes(user.role)) throw new ServiceError('STAFF_CANNOT_CLAIM');
  const found = await caseModel.findByRef(foundRef);
  if (!found || found.type !== 'found' || !CLAIMABLE.includes(found.status)) throw new ServiceError('NOT_CLAIMABLE');
  if (found.userId && found.userId === user.id) throw new ServiceError('OWN_FOUND');

  const mine = await claimModel.forUser(user.id);
  if (mine.some((c) => c.foundCaseId === found.id && CLAIM_ACTIVE.includes(c.status))) throw new ServiceError('ALREADY_CLAIMED');
  if (mine.filter((c) => c.createdAt.getTime() > Date.now() - DAY).length >= config.limits.claimsPerDay) throw new ServiceError('CLAIM_LIMIT');

  let lost = null;
  if (lostRef) {
    lost = await caseModel.findByRef(lostRef);
    if (!lost || lost.userId !== user.id || lost.type !== 'lost' || ![CASE.OPEN, CASE.MATCHED].includes(lost.status)) throw new ServiceError('LOST_INVALID');
  }
  const proof = await savePhoto(file);
  const claim = await claimModel.create({
    foundCaseId: found.id, lostCaseId: lost ? lost.id : null, userId: user.id, statement,
    events: [{ at: new Date(), key: 'cev_submitted', params: {}, staffOnly: false }]
  });
  if (proof) await claimModel.update(claim.id, { proof, proofNote: proofNote || '' });

  if ([CASE.OPEN, CASE.MATCHED].includes(found.status)) await caseModel.update(found.id, { status: CASE.CLAIM_PENDING });
  await caseModel.addEvent(found.id, { key: 'ev_claim_received', params: {}, staffOnly: true });
  if (lost) {
    await caseModel.update(lost.id, { status: CASE.CLAIM_PENDING });
    await caseModel.addEvent(lost.id, { key: 'ev_claim_submitted', params: { other: found.ref } });
  }
  await notifications.notifyRole(ROLES.SECURITY, 'notif_claim_submitted', { ref: found.ref }, `/security/claims/${claim.id}`);
  await audit.record(user, 'claim.submitted', found.ref, `claim ${claim.id}`, ip);
  return claimModel.get(claim.id);
}

async function submitProof(user, claimId, { proofNote }, file, ip = '') {
  const { claim, found } = await loadClaim(claimId);
  if (claim.userId !== user.id) throw new ServiceError('NOT_FOUND');
  if (claim.status !== CLAIM.PROOF_REQUESTED) throw new ServiceError('BAD_STATE');
  if (!file) throw new ServiceError('PROOF_FILE_REQUIRED');
  const proof = await savePhoto(file);
  await claimModel.update(claim.id, { proof, proofNote: proofNote || '', status: CLAIM.SUBMITTED });
  await event(claim, 'cev_proof_sent');
  await notifications.notifyRole(ROLES.SECURITY, 'notif_proof_received', { ref: found.ref }, `/security/claims/${claim.id}`);
  await audit.record(user, 'claim.proof_uploaded', found.ref, `claim ${claim.id}`, ip);
}

async function withdraw(user, claimId, ip = '') {
  const { claim, found } = await loadClaim(claimId);
  if (claim.userId !== user.id) throw new ServiceError('NOT_FOUND');
  if (!CLAIM_ACTIVE.includes(claim.status)) throw new ServiceError('BAD_STATE');
  await claimModel.update(claim.id, { status: CLAIM.REJECTED, verification: { by: user.id, byName: user.name, at: new Date(), note: 'Withdrawn by claimant' } });
  await event(claim, 'cev_withdrawn');
  const h = await handovers.forClaim(claim.id);
  if (h && h.status === 'pending') await handoverModel.update(h.id, { status: 'cancelled' });
  await release(found.id);
  await releaseLost(claim.lostCaseId);
  await audit.record(user, 'claim.withdrawn', found.ref, `claim ${claim.id}`, ip);
}

// ---------------------------------------------------------------- staff actions
function guard(staff, claim) {
  if (claim.userId === staff.id) throw new ServiceError('OWN_CLAIM');
}

async function requestProof(staff, claimId, note, ip = '') {
  const { claim, found } = await loadClaim(claimId);
  guard(staff, claim);
  if (claim.status !== CLAIM.SUBMITTED) throw new ServiceError('BAD_STATE');
  await claimModel.update(claim.id, { status: CLAIM.PROOF_REQUESTED, proofRequestedNote: note || '' });
  await event(claim, 'cev_proof_requested', { note: note || '' });
  await notifications.notify(claim.userId, 'notif_proof_requested', { ref: found.ref }, `/claims/${claim.id}`, { email: true });
  await audit.record(staff, 'claim.proof_requested', found.ref, `claim ${claim.id}`, ip);
}

async function verify(staff, claimId, { note }, ip = '') {
  const { claim, found } = await loadClaim(claimId);
  guard(staff, claim);
  if (claim.status !== CLAIM.SUBMITTED) throw new ServiceError('BAD_STATE');
  const category = await categoryModel.get(found.categoryId);
  const tier2 = Boolean(category && category.highValue);
  if (tier2 && !claim.proof) throw new ServiceError('PROOF_REQUIRED');
  const siblings = await claimModel.forCase(found.id);
  if (siblings.some((c) => c.id !== claim.id && c.status === CLAIM.VERIFIED)) throw new ServiceError('ANOTHER_VERIFIED');

  await claimModel.update(claim.id, { status: CLAIM.VERIFIED, verification: { by: staff.id, byName: staff.name, at: new Date(), tier: tier2 ? 2 : 1, note: note || '' } });
  await event(claim, 'cev_verified', {});
  await caseModel.update(found.id, { status: CASE.READY });
  await caseModel.addEvent(found.id, { key: 'ev_ready', params: {}, staffOnly: true });
  if (claim.lostCaseId) {
    await caseModel.update(claim.lostCaseId, { status: CASE.READY });
    await caseModel.addEvent(claim.lostCaseId, { key: 'ev_ready_claimant', params: {} });
  }
  await handovers.create(claim);
  await notifications.notify(claim.userId, 'notif_claim_verified', { ref: found.ref }, `/claims/${claim.id}`, { email: true });
  await audit.record(staff, 'claim.verified', found.ref, `claim ${claim.id}, tier ${tier2 ? 2 : 1}`, ip);
}

async function reject(staff, claimId, reason, ip = '') {
  const { claim, found } = await loadClaim(claimId);
  guard(staff, claim);
  if (![CLAIM.SUBMITTED, CLAIM.PROOF_REQUESTED].includes(claim.status)) throw new ServiceError('BAD_STATE');
  if (!reason) throw new ServiceError('REASON_REQUIRED');
  await claimModel.update(claim.id, { status: CLAIM.REJECTED, verification: { by: staff.id, byName: staff.name, at: new Date(), note: reason } });
  await event(claim, 'cev_rejected', { reason });
  await release(found.id);
  await releaseLost(claim.lostCaseId);
  await notifications.notify(claim.userId, 'notif_claim_rejected', { ref: found.ref, reason }, `/claims/${claim.id}`, { email: true });
  await audit.record(staff, 'claim.rejected', found.ref, `claim ${claim.id}: ${reason}`, ip);
}

// ---------------------------------------------------------------- reading
async function hydrateClaim(claim, { forStaff = false } = {}) {
  const [found, cats, locs, claimant] = await Promise.all([
    caseModel.findById(claim.foundCaseId), categoryModel.list(), locationModel.list(),
    forStaff ? userModel.findById(claim.userId) : null
  ]);
  const category = cats.find((c) => c.id === found.categoryId);
  const location = locs.find((l) => l.id === found.locationId);
  const lost = claim.lostCaseId ? await caseModel.findById(claim.lostCaseId) : null;
  const out = {
    ...claim,
    found: { ref: found.ref, status: found.status, title: category && category.sensitive && !forStaff ? null : found.title, category, location, occurredAt: found.occurredAt },
    lost: lost ? { ref: lost.ref, title: lost.title } : null
  };
  if (forStaff) {
    out.claimant = claimant;
    out.foundPrivate = { description: found.description, locationDetail: found.locationDetail, hasPhoto: Boolean(found.photo), photo: found.photo || null, storageSlot: found.storageSlot, title: found.title };
    out.lostPrivate = lost ? { description: lost.description, locationDetail: lost.locationDetail, occurredAt: lost.occurredAt } : null;
    out.tier2 = Boolean(category && category.highValue);
  }
  return out;
}

async function getForViewer(user, id) {
  const claim = await claimModel.get(id);
  if (!claim) return null;
  const staff = user.role === ROLES.SECURITY || user.role === ROLES.ADMIN;
  if (claim.userId !== user.id && !staff) return null;
  const hydrated = await hydrateClaim(claim, { forStaff: staff && claim.userId !== user.id });
  hydrated.events = claim.events.filter((e) => staff || !e.staffOnly);
  return hydrated;
}

async function listMine(user) {
  const rows = await claimModel.forUser(user.id);
  return Promise.all(rows.map((c) => hydrateClaim(c)));
}

async function listForStaff(statuses) {
  const rows = await claimModel.listByStatuses(statuses);
  return Promise.all(rows.map((c) => hydrateClaim(c, { forStaff: true })));
}

module.exports = { submit, canClaimAs: (user) => !STAFF_ROLES.includes(user.role), submitProof, withdraw, requestProof, verify, reject, getForViewer, listMine, listForStaff, hydrateClaim, CLAIMABLE };
