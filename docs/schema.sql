-- SafeFind BUP: PostgreSQL schema.
--
-- Derived from the application models and the ERD in the project proposal.
-- The app applies this file itself the first time it connects to an empty database.
-- To load it by hand:   psql "$DATABASE_URL" -f docs/schema.sql
-- Times are TIMESTAMPTZ (UTC in the database, shown in Asia/Dhaka by the application).
-- The login session table is created by connect-pg-simple when DATABASE_URL is set.

BEGIN;

-- ================================================================== people
CREATE TABLE users (
  id                  BIGSERIAL   PRIMARY KEY,
  name                TEXT        NOT NULL CHECK (btrim(name) <> ''),
  email               TEXT        NOT NULL CHECK (email = lower(email) AND position('@' IN email) > 1),
  password_hash       TEXT,       -- bcrypt. NULL for an invited account that has not chosen a password yet.
  role                TEXT        NOT NULL CHECK (role IN ('member', 'security', 'approver', 'admin')),
  affiliation         TEXT        CHECK (affiliation IN ('student', 'staff')),
  university_id       TEXT,
  phone               TEXT,
  status              TEXT        NOT NULL CHECK (status IN ('pending', 'active', 'suspended')),
  email_verified      BOOLEAN     NOT NULL DEFAULT FALSE,
  -- How the person proved they belong to BUP: a university e-mail address, or an ID card photo checked by an
  -- administrator (AUTH-8). An 'id_card' account becomes active only through an approved identity_proofs row.
  verification_method TEXT        NOT NULL DEFAULT 'university_email' CHECK (verification_method IN ('university_email', 'id_card')),
  lang                TEXT        NOT NULL DEFAULT 'en' CHECK (lang IN ('en', 'bn')),
  password_changed_at TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at       TIMESTAMPTZ,
  -- Set when an administrator deletes the account. The row stays so cases, claims and the audit
  -- log keep their link. The e-mail and university ID are cleared, so both can be registered again.
  deleted_at          TIMESTAMPTZ,
  CONSTRAINT users_active_has_password CHECK (status <> 'active' OR password_hash IS NOT NULL)
);
CREATE UNIQUE INDEX users_email_key ON users (email);
CREATE UNIQUE INDEX users_university_id_key ON users (university_id) WHERE university_id IS NOT NULL;
CREATE INDEX users_role_status_idx ON users (role, status);

-- Reset, e-mail confirmation and invitation links. Only a hash is stored.
CREATE TABLE auth_tokens (
  id         BIGSERIAL   PRIMARY KEY,
  token_hash TEXT        NOT NULL UNIQUE,
  user_id    BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose    TEXT        NOT NULL CHECK (purpose IN ('verify', 'reset', 'invite', 'resubmit')),
  expires_at TIMESTAMPTZ NOT NULL
);
-- A new link replaces the earlier one for the same purpose.
CREATE UNIQUE INDEX auth_tokens_one_per_purpose ON auth_tokens (user_id, purpose);

-- ID card photos of people who register without a university e-mail address (AUTH-8 to AUTH-12). One row per
-- photo: a person who is rejected and sends a new photo gets a new row, so the decisions stay on record.
-- `file` is set to NULL when the image is deleted, `purge_after` days after the decision.
CREATE TABLE identity_proofs (
  id            BIGSERIAL   PRIMARY KEY,
  user_id       BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  file          TEXT        CHECK (file IS NULL OR file ~ '^[a-f0-9]{32}\.(jpg|png|webp)$'),
  status        TEXT        NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected')),
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by   BIGINT      REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  reject_code   TEXT        CHECK (reject_code IN ('unreadable', 'name_mismatch', 'id_mismatch', 'not_bup_card', 'other')),
  reject_note   TEXT        NOT NULL DEFAULT '' CHECK (length(reject_note) <= 200),
  final         BOOLEAN     NOT NULL DEFAULT FALSE,  -- rejected for good: no new photo, the university ID was released
  purge_after   TIMESTAMPTZ,
  purged_at     TIMESTAMPTZ,
  CONSTRAINT identity_proofs_decision_complete CHECK (
    (status = 'submitted' AND reviewed_at IS NULL AND reject_code IS NULL AND NOT final)
    OR (status = 'approved' AND reviewed_at IS NOT NULL AND reject_code IS NULL AND NOT final)
    OR (status = 'rejected' AND reviewed_at IS NOT NULL AND reject_code IS NOT NULL)
  ),
  CONSTRAINT identity_proofs_other_has_note CHECK (reject_code IS DISTINCT FROM 'other' OR btrim(reject_note) <> ''),
  CONSTRAINT identity_proofs_file_or_purged CHECK (file IS NOT NULL OR purged_at IS NOT NULL)
);
-- A person has at most one photo waiting for a decision.
CREATE UNIQUE INDEX identity_proofs_one_open ON identity_proofs (user_id) WHERE status = 'submitted';
-- The administrator's list: oldest waiting first.
CREATE INDEX identity_proofs_queue_idx ON identity_proofs (status, submitted_at);
-- The clean-up job: photos that are still stored and whose time has passed.
CREATE INDEX identity_proofs_purge_idx ON identity_proofs (purge_after) WHERE file IS NOT NULL;

-- Needed once more than one server process runs. The current code keeps these counters in memory,
-- so they reset on restart and are not shared between processes.
CREATE TABLE login_failures (
  email        TEXT        PRIMARY KEY,
  failures     SMALLINT    NOT NULL,
  first_at     TIMESTAMPTZ NOT NULL,
  locked_until TIMESTAMPTZ
);

-- ================================================================== reference data
CREATE TABLE categories (
  id                BIGSERIAL PRIMARY KEY,
  name              TEXT      NOT NULL UNIQUE,
  name_bn           TEXT      NOT NULL DEFAULT '',
  description       TEXT      NOT NULL DEFAULT '',
  icon              TEXT      NOT NULL DEFAULT 'box',
  sensitive         BOOLEAN   NOT NULL DEFAULT FALSE,  -- public title is replaced by the category name
  high_value        BOOLEAN   NOT NULL DEFAULT FALSE,  -- a claim needs photo or document proof (tier 2)
  requires_approval BOOLEAN   NOT NULL DEFAULT FALSE,  -- a lost report goes to the authorized approver first
  active            BOOLEAN   NOT NULL DEFAULT TRUE
);

CREATE TABLE locations (
  id          BIGSERIAL        PRIMARY KEY,
  building    TEXT             NOT NULL,
  building_bn TEXT             NOT NULL DEFAULT '',
  name        TEXT             NOT NULL,
  name_bn     TEXT             NOT NULL DEFAULT '',
  lat         DOUBLE PRECISION CHECK (lat BETWEEN -90 AND 90),
  lng         DOUBLE PRECISION CHECK (lng BETWEEN -180 AND 180),
  active      BOOLEAN          NOT NULL DEFAULT TRUE,
  UNIQUE (building, name),
  CHECK ((lat IS NULL) = (lng IS NULL))
);

-- ================================================================== cases
-- Case numbers look like SF-2026-0001 and restart each year. The counter row is locked until the
-- surrounding transaction ends, so two reports can never get the same number, and a rolled-back
-- report leaves no gap. The format allows 9,999 cases a year; widen it (and the REF pattern in
-- controllers/_helpers.js) before that matters.
CREATE TABLE case_counters (
  year        INT PRIMARY KEY,
  last_number INT NOT NULL
);

CREATE FUNCTION next_case_ref() RETURNS TEXT LANGUAGE sql AS $$
  INSERT INTO case_counters (year, last_number)
  VALUES (EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Dhaka'))::int, 1)
  ON CONFLICT (year) DO UPDATE SET last_number = case_counters.last_number + 1
  RETURNING 'SF-' || year || '-' || repeat('0', greatest(0, 4 - length(last_number::text))) || last_number;
$$;

-- One table for lost and found reports (the ERD's CASE with LOST ITEM and FOUND ITEM). Columns that
-- only make sense for a found item are NULL on a lost one, and the checks below enforce that.
CREATE TABLE cases (
  id                   BIGSERIAL   PRIMARY KEY,
  ref                  TEXT        NOT NULL UNIQUE DEFAULT next_case_ref() CHECK (ref ~ '^SF-[0-9]{4}-[0-9]{4}$'),
  type                 TEXT        NOT NULL CHECK (type IN ('lost', 'found')),
  user_id              BIGINT      REFERENCES users (id),   -- the reporter; NULL for an item handed in at the desk by someone without an account
  category_id          BIGINT      NOT NULL REFERENCES categories (id),
  location_id          BIGINT      NOT NULL REFERENCES locations (id),
  location_detail      TEXT        NOT NULL DEFAULT '',      -- private
  title                TEXT        NOT NULL CHECK (btrim(title) <> '' AND length(title) <= 80),
  description          TEXT        NOT NULL CHECK (length(description) <= 1000),  -- private
  occurred_at          TIMESTAMPTZ NOT NULL,
  photo                TEXT,                                 -- file name in UPLOAD_DIR; private
  photo_mime           TEXT,
  status               TEXT        NOT NULL CHECK (status IN ('pending_approval', 'rejected', 'under_review', 'open', 'matched',
                                                              'claim_pending', 'ready_for_handover', 'closed', 'disposed')),
  approval_required    BOOLEAN     NOT NULL DEFAULT FALSE,
  approval_by          BIGINT      REFERENCES users (id),
  approval_at          TIMESTAMPTZ,
  approval_decision    TEXT        CHECK (approval_decision IN ('approved', 'rejected')),
  approval_remarks     TEXT,
  review_by            BIGINT      REFERENCES users (id),
  review_at            TIMESTAMPTZ,
  review_decision      TEXT        CHECK (review_decision IN ('accepted', 'rejected')),
  review_note          TEXT,
  finder_name          TEXT,       -- found items recorded at the desk
  finder_contact       TEXT,
  finder_university_id TEXT,
  recorded_by          BIGINT      REFERENCES users (id),
  storage_slot         TEXT,       -- shelf or box; staff only
  retention_flagged_at TIMESTAMPTZ,
  retention_reset_at   TIMESTAMPTZ,
  disposal_method      TEXT        CHECK (disposal_method IN ('donate', 'recycle', 'transfer')),
  disposal_note        TEXT,
  disposal_by          BIGINT      REFERENCES users (id),
  disposal_at          TIMESTAMPTZ,
  close_reason         TEXT        CHECK (close_reason IN ('withdrawn', 'recovered', 'returned', 'disposed')),
  closed_at            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, type),   -- lets matches and claims insist on the right kind of case
  CONSTRAINT cases_lost_has_reporter  CHECK (type = 'found' OR user_id IS NOT NULL),
  CONSTRAINT cases_slot_only_found    CHECK (type = 'found' OR storage_slot IS NULL),
  CONSTRAINT cases_finder_only_found  CHECK (type = 'found' OR (finder_name IS NULL AND recorded_by IS NULL))
);
CREATE INDEX cases_status_type_idx ON cases (status, type);
CREATE INDEX cases_public_board_idx ON cases (created_at DESC) WHERE status IN ('open', 'matched');
CREATE INDEX cases_user_idx ON cases (user_id);
CREATE INDEX cases_category_idx ON cases (category_id);
CREATE INDEX cases_location_idx ON cases (location_id);
-- The retention sweep looks for held found items whose clock has run out.
CREATE INDEX cases_retention_idx ON cases ((COALESCE(retention_reset_at, created_at)))
  WHERE type = 'found' AND status IN ('open', 'matched') AND retention_flagged_at IS NULL;

CREATE TABLE case_events (
  id         BIGSERIAL   PRIMARY KEY,
  case_id    BIGINT      NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  key        TEXT        NOT NULL,                 -- a locale key such as ev_received
  params     JSONB       NOT NULL DEFAULT '{}',
  staff_only BOOLEAN     NOT NULL DEFAULT FALSE
);
CREATE INDEX case_events_case_idx ON case_events (case_id, at);

-- CCTV review notes and other investigation notes. The reporter can read the findings.
-- Camera name and time window are withheld from them in the service, not in this table.
CREATE TABLE investigations (
  id          BIGSERIAL   PRIMARY KEY,
  case_id     BIGINT      NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
  user_id     BIGINT      NOT NULL REFERENCES users (id),
  kind        TEXT        NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'cctv')),
  camera      TEXT        NOT NULL DEFAULT '',
  window_from TIMESTAMPTZ,
  window_to   TIMESTAMPTZ,
  findings    TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
CREATE INDEX investigations_case_idx ON investigations (case_id);

-- Messages between the Security Cell and the person who reported the case. An image can be removed
-- later; the row stays so the timeline can say that it was removed.
CREATE TABLE case_updates (
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
);
CREATE INDEX case_updates_case_idx ON case_updates (case_id, created_at);

-- ================================================================== matching
-- A suggestion pairs a lost report with a found report. lost_type and found_type are constant columns
-- that exist so the foreign keys can insist the right kind of case is on each side.
CREATE TABLE matches (
  id             BIGSERIAL   PRIMARY KEY,
  lost_case_id   BIGINT      NOT NULL,
  lost_type      TEXT        NOT NULL DEFAULT 'lost'  CHECK (lost_type = 'lost'),
  found_case_id  BIGINT      NOT NULL,
  found_type     TEXT        NOT NULL DEFAULT 'found' CHECK (found_type = 'found'),
  score          SMALLINT    NOT NULL CHECK (score BETWEEN 0 AND 100),
  breakdown      JSONB       NOT NULL,                -- per factor: score, weight, points
  reasons        JSONB       NOT NULL DEFAULT '[]',   -- what staff see
  public_reasons JSONB       NOT NULL DEFAULT '[]',   -- coarse reasons the owner sees
  status         TEXT        NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'confirmed', 'rejected')),
  reviewed_by    BIGINT      REFERENCES users (id),
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (lost_case_id, lost_type)   REFERENCES cases (id, type) ON DELETE CASCADE,
  FOREIGN KEY (found_case_id, found_type) REFERENCES cases (id, type) ON DELETE CASCADE,
  UNIQUE (lost_case_id, found_case_id)
);
CREATE INDEX matches_found_idx ON matches (found_case_id);
CREATE INDEX matches_suggested_idx ON matches (created_at) WHERE status = 'suggested';

-- ================================================================== claims and handover
CREATE TABLE claims (
  id                   BIGSERIAL   PRIMARY KEY,
  found_case_id        BIGINT      NOT NULL,
  found_type           TEXT        NOT NULL DEFAULT 'found' CHECK (found_type = 'found'),
  lost_case_id         BIGINT,                         -- the claimant's own lost report, if they link one
  lost_type            TEXT        DEFAULT 'lost' CHECK (lost_type = 'lost'),
  user_id              BIGINT      NOT NULL REFERENCES users (id),
  statement            TEXT        NOT NULL,
  status               TEXT        NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'proof_requested', 'verified', 'rejected', 'completed')),
  proof_file           TEXT,                           -- tier 2 photo or document; private
  proof_mime           TEXT,
  proof_at             TIMESTAMPTZ,
  proof_note           TEXT        NOT NULL DEFAULT '',
  proof_requested_note TEXT        NOT NULL DEFAULT '',
  decided_by           BIGINT      REFERENCES users (id),  -- who verified or rejected; the claimant when withdrawn
  decided_at           TIMESTAMPTZ,
  decision_tier        SMALLINT    CHECK (decision_tier IN (1, 2)),
  decision_note        TEXT        NOT NULL DEFAULT '',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (found_case_id, found_type) REFERENCES cases (id, type),
  FOREIGN KEY (lost_case_id, lost_type)   REFERENCES cases (id, type)
);
-- One live claim per person and item.
CREATE UNIQUE INDEX claims_one_live_per_person_and_item ON claims (found_case_id, user_id)
  WHERE status IN ('submitted', 'proof_requested', 'verified');
-- Only one claimant can ever be verified for an item.
CREATE UNIQUE INDEX claims_one_winner_per_item ON claims (found_case_id)
  WHERE status IN ('verified', 'completed');
CREATE INDEX claims_user_idx ON claims (user_id);
CREATE INDEX claims_status_idx ON claims (status);

CREATE TABLE claim_events (
  id         BIGSERIAL   PRIMARY KEY,
  claim_id   BIGINT      NOT NULL REFERENCES claims (id) ON DELETE CASCADE,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  key        TEXT        NOT NULL,
  params     JSONB       NOT NULL DEFAULT '{}',
  staff_only BOOLEAN     NOT NULL DEFAULT FALSE
);
CREATE INDEX claim_events_claim_idx ON claim_events (claim_id, at);

CREATE TABLE handovers (
  id           BIGSERIAL   PRIMARY KEY,
  claim_id     BIGINT      NOT NULL REFERENCES claims (id),
  case_id      BIGINT      NOT NULL REFERENCES cases (id),
  nonce        TEXT        NOT NULL,                   -- part of the signed QR token; replaced when a new code is issued
  expires_at   TIMESTAMPTZ NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  completed_at TIMESTAMPTZ,
  completed_by BIGINT      REFERENCES users (id),
  id_checked   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A handover cannot be recorded as done without who did it, when, and the ID check.
  CONSTRAINT handovers_completed_needs_id_check
    CHECK (status <> 'completed' OR (completed_at IS NOT NULL AND completed_by IS NOT NULL AND id_checked))
);
-- One live code per claim; cancelled ones stay as history.
CREATE UNIQUE INDEX handovers_one_live_per_claim ON handovers (claim_id) WHERE status <> 'cancelled';
CREATE INDEX handovers_pending_idx ON handovers (expires_at) WHERE status = 'pending';

-- ================================================================== notifications, audit, settings
CREATE TABLE notifications (
  id         BIGSERIAL   PRIMARY KEY,
  user_id    BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key        TEXT        NOT NULL,
  params     JSONB       NOT NULL DEFAULT '{}',
  link       TEXT,
  is_read    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE NOT is_read;

CREATE TABLE audit_logs (
  id      BIGSERIAL   PRIMARY KEY,
  user_id BIGINT      REFERENCES users (id),
  actor   TEXT        NOT NULL DEFAULT 'system',  -- e-mail or name at the time of the action
  role    TEXT,
  action  TEXT        NOT NULL,                   -- for example claim.verified, handover.completed
  entity  TEXT        NOT NULL DEFAULT '',
  detail  TEXT        NOT NULL DEFAULT '',
  ip      TEXT        NOT NULL DEFAULT '',
  at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_at_idx ON audit_logs (at DESC);
CREATE INDEX audit_logs_action_idx ON audit_logs (action);
CREATE INDEX audit_logs_user_idx ON audit_logs (user_id);

-- Rows can be added but not changed or removed through the application's connection. A database
-- administrator can still drop the trigger, so this stops mistakes and casual edits, not a determined insider.
CREATE FUNCTION audit_logs_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$;
CREATE TRIGGER audit_logs_no_change BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();

-- Exactly one row of settings the administrator can change.
CREATE TABLE settings (
  id                  SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  retention_days      SMALLINT NOT NULL DEFAULT 90 CHECK (retention_days BETWEEN 7 AND 730),
  match_threshold     SMALLINT NOT NULL DEFAULT 40 CHECK (match_threshold BETWEEN 10 AND 90),
  weight_category     SMALLINT NOT NULL DEFAULT 30 CHECK (weight_category BETWEEN 0 AND 100),
  weight_description  SMALLINT NOT NULL DEFAULT 35 CHECK (weight_description BETWEEN 0 AND 100),
  weight_location     SMALLINT NOT NULL DEFAULT 20 CHECK (weight_location BETWEEN 0 AND 100),
  weight_time         SMALLINT NOT NULL DEFAULT 15 CHECK (weight_time BETWEEN 0 AND 100),
  handover_valid_days SMALLINT NOT NULL DEFAULT 7 CHECK (handover_valid_days BETWEEN 1 AND 30),
  CONSTRAINT settings_weights_sum_100 CHECK (weight_category + weight_description + weight_location + weight_time = 100)
);
INSERT INTO settings DEFAULT VALUES;

-- Suggested for deployment: connect the application as a role that cannot rewrite history.
--   CREATE ROLE safefind_app LOGIN PASSWORD '...';
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO safefind_app;
--   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO safefind_app;
--   REVOKE UPDATE, DELETE ON audit_logs FROM safefind_app;

COMMIT;
