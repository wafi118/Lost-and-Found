'use strict';
// Notes on a case, including CCTV review. The reporter can read the findings. The camera
// name and the time window stay with Security Cell and the administrator.
const { query, one } = require('../db');
const { id, dt } = require('../db/shape');

function toNote(row) {
  if (!row) return null;
  return {
    id: id(row.id), caseId: id(row.case_id), userId: id(row.user_id), kind: row.kind,
    camera: row.camera || '', windowFrom: dt(row.window_from), windowTo: dt(row.window_to),
    findings: row.findings, createdAt: dt(row.created_at), deletedAt: dt(row.deleted_at),
    authorName: row.author_name || ''
  };
}

async function create(d) {
  const row = await one(
    `INSERT INTO investigations (case_id, user_id, kind, camera, window_from, window_to, findings, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      Number(d.caseId), Number(d.userId), d.kind || 'note', d.camera || '',
      d.windowFrom || null, d.windowTo || null, d.findings, d.createdAt || new Date()
    ]
  );
  return toNote(row);
}

const get = async (n) => toNote(await one(
  `SELECT i.*, u.name AS author_name FROM investigations i JOIN users u ON u.id = i.user_id WHERE i.id = $1`,
  [Number(n)]
));

const forCase = async (caseId) => (await query(
  `SELECT i.*, u.name AS author_name
   FROM investigations i JOIN users u ON u.id = i.user_id
   WHERE i.case_id = $1 ORDER BY i.created_at ASC, i.id ASC`,
  [Number(caseId)]
)).map(toNote);

async function update(n, patch) {
  const sets = [];
  const params = [];
  if (Object.prototype.hasOwnProperty.call(patch, 'findings')) {
    params.push(patch.findings);
    sets.push(`findings = $${params.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'deletedAt')) {
    params.push(patch.deletedAt);
    sets.push(`deleted_at = $${params.length}`);
  }
  if (!sets.length) return get(n);
  params.push(Number(n));
  await query(`UPDATE investigations SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  return get(n);
}

module.exports = { create, get, forCase, update };
