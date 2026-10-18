'use strict';
const { query, one } = require('../db');
const { id, dt, json } = require('../db/shape');

function toMatch(row) {
  if (!row) return null;
  return {
    id: id(row.id), lostCaseId: id(row.lost_case_id), foundCaseId: id(row.found_case_id),
    score: Number(row.score), breakdown: json(row.breakdown, {}), reasons: json(row.reasons, []),
    publicReasons: json(row.public_reasons, []), status: row.status,
    reviewedBy: id(row.reviewed_by), reviewedAt: dt(row.reviewed_at), createdAt: dt(row.created_at)
  };
}

async function create(d) {
  const row = await one(
    `INSERT INTO matches (lost_case_id, found_case_id, score, breakdown, reasons, public_reasons, status)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, 'suggested') RETURNING *`,
    [
      Number(d.lostCaseId), Number(d.foundCaseId), d.score,
      JSON.stringify(d.breakdown || {}), JSON.stringify(d.reasons || []), JSON.stringify(d.publicReasons || [])
    ]
  );
  return toMatch(row);
}

const get = async (n) => toMatch(await one('SELECT * FROM matches WHERE id = $1', [Number(n)]));

async function update(n, patch) {
  const sets = [];
  const params = [];
  const push = (column, value) => { params.push(value); sets.push(`${column} = $${params.length}`); };
  if (Object.prototype.hasOwnProperty.call(patch, 'status')) push('status', patch.status);
  if (Object.prototype.hasOwnProperty.call(patch, 'reviewedBy')) push('reviewed_by', patch.reviewedBy);
  if (Object.prototype.hasOwnProperty.call(patch, 'reviewedAt')) push('reviewed_at', patch.reviewedAt);
  if (Object.prototype.hasOwnProperty.call(patch, 'score')) push('score', patch.score);
  if (!sets.length) return get(n);
  params.push(Number(n));
  return toMatch(await one(`UPDATE matches SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params));
}

async function forCase(caseId, status) {
  const params = [Number(caseId)];
  let sql = 'SELECT * FROM matches WHERE (lost_case_id = $1 OR found_case_id = $1)';
  if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
  sql += ' ORDER BY score DESC, id DESC';
  return (await query(sql, params)).map(toMatch);
}

const findPair = async (lostCaseId, foundCaseId) => toMatch(await one(
  'SELECT * FROM matches WHERE lost_case_id = $1 AND found_case_id = $2',
  [Number(lostCaseId), Number(foundCaseId)]
));

const listByStatus = async (status) => (await query(
  'SELECT * FROM matches WHERE status = $1 ORDER BY score DESC, id DESC',
  [status]
)).map(toMatch);

module.exports = { create, get, update, forCase, findPair, listByStatus };
