'use strict';
const { query, one } = require('../db');
const { id, dt } = require('../db/shape');

function toHandover(row) {
  if (!row) return null;
  return {
    id: id(row.id), claimId: id(row.claim_id), caseId: id(row.case_id), nonce: row.nonce,
    expiresAt: dt(row.expires_at), status: row.status, completedAt: dt(row.completed_at),
    completedBy: id(row.completed_by), idChecked: Boolean(row.id_checked), createdAt: dt(row.created_at)
  };
}

async function create(d) {
  const row = await one(
    `INSERT INTO handovers (claim_id, case_id, nonce, expires_at, status)
     VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
    [Number(d.claimId), Number(d.caseId), d.nonce, d.expiresAt]
  );
  return toHandover(row);
}

const get = async (n) => toHandover(await one('SELECT * FROM handovers WHERE id = $1', [Number(n)]));

const COLUMNS = {
  nonce: 'nonce', expiresAt: 'expires_at', status: 'status', completedAt: 'completed_at',
  completedBy: 'completed_by', idChecked: 'id_checked'
};

async function update(n, patch) {
  const sets = [];
  const params = [];
  for (const [key, column] of Object.entries(COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    params.push(key === 'idChecked' ? !!patch[key] : patch[key]);
    sets.push(`${column} = $${params.length}`);
  }
  if (!sets.length) return get(n);
  params.push(Number(n));
  return toHandover(await one(`UPDATE handovers SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params));
}

// One statement, so two staff members scanning the same code cannot both succeed.
async function completeIfPending(n, patch) {
  const row = await one(
    `UPDATE handovers
     SET status = 'completed', completed_at = $2, completed_by = $3, id_checked = true
     WHERE id = $1 AND status = 'pending' AND expires_at > now()
     RETURNING *`,
    [Number(n), patch.completedAt || new Date(), patch.completedBy]
  );
  return toHandover(row);
}

// The live code when there is one; otherwise the newest cancelled row (so it can be renewed).
async function byClaim(claimId) {
  return toHandover(await one(
    `SELECT * FROM handovers WHERE claim_id = $1
     ORDER BY CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END, id DESC
     LIMIT 1`,
    [Number(claimId)]
  ));
}

const listByStatus = async (status) => (await query(
  'SELECT * FROM handovers WHERE status = $1 ORDER BY expires_at ASC',
  [status]
)).map(toHandover);

// Every handover, newest activity first, for the history page. The nonce stays out of this result.
async function listHistory({ status, q, page = 1, pageSize = 15 } = {}) {
  const where = [];
  const params = [];
  if (status === 'completed' || status === 'cancelled') {
    params.push(status);
    where.push(`h.status = $${params.length}`);
  } else if (status === 'pending') where.push(`h.status = 'pending' AND h.expires_at > now()`);
  else if (status === 'expired') where.push(`h.status = 'pending' AND h.expires_at <= now()`);
  if (q) {
    params.push(String(q).toLowerCase());
    const n = `$${params.length}`;
    where.push(`(strpos(lower(cs.ref), ${n}) > 0 OR strpos(lower(cs.title), ${n}) > 0 OR strpos(lower(u.name), ${n}) > 0 OR strpos(lower(coalesce(u.university_id, '')), ${n}) > 0)`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from = `
    FROM handovers h
    JOIN claims cl ON cl.id = h.claim_id
    JOIN cases cs ON cs.id = h.case_id
    JOIN users u ON u.id = cl.user_id
    LEFT JOIN users staff ON staff.id = h.completed_by
  `;
  const total = Number((await one(`SELECT count(*)::int AS n ${from} ${clause}`, params)).n);
  const p = Math.max(1, parseInt(page, 10) || 1);
  const size = Math.max(1, parseInt(pageSize, 10) || 15);
  const rows = await query(
    `SELECT h.id, h.claim_id, h.status, h.expires_at, h.completed_at, h.created_at,
            cs.ref, cs.title, u.name AS claimant_name, u.university_id AS claimant_university_id,
            staff.name AS completed_by_name
     ${from} ${clause}
     ORDER BY COALESCE(h.completed_at, h.created_at) DESC
     LIMIT ${size} OFFSET ${(p - 1) * size}`,
    params
  );
  return {
    rows: rows.map((r) => ({
      id: id(r.id), claimId: id(r.claim_id), status: r.status,
      expiresAt: dt(r.expires_at), completedAt: dt(r.completed_at), createdAt: dt(r.created_at),
      ref: r.ref, title: r.title, claimantName: r.claimant_name, claimantUniversityId: r.claimant_university_id || '',
      completedByName: r.completed_by_name || '',
      expired: r.status === 'pending' && new Date(r.expires_at) <= new Date()
    })),
    total, page: p, pageSize: size
  };
}

const all = async () => (await query('SELECT * FROM handovers ORDER BY id')).map(toHandover);

module.exports = { create, get, update, completeIfPending, byClaim, listByStatus, listHistory, all };
