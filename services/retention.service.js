'use strict';
// Unclaimed items (FR-25). Once an item has been held longer than the retention period with no
// active claim, it is flagged for Security Cell review. The system never disposes of anything
// by itself: staff decide.
const caseModel = require('../models/case.model');
const claimModel = require('../models/claim.model');
const settingsModel = require('../models/settings.model');
const { CASE, CLAIM_ACTIVE } = require('../config/statuses');
const { ROLES } = require('../config/roles');
const audit = require('./audit.service');
const notifications = require('./notification.service');
const caseService = require('./case.service');
const { ServiceError } = require('./errors');

const DAY = 86400000;
const METHODS = ['donate', 'recycle', 'transfer'];

const anchor = (c) => new Date(c.retentionResetAt || c.createdAt).getTime();

// Flags items past the limit. Safe to call often: an item is flagged (and staff told) once.
async function sweep() {
  const { retentionDays } = await settingsModel.get();
  const limit = Date.now() - retentionDays * DAY;
  const claims = await claimModel.all();
  let flagged = 0;
  for (const c of await caseModel.all()) {
    if (c.type !== 'found' || ![CASE.OPEN, CASE.MATCHED].includes(c.status) || c.retentionFlaggedAt) continue;
    if (anchor(c) > limit) continue;
    if (claims.some((cl) => cl.foundCaseId === c.id && CLAIM_ACTIVE.includes(cl.status))) continue;
    await caseModel.update(c.id, { retentionFlaggedAt: new Date() });
    await caseModel.addEvent(c.id, { key: 'ev_retention_flagged', params: { days: retentionDays }, staffOnly: true });
    await notifications.notifyRole(ROLES.SECURITY, 'notif_retention_flagged', { ref: c.ref, days: retentionDays }, '/security/unclaimed');
    flagged += 1;
  }
  return flagged;
}

// The board: flagged items, and items that will be flagged within 14 days.
async function board() {
  const { retentionDays } = await settingsModel.get();
  const all = (await caseModel.all()).filter((c) => c.type === 'found' && [CASE.OPEN, CASE.MATCHED].includes(c.status));
  const decorated = await caseService.decorate(all);
  const withDue = decorated.map((c) => {
    const dueAt = new Date(anchor(c) + retentionDays * DAY);
    return { ...c, dueAt, daysHeld: Math.floor((Date.now() - new Date(c.createdAt).getTime()) / DAY), daysLeft: Math.ceil((dueAt - Date.now()) / DAY) };
  });
  return {
    retentionDays,
    flagged: withDue.filter((c) => c.retentionFlaggedAt).sort((a, b) => a.dueAt - b.dueAt),
    upcoming: withDue.filter((c) => !c.retentionFlaggedAt && c.daysLeft <= 14).sort((a, b) => a.dueAt - b.dueAt),
    holding: withDue.filter((c) => !c.retentionFlaggedAt && c.daysLeft > 14).length
  };
}

async function dispose(staff, ref, { method, note }, ip = '') {
  const c = await caseService.byRefOrThrow(ref);
  if (c.type !== 'found' || !c.retentionFlaggedAt || ![CASE.OPEN, CASE.MATCHED].includes(c.status)) throw new ServiceError('BAD_STATE');
  if (!METHODS.includes(method)) throw new ServiceError('METHOD_INVALID');
  await caseModel.update(c.id, {
    status: CASE.DISPOSED, closeReason: 'disposed', closedAt: new Date(),
    disposal: { method, note: note || '', by: staff.id, byName: staff.name, at: new Date() }
  });
  await caseModel.addEvent(c.id, { key: 'ev_disposed', params: { method }, staffOnly: false });
  await audit.record(staff, 'case.disposed', c.ref, `${method}${note ? ': ' + note : ''}`, ip);
}

// Staff keep holding the item: the clock restarts from today.
async function extend(staff, ref, note, ip = '') {
  const c = await caseService.byRefOrThrow(ref);
  if (c.type !== 'found' || !c.retentionFlaggedAt) throw new ServiceError('BAD_STATE');
  await caseModel.update(c.id, { retentionFlaggedAt: null, retentionResetAt: new Date() });
  await caseModel.addEvent(c.id, { key: 'ev_retention_extended', params: {}, staffOnly: true });
  await audit.record(staff, 'case.retention_extended', c.ref, note || '', ip);
}

module.exports = { sweep, board, dispose, extend, METHODS };
