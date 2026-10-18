'use strict';
// One-time tokens for email verification and password setup/reset. Only a hash is stored,
// so a leaked table cannot be used to take over an account.
const crypto = require('crypto');
const { query, one, tx } = require('../db');
const { dt } = require('../db/shape');

const hash = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

async function issue(userId, purpose, ttlMs) {
  const raw = crypto.randomBytes(32).toString('base64url');
  await tx(async () => {
    await query('DELETE FROM auth_tokens WHERE user_id = $1 AND purpose = $2', [Number(userId), purpose]);
    await query(
      'INSERT INTO auth_tokens (token_hash, user_id, purpose, expires_at) VALUES ($1, $2, $3, $4)',
      [hash(raw), Number(userId), purpose, new Date(Date.now() + ttlMs)]
    );
  });
  return raw;
}

async function peek(raw, purpose) {
  if (typeof raw !== 'string' || raw.length > 100) return null;
  const t = await one(
    'SELECT user_id, expires_at FROM auth_tokens WHERE token_hash = $1 AND purpose = $2',
    [hash(raw), purpose]
  );
  if (!t || dt(t.expires_at) <= new Date()) return null;
  return { userId: Number(t.user_id) };
}

async function consume(raw, purpose) {
  if (typeof raw !== 'string' || raw.length > 100) return null;
  const t = await one(
    'DELETE FROM auth_tokens WHERE token_hash = $1 AND purpose = $2 RETURNING user_id, expires_at',
    [hash(raw), purpose]
  );
  if (!t || dt(t.expires_at) <= new Date()) return null;
  return { userId: Number(t.user_id) };
}

module.exports = { issue, peek, consume };
