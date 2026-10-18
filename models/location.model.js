'use strict';
const { query, one } = require('../db');
const { id } = require('../db/shape');

function toLocation(row) {
  if (!row) return null;
  return {
    id: id(row.id), building: row.building, buildingBn: row.building_bn || '',
    name: row.name, nameBn: row.name_bn || '',
    lat: row.lat == null ? null : Number(row.lat), lng: row.lng == null ? null : Number(row.lng),
    active: Boolean(row.active)
  };
}

async function create(d) {
  const row = await one(
    `INSERT INTO locations (building, building_bn, name, name_bn, lat, lng, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [d.building, d.buildingBn || '', d.name, d.nameBn || '', d.lat ?? null, d.lng ?? null, d.active !== false]
  );
  return toLocation(row);
}

const get = async (n) => toLocation(await one('SELECT * FROM locations WHERE id = $1', [Number(n)]));

const COLUMNS = {
  building: 'building', buildingBn: 'building_bn', name: 'name', nameBn: 'name_bn',
  lat: 'lat', lng: 'lng', active: 'active'
};

async function update(n, patch) {
  const sets = [];
  const params = [];
  for (const [key, column] of Object.entries(COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    let value = patch[key];
    if (key === 'active') value = !!value;
    if ((key === 'lat' || key === 'lng') && value !== null && value !== undefined && value !== '') value = Number(value);
    if ((key === 'lat' || key === 'lng') && (value === '' || value === undefined)) value = null;
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  }
  if (!sets.length) return get(n);
  params.push(Number(n));
  return toLocation(await one(`UPDATE locations SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params));
}

const list = async ({ activeOnly = false } = {}) => (await query(
  `SELECT * FROM locations ${activeOnly ? 'WHERE active' : ''} ORDER BY building, name`
)).map(toLocation);

module.exports = { create, get, update, list };
