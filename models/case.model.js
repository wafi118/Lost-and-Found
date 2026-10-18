'use strict';
// A "case" is one report (lost or found). The columns that only make sense for a found item
// (finder, shelf) stay null on a lost report; the schema checks that.
const { query, one, tx } = require('../db');
const { id, dt, eventsOf, inList } = require('../db/shape');

const CASE_FROM = `
  SELECT cs.*,
    rec.name AS recorded_by_name,
    appr.name AS approval_by_name,
    rev.name AS review_by_name,
    disp.name AS disposal_by_name,
    COALESCE((
      SELECT json_agg(json_build_object(
        'at', ev.at, 'key', ev.key, 'params', ev.params, 'staffOnly', ev.staff_only
      ) ORDER BY ev.id)
      FROM case_events ev WHERE ev.case_id = cs.id
    ), '[]'::json) AS events
  FROM cases cs
  LEFT JOIN users rec ON rec.id = cs.recorded_by
  LEFT JOIN users appr ON appr.id = cs.approval_by
  LEFT JOIN users rev ON rev.id = cs.review_by
  LEFT JOIN users disp ON disp.id = cs.disposal_by
`;

function toCase(row) {
  if (!row) return null;
  const approval = row.approval_decision ? {
    by: id(row.approval_by), byName: row.approval_by_name || '', at: dt(row.approval_at),
    decision: row.approval_decision, remarks: row.approval_remarks || ''
  } : null;
  const review = row.review_decision ? {
    by: id(row.review_by), byName: row.review_by_name || '', at: dt(row.review_at),
    decision: row.review_decision, note: row.review_note || ''
  } : null;
  const finder = (row.finder_name || row.recorded_by) ? {
    name: row.finder_name || '', contact: row.finder_contact || '',
    universityId: row.finder_university_id || '', recordedBy: id(row.recorded_by),
    recordedByName: row.recorded_by_name || ''
  } : null;
  const disposal = row.disposal_method ? {
    method: row.disposal_method, note: row.disposal_note || '', by: id(row.disposal_by),
    byName: row.disposal_by_name || '', at: dt(row.disposal_at)
  } : null;
  return {
    id: id(row.id), ref: row.ref, type: row.type, userId: id(row.user_id),
    categoryId: id(row.category_id), locationId: id(row.location_id),
    locationDetail: row.location_detail || '', title: row.title, description: row.description,
    occurredAt: dt(row.occurred_at), photo: row.photo, photoMime: row.photo_mime, status: row.status,
    approvalRequired: Boolean(row.approval_required), approval, review, finder,
    storageSlot: row.storage_slot, retentionFlaggedAt: dt(row.retention_flagged_at),
    retentionResetAt: dt(row.retention_reset_at), disposal, closeReason: row.close_reason,
    closedAt: dt(row.closed_at), events: eventsOf(row.events),
    createdAt: dt(row.created_at), updatedAt: dt(row.updated_at)
  };
}

async function replaceEvents(caseId, events) {
  await query('DELETE FROM case_events WHERE case_id = $1', [caseId]);
  for (const e of events || []) {
    await query(
      'INSERT INTO case_events (case_id, at, key, params, staff_only) VALUES ($1, $2, $3, $4::jsonb, $5)',
      [caseId, e.at || new Date(), e.key, JSON.stringify(e.params || {}), !!e.staffOnly]
    );
  }
}

async function create(d) {
  const now = d.createdAt || new Date();
  const f = d.finder || null;
  return tx(async () => {
    const row = await one(
      `INSERT INTO cases (
         type, user_id, category_id, location_id, location_detail, title, description, occurred_at,
         photo, photo_mime, status, approval_required,
         finder_name, finder_contact, finder_university_id, recorded_by, storage_slot,
         created_at, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18
       ) RETURNING id`,
      [
        d.type, d.userId || null, Number(d.categoryId), Number(d.locationId), d.locationDetail || '',
        d.title, d.description, d.occurredAt, d.photo || null, d.photoMime || null, d.status, !!d.approvalRequired,
        f ? (f.name || null) : null, f ? (f.contact || '') : null, f ? (f.universityId || null) : null,
        f ? f.recordedBy : null, d.storageSlot || null, now
      ]
    );
    if (d.events && d.events.length) await replaceEvents(id(row.id), d.events);
    return findById(row.id);
  });
}

const findById = async (n) => toCase(await one(`${CASE_FROM} WHERE cs.id = $1`, [Number(n)]));
const findByRef = async (ref) => toCase(await one(`${CASE_FROM} WHERE cs.ref = $1`, [String(ref).toUpperCase()]));
const findByPhoto = async (file) => toCase(await one(`${CASE_FROM} WHERE cs.photo = $1`, [file]));

const SCALARS = {
  status: 'status', closeReason: 'close_reason', closedAt: 'closed_at', createdAt: 'created_at',
  occurredAt: 'occurred_at', retentionFlaggedAt: 'retention_flagged_at', retentionResetAt: 'retention_reset_at',
  storageSlot: 'storage_slot', photo: 'photo', photoMime: 'photo_mime', title: 'title',
  description: 'description', locationDetail: 'location_detail', locationId: 'location_id',
  categoryId: 'category_id', userId: 'user_id', approvalRequired: 'approval_required'
};

async function update(n, patch) {
  const caseId = Number(n);
  return tx(async () => {
    const sets = ['updated_at = now()'];
    const params = [];
    const push = (column, value) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };
    for (const [key, column] of Object.entries(SCALARS)) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) push(column, patch[key]);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'approval')) {
      const a = patch.approval;
      push('approval_by', a && a.by);
      push('approval_at', a && a.at);
      push('approval_decision', a && a.decision);
      push('approval_remarks', a ? (a.remarks || '') : null);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'review')) {
      const r = patch.review;
      push('review_by', r && r.by);
      push('review_at', r && r.at);
      push('review_decision', r && r.decision);
      push('review_note', r ? (r.note || '') : null);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'disposal')) {
      const d = patch.disposal;
      push('disposal_method', d && d.method);
      push('disposal_note', d ? (d.note || '') : null);
      push('disposal_by', d && d.by);
      push('disposal_at', d && d.at);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'finder')) {
      const f = patch.finder;
      push('finder_name', f ? (f.name || null) : null);
      push('finder_contact', f ? (f.contact || '') : null);
      push('finder_university_id', f ? (f.universityId || null) : null);
      push('recorded_by', f && f.recordedBy);
    }
    params.push(caseId);
    await query(`UPDATE cases SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    if (Object.prototype.hasOwnProperty.call(patch, 'events')) await replaceEvents(caseId, patch.events);
    return findById(caseId);
  });
}

async function addEvent(n, event) {
  const caseId = Number(n);
  await query(
    'INSERT INTO case_events (case_id, at, key, params, staff_only) VALUES ($1, $2, $3, $4::jsonb, $5)',
    [caseId, event.at || new Date(), event.key, JSON.stringify(event.params || {}), !!event.staffOnly]
  );
  await query('UPDATE cases SET updated_at = now() WHERE id = $1', [caseId]);
  return findById(caseId);
}

function filters(opts) {
  const where = [];
  const params = [];
  const { type, statuses, userId, categoryId, locationId, locationIds, publicSearch, since, until } = opts;
  if (type) { params.push(type); where.push(`cs.type = $${params.length}`); }
  if (statuses) where.push(inList('cs.status', statuses, params));
  if (userId) { params.push(Number(userId)); where.push(`cs.user_id = $${params.length}`); }
  if (categoryId) { params.push(Number(categoryId)); where.push(`cs.category_id = $${params.length}`); }
  if (locationId) { params.push(Number(locationId)); where.push(`cs.location_id = $${params.length}`); }
  if (locationIds) where.push(inList('cs.location_id', locationIds.map(Number), params));
  if (since) { params.push(since); where.push(`cs.created_at >= $${params.length}`); }
  if (until) { params.push(until); where.push(`cs.created_at <= $${params.length}`); }
  if (publicSearch && publicSearch.text) {
    params.push(String(publicSearch.text).toLowerCase());
    const needle = `$${params.length}`;
    const titleOk = inList('cs.category_id', (publicSearch.titleCategoryIds || []).map(Number), params);
    const catOk = inList('cs.category_id', (publicSearch.categoryIds || []).map(Number), params);
    const locOk = inList('cs.location_id', (publicSearch.locationIds || []).map(Number), params);
    where.push(`((${titleOk} AND strpos(lower(cs.title), ${needle}) > 0) OR ${catOk} OR ${locOk})`);
  }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function queryCases(opts = {}) {
  const { sort = 'newest', page = 1, pageSize = 20 } = opts;
  const { clause, params } = filters(opts);
  const total = Number((await one(`SELECT count(*)::int AS n FROM cases cs ${clause}`, params)).n);
  const p = Math.max(1, parseInt(page, 10) || 1);
  const size = Math.max(1, parseInt(pageSize, 10) || 20);
  const order = sort === 'oldest' ? 'cs.created_at ASC' : 'cs.created_at DESC';
  const rows = (await query(
    `${CASE_FROM} ${clause} ORDER BY ${order} LIMIT ${size} OFFSET ${(p - 1) * size}`,
    params
  )).map(toCase);
  return { rows, total, page: p, pageSize: size };
}

async function count(f = {}) {
  const { clause, params } = filters(f);
  return Number((await one(`SELECT count(*)::int AS n FROM cases cs ${clause}`, params)).n);
}

const all = async () => (await query(`${CASE_FROM} ORDER BY cs.id`)).map(toCase);

async function countByUserSince(userId, since) {
  return Number((await one(
    'SELECT count(*)::int AS n FROM cases WHERE user_id = $1 AND created_at >= $2',
    [Number(userId), since]
  )).n);
}

module.exports = {
  create, findById, findByRef, findByPhoto, update, addEvent,
  query: queryCases, count, all, countByUserSince
};
