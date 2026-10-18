'use strict';
// One connection for the whole process.
// Tests use PGlite (PostgreSQL compiled to WebAssembly) so `npm test` needs no server.
// Everywhere else the app talks to the PostgreSQL named by DATABASE_URL. The same schema
// file is applied to both, which is the database you can dump and restore on another server.
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');

require('dotenv').config();

const als = new AsyncLocalStorage();
const schemaPath = path.join(__dirname, '..', 'docs', 'schema.sql');

let backend = null;
let starting = null;

function runningUnderTest() {
  return process.env.NODE_ENV === 'test'
    || process.execArgv.includes('--test')
    || process.argv.includes('--test');
}

function mapError(err) {
  const msg = `${err && err.code ? err.code : ''} ${err && err.constraint ? err.constraint : ''} ${err && err.message ? err.message : ''}`;
  if (err && (err.code === '23505' || /duplicate key value/i.test(msg))) {
    const { ServiceError } = require('../services/errors');
    if (/claims_one_live/.test(msg)) return new ServiceError('ALREADY_CLAIMED');
    if (/claims_one_winner/.test(msg)) return new ServiceError('ANOTHER_VERIFIED');
    if (/users_email/.test(msg)) return new ServiceError('EMAIL_TAKEN');
    if (/users_university_id/.test(msg)) return new ServiceError('ID_TAKEN');
  }
  return err;
}

// Columns added after a database was first created. Safe to run every start.
async function ensureColumns() {
  await backend.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ');
  await backend.query('ALTER TABLE investigations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ');
  await backend.query(`CREATE TABLE IF NOT EXISTS case_updates (
    id               BIGSERIAL   PRIMARY KEY,
    case_id          BIGINT      NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
    user_id          BIGINT      NOT NULL REFERENCES users (id),
    body             TEXT        NOT NULL DEFAULT '' CHECK (length(body) <= 1500),
    image            TEXT,
    image_mime       TEXT,
    had_image        BOOLEAN     NOT NULL DEFAULT FALSE,
    image_deleted_at TIMESTAMPTZ,
    deleted_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (btrim(body) <> '' OR image IS NOT NULL OR deleted_at IS NOT NULL OR image_deleted_at IS NOT NULL)
  )`);
  await backend.query('CREATE INDEX IF NOT EXISTS case_updates_case_idx ON case_updates (case_id, created_at)');
}

async function setupPglite() {
  const { PGlite } = require('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(fs.readFileSync(schemaPath, 'utf8'));
  backend = {
    kind: 'pglite',
    pool: null,
    async query(text, params = []) {
      const res = await db.query(text, params);
      return res.rows;
    },
    async tx(fn) {
      if (als.getStore()) return fn();
      await db.exec('BEGIN');
      try {
        const out = await als.run(db, fn);
        await db.exec('COMMIT');
        return out;
      } catch (err) {
        await db.exec('ROLLBACK');
        throw err;
      }
    }
  };
  await ensureColumns();
}

async function setupPostgres() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and point it at your PostgreSQL database. Tests do not need one.');
  }
  const { Pool, types } = require('pg');
  // node-pg returns BIGINT as a string. Ids are compared with === throughout the app, so they stay numbers.
  types.setTypeParser(20, (v) => (v == null ? null : Number(v)));
  const pool = new Pool({ connectionString: url });
  const found = await pool.query("SELECT to_regclass('public.users') AS name");
  if (!found.rows[0].name) {
    await pool.query(fs.readFileSync(schemaPath, 'utf8'));
  }
  backend = {
    kind: 'postgresql',
    pool,
    async query(text, params = []) {
      const client = als.getStore();
      const res = await (client && client.query ? client : pool).query(text, params);
      return res.rows;
    },
    async tx(fn) {
      const current = als.getStore();
      if (current && current.query) return fn();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await als.run(client, fn);
        await client.query('COMMIT');
        return out;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
  };
  await ensureColumns();
}

async function init() {
  if (backend) return backend;
  if (!starting) {
    starting = (runningUnderTest() ? setupPglite() : setupPostgres()).catch((err) => {
      starting = null;
      throw err;
    });
  }
  await starting;
  return backend;
}

async function query(text, params) {
  await init();
  try {
    return await backend.query(text, params);
  } catch (err) {
    throw mapError(err);
  }
}

async function one(text, params) {
  const rows = await query(text, params);
  return rows[0] || null;
}

async function tx(fn) {
  await init();
  return backend.tx(fn);
}

const kind = () => (backend ? backend.kind : null);
const pool = () => (backend ? backend.pool : null);

module.exports = { init, query, one, tx, kind, pool };
