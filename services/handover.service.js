'use strict';
// QR-assisted handover (FR-17 to FR-20). The code a claimant shows is a signed, expiring,
// single-use token. Only Security Cell staff can complete a handover, and only after they
// confirm they checked the claimant's university ID.
const crypto = require('crypto');
const QRCode = require('qrcode');
const config = require('../config');
const handoverModel = require('../models/handover.model');
const claimModel = require('../models/claim.model');
const caseModel = require('../models/case.model');
const settingsModel = require('../models/settings.model');
const { CASE, CLAIM } = require('../config/statuses');
const audit = require('./audit.service');
const notifications = require('./notification.service');
const matching = require('./matching.service');
const { ServiceError } = require('./errors');

const PREFIX = 'sf1';
const DAY = 86400000;
const SHORT_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L

const hmac = (data) => crypto.createHmac('sha256', config.qrSecret).update(data);
const sign = (payloadB64) => hmac(`${PREFIX}.${payloadB64}`).digest('base64url');

function makeToken(h) {
  const payload = Buffer.from(JSON.stringify({ h: h.id, c: h.claimId, n: h.nonce, e: new Date(h.expiresAt).getTime() })).toString('base64url');
  return `${PREFIX}.${payload}.${sign(payload)}`;
}

function shortCode(h) {
  const digest = hmac(`short.${h.id}.${h.nonce}`).digest();
  let out = '';
  for (let i = 0; i < 8; i += 1) out += SHORT_ALPHABET[digest[i] % SHORT_ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

function parseToken(raw) {
  let token = String(raw || '').trim();
  if (!token || token.length > 600) return null;
  if (token.includes('t=')) {
    try { token = new URL(token, config.baseUrl).searchParams.get('t') || token; } catch { /* use as is */ }
  }
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const a = Buffer.from(parts[2]);
  const b = Buffer.from(sign(parts[1]));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { return null; }
}

async function create(claim) {
  const settings = await settingsModel.get();
  const old = await handoverModel.byClaim(claim.id);
  if (old && old.status === 'pending') await handoverModel.update(old.id, { status: 'cancelled' });
  return handoverModel.create({
    claimId: claim.id, caseId: claim.foundCaseId, nonce: crypto.randomBytes(12).toString('hex'),
    expiresAt: new Date(Date.now() + settings.handoverValidDays * DAY)
  });
}

// Claimant (or staff) asks for a fresh code after the old one expired.
async function renew(claimId) {
  const claim = await claimModel.get(claimId);
  if (!claim || claim.status !== CLAIM.VERIFIED) throw new ServiceError('BAD_STATE');
  const h = await handoverModel.byClaim(claim.id);
  if (!h || h.status === 'completed') throw new ServiceError('BAD_STATE');
  const settings = await settingsModel.get();
  return handoverModel.update(h.id, { nonce: crypto.randomBytes(12).toString('hex'), expiresAt: new Date(Date.now() + settings.handoverValidDays * DAY), status: 'pending' });
}

// Staff issue a fresh code when the old one expired or was lost.
async function renewAs(staff, claimId, ip = '') {
  const claim = await claimModel.get(claimId);
  if (claim && claim.userId === staff.id) throw new ServiceError('OWN_CLAIM');
  const h = await renew(claimId);
  const found = claim ? await caseModel.findById(claim.foundCaseId) : null;
  await audit.record(staff, 'handover.code_renewed', found ? found.ref : String(claimId), `claim ${claimId}`, ip);
  return h;
}

const forClaim = (claimId) => handoverModel.byClaim(claimId);
const qrPng = (h) => QRCode.toBuffer(makeToken(h), { errorCorrectionLevel: 'M', margin: 2, width: 320, color: { dark: '#000000', light: '#ffffff' } });

async function load(handover) {
  if (!handover) throw new ServiceError('QR_INVALID');
  if (handover.status === 'completed') throw new ServiceError('QR_USED');
  if (handover.status === 'cancelled') throw new ServiceError('QR_CANCELLED');
  if (new Date(handover.expiresAt) < new Date()) throw new ServiceError('QR_EXPIRED');
  const claim = await claimModel.get(handover.claimId);
  const found = claim ? await caseModel.findById(claim.foundCaseId) : null;
  if (!claim || !found || claim.status !== CLAIM.VERIFIED || found.status !== CASE.READY) throw new ServiceError('QR_INVALID');
  return { handover, claim, found };
}

// Accepts a scanned token, a pasted URL, or the short code read aloud.
async function resolve(input) {
  const text = String(input || '').trim();
  const payload = parseToken(text);
  if (payload) {
    const h = await handoverModel.get(payload.h);
    if (!h || h.nonce !== payload.n || h.claimId !== payload.c) throw new ServiceError('QR_INVALID');
    return load(h);
  }
  const code = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length === 8) {
    const pending = await handoverModel.listByStatus('pending');
    const h = pending.find((x) => shortCode(x).replace('-', '') === code);
    if (h) return load(h);
  }
  throw new ServiceError('QR_INVALID');
}

async function complete(staff, input, { idChecked }, ip = '') {
  const ctx = await resolve(input);
  if (!idChecked) throw new ServiceError('ID_NOT_CHECKED');
  if (ctx.claim.userId === staff.id) throw new ServiceError('OWN_CLAIM');

  // Single use: only the first caller to reach this line gets a row back.
  const done = await handoverModel.completeIfPending(ctx.handover.id, { completedAt: new Date(), completedBy: staff.id, idChecked: true });
  if (!done) throw new ServiceError('QR_USED');

  const now = new Date();
  await claimModel.update(ctx.claim.id, { status: CLAIM.COMPLETED });
  await caseModel.update(ctx.found.id, { status: CASE.CLOSED, closeReason: 'returned', closedAt: now });
  await caseModel.addEvent(ctx.found.id, { key: 'ev_returned', params: {} });
  if (ctx.claim.lostCaseId) {
    await caseModel.update(ctx.claim.lostCaseId, { status: CASE.CLOSED, closeReason: 'recovered', closedAt: now });
    await caseModel.addEvent(ctx.claim.lostCaseId, { key: 'ev_recovered', params: {} });
  }
  // Anyone else who claimed the same item is told it has been returned.
  for (const other of await claimModel.forCase(ctx.found.id)) {
    if (other.id === ctx.claim.id || ![CLAIM.SUBMITTED, CLAIM.PROOF_REQUESTED, CLAIM.VERIFIED].includes(other.status)) continue;
    await claimModel.update(other.id, { status: CLAIM.REJECTED, verification: { by: staff.id, byName: staff.name, at: now, note: 'Item returned to another claimant' } });
    await notifications.notify(other.userId, 'notif_claim_closed_other', { ref: ctx.found.ref }, `/claims/${other.id}`);
    if (other.lostCaseId) await matching.recomputeStatus(other.lostCaseId);
  }
  await notifications.notify(ctx.claim.userId, 'notif_handover_done', { ref: ctx.found.ref }, `/claims/${ctx.claim.id}`, { email: true });
  await audit.record(staff, 'handover.completed', ctx.found.ref, `claim ${ctx.claim.id}, ID checked`, ip);
  return ctx;
}

const listHistory = (filters) => handoverModel.listHistory(filters);

const listPending = async () => {
  const rows = await handoverModel.listByStatus('pending');
  const out = [];
  for (const h of rows) {
    const claim = await claimModel.get(h.claimId);
    const found = claim ? await caseModel.findById(claim.foundCaseId) : null;
    if (claim && found) out.push({ handover: h, claim, found, expired: new Date(h.expiresAt) < new Date() });
  }
  return out;
};

module.exports = { create, renew, renewAs, forClaim, qrPng, makeToken, shortCode, parseToken, resolve, complete, listPending, listHistory };
