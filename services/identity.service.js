'use strict';
// ID card verification for people who register without a university e-mail address (AUTH-8 to AUTH-12).
//
// The ID card photo is the most sensitive file in the system, so the rules here are strict:
//   - only an administrator can see it, and every viewing is written to the audit log;
//   - it is never linked from a page and never served by /uploads/:file;
//   - it is deleted `keepDays` days after the decision (the decision itself stays in the database);
//   - nobody is activated without an administrator's decision on this photo.
const config = require('../config');
const { USER, VERIFY, ID_PROOF, ID_REJECT_REASONS } = require('../config/statuses');
const { ROLES } = require('../config/roles');
const proofModel = require('../models/identityProof.model');
const userModel = require('../models/user.model');
const tokenModel = require('../models/token.model');
const images = require('../utils/images');
const mailer = require('./mailer.service');
const audit = require('./audit.service');
const notifications = require('./notification.service');
const { ServiceError } = require('./errors');
const { translate } = require('../utils/i18n');

const DAY = 86400000;
const purgeTime = () => new Date(Date.now() + config.auth.idCard.keepDays * DAY);
const link = (path) => `${config.baseUrl}${path}`;

// Only what the reviewer needs. Password hashes never leave the model layer.
const reviewerView = (u) => ({
  id: u.id, name: u.name, email: u.email, affiliation: u.affiliation, universityId: u.universityId,
  phone: u.phone, emailVerified: u.emailVerified, status: u.status, lang: u.lang
});

// ---------------------------------------------------------------- storing a photo
// Checks the file by its content and stores it. Throws ServiceError ID_PHOTO_REQUIRED, UPLOAD_TYPE or UPLOAD_STORAGE.
async function storeImage(file) {
  if (!file || !file.buffer || !file.buffer.length) throw new ServiceError('ID_PHOTO_REQUIRED');
  try {
    return await images.saveImage(file.buffer);
  } catch (err) {
    if (err.message === 'UPLOAD_TYPE' || err.message === 'UPLOAD_STORAGE') throw new ServiceError(err.message);
    throw err;
  }
}

// Used when a photo was stored but the account could not be created. Failure to delete is logged, not thrown.
const discard = (file) => images.deleteStored(file).catch((err) => console.error('[identity] could not delete a stored photo:', err.message));

const submit = (userId, saved) => proofModel.create({ userId, file: saved.file });
const latestFor = (userId) => proofModel.latestByUser(userId);

// ---------------------------------------------------------------- what a person who cannot sign in yet is told
// Called after the right password was given, so it is safe to say why the account is not open.
async function waitingState(user) {
  const proof = await proofModel.latestByUser(user.id);
  if (!proof) return { code: 'PENDING_APPROVAL' };
  if (proof.status === ID_PROOF.SUBMITTED) return { code: 'ID_PENDING' };
  if (proof.status === ID_PROOF.REJECTED && proof.final) return { code: 'ID_REJECTED_FINAL' };
  if (proof.status === ID_PROOF.REJECTED) return { code: 'ID_REJECTED', resubmitToken: await issueResubmitToken(user) };
  return { code: 'PENDING_APPROVAL' };
}

const issueResubmitToken = (user) => tokenModel.issue(user.id, 'resubmit', config.auth.idCard.resubmitTtlMs);

// ---------------------------------------------------------------- the administrator's queue
async function queue({ status, page = 1 } = {}) {
  // A photo enters the waiting list only after the e-mail address is confirmed, so typing somebody else's
  // address cannot fill the administrator's list.
  const eligible = status === ID_PROOF.SUBMITTED ? new Set(await userModel.idsVerifiedBy(VERIFY.ID_CARD)) : null;
  const list = await proofModel.list({ status, eligible, page });
  const rows = await Promise.all(list.rows.map(async (proof) => {
    const user = await userModel.findById(proof.userId);
    return { proof, user: user ? reviewerView(user) : null };
  }));
  return { ...list, rows };
}

async function waitingCount() {
  const eligible = new Set(await userModel.idsVerifiedBy(VERIFY.ID_CARD));
  return (await proofModel.list({ status: ID_PROOF.SUBMITTED, eligible, pageSize: 1 })).total;
}

async function load(id) {
  const proof = await proofModel.findById(id);
  const user = proof ? await userModel.findById(proof.userId) : null;
  if (!proof || !user) throw new ServiceError('NOT_FOUND');
  return { proof, user };
}

async function get(id) {
  const { proof, user } = await load(id);
  const attempts = await proofModel.countByUser(user.id);
  return { proof, applicant: reviewerView(user), attempt: attempts, maxAttempts: config.auth.idCard.maxAttempts };
}

// ---------------------------------------------------------------- the decision (AUTH-10)
async function approve(admin, id, ip = '') {
  const { proof, user } = await load(id);
  if (proof.status !== ID_PROOF.SUBMITTED || user.status === USER.SUSPENDED) throw new ServiceError('ID_NOT_OPEN');
  if (!user.emailVerified) throw new ServiceError('ID_EMAIL_UNVERIFIED');
  await proofModel.update(proof.id, { status: ID_PROOF.APPROVED, reviewedBy: admin.id, reviewedAt: new Date(), purgeAfter: purgeTime() });
  await userModel.update(user.id, { status: USER.ACTIVE });
  // The account is active now, so this message is also sent by e-mail.
  await notifications.notify(user.id, 'notif_id_approved', {}, '/dashboard', { email: true });
  await audit.record(admin, 'admin.id_approved', user.email, user.universityId || '', ip);
}

async function reject(admin, id, { reason, note = '', permanent = false }, ip = '') {
  if (!ID_REJECT_REASONS.includes(reason)) throw new ServiceError('ID_REASON_INVALID');
  const cleanNote = String(note || '').trim().slice(0, 200);
  if (reason === 'other' && !cleanNote) throw new ServiceError('ID_REASON_NOTE');

  const { proof, user } = await load(id);
  if (proof.status !== ID_PROOF.SUBMITTED || user.status === USER.SUSPENDED) throw new ServiceError('ID_NOT_OPEN');
  if (!user.emailVerified) throw new ServiceError('ID_EMAIL_UNVERIFIED');

  const attempts = await proofModel.countByUser(user.id);
  const final = Boolean(permanent) || attempts >= config.auth.idCard.maxAttempts;
  await proofModel.update(proof.id, {
    status: ID_PROOF.REJECTED, reviewedBy: admin.id, reviewedAt: new Date(),
    rejectCode: reason, rejectNote: cleanNote, final, purgeAfter: purgeTime()
  });
  // A final rejection frees the university ID, so the real owner of that number can still register.
  if (final) await userModel.update(user.id, { universityId: null });

  const lang = user.lang || 'en';
  const reasonText = translate(lang, `id_reason_${reason}`) + (cleanNote ? `: ${cleanNote}` : '');
  if (final) {
    await mailer.send({
      to: user.email, subject: translate(lang, 'mail_id_rejected_subject'),
      text: translate(lang, 'mail_id_final_body', { name: user.name, reason: reasonText })
    });
  } else {
    const raw = await issueResubmitToken(user);
    const url = link(`/auth/id-card/resubmit/${raw}`);
    await mailer.send({
      to: user.email, subject: translate(lang, 'mail_id_rejected_subject'),
      text: translate(lang, 'mail_id_rejected_body', {
        name: user.name, reason: reasonText, link: url, days: Math.round(config.auth.idCard.resubmitTtlMs / DAY)
      }),
      link: url
    });
  }
  await audit.record(admin, 'admin.id_rejected', user.email, `${reason}${final ? ' (final)' : ''}`, ip);
  return { final };
}

// ---------------------------------------------------------------- sending a new photo after a rejection
// The link in the rejection e-mail (or the redirect after a correct password) carries the token.
async function peekResubmit(raw) {
  const hit = await tokenModel.peek(raw, 'resubmit');
  if (!hit) return null;
  const user = await userModel.findById(hit.userId);
  const proof = user ? await proofModel.latestByUser(user.id) : null;
  const allowed = user && user.verificationMethod === VERIFY.ID_CARD && user.status === USER.PENDING
    && proof && proof.status === ID_PROOF.REJECTED && !proof.final;
  return allowed ? { user: reviewerView(user), proof } : null;
}

async function resubmit(raw, file, ip = '') {
  const ctx = await peekResubmit(raw);
  if (!ctx) throw new ServiceError('TOKEN_INVALID');
  if ((await proofModel.countByUser(ctx.user.id)) >= config.auth.idCard.maxAttempts) throw new ServiceError('ID_LIMIT');
  const saved = await storeImage(file); // a bad file leaves the link usable
  const hit = await tokenModel.consume(raw, 'resubmit');
  if (!hit) { await discard(saved.file); throw new ServiceError('TOKEN_INVALID'); }
  const proof = await submit(ctx.user.id, saved);
  await audit.record({ id: ctx.user.id, name: ctx.user.name, role: ROLES.MEMBER }, 'auth.id_resubmitted', ctx.user.email, '', ip);
  await notifications.notifyRole(ROLES.ADMIN, 'notif_id_resubmitted', { name: ctx.user.name }, `/admin/id-reviews/${proof.id}`);
  return proof;
}

// ---------------------------------------------------------------- looking at the photo (AUTH-11)
// Returns the stored file name and records who looked. The caller sends the bytes.
async function photoFor(admin, id, ip = '') {
  const { proof, user } = await load(id);
  if (!proof.file) throw new ServiceError('NOT_FOUND');
  await audit.record(admin, 'admin.id_viewed', user.email, `photo ${proof.id}`, ip);
  return { file: proof.file };
}

// ---------------------------------------------------------------- clean-up (AUTH-12)
// Deletes photos whose time has passed. Safe to run often. One failure does not stop the others.
async function purgeDue(now = new Date()) {
  let removed = 0;
  for (const proof of await proofModel.listDue(now)) {
    try {
      await images.deleteStored(proof.file);
      await proofModel.update(proof.id, { file: null, purgedAt: new Date() });
      removed += 1;
    } catch (err) {
      console.error('[identity] could not delete photo', proof.id, '-', err.message);
    }
  }
  return removed;
}

module.exports = {
  storeImage, discard, submit, latestFor, waitingState, issueResubmitToken,
  queue, waitingCount, get, approve, reject, peekResubmit, resubmit, photoFor, purgeDue
};
