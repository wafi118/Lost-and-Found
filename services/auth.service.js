'use strict';
// Who may hold an account, and how they prove it. See docs/SAFEFIND_MASTER_PROMPT.md (AUTH-1 to AUTH-7).
const bcrypt = require('bcrypt');
const config = require('../config');
const { ROLES } = require('../config/roles');
const { USER, VERIFY } = require('../config/statuses');
const userModel = require('../models/user.model');
const tokenModel = require('../models/token.model');
const mailer = require('./mailer.service');
const audit = require('./audit.service');
const notifications = require('./notification.service');
const identity = require('./identity.service');
const { translate } = require('../utils/i18n');

class AuthError extends Error {
  constructor(code, extra = {}) {
    super(code);
    this.name = 'AuthError';
    this.code = code;
    Object.assign(this, extra);
  }
}

const norm = (e) => String(e || '').trim().toLowerCase();

// ---------------------------------------------------------------- email domain (AUTH-1)
// A domain is accepted if it equals an allowed domain, or (when subdomains are allowed) ends
// with "." + allowed domain. "evilbup.edu.bd" and "bup.edu.bd.evil.com" both fail.
const EMAIL_SHAPE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

function isValidEmailShape(email) {
  const e = norm(email);
  if (e.length > 254 || !EMAIL_SHAPE.test(e) || e.includes('..')) return false;
  const domain = e.slice(e.lastIndexOf('@') + 1);
  return !domain.split('.').some((label) => !label || label.startsWith('-') || label.endsWith('-'));
}

function isAllowedEmail(email) {
  const e = norm(email);
  if (!isValidEmailShape(e)) return false;
  const domain = e.slice(e.lastIndexOf('@') + 1);
  return config.auth.allowedEmailDomains.some(
    (d) => domain === d || (config.auth.allowSubdomains && domain.endsWith('.' + d))
  );
}

// ---------------------------------------------------------------- university ID (AUTH-2)
function isValidUniversityId(affiliation, id) {
  const value = String(id || '').trim();
  const pattern = affiliation === 'staff' ? config.auth.staffIdPattern : config.auth.studentIdPattern;
  return pattern.test(value);
}

// ---------------------------------------------------------------- passwords
const DUMMY_HASH = bcrypt.hashSync('safefind-timing-equaliser', config.bcryptRounds);
const hashPassword = (pw) => bcrypt.hash(pw, config.bcryptRounds);

// Always performs one bcrypt comparison, so a missing account takes as long as a wrong password.
async function checkPassword(user, password) {
  const hash = user && user.passwordHash ? user.passwordHash : DUMMY_HASH;
  let ok = false;
  try { ok = await bcrypt.compare(String(password || ''), hash); } catch { ok = false; }
  return ok && !!user && !!user.passwordHash;
}

// ---------------------------------------------------------------- failed-login tracking
// Keyed by the submitted email whether or not an account exists, so it reveals nothing.
// Stored in login_failures so a restart, or a second server process, still keeps the lock.
const db = require('../db');
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

async function lockState(email) {
  const row = await db.one('SELECT failures, first_at, locked_until FROM login_failures WHERE email = $1', [email]);
  if (!row) return { locked: false };
  const lockedUntil = row.locked_until ? new Date(row.locked_until).getTime() : 0;
  const firstAt = new Date(row.first_at).getTime();
  if (lockedUntil && lockedUntil > Date.now()) return { locked: true, until: lockedUntil };
  if (Date.now() - firstAt > FAIL_WINDOW_MS) {
    await db.query('DELETE FROM login_failures WHERE email = $1', [email]);
    return { locked: false };
  }
  return { locked: false };
}
async function recordFailure(email) {
  const now = new Date();
  const row = await db.one('SELECT failures, first_at FROM login_failures WHERE email = $1', [email]);
  let count = 1;
  let firstAt = now;
  if (row && now.getTime() - new Date(row.first_at).getTime() <= FAIL_WINDOW_MS) {
    count = Number(row.failures) + 1;
    firstAt = new Date(row.first_at);
  }
  const lockedUntil = count >= config.auth.maxFailedPerEmail ? new Date(now.getTime() + LOCK_MS) : null;
  await db.query(
    `INSERT INTO login_failures (email, failures, first_at, locked_until) VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET failures = EXCLUDED.failures, first_at = EXCLUDED.first_at, locked_until = EXCLUDED.locked_until`,
    [email, count, firstAt, lockedUntil]
  );
}
const clearFailures = (email) => db.query('DELETE FROM login_failures WHERE email = $1', [email]);

// ---------------------------------------------------------------- mail helpers
const link = (path) => `${config.baseUrl}${path}`;

async function sendVerification(user, raw) {
  const url = link(`/auth/verify/${raw}`);
  await mailer.send({
    to: user.email,
    subject: translate(user.lang, 'mail_verify_subject'),
    text: translate(user.lang, 'mail_verify_body', { name: user.name, link: url, hours: Math.round(config.auth.verifyTtlMs / 3600000) }),
    link: url
  });
}

// ---------------------------------------------------------------- registration (AUTH-2, AUTH-3)
// Same outcome as a new account, so the form cannot be used to find out who is registered.
async function answerExisting(existing, email, ip) {
  if (!existing.emailVerified && existing.role === ROLES.MEMBER) {
    const raw = await tokenModel.issue(existing.id, 'verify', config.auth.verifyTtlMs);
    await sendVerification(existing, raw);
  } else {
    await mailer.send({
      to: existing.email,
      subject: translate(existing.lang, 'mail_exists_subject'),
      text: translate(existing.lang, 'mail_exists_body', { name: existing.name, link: link('/auth/forgot') })
    });
  }
  await audit.record(null, 'auth.register_duplicate', email, '', ip);
  return { created: false, email };
}

async function register(input, ip = '') {
  const email = norm(input.email);
  if (!isAllowedEmail(email)) throw new AuthError('EMAIL_DOMAIN');
  if (!isValidUniversityId(input.affiliation, input.universityId)) throw new AuthError('ID_FORMAT');

  const existing = await userModel.findByEmail(email);
  if (existing) return answerExisting(existing, email, ip);
  if (await userModel.findByUniversityId(input.universityId)) throw new AuthError('ID_TAKEN');

  const user = await userModel.create({
    name: input.name, email, passwordHash: await hashPassword(input.password), role: ROLES.MEMBER,
    affiliation: input.affiliation, universityId: String(input.universityId).trim(), phone: input.phone || null,
    status: USER.PENDING, emailVerified: false, lang: input.lang
  });
  const raw = await tokenModel.issue(user.id, 'verify', config.auth.verifyTtlMs);
  await sendVerification(user, raw);
  await audit.record({ id: user.id, name: user.name, role: user.role }, 'auth.register', email, input.affiliation, ip);
  return { created: true, email };
}

// ---------------------------------------------------------------- registration with an ID card photo (AUTH-8, AUTH-9)
// For people who have no university address. Any e-mail address may be used, so the address proves nothing
// about BUP: the ID card photo, checked by an administrator, does. The address is still confirmed by a link,
// because it is what the person will sign in with and what password resets are sent to.
async function registerWithIdCard(input, file, ip = '') {
  if (!config.auth.idCard.enabled) throw new AuthError('ID_ROUTE_OFF');
  const email = norm(input.email);
  if (!isValidEmailShape(email)) throw new AuthError('EMAIL_INVALID');
  if (isAllowedEmail(email)) throw new AuthError('EMAIL_USE_UNIVERSITY'); // that address already proves membership
  if (!isValidUniversityId(input.affiliation, input.universityId)) throw new AuthError('ID_FORMAT');

  const existing = await userModel.findByEmail(email);
  if (existing) return answerExisting(existing, email, ip); // no photo is stored for an address that is taken
  if (await userModel.findByUniversityId(input.universityId)) throw new AuthError('ID_TAKEN');

  const saved = await identity.storeImage(file); // before the account, so a bad photo creates nothing
  let user;
  try {
    user = await userModel.create({
      name: input.name, email, passwordHash: await hashPassword(input.password), role: ROLES.MEMBER,
      affiliation: input.affiliation, universityId: String(input.universityId).trim(), phone: input.phone || null,
      status: USER.PENDING, emailVerified: false, lang: input.lang, verificationMethod: VERIFY.ID_CARD
    });
    await identity.submit(user.id, saved);
  } catch (err) {
    await identity.discard(saved.file);
    throw err;
  }
  const raw = await tokenModel.issue(user.id, 'verify', config.auth.verifyTtlMs);
  await sendVerification(user, raw);
  await audit.record({ id: user.id, name: user.name, role: user.role }, 'auth.register_id_card', email, input.affiliation, ip);
  return { created: true, email };
}

async function resendVerification(emailInput, ip = '') {
  const user = await userModel.findByEmail(emailInput);
  if (user && user.role === ROLES.MEMBER && !user.emailVerified) {
    const raw = await tokenModel.issue(user.id, 'verify', config.auth.verifyTtlMs);
    await sendVerification(user, raw);
    await audit.record(null, 'auth.verify_resent', user.email, '', ip);
  }
}

const peekVerify = async (raw) => Boolean(await tokenModel.peek(raw, 'verify'));

async function verifyEmail(raw, ip = '') {
  const hit = await tokenModel.consume(raw, 'verify');
  if (!hit) throw new AuthError('TOKEN_INVALID');
  const user = await userModel.findById(hit.userId);
  if (!user) throw new AuthError('TOKEN_INVALID');
  // A confirmed address never opens an ID-card account: only the administrator's decision on the photo does (AUTH-10).
  const byIdCard = user.verificationMethod === VERIFY.ID_CARD;
  const needsApproval = byIdCard || config.auth.requireAdminApproval;
  const status = user.status === USER.SUSPENDED ? USER.SUSPENDED : (needsApproval ? USER.PENDING : USER.ACTIVE);
  await userModel.update(user.id, { emailVerified: true, status });
  await audit.record({ id: user.id, name: user.name, role: user.role }, 'auth.email_verified', user.email, '', ip);
  if (byIdCard && status === USER.PENDING) {
    const proof = await identity.latestFor(user.id);
    await notifications.notifyRole(ROLES.ADMIN, 'notif_id_awaiting', { name: user.name }, proof ? `/admin/id-reviews/${proof.id}` : '/admin/id-reviews');
  } else if (needsApproval && status === USER.PENDING) {
    await notifications.notifyRole(ROLES.ADMIN, 'notif_user_awaiting', { name: user.name }, '/admin/users?status=pending');
  }
  return { needsApproval: needsApproval && status === USER.PENDING, byIdCard };
}

// ---------------------------------------------------------------- login (AUTH-6)
async function login(emailInput, password, ip = '') {
  const email = norm(emailInput);
  const lock = await lockState(email);
  const user = await userModel.findByEmail(email);
  const ok = await checkPassword(user, password); // runs even when locked or unknown

  if (lock.locked) throw new AuthError('LOCKED', { until: lock.until });
  if (!ok) {
    await recordFailure(email);
    await audit.record(null, 'auth.login_failed', email, '', ip);
    throw new AuthError('INVALID');
  }
  // From here the password was right, so telling the person why they cannot enter is safe.
  if (user.status === USER.SUSPENDED) throw new AuthError('SUSPENDED');
  if (!user.emailVerified) throw new AuthError('UNVERIFIED', { email });
  if (user.status !== USER.ACTIVE) {
    if (user.verificationMethod === VERIFY.ID_CARD) {
      const { code, resubmitToken } = await identity.waitingState(user);
      throw new AuthError(code, resubmitToken ? { resubmitToken } : {});
    }
    throw new AuthError('PENDING_APPROVAL');
  }

  await clearFailures(email);
  await userModel.update(user.id, { lastLoginAt: new Date() });
  await audit.record({ id: user.id, name: user.name, role: user.role }, 'auth.login', user.email, '', ip);
  return user;
}

// ---------------------------------------------------------------- password reset
async function startReset(emailInput, ip = '') {
  const user = await userModel.findByEmail(emailInput);
  if (user && user.status !== USER.SUSPENDED && user.emailVerified && user.passwordHash) {
    const raw = await tokenModel.issue(user.id, 'reset', config.auth.resetTtlMs);
    const url = link(`/auth/reset/${raw}`);
    await mailer.send({
      to: user.email, subject: translate(user.lang, 'mail_reset_subject'),
      text: translate(user.lang, 'mail_reset_body', { name: user.name, link: url, minutes: Math.round(config.auth.resetTtlMs / 60000) }), link: url
    });
    await audit.record(null, 'auth.reset_requested', user.email, '', ip);
  }
}
const peekReset = async (raw) => Boolean(await tokenModel.peek(raw, 'reset'));

async function completeReset(raw, newPassword, ip = '') {
  const hit = await tokenModel.consume(raw, 'reset');
  if (!hit) throw new AuthError('TOKEN_INVALID');
  const user = await userModel.findById(hit.userId);
  if (!user) throw new AuthError('TOKEN_INVALID');
  await userModel.update(user.id, { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() });
  await clearFailures(user.email);
  await audit.record({ id: user.id, name: user.name, role: user.role }, 'auth.password_reset', user.email, '', ip);
}

async function changePassword(user, current, next, ip = '') {
  const fresh = await userModel.findById(user.id);
  if (!(await checkPassword(fresh, current))) throw new AuthError('WRONG_PASSWORD');
  await userModel.update(user.id, { passwordHash: await hashPassword(next), passwordChangedAt: new Date() });
  await audit.record(user, 'auth.password_changed', user.email, '', ip);
}

// ---------------------------------------------------------------- authority accounts (AUTH-5)
async function inviteAuthority(admin, { name, email, role }, ip = '') {
  const e = norm(email);
  if (![ROLES.SECURITY, ROLES.APPROVER, ROLES.ADMIN].includes(role)) throw new AuthError('ROLE_INVALID');
  if (!isAllowedEmail(e)) throw new AuthError('EMAIL_DOMAIN');
  if (await userModel.findByEmail(e)) throw new AuthError('EMAIL_TAKEN');
  const user = await userModel.create({
    name, email: e, passwordHash: null, role, status: USER.PENDING, emailVerified: false
  });
  const raw = await tokenModel.issue(user.id, 'invite', config.auth.inviteTtlMs);
  const url = link(`/auth/invite/${raw}`);
  await mailer.send({
    to: e, subject: translate('en', 'mail_invite_subject'),
    text: translate('en', 'mail_invite_body', { name, link: url, hours: Math.round(config.auth.inviteTtlMs / 3600000) }), link: url
  });
  await audit.record(admin, 'admin.user_invited', e, role, ip);
  return { user, link: config.isProd ? null : url };
}

async function resendInvite(admin, userId, ip = '') {
  const user = await userModel.findById(userId);
  if (!user || user.passwordHash || user.role === ROLES.MEMBER) throw new AuthError('NOT_FOUND');
  const raw = await tokenModel.issue(user.id, 'invite', config.auth.inviteTtlMs);
  const url = link(`/auth/invite/${raw}`);
  await mailer.send({
    to: user.email, subject: translate('en', 'mail_invite_subject'),
    text: translate('en', 'mail_invite_body', { name: user.name, link: url, hours: Math.round(config.auth.inviteTtlMs / 3600000) }), link: url
  });
  await audit.record(admin, 'admin.invite_resent', user.email, '', ip);
  return { link: config.isProd ? null : url };
}

const peekInvite = async (raw) => {
  const hit = await tokenModel.peek(raw, 'invite');
  return hit ? userModel.findById(hit.userId) : null;
};

async function acceptInvite(raw, password, ip = '') {
  const hit = await tokenModel.consume(raw, 'invite');
  if (!hit) throw new AuthError('TOKEN_INVALID');
  const user = await userModel.findById(hit.userId);
  if (!user) throw new AuthError('TOKEN_INVALID');
  await userModel.update(user.id, {
    passwordHash: await hashPassword(password), emailVerified: true, status: USER.ACTIVE, passwordChangedAt: new Date()
  });
  await audit.record({ id: user.id, name: user.name, role: user.role }, 'auth.invite_accepted', user.email, user.role, ip);
}

// First deployment: create an administrator from environment variables, if none exists.
async function bootstrapAdmin() {
  const { email, password, name } = config.bootstrapAdmin;
  if (!email || !password) return false;
  const admins = await userModel.listByRole(ROLES.ADMIN);
  if (admins.length || (await userModel.findByEmail(email))) return false;
  await userModel.create({
    name, email, passwordHash: await hashPassword(password), role: ROLES.ADMIN, status: USER.ACTIVE, emailVerified: true
  });
  console.log(`[SafeFind] Administrator account created for ${email}`);
  return true;
}

module.exports = {
  AuthError, isAllowedEmail, isValidEmailShape, isValidUniversityId, hashPassword, checkPassword,
  register, registerWithIdCard, resendVerification, peekVerify, verifyEmail, login,
  startReset, peekReset, completeReset, changePassword,
  inviteAuthority, resendInvite, peekInvite, acceptInvite, bootstrapAdmin
};
