'use strict';
// ID card photos sent by people who register without a university e-mail address.
// One row per photo, so a later attempt does not erase the earlier decision.
const { query, one } = require('../db');
const { id, dt, inList } = require('../db/shape');

function toProof(row) {
  if (!row) return null;
  return {
    id: id(row.id), userId: id(row.user_id), file: row.file, status: row.status,
    submittedAt: dt(row.submitted_at), reviewedBy: id(row.reviewed_by), reviewedAt: dt(row.reviewed_at),
    rejectCode: row.reject_code, rejectNote: row.reject_note || '', final: Boolean(row.final),
    purgeAfter: dt(row.purge_after), purgedAt: dt(row.purged_at)
  };
}

async function create({ userId, file }) {
  const row = await one(
    `INSERT INTO identity_proofs (user_id, file, status) VALUES ($1, $2, 'submitted') RETURNING *`,
    [Number(userId), file]
  );
  return toProof(row);
}

const findById = async (n) => toProof(await one('SELECT * FROM identity_proofs WHERE id = $1', [Number(n)]));

const COLUMNS = {
  file: 'file', status: 'status', reviewedBy: 'reviewed_by', reviewedAt: 'reviewed_at',
  rejectCode: 'reject_code', rejectNote: 'reject_note', final: 'final',
  purgeAfter: 'purge_after', purgedAt: 'purged_at'
};

async function update(n, patch) {
  const sets = [];
  const params = [];
  for (const [key, column] of Object.entries(COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    let value = patch[key];
    if (key === 'final') value = !!value;
    if (key === 'rejectNote' && value == null) value = '';
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  }
  if (!sets.length) return findById(n);
  params.push(Number(n));
  return toProof(await one(`UPDATE identity_proofs SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params));
}

const latestByUser = async (userId) => toProof(await one(
  'SELECT * FROM identity_proofs WHERE user_id = $1 ORDER BY id DESC LIMIT 1',
  [Number(userId)]
));

const countByUser = async (userId) => Number((await one(
  'SELECT count(*)::int AS n FROM identity_proofs WHERE user_id = $1',
  [Number(userId)]
)).n);

async function list({ status, eligible = null, page = 1, pageSize = 15 } = {}) {
  const where = [];
  const params = [];
  if (status) { params.push(status); where.push(`status = $${params.length}`); }
  if (eligible) {
    const ids = [...eligible].map(Number);
    if (!ids.length) return { rows: [], total: 0, page: 1, pageSize };
    where.push(inList('user_id', ids, params));
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number((await one(`SELECT count(*)::int AS n FROM identity_proofs ${clause}`, params)).n);
  const p = Math.max(1, parseInt(page, 10) || 1);
  const size = Math.max(1, parseInt(pageSize, 10) || 15);
  const order = status === 'submitted' ? 'submitted_at ASC' : 'id DESC';
  const rows = (await query(
    `SELECT * FROM identity_proofs ${clause} ORDER BY ${order} LIMIT ${size} OFFSET ${(p - 1) * size}`,
    params
  )).map(toProof);
  return { rows, total, page: p, pageSize: size };
}

const all = async () => (await query('SELECT * FROM identity_proofs ORDER BY id')).map(toProof);

const listDue = async (now = new Date()) => (await query(
  'SELECT * FROM identity_proofs WHERE file IS NOT NULL AND purge_after IS NOT NULL AND purge_after <= $1',
  [now]
)).map(toProof);

module.exports = { create, findById, update, latestByUser, countByUser, list, all, listDue };
