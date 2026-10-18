'use strict';
// A message on a case, from the Security Cell or from the person who reported it.
// Deleting the text or the image keeps the row, so the case history can say what was removed.
const { query, one } = require('../db');
const { id, dt } = require('../db/shape');

const FROM = `
  SELECT m.*, u.name AS author_name, u.role AS author_role
  FROM case_updates m JOIN users u ON u.id = m.user_id
`;

function toUpdate(row) {
  if (!row) return null;
  return {
    id: id(row.id), caseId: id(row.case_id), userId: id(row.user_id),
    body: row.body || '', image: row.image || null, imageMime: row.image_mime || null,
    hadImage: Boolean(row.had_image), imageDeletedAt: dt(row.image_deleted_at),
    deletedAt: dt(row.deleted_at), createdAt: dt(row.created_at),
    authorName: row.author_name || '', authorRole: row.author_role || ''
  };
}

async function create(d) {
  const row = await one(
    `INSERT INTO case_updates (case_id, user_id, body, image, image_mime, had_image, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [Number(d.caseId), Number(d.userId), d.body || '', d.image || null, d.imageMime || null, !!d.hadImage, d.createdAt || new Date()]
  );
  return get(row.id);
}

const get = async (n) => toUpdate(await one(`${FROM} WHERE m.id = $1`, [Number(n)]));

const forCase = async (caseId) => (await query(
  `${FROM} WHERE m.case_id = $1 ORDER BY m.created_at ASC, m.id ASC`,
  [Number(caseId)]
)).map(toUpdate);

const findByImage = async (file) => toUpdate(await one(`${FROM} WHERE m.image = $1`, [file]));

async function update(n, patch) {
  const columns = {
    body: 'body', image: 'image', imageMime: 'image_mime', hadImage: 'had_image',
    imageDeletedAt: 'image_deleted_at', deletedAt: 'deleted_at'
  };
  const sets = [];
  const params = [];
  for (const [key, column] of Object.entries(columns)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    params.push(key === 'hadImage' ? !!patch[key] : patch[key]);
    sets.push(`${column} = $${params.length}`);
  }
  if (!sets.length) return get(n);
  params.push(Number(n));
  await query(`UPDATE case_updates SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  return get(n);
}

module.exports = { create, get, forCase, findByImage, update };
