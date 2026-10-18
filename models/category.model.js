'use strict';
const { query, one } = require('../db');
const { id } = require('../db/shape');

function toCategory(row) {
  if (!row) return null;
  return {
    id: id(row.id), name: row.name, nameBn: row.name_bn || '', description: row.description || '',
    icon: row.icon || 'box', sensitive: Boolean(row.sensitive), highValue: Boolean(row.high_value),
    requiresApproval: Boolean(row.requires_approval), active: Boolean(row.active)
  };
}

async function create(d) {
  const row = await one(
    `INSERT INTO categories (name, name_bn, description, icon, sensitive, high_value, requires_approval, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [d.name, d.nameBn || '', d.description || '', d.icon || 'box', !!d.sensitive, !!d.highValue, !!d.requiresApproval, d.active !== false]
  );
  return toCategory(row);
}

const get = async (n) => toCategory(await one('SELECT * FROM categories WHERE id = $1', [Number(n)]));

const COLUMNS = {
  name: 'name', nameBn: 'name_bn', description: 'description', icon: 'icon',
  sensitive: 'sensitive', highValue: 'high_value', requiresApproval: 'requires_approval', active: 'active'
};

async function update(n, patch) {
  const sets = [];
  const params = [];
  for (const [key, column] of Object.entries(COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    let value = patch[key];
    if (key === 'sensitive' || key === 'highValue' || key === 'requiresApproval' || key === 'active') value = !!value;
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  }
  if (!sets.length) return get(n);
  params.push(Number(n));
  return toCategory(await one(`UPDATE categories SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params));
}

const list = async ({ activeOnly = false } = {}) => (await query(
  `SELECT * FROM categories ${activeOnly ? 'WHERE active' : ''} ORDER BY name`
)).map(toCategory);

const findByName = async (name) => toCategory(await one(
  'SELECT * FROM categories WHERE lower(name) = lower($1)',
  [String(name).trim()]
));

module.exports = { create, get, update, list, findByName };
