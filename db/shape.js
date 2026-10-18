'use strict';
// Rows come back from PostgreSQL (or PGlite) with snake_case columns and, sometimes, strings
// where the rest of the app expects a Date or a number. These helpers keep that conversion
// in one place so every model returns the same shape the in-memory models used to.

const id = (v) => (v == null || v === '' ? null : Number(v));

const dt = (v) => {
  if (v == null) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

function json(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return fallback; }
  }
  return v;
}

function eventsOf(raw) {
  return json(raw, []).map((e) => ({
    at: dt(e.at),
    key: e.key,
    params: json(e.params, {}) || {},
    staffOnly: Boolean(e.staffOnly)
  }));
}

// `column IN ($1, $2, ...)`. An empty list is FALSE, which matches "this filter matches nothing".
function inList(column, values, params) {
  if (!values || !values.length) return 'FALSE';
  const holders = values.map((v) => {
    params.push(v);
    return `$${params.length}`;
  });
  return `${column} IN (${holders.join(', ')})`;
}

module.exports = { id, dt, json, eventsOf, inList };
