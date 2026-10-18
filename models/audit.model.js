'use strict';
const { query, one } = require('../db');
const { id, dt } = require('../db/shape');

function toAudit(row) {
  if (!row) return null;
  return {
    id: id(row.id), userId: id(row.user_id), actor: row.actor, role: row.role,
    action: row.action, entity: row.entity || '', detail: row.detail || '', ip: row.ip || '', at: dt(row.at)
  };
}

async function append(d) {
  const row = await one(
    `INSERT INTO audit_logs (user_id, actor, role, action, entity, detail, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [d.userId || null, d.actor || 'system', d.role || null, d.action, d.entity || '', d.detail || '', d.ip || '']
  );
  return toAudit(row);
}

async function list({ action, q, page = 1, pageSize = 25 } = {}) {
  const where = [];
  const params = [];
  if (action) { params.push(action); where.push(`action = $${params.length}`); }
  if (q) {
    params.push(String(q).toLowerCase());
    const n = `$${params.length}`;
    where.push(`(strpos(lower(actor), ${n}) > 0 OR strpos(lower(entity), ${n}) > 0 OR strpos(lower(detail), ${n}) > 0)`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number((await one(`SELECT count(*)::int AS n FROM audit_logs ${clause}`, params)).n);
  const p = Math.max(1, parseInt(page, 10) || 1);
  const size = Math.max(1, parseInt(pageSize, 10) || 25);
  const rows = (await query(
    `SELECT * FROM audit_logs ${clause} ORDER BY id DESC LIMIT ${size} OFFSET ${(p - 1) * size}`,
    params
  )).map(toAudit);
  return { rows, total, page: p, pageSize: size };
}

const actions = async () => (await query('SELECT DISTINCT action FROM audit_logs ORDER BY action')).map((r) => r.action);

module.exports = { append, list, actions };
