# Database notes

## Where things stand

The application stores its data in PostgreSQL. `docs/schema.sql` is applied automatically the first time the server connects to an empty database (`db/index.js`). Every model in `models/` reads and writes that schema, and the pages keep the same shape of data they had before. Login sessions use the same database when `DATABASE_URL` is set.

`npm test` does not need a running server: it applies the same schema to PGlite. A dump you can restore on another PostgreSQL is `database/safefind.sql` (see README).

`tests/schema.test.js` runs `docs/schema.sql` on a real PostgreSQL engine (PGlite, PostgreSQL compiled to WebAssembly; PostgreSQL 18.3 when this was written) and checks each rule below by trying to break it. It needs no database server: `npm test` runs it.

## From the ERD to tables

| ERD entity | Table | Note |
|---|---|---|
| User | `users`, `auth_tokens`, `login_failures` | `password_hash` is NULL for an invited account that has not set a password. `auth_tokens` holds only hashes. |
| Case, Lost Item, Found Item | `cases` | One table. See below. |
| Category, Location | `categories`, `locations` | The flags `sensitive`, `high_value` and `requires_approval` drive the privacy and approval rules. |
| Match | `matches` | The score breakdown is JSONB. |
| Claim | `claims`, `claim_events` | |
| Handover | `handovers` | |
| Investigation | `investigations` | CCTV and other staff notes. |
| Notification | `notifications` | |
| Audit Log | `audit_logs` | Append-only. |
| (not in the ERD) | `case_events`, `case_counters`, `settings` | Case history, the yearly counter for case numbers, and the administrator's settings (one row). |

**Why Lost Item and Found Item are not separate tables.** They share almost every column, and the board, the queue and the matcher read both kinds together, so two tables would mean a join or a union in nearly every query. The columns that only make sense for a found item (shelf slot, finder, who recorded it) are checked: a lost report cannot carry them. If your supervisors want the ERD followed literally, split `cases` into `lost_items` and `found_items` keyed by the case id; nothing else in the schema has to change.

## What the database enforces

These are tested in `tests/schema.test.js`. Each one is a rule that, if only the application held it, a bug or a second code path could break.

- An active account has a password; e-mail addresses are lower case and unique; a university ID is unique when present.
- A lost report always has a reporter; a shelf slot, a finder and a recorder exist only on found items.
- A match always pairs a *lost* report with a *found* item, once; a claim is always against a *found* item, and the report a claimant links is always a *lost* one.
- A person has at most one live claim on an item, and **only one claim per item can ever be verified or completed**.
- An item has at most one live handover code, and a handover cannot be recorded as completed without who did it, when, and the ID check.
- Case numbers (`SF-2026-0001`) are unique, restart each year and leave no gaps, because the counter row changes in the same transaction as the case.
- Audit rows cannot be changed or deleted through the application's connection. A database administrator can still remove the trigger, so this protects against mistakes and casual edits, not against a determined insider.
- Settings: exactly one row, and the four matching weights add up to 100.

## What stays in the application

The database cannot see who is signed in, so these remain in the services: role-based access; nobody reviews, approves, confirms or verifies on their own case or claim; Security Cell and administrator accounts do not claim; the handover needs a Security Cell user other than the claimant; the QR token signature and expiry; password hashing; which columns the public board may select.

## Writing the PostgreSQL models

Keep each model's exported function names, so no service or controller changes. The files to rewrite are `models/*.model.js`; `models/collection.js` goes away. Failed-login counters are in `services/auth.service.js` and should move to `login_failures`. `services/seed.service.js` already goes through the models.

**The public board query** (tested; note that sensitive titles are never read, and `strpos` is used so that `%` and `_` in a search are plain characters):

```sql
SELECT cs.ref, cs.type, cs.status, cs.occurred_at,
       CASE WHEN cat.sensitive THEN cat.name ELSE cs.title END AS title,
       cat.name AS category, loc.building
FROM cases cs
JOIN categories cat ON cat.id = cs.category_id
JOIN locations  loc ON loc.id = cs.location_id
WHERE cs.status IN ('open', 'matched')
  AND ($1::text IS NULL OR (
        (NOT cat.sensitive AND strpos(lower(cs.title), lower($1)) > 0)
     OR strpos(lower(cat.name), lower($1)) > 0
     OR strpos(lower(loc.building), lower($1)) > 0))
ORDER BY cs.created_at DESC
LIMIT 12 OFFSET 0;
```

**Completing a handover** must be one conditional statement, so that two staff members scanning the same code cannot both succeed:

```sql
UPDATE handovers
SET status = 'completed', completed_at = now(), completed_by = $2, id_checked = true
WHERE id = $1 AND status = 'pending' AND expires_at > now()
RETURNING id;     -- no row back: the code was used, cancelled or has expired
```

## Transactions

The in-memory version does each of these as a series of separate steps. With PostgreSQL a crash halfway would leave a half-finished case, so each must run in one transaction:

1. Creating a report: the case, its first event, the notifications and the audit row.
2. Verifying a claim: the claim, the case or cases becoming ready for handover, the handover code, the notification and the audit row.
3. Completing a handover: the conditional update above, then the claim, both cases, the events, rejecting the other claimants, notifications and the audit row.
4. Confirming or rejecting a match, and accepting or rejecting a report.
5. Registering, confirming an e-mail address and using an invitation link (the token is consumed with the change it authorises).

`READ COMMITTED` (the default) is enough, because the unique indexes and the conditional update decide the races. To avoid changing every model signature, hold the current transaction in an `AsyncLocalStorage` store and let the model helpers use it when it is set.

Map the database errors to the application's existing messages: unique violation (`23505`) on `claims_one_live_per_person_and_item` is `ALREADY_CLAIMED`; on `claims_one_winner_per_item`, `ANOTHER_VERIFIED`; on `users_email_key`, `EMAIL_TAKEN`; on `users_university_id_key`, `ID_TAKEN`. Zero rows from the handover update is `QR_USED`.

## Operations

- **Back up the database and `UPLOAD_DIR` together.** Cases refer to photos by file name. With Cloudinary switched on the file name is unchanged and the image is stored as `<CLOUDINARY_FOLDER>/<name without extension>` with private delivery, so the schema does not change.
- **Never delete a user.** Cases, claims and audit rows refer to them; suspend the account instead. This is why the audit table's foreign key has no cascade.
- **`audit_logs` only grows.** Partition it by year when it becomes large.
- **Photos outlive their cases.** Closing or disposing of a case does not delete its photo, locally or in Cloudinary. If the privacy policy needs it, add a job that removes photos some time after closure.
- **Sessions** use the `session` table that `connect-pg-simple` creates; expired rows are pruned by the library.
- **Time zone.** Everything is `TIMESTAMPTZ`; the application shows Asia/Dhaka.

## Limits

- Case numbers have four digits, so 9,999 cases a year. Widen the format in `case_counters`/`next_case_ref()` and the `REF` pattern in `controllers/_helpers.js` together before that matters.
- Search uses `strpos` on lower-cased text, which is fine for thousands of reports. If the board grows much larger, add a `pg_trgm` index on `lower(title)`.
- The in-memory claim model has two fields, `lostAt` and `locationId`, that no service sets. They are left out of the schema.
