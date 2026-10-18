'use strict';
// Messages are stored as a locale key plus parameters, not as finished text, so the language
// toggle also changes old notifications.
const { query, one } = require('../db');
const { id, dt, json } = require('../db/shape');

function toNote(row) {
  if (!row) return null;
  return {
    id: id(row.id), userId: id(row.user_id), key: row.key, params: json(row.params, {}),
    link: row.link, read: Boolean(row.is_read), createdAt: dt(row.created_at)
  };
}

async function create(d) {
  const row = await one(
    `INSERT INTO notifications (user_id, key, params, link, is_read) VALUES ($1, $2, $3::jsonb, $4, false) RETURNING *`,
    [Number(d.userId), d.key, JSON.stringify(d.params || {}), d.link || null]
  );
  return toNote(row);
}

async function forUser(userId, { page = 1, pageSize = 20 } = {}) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const size = Math.max(1, parseInt(pageSize, 10) || 20);
  const total = Number((await one('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1', [Number(userId)])).n);
  const rows = (await query(
    'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
    [Number(userId), size, (p - 1) * size]
  )).map(toNote);
  return { rows, total, page: p, pageSize: size };
}

const recent = async (userId, n = 5) => (await query(
  'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
  [Number(userId), n]
)).map(toNote);

const countUnread = async (userId) => Number((await one(
  'SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND NOT is_read',
  [Number(userId)]
)).n);

const markAllRead = async (userId) => {
  await query('UPDATE notifications SET is_read = true WHERE user_id = $1 AND NOT is_read', [Number(userId)]);
};

module.exports = { create, forUser, recent, countUnread, markAllRead };
