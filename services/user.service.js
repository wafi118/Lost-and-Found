'use strict';
// Account administration (FR-22). Every change is audited (FR-23, NFR-10).
const { ROLES } = require('../config/roles');
const { USER, VERIFY, ID_PROOF } = require('../config/statuses');
const userModel = require('../models/user.model');
const proofModel = require('../models/identityProof.model');
const audit = require('./audit.service');
const notifications = require('./notification.service');
const realtime = require('./realtime.service');

class UserError extends Error {
  constructor(code) { super(code); this.name = 'UserError'; this.code = code; }
}

const list = (filters) => userModel.list(filters);

async function approve(admin, id, ip = '') {
  const user = await userModel.findById(id);
  if (!user || user.deletedAt) throw new UserError('NOT_FOUND');
  if (user.status !== USER.PENDING || !user.emailVerified) throw new UserError('NOT_PENDING');
  // An ID-card account is opened only by deciding on its photo (AUTH-10), never by this shortcut.
  if (user.verificationMethod === VERIFY.ID_CARD) throw new UserError('ID_REVIEW_REQUIRED');
  await userModel.update(user.id, { status: USER.ACTIVE });
  await notifications.notify(user.id, 'notif_account_approved', {}, '/dashboard', { email: true });
  await audit.record(admin, 'admin.user_approved', user.email, '', ip);
}

async function suspend(admin, id, ip = '') {
  const user = await userModel.findById(id);
  if (!user || user.deletedAt) throw new UserError('NOT_FOUND');
  if (user.id === admin.id) throw new UserError('SELF');
  if (user.role === ROLES.ADMIN && user.status === USER.ACTIVE) {
    const active = (await userModel.listByRole(ROLES.ADMIN)).length;
    if (active <= 1) throw new UserError('LAST_ADMIN');
  }
  await userModel.update(user.id, { status: USER.SUSPENDED });
  realtime.disconnectUser(user.id);
  await audit.record(admin, 'admin.user_suspended', user.email, '', ip);
}

// The last active administrator cannot be removed or demoted. Checked before the self-check so
// the message says why, not only that it is their own account.
async function guardLastAdmin(user, leaving) {
  if (!leaving || user.role !== ROLES.ADMIN || user.status !== USER.ACTIVE) return;
  const active = (await userModel.listByRole(ROLES.ADMIN)).length;
  if (active <= 1) throw new UserError('LAST_ADMIN');
}

// Name, e-mail, phone, role, affiliation and language. Password and university ID are never written here.
async function updateAccount(admin, id, input, ip = '') {
  const user = await userModel.findById(id);
  if (!user || user.deletedAt) throw new UserError('NOT_FOUND');
  const email = String(input.email || '').trim().toLowerCase();
  const taken = await userModel.findByEmail(email);
  if (taken && taken.id !== user.id) throw new UserError('EMAIL_TAKEN');
  if (![ROLES.MEMBER, ROLES.SECURITY, ROLES.APPROVER, ROLES.ADMIN].includes(input.role)) throw new UserError('ROLE_INVALID');
  await guardLastAdmin(user, input.role !== ROLES.ADMIN);
  let affiliation = null;
  if (input.role === ROLES.MEMBER) {
    if (input.affiliation !== 'student' && input.affiliation !== 'staff') throw new UserError('AFFILIATION');
    affiliation = input.affiliation;
  }
  const phone = input.phone ? String(input.phone).trim() : null;
  const lang = input.lang === 'bn' ? 'bn' : 'en';
  await userModel.update(user.id, {
    name: String(input.name || '').trim(), email, phone, role: input.role, affiliation, lang
  });
  await audit.record(admin, 'admin.user_updated', email, `role ${input.role}`, ip);
  return userModel.findById(user.id);
}

// The row stays, because cases and the audit log point at it. The person can no longer sign in,
// and the e-mail address and university ID are freed for a new account.
async function remove(admin, id, ip = '') {
  const user = await userModel.findById(id);
  if (!user || user.deletedAt) throw new UserError('NOT_FOUND');
  await guardLastAdmin(user, true);
  if (user.id === admin.id) throw new UserError('SELF');
  const previousEmail = user.email;
  const previousId = user.universityId || '';
  await userModel.update(user.id, {
    name: 'Deleted account',
    email: `deleted.${user.id}@removed.invalid`,
    phone: null,
    universityId: null,
    passwordHash: null,
    status: USER.SUSPENDED,
    deletedAt: new Date()
  });
  realtime.disconnectUser(user.id);
  await audit.record(admin, 'admin.user_deleted', previousEmail, previousId ? `id ${previousId}` : '', ip);
}

async function reactivate(admin, id, ip = '') {
  const user = await userModel.findById(id);
  if (!user || user.deletedAt) throw new UserError('NOT_FOUND');
  if (user.status !== USER.SUSPENDED) throw new UserError('NOT_SUSPENDED');
  // A person who never finished verification or setting a password stays pending. So does an ID-card
  // account whose photo was never approved: suspending and reactivating must not skip the check (AUTH-10).
  let identityOk = true;
  if (user.verificationMethod === VERIFY.ID_CARD) {
    const proof = await proofModel.latestByUser(user.id);
    identityOk = Boolean(proof && proof.status === ID_PROOF.APPROVED);
  }
  const status = user.emailVerified && user.passwordHash && identityOk ? USER.ACTIVE : USER.PENDING;
  await userModel.update(user.id, { status });
  await audit.record(admin, 'admin.user_reactivated', user.email, '', ip);
}

async function updateProfile(user, { name, phone, lang }, ip = '') {
  const patch = { name, phone: phone || null };
  if (lang === 'bn' || lang === 'en') patch.lang = lang;
  const updated = await userModel.update(user.id, patch);
  await audit.record(user, 'account.profile_updated', user.email, '', ip);
  return updated;
}

async function counts() {
  const [members, security, approver, admin, pending, suspended] = await Promise.all([
    userModel.count({ role: ROLES.MEMBER }), userModel.count({ role: ROLES.SECURITY }),
    userModel.count({ role: ROLES.APPROVER }), userModel.count({ role: ROLES.ADMIN }),
    userModel.count({ status: USER.PENDING }), userModel.count({ status: USER.SUSPENDED })
  ]);
  return { members, security, approver, admin, pending, suspended, total: members + security + approver + admin };
}

module.exports = { UserError, list, approve, suspend, reactivate, updateAccount, remove, updateProfile, counts };
