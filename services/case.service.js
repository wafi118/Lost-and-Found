'use strict';
// Report lifecycle (FR-03 to FR-08, FR-24). This is where the privacy rules for what a
// given viewer may see are applied, so templates never receive fields they must not show.
const caseModel = require('../models/case.model');
const categoryModel = require('../models/category.model');
const locationModel = require('../models/location.model');
const userModel = require('../models/user.model');
const investigationModel = require('../models/investigation.model');
const updateModel = require('../models/caseUpdate.model');
const { deleteStored } = require('../utils/images');
const { paginate } = require('../models/collection');
const config = require('../config');
const { CASE, PUBLIC_VISIBLE } = require('../config/statuses');
const { ROLES } = require('../config/roles');
const { saveImage } = require('../utils/images');
const { progressFor } = require('../utils/progress');
const audit = require('./audit.service');
const notifications = require('./notification.service');
const matching = require('./matching.service');
const { ServiceError } = require('./errors');

const DAY = 86400000;

// ---------------------------------------------------------------- lookups
async function lookups() {
  const [cats, locs] = await Promise.all([categoryModel.list(), locationModel.list()]);
  return { cats, locs, catMap: new Map(cats.map((c) => [c.id, c])), locMap: new Map(locs.map((l) => [l.id, l])) };
}

// Attach category and location to each case (used by list pages).
async function decorate(cases) {
  const { catMap, locMap } = await lookups();
  return cases.map((c) => ({ ...c, category: catMap.get(c.categoryId) || null, location: locMap.get(c.locationId) || null }));
}

const localName = (obj, lang, key = 'name') => (obj ? (lang === 'bn' && obj[`${key}Bn`] ? obj[`${key}Bn`] : obj[key]) : '');

// ---------------------------------------------------------------- public feed (PUB-1 to PUB-6)
// Only these fields ever leave for an anonymous visitor.
function publicCard(c, cat, loc, lang) {
  const masked = Boolean(cat && cat.sensitive);
  return {
    ref: c.ref, type: c.type, status: c.status, occurredAt: c.occurredAt,
    title: masked ? localName(cat, lang) : c.title,
    categoryName: localName(cat, lang),
    building: loc ? localName(loc, lang, 'building') : '',
    masked
  };
}

async function publicFeed({ type, categoryId, q, building, page = 1, pageSize = 12 } = {}, lang = 'en') {
  const { cats, locs, catMap, locMap } = await lookups();
  const text = String(q || '').trim().slice(0, 60).toLowerCase();
  const needle = text.length >= 2 ? text : '';
  const publicSearch = needle ? {
    text: needle,
    titleCategoryIds: cats.filter((c) => !c.sensitive).map((c) => c.id),
    categoryIds: cats.filter((c) => c.name.toLowerCase().includes(needle) || (c.nameBn || '').toLowerCase().includes(needle)).map((c) => c.id),
    locationIds: locs.filter((l) => l.building.toLowerCase().includes(needle) || (l.buildingBn || '').toLowerCase().includes(needle)).map((l) => l.id)
  } : undefined;

  const result = await caseModel.query({
    type: type === 'lost' || type === 'found' ? type : undefined,
    statuses: PUBLIC_VISIBLE,
    categoryId: categoryId ? Number(categoryId) : undefined,
    // The card shows the building (PUB-2), so the building is a public thing to filter by.
    locationIds: building ? locs.filter((l) => l.active && l.building === building).map((l) => l.id) : undefined,
    publicSearch, page, pageSize
  });
  return {
    ...result,
    rows: result.rows.map((c) => publicCard(c, catMap.get(c.categoryId), locMap.get(c.locationId), lang))
  };
}

// Aggregates only: no individual case can be identified from these numbers.
async function publicStats() {
  const all = await caseModel.all();
  return {
    openLost: all.filter((c) => c.type === 'lost' && PUBLIC_VISIBLE.includes(c.status)).length,
    openFound: all.filter((c) => c.type === 'found' && PUBLIC_VISIBLE.includes(c.status)).length,
    returned: all.filter((c) => c.type === 'found' && c.closeReason === 'returned').length
  };
}

// ---------------------------------------------------------------- creating reports
function checkWhen(occurredAt) {
  if (!(occurredAt instanceof Date) || Number.isNaN(occurredAt.getTime())) throw new ServiceError('WHEN_INVALID');
  if (occurredAt.getTime() > Date.now() + 5 * 60 * 1000) throw new ServiceError('WHEN_FUTURE');
  if (occurredAt.getTime() < Date.now() - 365 * DAY) throw new ServiceError('WHEN_OLD');
}

async function checkRefs(categoryId, locationId) {
  const [cat, loc] = await Promise.all([categoryModel.get(categoryId), locationModel.get(locationId)]);
  if (!cat || !cat.active) throw new ServiceError('CATEGORY_INVALID');
  if (!loc || !loc.active) throw new ServiceError('LOCATION_INVALID');
  return { cat, loc };
}

async function storePhoto(file) {
  if (!file) return { photo: null, photoMime: null };
  try {
    const saved = await saveImage(file.buffer);
    return { photo: saved.file, photoMime: saved.mime };
  } catch (err) {
    if (err.message === 'UPLOAD_TYPE' || err.message === 'UPLOAD_STORAGE') throw new ServiceError(err.message);
    throw err;
  }
}

async function createReport(user, input, file, ip = '') {
  const since = new Date(Date.now() - DAY);
  if ((await caseModel.countByUserSince(user.id, since)) >= config.limits.reportsPerDay) throw new ServiceError('REPORT_LIMIT');
  checkWhen(input.occurredAt);
  const { cat } = await checkRefs(input.categoryId, input.locationId);
  const photo = await storePhoto(file);

  const needsApproval = input.type === 'lost' && cat.requiresApproval;
  const status = needsApproval ? CASE.PENDING_APPROVAL : CASE.UNDER_REVIEW;
  const c = await caseModel.create({
    type: input.type, userId: user.id, categoryId: cat.id, locationId: input.locationId,
    locationDetail: input.locationDetail, title: input.title, description: input.description,
    occurredAt: input.occurredAt, ...photo, status, approvalRequired: needsApproval,
    events: [{ at: new Date(), key: input.type === 'lost' ? 'ev_created_lost' : 'ev_created_found', params: {}, staffOnly: false }]
  });

  if (needsApproval) {
    await caseModel.addEvent(c.id, { key: 'ev_sent_for_approval', params: {} });
    await notifications.notifyRole(ROLES.APPROVER, 'notif_approval_needed', { ref: c.ref }, `/approver/cases/${c.ref}`);
    await notifications.notifyRole(ROLES.ADMIN, 'notif_approval_needed', { ref: c.ref }, `/approver/cases/${c.ref}`);
  } else {
    await notifications.notifyRole(ROLES.SECURITY, 'notif_review_needed', { ref: c.ref }, `/security/cases/${c.ref}`);
  }
  await notifications.notify(user.id, 'notif_report_received', { ref: c.ref }, `/items/${c.ref}`);
  await audit.record(user, 'case.created', c.ref, `${c.type}, ${cat.name}`, ip);
  return c;
}

// A walk-in: someone hands a found item to the Security Cell and staff record it on the spot.
async function intakeFound(staff, input, file, ip = '') {
  checkWhen(input.occurredAt);
  const { cat } = await checkRefs(input.categoryId, input.locationId);
  const photo = await storePhoto(file);

  // If the finder has an account, link it so they can follow the case.
  let finderUser = null;
  if (input.finderUniversityId) finderUser = await userModel.findByUniversityId(input.finderUniversityId);

  const c = await caseModel.create({
    type: 'found', userId: finderUser ? finderUser.id : null, categoryId: cat.id, locationId: input.locationId,
    locationDetail: input.locationDetail, title: input.title, description: input.description,
    occurredAt: input.occurredAt, ...photo, status: CASE.OPEN, approvalRequired: false,
    finder: { name: input.finderName, contact: input.finderContact || '', universityId: input.finderUniversityId || '', recordedBy: staff.id, recordedByName: staff.name },
    storageSlot: input.storageSlot,
    events: [{ at: new Date(), key: 'ev_intake', params: { slot: input.storageSlot }, staffOnly: false }]
  });
  if (finderUser) await notifications.notify(finderUser.id, 'notif_intake_recorded', { ref: c.ref }, `/items/${c.ref}`);
  await audit.record(staff, 'case.intake', c.ref, `${cat.name}, slot ${input.storageSlot}`, ip);
  await matching.runForCase(c.id);
  return c;
}

// ---------------------------------------------------------------- decisions
async function byRefOrThrow(ref) {
  const c = await caseModel.findByRef(ref);
  if (!c) throw new ServiceError('NOT_FOUND');
  return c;
}

async function approvalDecision(approver, ref, { decision, remarks }, ip = '') {
  const c = await byRefOrThrow(ref);
  if (c.status !== CASE.PENDING_APPROVAL) throw new ServiceError('BAD_STATE');
  if (c.userId === approver.id) throw new ServiceError('OWN_CASE');
  const approved = decision === 'approve';
  if (!approved && !remarks) throw new ServiceError('REASON_REQUIRED');

  await caseModel.update(c.id, {
    status: approved ? CASE.UNDER_REVIEW : CASE.REJECTED,
    approval: { by: approver.id, byName: approver.name, at: new Date(), decision: approved ? 'approved' : 'rejected', remarks: remarks || '' }
  });
  await caseModel.addEvent(c.id, { key: approved ? 'ev_approved' : 'ev_approval_rejected', params: { remarks: remarks || '' } });
  if (approved) {
    await notifications.notifyRole(ROLES.SECURITY, 'notif_review_needed', { ref: c.ref }, `/security/cases/${c.ref}`);
    await notifications.notify(c.userId, 'notif_case_approved', { ref: c.ref }, `/items/${c.ref}`, { email: true });
  } else {
    await notifications.notify(c.userId, 'notif_case_rejected', { ref: c.ref, reason: remarks }, `/items/${c.ref}`, { email: true });
  }
  await audit.record(approver, approved ? 'case.approved' : 'case.approval_rejected', c.ref, remarks || '', ip);
}

async function reviewDecision(staff, ref, { decision, note, storageSlot }, ip = '') {
  const c = await byRefOrThrow(ref);
  if (c.status !== CASE.UNDER_REVIEW) throw new ServiceError('BAD_STATE');
  if (c.userId === staff.id) throw new ServiceError('OWN_CASE');
  const accept = decision === 'accept';
  if (!accept && !note) throw new ServiceError('REASON_REQUIRED');
  if (accept && c.type === 'found' && !storageSlot) throw new ServiceError('SLOT_REQUIRED');

  await caseModel.update(c.id, {
    status: accept ? CASE.OPEN : CASE.REJECTED,
    storageSlot: accept && c.type === 'found' ? storageSlot : c.storageSlot,
    review: { by: staff.id, byName: staff.name, at: new Date(), decision: accept ? 'accepted' : 'rejected', note: note || '' }
  });
  await caseModel.addEvent(c.id, { key: accept ? (c.type === 'found' ? 'ev_received' : 'ev_review_accepted') : 'ev_review_rejected', params: { note: note || '', slot: storageSlot || '' } });
  if (accept) {
    await notifications.notify(c.userId, c.type === 'found' ? 'notif_found_received' : 'notif_case_open', { ref: c.ref }, `/items/${c.ref}`, { email: true });
    await matching.runForCase(c.id);
  } else {
    await notifications.notify(c.userId, 'notif_case_rejected', { ref: c.ref, reason: note }, `/items/${c.ref}`, { email: true });
  }
  await audit.record(staff, accept ? 'case.review_accepted' : 'case.review_rejected', c.ref, note || '', ip);
}

async function withdraw(user, ref, ip = '') {
  const c = await byRefOrThrow(ref);
  if (c.userId !== user.id || c.type !== 'lost') throw new ServiceError('NOT_FOUND');
  if (![CASE.PENDING_APPROVAL, CASE.UNDER_REVIEW, CASE.OPEN, CASE.MATCHED].includes(c.status)) throw new ServiceError('BAD_STATE');
  await caseModel.update(c.id, { status: CASE.CLOSED, closeReason: 'withdrawn', closedAt: new Date() });
  await caseModel.addEvent(c.id, { key: 'ev_withdrawn', params: {} });
  await audit.record(user, 'case.withdrawn', c.ref, '', ip);
}

async function addNote(staff, ref, input, ip = '') {
  const c = await byRefOrThrow(ref);
  await investigationModel.create({ caseId: c.id, userId: staff.id, ...input });
  await caseModel.addEvent(c.id, { key: input.kind === 'cctv' ? 'ev_cctv_added' : 'ev_note_added', params: {}, staffOnly: false });
  if (c.userId && c.userId !== staff.id) await notifications.notify(c.userId, 'notif_case_note', { ref: c.ref }, `/items/${c.ref}`);
  await audit.record(staff, input.kind === 'cctv' ? 'case.cctv_note' : 'case.note', c.ref, '', ip);
}

async function deleteNote(staff, ref, noteId, ip = '') {
  const c = await byRefOrThrow(ref);
  const note = await investigationModel.get(noteId);
  if (!note || note.caseId !== c.id || note.deletedAt) throw new ServiceError('NOT_FOUND');
  await investigationModel.update(note.id, { findings: '', deletedAt: new Date() });
  await caseModel.addEvent(c.id, { key: 'ev_note_deleted', params: {}, staffOnly: false });
  await audit.record(staff, 'case.note_deleted', c.ref, `note ${note.id}`, ip);
}

function canWriteUpdate(user, c) {
  if (user.role === ROLES.SECURITY) return true;
  return Boolean(c.userId && c.userId === user.id);
}

async function addUpdate(user, ref, body, file, ip = '') {
  const c = await byRefOrThrow(ref);
  if (!canWriteUpdate(user, c)) throw new ServiceError('NOT_FOUND');
  const text = String(body || '').trim();
  if (!text && !file) throw new ServiceError('UPDATE_EMPTY');
  let image = null;
  let imageMime = null;
  if (file) {
    const saved = await storePhoto(file);
    image = saved.photo;
    imageMime = saved.photoMime;
  }
  const row = await updateModel.create({
    caseId: c.id, userId: user.id, body: text, image, imageMime, hadImage: Boolean(image)
  });
  await caseModel.addEvent(c.id, { key: 'ev_update_added', params: {}, staffOnly: false });
  if (user.role === ROLES.SECURITY) {
    if (c.userId && c.userId !== user.id) await notifications.notify(c.userId, 'notif_case_update', { ref: c.ref }, `/items/${c.ref}`);
  } else {
    await notifications.notifyRole(ROLES.SECURITY, 'notif_case_update_reply', { ref: c.ref }, `/security/cases/${c.ref}`);
  }
  await audit.record(user, 'case.update', c.ref, `update ${row.id}`, ip);
  return row;
}

async function loadUpdate(user, ref, updateId, { anyImage = false } = {}) {
  const c = await byRefOrThrow(ref);
  const row = await updateModel.get(updateId);
  if (!row || row.caseId !== c.id) throw new ServiceError('NOT_FOUND');
  const staff = user.role === ROLES.SECURITY;
  const owner = Boolean(c.userId && c.userId === user.id);
  if (!staff && !(owner && (anyImage || row.userId === user.id))) throw new ServiceError('NOT_FOUND');
  return { c, row };
}

async function deleteUpdateImage(user, ref, updateId, ip = '') {
  const { c, row } = await loadUpdate(user, ref, updateId, { anyImage: true });
  if (row.deletedAt || !row.image) throw new ServiceError('NOT_FOUND');
  await deleteStored(row.image);
  await updateModel.update(row.id, { image: null, imageMime: null, imageDeletedAt: new Date() });
  await caseModel.addEvent(c.id, { key: 'ev_image_deleted', params: {}, staffOnly: false });
  await audit.record(user, 'case.image_deleted', c.ref, `update ${row.id}`, ip);
}

async function deleteUpdate(user, ref, updateId, ip = '') {
  const { c, row } = await loadUpdate(user, ref, updateId);
  if (row.deletedAt) throw new ServiceError('NOT_FOUND');
  if (row.image) await deleteStored(row.image);
  await updateModel.update(row.id, { body: '', image: null, imageMime: null, deletedAt: new Date() });
  await caseModel.addEvent(c.id, { key: 'ev_update_deleted', params: {}, staffOnly: false });
  await audit.record(user, 'case.update_deleted', c.ref, `update ${row.id}`, ip);
}

// ---------------------------------------------------------------- viewing one case
function accessLevel(user, c) {
  if (!user) return null;
  if (user.role === ROLES.SECURITY || user.role === ROLES.ADMIN) return 'staff';
  if (c.userId && c.userId === user.id) return 'owner';
  if (user.role === ROLES.APPROVER && c.approvalRequired) return 'approver';
  if (PUBLIC_VISIBLE.includes(c.status)) return 'viewer';
  return null;
}

// Returns null when the case does not exist or this user may not know it exists.
async function getForViewer(user, ref) {
  const c = await caseModel.findByRef(ref);
  if (!c) return null;
  const level = accessLevel(user, c);
  if (!level) return null;
  const { catMap, locMap } = await lookups();
  const category = catMap.get(c.categoryId);
  const location = locMap.get(c.locationId);

  const view = {
    id: c.id, ref: c.ref, type: c.type, status: c.status, categoryId: c.categoryId, locationId: c.locationId,
    occurredAt: c.occurredAt, createdAt: c.createdAt, updatedAt: c.updatedAt, isMine: level === 'owner',
    title: level === 'viewer' && category && category.sensitive ? null : c.title, titleMasked: level === 'viewer' && Boolean(category && category.sensitive)
  };
  if (level !== 'viewer') view.progress = progressFor(c); // computed here, where the whole case is known
  if (level !== 'viewer') {
    Object.assign(view, {
      description: c.description, locationDetail: c.locationDetail, hasPhoto: Boolean(c.photo), photo: c.photo || null,
      approvalRequired: c.approvalRequired, approval: c.approval,
      reviewNote: c.review && c.review.decision === 'rejected' ? c.review.note : ''
    });
  }
  if (level === 'staff') {
    Object.assign(view, { review: c.review, finder: c.finder, storageSlot: c.storageSlot, retentionFlaggedAt: c.retentionFlaggedAt, disposal: c.disposal, closeReason: c.closeReason });
  } else if (level === 'owner') {
    view.closeReason = c.closeReason;
    if (c.type === 'found') view.storageSlot = null; // a finder does not need the shelf number
  }
  const reporter = (level === 'staff' || level === 'approver') && c.userId ? await userModel.findById(c.userId) : null;
  const events = c.events.filter((e) => level === 'staff' || !e.staffOnly);
  const seeThread = level === 'staff' || level === 'owner';
  const rawNotes = seeThread ? await investigationModel.forCase(c.id) : [];
  const notes = rawNotes.map((n) => ({
    id: n.id, kind: n.kind, createdAt: n.createdAt, deletedAt: n.deletedAt, authorName: n.authorName,
    findings: n.deletedAt ? '' : n.findings,
    camera: level === 'staff' && !n.deletedAt ? n.camera : '',
    windowFrom: level === 'staff' && !n.deletedAt ? n.windowFrom : null,
    windowTo: level === 'staff' && !n.deletedAt ? n.windowTo : null
  }));
  const updates = seeThread ? await updateModel.forCase(c.id) : [];
  return { view, level, category, location, reporter, events, notes, updates };
}

// ---------------------------------------------------------------- lists
async function listMine(user, { type, status, page = 1 } = {}) {
  const r = await caseModel.query({ userId: user.id, type: type || undefined, statuses: status ? [status] : undefined, page, pageSize: 10 });
  return { ...r, rows: await decorate(r.rows) };
}

async function listForStaff({ statuses, type, q, flaggedOnly, newest = false, page = 1, pageSize = 15 } = {}) {
  const needle = String(q || '').trim().toLowerCase();
  let rows = (await caseModel.all()).filter((c) =>
    (!statuses || statuses.includes(c.status)) && (!type || c.type === type) && (!flaggedOnly || c.retentionFlaggedAt) &&
    (!needle || c.ref.toLowerCase().includes(needle) || c.title.toLowerCase().includes(needle) || c.description.toLowerCase().includes(needle) || (c.storageSlot || '').toLowerCase().includes(needle))
  );
  rows.sort((a, b) => (newest ? b.createdAt - a.createdAt : a.createdAt - b.createdAt));
  const p = paginate(rows, page, pageSize);
  return { ...p, rows: await decorate(p.rows) };
}

const listByStatuses = async (statuses, type) => decorate((await caseModel.all()).filter((c) => statuses.includes(c.status) && (!type || c.type === type)).sort((a, b) => b.updatedAt - a.updatedAt));

async function listApprovals({ history = false, page = 1 } = {}) {
  const rows = (await caseModel.all())
    .filter((c) => c.approvalRequired && (history ? c.approval : c.status === CASE.PENDING_APPROVAL))
    .sort((a, b) => (history ? b.approval.at - a.approval.at : a.createdAt - b.createdAt));
  const p = paginate(rows, page, 10);
  return { ...p, rows: await decorate(p.rows) };
}

module.exports = {
  lookups, decorate, localName, publicCard, publicFeed, publicStats,
  createReport, intakeFound, approvalDecision, reviewDecision, withdraw, addNote, deleteNote,
  addUpdate, deleteUpdate, deleteUpdateImage,
  accessLevel, getForViewer, listMine, listForStaff, listByStatuses, listApprovals, byRefOrThrow
};
