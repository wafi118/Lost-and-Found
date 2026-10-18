'use strict';
const { one } = require('../db');

function toSettings(row) {
  return {
    retentionDays: Number(row.retention_days),
    matchThreshold: Number(row.match_threshold),
    weights: {
      category: Number(row.weight_category),
      description: Number(row.weight_description),
      location: Number(row.weight_location),
      time: Number(row.weight_time)
    },
    handoverValidDays: Number(row.handover_valid_days)
  };
}

async function get() {
  const row = await one('SELECT * FROM settings WHERE id = 1');
  if (row) return toSettings(row);
  return toSettings(await one('INSERT INTO settings DEFAULT VALUES RETURNING *'));
}

async function set(patch) {
  const cur = await get();
  const next = {
    ...cur,
    ...patch,
    weights: { ...cur.weights, ...(patch.weights || {}) }
  };
  const row = await one(
    `UPDATE settings SET
       retention_days = $1, match_threshold = $2,
       weight_category = $3, weight_description = $4, weight_location = $5, weight_time = $6,
       handover_valid_days = $7
     WHERE id = 1 RETURNING *`,
    [
      next.retentionDays, next.matchThreshold,
      next.weights.category, next.weights.description, next.weights.location, next.weights.time,
      next.handoverValidDays
    ]
  );
  return toSettings(row);
}

module.exports = { get, set };
