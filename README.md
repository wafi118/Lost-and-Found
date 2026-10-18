# SafeFind BUP

Lost and found case management for Bangladesh University of Professionals (BUP).
A student project of the Department of ICT: Iftakharul Islam Riad, Ayesha Siddiki Mimi and Sabicunnaher Wafi (BICE 2024, Section B), supervised by Asst. Prof. Nazneen Akter and Asst. Prof. Suman Saha.

SafeFind replaces the paper process at the Security Cell with one case record that runs from the first report to the handover. The Security Cell and the authorized approver keep their authority. The system organises the work around them.

## Status

| Area | State |
|---|---|
| Accounts: university e-mail only, confirmed by a link; staff, approver and administrator by invitation | Works |
| Public board that anyone can read; reporting, claiming and tracking need an account | Works |
| Reports with photos; approval step for phones and laptops | Works |
| Report in three steps, drag-and-drop photo, live filters, toast messages, empty states, progress path | Works |
| Photos in Cloudinary (private) or the local folder | Works. The Cloudinary calls are tested against stand-ins; a real account has not been tried. |
| Live alerts: a message appears when a notification arrives | Works over WebSocket. If the connection is blocked, the bell and the notifications page still show everything. |
| Matching (category, description, place, time) with a score staff can read | Works |
| Claims, tiered ownership check, QR handover with an ID check | Works |
| Unclaimed items flagged after 90 days; staff decide | Works |
| Analytics (charts and a hotspot map), audit log, administrator settings | Works |
| Home page | Built in 1.3.1 from the owner's concept as drawn. The image in the hero is the concept's ticket diagram. |
| English and Bangla | Public, sign-in and member screens are translated. Staff and administrator screens fall back to English. |
| **Data storage** | **PostgreSQL.** `DATABASE_URL` is required. The server applies `docs/schema.sql` to an empty database on first start, then loads the demo data once. `database/safefind.sql` is a dump of that database you can restore somewhere else. Tests use the same schema on PGlite and do not need a server (`docs/DB_NOTES.md`). |
| E-mail | In development, messages are printed to the console and the link is shown on the page. In production an SMTP server is required. The SMTP path is tested against a fake server. |

How it was checked: 169 automated tests (`npm test`), and two browser passes in headless Chromium. The first covered 198 page loads for version 1.1 (desktop and 360 px, light and dark, English and Bangla, including a QR scan with a simulated camera). The second is `npm run browser-check` for versions 1.2 and 1.3: 40 checks of the uploader, the report steps, live filters, live alerts, toast messages, the home page (header, steps, keyboard, signed-in state), contrast and 360 px width, in both themes and both languages. **Not tested:** a real Cloudinary account, real phone cameras, Safari, Firefox, Windows, Node versions other than 22.

## Quick start

You need Node.js 20 or 22 (LTS).

```
npm install
copy .env.example .env      (macOS/Linux: cp .env.example .env)
```

Create an empty PostgreSQL database and set `DATABASE_URL` in `.env`. Two ways to fill it:

```
psql "$DATABASE_URL" -f database/safefind.sql
```

restores the ready demo database (schema, accounts and sample cases). Or leave the database empty and run `npm start`: the app applies `docs/schema.sql` and seeds the same demo data itself.

```
npm start
```

Open http://localhost:3000. `RUN_INSTRUCTIONS.txt` has a five-minute walkthrough for a demo. To make a fresh dump after you have changed data: `pg_dump --no-owner --no-acl --clean --if-exists "$DATABASE_URL" > database/safefind.sql`.

### Demo accounts (development only)

Created when `SEED_DEMO_DATA` is on, which is the default outside production.

| Role | E-mail | Password |
|---|---|---|
| Administrator | admin@safefind.example | Admin@12345 |
| Security Cell staff | security@safefind.example, security2@safefind.example | Security@12345 |
| Authorized approver | approver@safefind.example | Approver@12345 |
| Student | student@safefind.example, student2@safefind.example | Student@12345 |
| Staff member | staff@safefind.example | Staff@12345 |

Never run production with demo data on.

## Rules the system enforces

- **Who can have an account.** The e-mail must be on `ALLOWED_EMAIL_DOMAINS`, and the person must open the link sent to that mailbox. This proves control of a mailbox, not that someone is a current student. For stronger assurance, turn on `REQUIRE_ADMIN_APPROVAL` or import a registrar list (not built).
- **What the public sees.** Type, public title, category, building, date and status of open or matched reports. Never the description, the exact spot, photos, shelf, finder or owner. For identity and bank cards the title is replaced by the category name. Search works on those public fields only.
- **Nobody decides on their own case.** Staff cannot review, confirm a match for, or verify a claim they or their own report is part of. The approver cannot approve their own report.
- **Security Cell and administrator accounts do not claim items.** They can read the private details of found items, so a staff member who loses something uses a separate member account.
- **Matching suggests, staff decide.** A score never changes a case. Staff see the four factors; the owner sees only coarse reasons.
- **Handover.** Only Security Cell staff, only after they tick that they checked the person's ID. The code is signed, expires (7 days by default) and works once. The administrator can read the desk but not use it. Past handovers stay on **Handover history** (`/security/handover/history`).
- **All cases.** Security Cell staff and the administrator have **All cases** (`/security/records`), one list of every report in every status.
- **Accounts.** An administrator can edit a person's name, email, phone, role, student-or-staff type and language. The password and the ID number cannot be edited. **Delete** signs them out and frees the email and ID for a new account; their reports stay on record. The last active administrator cannot be deleted.
- **Notes and updates.** The person who reported a case can read Security Cell notes. Camera details stay with Security Cell. Either side can send an update and attach a photo. Removing a note, an update or a photo clears it and leaves a line in the case history.
- **Claims.** **Claims** in the personal menu lists the person's claims. A verified claim shows the QR code and the handover code there.
- **Unclaimed items.** After 90 days (a setting) an item is flagged. Staff choose donate, recycle or transfer. Nothing is removed automatically.

## Project layout

```
app.js            wires middleware and routes; start() seeds data and schedules the retention sweep
config/           environment, roles, statuses, navigation
routes/           one file per area (URL to controller)
controllers/      read the request, call a service, render or redirect
services/         business rules: auth, cases, matching, claims, handover, retention, analytics, mail, live alerts
models/           data access (in memory today, shaped like PostgreSQL queries)
middleware/       security headers, session, CSRF, locale, rate limits, uploads, error pages
validators/       form rules, one schema per form
utils/            small helpers: photo storage (images), progress path, formatting, i18n
views/            EJS templates by role (auth, member, security, approver, admin, items, partials)
public/           css/style.css (the design system), js/ (small enhancements: toasts, uploader, report steps, live filters, live alerts, home page), images/
locales/          en.json, bn.json
tests/            node:test suites
scripts/          smoke.js (walks every page as every role), collect-keys.js (used by the i18n test), browser-check.js (optional, needs Playwright)
docs/             PROJECT_MEMORY.md, CHANGELOG.md, DB_NOTES.md, schema.sql, SAFEFIND_MASTER_PROMPT.md
```

A suggested way to split the work, which you can change:

| Person | Area | Main files |
|---|---|---|
| 1 | Accounts and administration | `auth.*`, `admin.*`, `user.service`, `middleware/`, `views/auth`, `views/admin` |
| 2 | Reporting, approval, matching | `member.controller`, `items.controller`, `approver.controller`, `case.service`, `matching.service`, `retention.service`, `views/member`, `views/items`, `views/approver` |
| 3 | Claims, handover, look and feel | `claim.*`, `security.*`, `handover.service`, `views/security`, `public/css`, `public/js` |

## Project record

`docs/PROJECT_MEMORY.md` is the memory of the project: what it is, how the owner wants the work done, the current state, the decisions and their reasons, the open items and the history of every version. Every change updates it and `docs/CHANGELOG.md` and ships with it, so another assistant or team member can pick the work up without being told the story again. `npm test` fails when the version, the record and the changelog disagree.

## Registration with an ID card

People who have no university e-mail address use the second tab on the registration page: any e-mail address (for example Gmail), the usual details and a photo of their BUP ID card. They confirm the address from an e-mailed link, then an administrator compares the card with what they typed under **ID checks** (`/admin/id-reviews`) and approves or rejects it. After approval the person signs in with the address they gave. Only administrators can see the photo, every viewing is audited, and the photo is deleted 30 days after the decision. Settings: `ALLOW_ID_CARD_REGISTRATION`, `ID_CARD_MAX_ATTEMPTS`, `ID_CARD_KEEP_DAYS`. To try it in development: register, open the confirmation link shown on the "check your email" page, then sign in as the demo administrator and open ID checks.

## Configuration

Every setting is in `.env.example` with a comment. In production you must set `SESSION_SECRET` (24+ random characters), `QR_SECRET`, `BASE_URL`, an SMTP server, and the first administrator (`ADMIN_EMAIL`, `ADMIN_PASSWORD`). The app refuses to start in production with a weak session secret.

Photos are stored in Cloudinary when `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` (or `CLOUDINARY_URL`) are set, and in `UPLOAD_DIR` otherwise. Live alerts are on by default; `REALTIME=false` switches them off.

## Tests

```
npm test          the automated suites
npm run smoke     open every page as every role and report anything unexpected
npm run browser-check   real-browser check of the 1.2 and 1.3 additions (optional, see below)
```

`npm run browser-check` needs a browser, and Playwright is not a dependency of the project. Install it once with `npm install --no-save playwright` and `npx playwright install chromium`. Add `SHOTS=./shots` to also save screenshots of the main states.

The suites cover accounts and sessions, CSRF and the CSP, role-based access for every route, the public-privacy rules (including a test that searches for every private-only word in the demo data), the full lifecycle from report to closed case with a decoded QR image, the guards against acting on your own case, rate limits, matching, retention, that pages load the scripts and files they reference, that `docs/schema.sql` enforces its rules on a real PostgreSQL engine (PGlite), and that mail goes out through SMTP while demo addresses never do.

## Deployment notes

- **HTTPS is required for the camera.** Browsers allow camera access only on HTTPS or `localhost`. On plain `http://` over a LAN address the scan button fails; staff can type the 8-character code instead.
- **Behind a proxy**, set `TRUST_PROXY=1` and keep `COOKIE_SECURE` on, so rate limits see the real visitor address.
- **Campus NAT.** If all students reach the server through one public address, they share one rate-limit allowance. Raise `RATE_LIMIT_GLOBAL` and `RATE_LIMIT_LOGIN_FAILURES` or pass real addresses through the proxy.
- **Uploads** are private files in `UPLOAD_DIR`, or private images in Cloudinary when it is configured. Back up the local folder with the database. Photos keep their metadata (such as GPS position); strip it on upload if that matters.
- **Cloudinary.** A photo view makes one download request to Cloudinary, so check the quota of your plan. If Cloudinary cannot be reached, the photo answers 404 and the reason is in the log; a new upload is refused with a message rather than saved locally, because a local copy on a host with a temporary disk would be lost. Photos saved locally before you switched on Cloudinary keep working.
- **Live alerts** need WebSocket connections. Behind nginx, pass `Upgrade` and `Connection` for `/socket.io/` (`proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`). Run one server process: a second process would not know the first one's connections, and sharing them needs the Socket.io Redis adapter, which is not built.
- **The map** loads tiles from OpenStreetMap, so it needs internet access and is meant for light use.
- **Failed-login counters** are in memory. They reset on restart and are not shared between several server processes.

## Decisions the team needs to confirm

1. The exact e-mail domains for students and staff, and the real ID formats (`ALLOWED_EMAIL_DOMAINS`, `STUDENT_ID_PATTERN`, `STAFF_ID_PATTERN`). The defaults are placeholders.
2. Whether accounts should wait for administrator approval, or be checked against a roster.
3. The Security Cell's real contact details and the real list of buildings and places. The seed list is generic.
4. A second approver. The approver cannot approve their own report, so a lone approver who loses a phone cannot clear it.
5. Whether the administrator should read claim details. Today the role has read-only access to them.
6. Whether the 90-day retention clock should start when the Security Cell receives an item rather than when it is reported.
7. Whether photos of identity documents may be kept outside the university's own server. Cloudinary stores them on its servers, in a region you do not choose by default. The local folder avoids the question.
8. Whether the photos of closed cases should be deleted after some time. Today they are kept, locally and in Cloudinary.
9. Whether the public board should also filter by status. It was left out on purpose (see `docs/CHANGELOG.md`).

## Troubleshooting

- `npm install` fails on `bcrypt`: install the build tools for your platform, or replace `bcrypt` with `bcryptjs` (same API, one import).
- Port already in use: set `PORT` in `.env`.
- Photos stop showing after you switch on Cloudinary: look for `[images] Cloudinary answered 401` in the log. It means the cloud name, key or secret is wrong. Uploads then fail with "The photo could not be stored".
- No live messages appear: the browser console will show a blocked WebSocket. Fix the proxy, or set `REALTIME=false`. Notifications are still stored.
- Demo accounts missing: `SEED_DEMO_DATA` is off, or `NODE_ENV=production`.
- The registration page rejects `@safefind.example`: the demo addresses are created directly. Register with an address on `ALLOWED_EMAIL_DOMAINS`.
