'use strict';
// `paginate` is what the list pages use. `createCollection` remains only so older notes
// in the docs still match a file in the tree; the models no longer call it.
function createCollection() {
  const rows = new Map();
  let seq = 0;
  const copy = (r) => (r ? structuredClone(r) : null);
  return {
    insert(data) {
      const row = { ...structuredClone(data), id: ++seq };
      rows.set(row.id, row);
      return copy(row);
    },
    get: (id) => copy(rows.get(Number(id))),
    update(id, patch) {
      const row = rows.get(Number(id));
      if (!row) return null;
      Object.assign(row, structuredClone(patch));
      return copy(row);
    },
    remove: (id) => rows.delete(Number(id)),
    filter: (pred) => [...rows.values()].filter(pred).map(copy),
    find: (pred) => copy([...rows.values()].find(pred)),
    count: (pred) => (pred ? [...rows.values()].filter(pred).length : rows.size),
    clear() { rows.clear(); seq = 0; }
  };
}

const paginate = (list, page = 1, pageSize = 15) => {
  const p = Math.max(1, parseInt(page, 10) || 1);
  return { rows: list.slice((p - 1) * pageSize, p * pageSize), total: list.length, page: p, pageSize };
};

module.exports = { createCollection, paginate };
