'use strict';
const { query, one } = require('../db');
const { id, dt } = require('../db/shape');

const norm = (e) => String(e || '').trim().toLowerCase();

function toUser(row) {
  if (!row) return null;
  return {
    id: id(row.id),
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    affiliation: row.affiliation,
    universityId: row.university_id,
    phone: row.phone,
    status: row.status,
    emailVerified: Boolean(row.email_verified),
    verificationMethod: row.verification_method,
    lang: row.lang,
    passwordChangedAt: dt(row.password_changed_at),
    createdAt: dt(row.created_at),
    lastLoginAt: dt(row.last_login_at),
    deletedAt: dt(row.deleted_at)
  };
}

async function create(data) {
  const row = await one(
    `INSERT INTO users (
       name, email, password_hash, role, affiliation, university_id, phone, status,
       email_verified, verification_method, lang, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [
      data.name, norm(data.email), data.passwordHash || null, data.role,
      data.affiliation || null, data.universityId ? String(data.universityId).trim() : null,
      data.phone || null, data.status, !!data.emailVerified,
      data.verificationMethod === 'id_card' ? 'id_card' : 'university_email',
      data.lang === 'bn' ? 'bn' : 'en', data.createdAt || new Date()
    ]
  );
  return toUser(row);
}

const findById = async (n) => toUser(await one('SELECT * FROM users WHERE id = $1', [Number(n)]));
const findByEmail = async (email) => toUser(await one('SELECT * FROM users WHERE email = $1', [norm(email)]));
const findByUniversityId = async (uid) => toUser(await one(
  'SELECT * FROM users WHERE university_id IS NOT NULL AND lower(university_id) = lower($1)',
  [String(uid)]
));

const USER_COLUMNS = {
  name: 'name', email: 'email', passwordHash: 'password_hash', role: 'role', affiliation: 'affiliation',
  universityId: 'university_id', phone: 'phone', status: 'status', emailVerified: 'email_verified',
  verificationMethod: 'verification_method', lang: 'lang', passwordChangedAt: 'password_changed_at',
  lastLoginAt: 'last_login_at', createdAt: 'created_at', deletedAt: 'deleted_at'
};

async function update(n, patch) {
  const sets = [];
  const params = [];
  for (const [key, column] of Object.entries(USER_COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    let value = patch[key];
    if (key === 'email' && value != null) value = norm(value);
    if (key === 'universityId') value = value ? String(value).trim() : null;
    if (key === 'emailVerified') value = !!value;
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  }
  if (!sets.length) return findById(n);
  params.push(Number(n));
  const row = await one(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  return toUser(row);
}

async function list({ role, status, q, page = 1, pageSize = 15 } = {}) {
  const where = [];
  const params = [];
  if (status === 'deleted') where.push('deleted_at IS NOT NULL');
  else {
    where.push('deleted_at IS NULL');
    if (status) { params.push(status); where.push(`status = $${params.length}`); }
  }
  if (role) { params.push(role); where.push(`role = $${params.length}`); }
  if (q) {
    params.push(String(q).toLowerCase());
    const n = `$${params.length}`;
    where.push(`(strpos(lower(name), ${n}) > 0 OR strpos(email, ${n}) > 0 OR strpos(lower(coalesce(university_id, '')), ${n}) > 0)`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number((await one(`SELECT count(*)::int AS n FROM users ${clause}`, params)).n);
  const p = Math.max(1, parseInt(page, 10) || 1);
  const size = Math.max(1, parseInt(pageSize, 10) || 15);
  const rows = (await query(
    `SELECT * FROM users ${clause} ORDER BY created_at DESC LIMIT ${size} OFFSET ${(p - 1) * size}`,
    params
  )).map(toUser);
  return { rows, total, page: p, pageSize: size };
}

const idsVerifiedBy = async (method) => (await query(
  'SELECT id FROM users WHERE verification_method = $1 AND email_verified AND deleted_at IS NULL',
  [method]
)).map((r) => id(r.id));

async function count(filter = {}) {
  const where = [];
  const params = [];
  where.push('deleted_at IS NULL');
  if (filter.role) { params.push(filter.role); where.push(`role = $${params.length}`); }
  if (filter.status) { params.push(filter.status); where.push(`status = $${params.length}`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return Number((await one(`SELECT count(*)::int AS n FROM users ${clause}`, params)).n);
}

const listByRole = async (role) => (await query(
  "SELECT * FROM users WHERE role = $1 AND status = 'active' ORDER BY id",
  [role]
)).map(toUser);

module.exports = { create, findById, findByEmail, findByUniversityId, update, list, count, listByRole, idsVerifiedBy };
