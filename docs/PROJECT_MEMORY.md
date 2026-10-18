# SafeFind project memory

App version: 1.7.1
Last updated: 2026-10-18

This file is the memory of the SafeFind project. It says what the project is, how the owner wants the work done, what state the code is in, which decisions were made and why, what is still open, and what changed in each version. If the assistant, the Claude account or the chat is lost, give this file and the latest project zip to a new assistant or a new team member, and the work continues from where it stopped, without explaining the project again.

It lives in the repository as `docs/PROJECT_MEMORY.md`. Every update to the project updates this file and ships with it (section 2).

Keep three things together, outside any chat: the latest project zip, this file, and the four original documents listed in section 4.

## 1. Start here

To continue with a new assistant, send this as the first message and attach this file and the latest project zip:

~~~text
You are taking over the SafeFind project (a lost and found case management system for Bangladesh University of Professionals) from a previous assistant.
1. Read the attached PROJECT_MEMORY.md completely. Then read docs/SAFEFIND_MASTER_PROMPT.md, docs/CHANGELOG.md and README.md inside the zip.
2. Work the way section 3 of PROJECT_MEMORY.md describes.
3. Unzip, run `npm install` and `npm test`, and tell me the result before you change anything.
4. Tell me in ten lines or fewer what you understood: the project, the current version, what is open.
5. After every change, update PROJECT_MEMORY.md and docs/CHANGELOG.md as section 2 describes, and give me the new zip and PROJECT_MEMORY.md together.
My task now: (write it here)
~~~

Reading order inside the zip:

1. This file.
2. `docs/SAFEFIND_MASTER_PROMPT.md`: the rules for the assistant and the locked project facts. Its section 3 is the list of defects D1 to D16 found in the first draft; section 4 defines AUTH-1 to AUTH-7 (what an authentic user is) and PUB-1 to PUB-6 (what the public board may show). Code comments and tests refer to those IDs.
3. `docs/CHANGELOG.md`: what changed in each version.
4. `README.md`: how to run, the rules the system enforces, the decisions the team must confirm.
5. `docs/DB_NOTES.md` and `docs/schema.sql`: how to write the PostgreSQL models.

First commands: `npm install`, `npm test` (every test should pass), `npm start`, then open http://localhost:3000. Demo accounts are in section 5.

## 2. How this record is kept up to date

The rule: every change to the project, however small, ships with an updated record. Whoever changes the project (an assistant or a team member) does these steps in the same turn.

1. Choose the next version. Patch (1.2.x) for fixes and documents, minor (1.x.0) for features, major for changing a locked decision (section 6.1). Set it in `package.json` and `package-lock.json`.
2. Add an entry at the top of section 9 of this file, and the matching entry at the top of `docs/CHANGELOG.md`. Use the template below.
3. Update the sections the change touched: 5 (current state), 6 (decisions), 7 (open items: close what is done, add what is new) and 8 (verification record).
4. Update the `App version` and `Last updated` lines at the top.
5. Run `npm test`. `tests/records.test.js` fails if the version, the newest entry in section 9 and the changelog disagree, or if a numbered section is missing.
6. Deliver together: the new project zip and a standalone copy of this file. Name the zip `SafeFind-BUP-vX.Y.Z.zip`, with the top folder `SafeFind-BUP/`, without `node_modules`, `.env` or the contents of `uploads/`. If only the record changed, still bump the patch version.
7. In the reply, say plainly what was not tested.

Entry template for section 9 (newest first):

~~~text
### vX.Y.Z (YYYY-MM-DD) One-line summary
Asked for: what the owner asked, in their words.
Done: what changed, by area.
Files: new and changed (a full list goes in an appendix if there are more than about ten).
Decisions: each choice, and why.
Found and fixed: problems found on the way.
Verified: the commands that were run and their results.
Not verified: what was not run.
Open after this: items opened or closed in section 7.
~~~

If the project is changed without an assistant (for example by a team member in Git), add the entry by hand in the same way.

## 3. How the owner wants the work done

The owner is one of the three team members and writes to the assistant in English or in romanized Bengali (Banglish). Reply in the language of the owner's latest message. Keep replies practical: give files and a short explanation, not only advice.

The assistant's role is senior software engineer, system architect, technical lead, code reviewer, UI/UX consultant, documentation expert and project supervisor for a university-level project that should be built like production software. It is a long-term technical partner and keeps the full project context.

Working rules:

1. Read before writing and run before claiming. Never say something works unless it was run, and say plainly what was not tested.
2. Do not simply agree. When an idea is wrong, risky or unnecessary, open with `Technical concern:` and give the reason, the impact and a better option. When a defect is noticed while working, open with `Potential issue:` and give the fix.
3. Do not change a locked decision (section 6.1) without showing the current approach, the proposed change, the benefit and the trade-off, and wait for approval. Do not drift in stack, architecture, roles, workflow, database concepts or scope.
4. Reply order for technical answers: Understanding, Engineering analysis, Recommended approach, Implementation plan, Potential problems, Final recommendation. Keep each part short. For jobs that touch many files, deliver a project archive and a table (file, purpose, new or changed); show a snippet only to explain a decision; every delivered file must be complete.
5. Before a major feature: requirements (the problem, who uses it, what data), design (database, backend, frontend, security) and a plan (steps and testing).
6. Put code where it belongs: routes to controllers, controllers to services, services to models; middleware for cross-cutting concerns; utils for pure helpers. When the choice is not obvious, explain it and name one alternative that was rejected.
7. Database: model the real workflow, with no table or column without a use. Note the foreign keys, constraints and indexes the PostgreSQL version needs.
8. Check security on every feature: password hashing and policy, session fixation, expiry and cookie flags, CSRF on every state change, role checks on the server, object-level checks, input validation and output escaping, upload checks by content, no private data in public views, an audit trail for decisions.
9. Matching stays explainable (four factors with visible weights and plain-language reasons). It assists Security Cell staff and never decides ownership. No extra AI or machine learning.
10. UI: modern, minimal, professional, suited to a university. Clear hierarchy, simple navigation, consistent spacing. No decorative motion, no gradient fills, no dashboards of identical cards, no generic templates. Every screen has an empty state and an error state. Buttons say what they do and the same action keeps the same name everywhere. Both themes, visible keyboard focus, text contrast of at least 4.5:1, reduced motion respected, usable at 360 px.
11. Writing (documents, reports, interface copy): plain, specific, human and academic where needed. No claim the system cannot back up, no marketing words, sentence-case headings.
12. Diagrams use UML, stay simple, show realistic relationships and no unnecessary entities, and should look made by a student or engineer, not generated.
13. No new framework. A library is allowed only when it removes risk. Do not invent facts about BUP: contact details, real building names and e-mail formats come from configuration.
14. Avoid: unnecessary AI features, enterprise-scale designs, extra database complexity, technology that does not fit the timeline, textbook answers, ignoring security or the academic evaluation, complicated diagrams.
15. Project management: plan sprints, prioritize, divide tasks, manage risk, foresee obstacles and suggest solutions before they happen.
16. Continuity: every update ships with this record (section 2).
17. When the owner supplies a design (an HTML concept, a sketch, a screenshot), build that design as drawn: its layout, colours, sizes and wording. Change only what is wrong, inconvenient or missing, and list each change in the reply. "Unique" and "not machine-made" apply to what is newly drawn (a part the concept does not show), not to the owner's own design and not to anything the concept already shows. When something is unclear, follow the file and ask one question at the end; do not redesign. Version 1.3.0 broke this rule (it restyled the whole page) and version 1.3.1 broke it again (it replaced the concept's ticket diagram with its own drawing of a shelf); both were rejected. If the concept contains an image or a diagram, reproduce that one; do not substitute new artwork for it.

Philosophy: a realistic, secure, maintainable university-level system that shows professional engineering practice. Priority order: correct functionality, clean architecture, security, user experience, maintainability, advanced features.

## 4. The project in brief

Name: SafeFind, an Intelligent Lost and Found Case Management System for BUP.

Institution: Department of Information and Communication Technology, Faculty of Science and Technology, Bangladesh University of Professionals (BUP).

Team: Iftakharul Islam Riad, Ayesha Siddiki Mimi and Sabicunnaher Wafi (BICE 2024, Section B, Group 1). The owner talking to the assistant is one of them; their role in the team is not recorded here.

Supervisors: Asst. Prof. Nazneen Akter (Department of ICT, BUP) and Asst. Prof. Suman Saha (Department of IT & RE, University of Frontier Technology, Bangladesh).

Course: Software and Requirement Engineering Lab. A midterm presentation deck exists. The proposal is dated 22 August 2026 and plans 14 weeks: the core system by about week 9, week 10 as a buffer, then testing, refinement, documentation and the final presentation.

Problem: the lost and found process of the BUP Security Cell is paper-based. People visit the Cell to report or follow up. Approval, investigation, CCTV review, recovery and handover run on manual steps and informal messages. Users cannot see progress, owners may not learn that their item was found, and the university has no central records or analytics.

Purpose: one digital case record from report to handover, without changing the university's approval authority. The system organises the work around the Security Cell and the authorized approver.

Roles (`config/roles.js`): `member` (student or staff), `security` (Security Cell staff), `approver` (chairman or authorized approver), `admin` (system administrator). After sign-in they land on `/dashboard`, `/security`, `/approver` and `/admin`.

Case life cycle: report, case reference (`SF-YYYY-NNNN`), approval if the category needs it (phones and laptops, lost reports only), Security Cell review, matching, notification, claim, tiered ownership check (tier 1 details; tier 2 proof photo for high-value categories), QR handover (signed single-use code, ID checked, Security Cell staff only), closed. Found items nobody claims are flagged after the retention period (90 days, a setting); staff choose donate, recycle or transfer and nothing is removed automatically.

Statuses (`config/statuses.js`): case `pending_approval`, `rejected`, `under_review`, `open`, `matched`, `claim_pending`, `ready_for_handover`, `closed`, `disposed`. Claim `submitted`, `proof_requested`, `verified`, `rejected`, `completed`. Account `pending`, `active`, `suspended`. The public board lists `open` and `matched` cases only.

Matching: category, description (TF-IDF with cosine similarity), place and time, combined with weights the administrator sets. It is explainable and only suggests.

Out of scope: native mobile apps, automated CCTV analysis, facial recognition, GPS or Bluetooth or IoT tracking, blockchain, national ID integration, automatic social media posting.

Original documents (the owner keeps these; they were in the Claude Project named "SafeFind"):

| File | What it holds | Note |
|---|---|---|
| `1Bupdated_Final_1.pdf` | The project proposal: problem, objectives, scope, stakeholders, requirements FR-01 to FR-25 and NFR-01 to NFR-10, methodology, technology, diagrams (use case, context, level-1 DFD, workflow, swimlane activity, ER, architecture), 14-week timeline | Source of the locked decisions. Requirements are in Appendix A. |
| `SafeFind_Team_Workflow_Guide.pdf` | A plain-language explanation of the route, controller, service, model and view pattern, and a split of work among three people (accounts and admin; reporting and intelligence; claims, handover and look) | Written for the planned file names; the real code differs in places. |
| `SafeFind_Project_Structure.pdf` | The planned folder tree (`src/`, Sequelize models, Bootstrap named in its title) | Outdated. The real project has no `src/`, no Sequelize and no Bootstrap. Use the layout in section 5.3. |
| `SectionB_Group1_Mid.pptx` | The 15-slide midterm deck: problem, overview, requirements, use case, ER, activity, sequence, architecture, DFD, front end, status and next steps | Its status slide predates the working code. |
| `safefind-home-concept-v5.html` | The owner's concept for the home page: layout, copy in English and Bangla, colours and behaviour, with placeholder numbers | Source of the 1.3.0 home page. It is not in the zip, so keep it. The built page differs from it where the concept was wrong or did not fit the application (section 6.4). |

## 5. Current state

### 5.1 What works

| Area | State |
|---|---|
| Accounts: university e-mail, confirmed by a link; staff, approver and administrator by invitation | Works |
| Accounts without a university e-mail: any address plus an ID card photo, address confirmed by a link, photo checked by an administrator at `/admin/id-reviews`, then sign-in with that address (AUTH-8 to AUTH-12) | Works (1.4.0). Tested with an in-memory store, local photo storage and a stand-in for Cloudinary. |
| Public board that anyone can read; reporting, claiming and tracking need an account | Works |
| Reports with photos; approval step for phones and laptops | Works |
| Report in three steps, drag-and-drop photo, live filters, toast messages, empty states, progress path | Works (1.2.0) |
| Photos in Cloudinary (private) or the local folder | Works. The Cloudinary calls are tested against stand-ins; a real account has not been tried. |
| Live alerts over Socket.io | Works over WebSocket. If it is blocked, the bell and the notifications page still show everything. |
| Matching with a score staff can read | Works |
| Claims, tiered ownership check, QR handover with an ID check | Works |
| Unclaimed items flagged after 90 days | Works |
| Analytics (charts and a hotspot map), audit log, administrator settings | Works |
| Administrator edits an account (not the password or the ID) and can delete it; the email and ID can be registered again | Works (1.6.0) |
| Security Cell and administrator: all case statuses in one list, and a handover history | Works (1.6.0) |
| The reporter reads Security Cell notes; both sides can post an update with a photo; removing a note, update or photo leaves a line in the case history | Works (1.7.0) |
| Claims in the personal menu, with the QR and handover code while the claim is verified | Works (1.7.0) |
| Administrator dashboard shows account and case figures and recent activity. Waiting accounts are on Users, not a second panel | Works (1.7.1) |
| Home page | Built in 1.3.1 from the owner's concept as drawn: eyebrow labels, the underlined headline, three tiles, a stats box with the board and a follow card, the campus photo, a four-step strip, four features, a before-and-after table, who can use it, team and contact. The hero image is the concept's ticket diagram: a Lost and a Found ticket, the Security Cell step and the return to the owner. | Works |
| English and Bangla | Public, sign-in and member screens are translated. Staff and administrator screens fall back to English where a string is not translated. |
| Data storage | PostgreSQL, through `DATABASE_URL`. The server applies `docs/schema.sql` to an empty database, then seeds demo data once. `database/safefind.sql` is a dump of that database. Tests use the same schema on PGlite. |
| E-mail | Development prints messages to the console. Production needs an SMTP server. |

### 5.2 Stack

Node.js 20 or newer (tested on 22), Express 4, EJS 3, one custom stylesheet with light and dark themes, plain JavaScript in the browser, `node --test` for tests. Locale keys: 995 in English, 625 in Bangla.

Runtime dependencies:

| Package | Range |
|---|---|
| `@fontsource/inter` | ^5.0.0 |
| `@fontsource/noto-sans-bengali` | ^5.0.0 |
| `@fontsource/poppins` | ^5.0.0 |
| `bcrypt` | ^6.0.0 |
| `chart.js` | ^4.4.0 |
| `cloudinary` | ^2.11.0 |
| `connect-pg-simple` | ^9.0.1 |
| `cookie-parser` | ^1.4.6 |
| `dotenv` | ^16.4.5 |
| `ejs` | ^3.1.10 |
| `express` | ^4.19.2 |
| `express-rate-limit` | ^7.4.0 |
| `express-session` | ^1.18.0 |
| `helmet` | ^7.1.0 |
| `jsqr` | ^1.4.0 |
| `leaflet` | ^1.9.4 |
| `morgan` | ^1.10.0 |
| `multer` | ^2.0.0 |
| `nodemailer` | ^10.0.13 |
| `pg` | ^8.12.0 |
| `qrcode` | ^1.5.4 |
| `socket.io` | ^4.8.4 |

Development dependencies:

| Package | Range |
|---|---|
| `@electric-sql/pglite` | ^0.5.8 |
| `nodemon` | ^3.1.4 |
| `socket.io-client` | ^4.8.4 |

Playwright is not a dependency. `scripts/browser-check.js` loads it if it is installed.

### 5.3 Architecture and layout

Three tiers and MVC with a service layer. Routes map URLs to controllers. Controllers read the request and call services. Services hold the business rules. Models are the data layer. They talk to PostgreSQL and return the same objects the services already used, so controllers and pages did not change. Views are EJS templates without logic. Middleware handles the cross-cutting parts.

~~~text
app.js            wires middleware and routes; start() seeds data, schedules the retention sweep, creates the HTTP server and attaches Socket.io
config/           environment (index.js), roles, statuses, navigation, team
routes/           one file per area (URL to controller)
controllers/      read the request, call a service, render or redirect
services/         business rules: auth, cases, matching, claims, handover, retention, analytics, notifications, live alerts (realtime), mail, audit, settings, seed
models/           data access (PostgreSQL). db/ holds the connection. collection.js only paginates lists.
middleware/       security headers and CSP, session, CSRF, locale, rate limits, uploads, error pages, view helpers
validators/       form rules, one schema per form; messages are locale keys
utils/            images (photo storage), progress (the four-step path), format, i18n, text, safeRedirect, wrapController
views/            EJS templates by area: auth, member, security, approver, admin, items, partials
public/           css/style.css (the design system), js/ (small enhancements), images/
locales/          en.json, bn.json
tests/            node:test suites
scripts/          smoke.js, collect-keys.js, browser-check.js
docs/             PROJECT_MEMORY.md, CHANGELOG.md, DB_NOTES.md, schema.sql, SAFEFIND_MASTER_PROMPT.md
~~~

### 5.4 Where to find what

| Need | Look at |
|---|---|
| Sign-up, e-mail confirmation, sign-in, sessions (FR-01, FR-02) | `services/auth.service.js`, `controllers/auth.controller.js`, `middleware/session.js`, `middleware/currentUser.js`, `middleware/csrf.js` |
| Reports, case references, intake of found items (FR-03 to FR-05, FR-09) | `services/case.service.js`, `models/case.model.js`, `controllers/member.controller.js`, `controllers/security.controller.js` |
| What a visitor may see (FR-24, PUB rules) | `case.service.js` (`publicCard`, `publicFeed`, `getForViewer`), `tests/privacy.test.js` |
| Approval (FR-07) | `controllers/approver.controller.js`, `case.service.js` (`approvalDecision`) |
| Matching (FR-10 to FR-12) | `services/matching.service.js`, `views/partials/match-card.ejs` |
| Notifications (FR-13) | `services/notification.service.js`, `models/notification.model.js`, `services/realtime.service.js`, `public/js/realtime.js` |
| Claims and ownership check (FR-14, FR-15) | `services/claim.service.js`, `controllers/claim.controller.js` |
| Investigation and CCTV notes (FR-16) | `case.service.js` (`addNote`, `deleteNote`, `getForViewer`), `models/investigation.model.js`. The reporter reads the findings; the camera name and time window stay with staff |
| Updates on a case, with photos | `case.service.js` (`addUpdate`, `deleteUpdate`, `deleteUpdateImage`), `models/caseUpdate.model.js`, `views/partials/case-thread.ejs` |
| The person's own claims, including the QR | `controllers/claim.controller.js` (`list`), `views/member/claims.ejs`, nav key `nav_my_claims` |
| QR handover (FR-17 to FR-20) | `services/handover.service.js`, `public/js/handover-scanner.js` |
| Analytics (FR-21) | `services/analytics.service.js`, `views/admin/analytics.ejs`, `public/js/analytics.js` |
| Administration (FR-22) | `controllers/admin.controller.js`, `services/user.service.js`, `services/settings.service.js`, `services/catalog.service.js` |
| Audit trail (FR-23) | `services/audit.service.js`, `models/audit.model.js` |
| Retention (FR-25) | `services/retention.service.js` |
| ID card registration (AUTH-8 to AUTH-12) | `services/auth.service.js` (`registerWithIdCard`, `login`, `verifyEmail`), `services/identity.service.js` (review, resubmit, purge), `models/identityProof.model.js`, `controllers/idreview.controller.js`, `controllers/auth.controller.js` (`registerId*`, `resubmit*`), `views/auth/register-id.ejs`, `views/auth/id-resubmit.ejs`, `views/admin/id-reviews.ejs`, `views/admin/id-review.ejs`, `views/partials/register-tabs.ejs`, `register-fields.ejs`, `tests/idcard.test.js` |
| Photo storage | `utils/images.js`, `middleware/upload.js`, `controllers/items.controller.js` (`file`), `config/index.js` (`cloudinary`) |
| Report steps and uploader | `views/member/report-form.ejs`, `views/partials/dropzone.ejs`, `public/js/wizard.js`, `public/js/dropzone.js` |
| Live filters | `controllers/home.controller.js`, `member.controller.js`, `security.controller.js` (`?partial=1`), `views/partials/browse-results.ejs`, `list-results.ejs`, `public/js/live-filter.js` |
| Toast messages | `public/js/site.js`, `views/partials/flash.ejs`, the `Toasts` part of `public/css/style.css` |
| Progress path | `utils/progress.js`, `views/partials/status-progress.ejs` |
| Empty states | `views/partials/empty.ejs` |
| Home page | `views/home.ejs`, `controllers/home.controller.js`, `public/js/home.js`, the "home page (1.3)" part of `public/css/style.css` |
| Hero image | the `hp-vis` figure in `views/home.ejs`; the `.hp-tks`, `.hp-tk`, `.hp-fl` and `.hp-chip` rules in `public/css/style.css` |
| Board rows | `views/partials/feed.ejs`, used by the home page and `/browse` |
| Header and footer links | `views/partials/top.ejs`, `views/partials/bottom.ejs` |

### 5.5 Configuration

Every setting is in `.env.example` with a comment. In production `SESSION_SECRET` (24 or more random characters), `QR_SECRET`, `BASE_URL`, an SMTP server and the first administrator (`ADMIN_EMAIL`, `ADMIN_PASSWORD`) are required; the app refuses to start with a weak session secret.

| Group | Settings |
|---|---|
| Server | `NODE_ENV`, `PORT`, `BASE_URL`, `TRUST_PROXY`, `COOKIE_SECURE` |
| Secrets | `SESSION_SECRET`, `QR_SECRET`, `BCRYPT_ROUNDS` |
| Database | `DATABASE_URL` (required; cases, accounts, claims and sessions) |
| Who may register | `ALLOWED_EMAIL_DOMAINS`, `ALLOW_EMAIL_SUBDOMAINS`, `REQUIRE_ADMIN_APPROVAL`, `STUDENT_ID_PATTERN`, `STAFF_ID_PATTERN`, `ALLOW_ID_CARD_REGISTRATION` (true), `ID_CARD_MAX_ATTEMPTS` (3), `ID_CARD_KEEP_DAYS` (30) |
| First administrator | `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` |
| E-mail | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` |
| Uploads and limits | `UPLOAD_DIR`, `MAX_UPLOAD_MB` (default 3), `MAX_REPORTS_PER_DAY` (10), `MAX_CLAIMS_PER_DAY` (5), `RATE_LIMIT_GLOBAL` (3000 per 15 minutes), `RATE_LIMIT_LOGIN_FAILURES` (20) |
| Photo storage | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` or `CLOUDINARY_URL`, `CLOUDINARY_FOLDER` |
| Live alerts | `REALTIME` (default true) |
| Demo data | `SEED_DEMO_DATA` (default true outside production) |
| Contact details and map | `SECURITY_CELL_LOCATION`, `SECURITY_CELL_PHONE`, `SECURITY_CELL_EMAIL`, `SECURITY_CELL_HOURS`, `CAMPUS_LAT`, `CAMPUS_LNG` |

### 5.6 Demo accounts (development only)

Created when `SEED_DEMO_DATA` is on. The seed also creates 14 sample cases, `SF-2026-0001` to `SF-2026-0014`. Never run production with demo data.

| Role | E-mail | Password |
|---|---|---|
| Administrator | admin@safefind.example | Admin@12345 |
| Security Cell staff | security@safefind.example, security2@safefind.example | Security@12345 |
| Authorized approver | approver@safefind.example | Approver@12345 |
| Student | student@safefind.example, student2@safefind.example | Student@12345 |
| Staff member | staff@safefind.example | Staff@12345 |

### 5.7 Commands

~~~text
npm install
copy .env.example .env      (macOS or Linux: cp .env.example .env)
npm start                   http://localhost:3000
npm test                    all suites (15 test files, 201 tests, about 25 seconds)
npm run smoke               every page as every role
npm install --no-save playwright && npx playwright install chromium
npm run browser-check       real-browser checks of the 1.2 and 1.3 additions (SHOTS=./shots saves screenshots)
~~~

### 5.8 Rules the tests enforce

Anything that breaks these fails `npm test`, so a change has to respect them.

- Every user-facing string goes through a locale key. Add the English text to `locales/en.json` and the Bangla to `locales/bn.json` for public, sign-in and member screens (staff screens may fall back to English). `tests/unit.test.js` checks that every key the code uses exists in English, and that the Bangla file has no stray keys and the same `{placeholders}`. `scripts/collect-keys.js` finds keys by pattern: `t('key')`; object properties `key`, `label`, `hint`, `placeholder`, `blank`, `success`, `titleKey`, `bodyKey`; quoted strings that start with `ev_`, `cev_`, `notif_`, `mail_`, `flash_`, `err_`, `mr_`, `svc_`, `dz_`, `wizard_`, `progress_`, `empty_` or `toast_`; `new ServiceError('CODE')` (key `svc_CODE`); and the families listed at the bottom of that script. Add a family there when keys are built at run time.
- The Content-Security-Policy is strict (`middleware/security.js`): scripts and styles come from this site only, with no inline `<script>`, no `style=""` attributes in markup (set widths from JavaScript, as `site.js` does for score bars) and no third-party hosts. `img-src` allows `blob:` for the uploader preview. `connect-src` allows this site's own WebSocket.
- A page declares the scripts it needs once (`var assets = { scripts: [...] }`) and passes `assets` to both `partials/top` and `partials/bottom`. `tests/assets.test.js` holds a table of what each page must load, in order. Update it when a page gets a script.
- `[hidden]` must keep winning over any `display` rule (a test reads the stylesheet).
- Every state-changing request carries a CSRF token: the hidden field `_csrf`, or for upload forms `?_csrf=` in the URL, because the multipart body is not parsed yet at the check.
- Public pages never write to the session, so a visitor who only reads gets no cookie (D2).
- What a visitor sees is decided by `case.service.publicCard`, and search runs on public fields only. `tests/privacy.test.js` searches for every private-only word in the demo data.
- Controllers are wrapped with `utils/wrapController`, so an async error reaches the error handler. A business-rule failure is a `ServiceError` code shown through an `svc_*` key.
- Copy does not overclaim: `tests/unit.test.js` rejects phrases such as "tamper-proof".
- Board rows keep `<span class="feed-title">` with plain text only (`tests/ui.test.js` reads it), and the three `<span class="stat-num">` figures on the home page keep their order (`tests/privacy.test.js` reads them).
- `tests/records.test.js` keeps the version, this file and the changelog in step.

## 6. Decisions and why

### 6.1 Locked decisions

From the proposal, the master prompt and the owner's role prompt. Changing one needs the process in section 3, rule 3.

| Topic | Decision |
|---|---|
| Stack | Node.js, Express 4, EJS, HTML5, CSS3, JavaScript, a custom CSS design system (no Bootstrap or Tailwind), PostgreSQL, bcrypt, express-session with a PostgreSQL store, Chart.js, Leaflet.js, QR generation on the server and scanning in the browser, Git and GitHub |
| Architecture | Three tiers; MVC with a service layer |
| Roles | Student/Staff, Security Cell Staff, Chairman/Authorized Approver, System Administrator |
| Authority | The university's approval authority does not change |
| Matching | Explainable weighted score; assists staff; never decides ownership |
| Out of scope | Native apps, automated CCTV analysis, facial recognition, GPS/Bluetooth/IoT, blockchain, national ID integration, automatic social media posting |
| Priorities | Correct functionality, clean architecture, security, user experience, maintainability, advanced features |

### 6.2 Decisions made in version 1.1.0

As documented in `README.md` and `docs/CHANGELOG.md`. They are the team's work before this record existed.

- Accounts need an e-mail on an allowed domain and a single-use confirmation link. Staff, approver and administrator accounts are created by an administrator invitation. The account is re-checked on every request, sign-in gives one generic error, and failed attempts are throttled.
- The public board shows type, public title, category, building, date and status of open or matched reports. For identity and bank cards the title is replaced by the category name. Descriptions, exact spots, photos, shelf, finder and owner are never public.
- Nobody decides on their own case. Security Cell and administrator accounts do not claim items. Only Security Cell staff complete a handover, after ticking that they checked the ID, with a signed single-use code that expires.
- The data layer stays in memory behind async functions shaped like PostgreSQL queries. The schema in `docs/schema.sql` is tested on PGlite.
- Strict CSP with fonts, charts, maps and the QR scanner served by the app itself.
- English and Bangla, light and dark themes, tests with the built-in `node --test` runner (no extra framework).

### 6.3 Decisions made in version 1.2.0

| Question | Choice | Why |
|---|---|---|
| Use `multer-storage-cloudinary`? | No. Memory upload, content check, then the Cloudinary SDK. | The existing pipeline checks the file's first bytes before anything is stored, and the package would upload first. It also needs the old 1.x SDK. |
| Public or private Cloudinary delivery? | Private (`type: authenticated`). Pages never contain a Cloudinary address. `/uploads/:file` checks who may see the case, then fetches the image with a signed address that lasts one minute and passes it on. | Photos may show ID cards. A public address would let anyone with the link see the image, and it would need a Cloudinary host in the CSP. |
| What if Cloudinary fails on upload? | The person is told to try again. There is no silent fallback to the local folder. | A local copy on a host with a temporary disk would be lost. |
| WebSocket or long polling? | WebSocket only. | Each polling request would read the session store (PostgreSQL in production). If WebSocket is blocked, nothing is lost: notifications are stored. |
| Who may join a socket room? | The server decides. A socket joins only `user:<id>`, after the session passes the same checks as a normal request (account active, session newer than the last password change), and the Origin must match this host. | The browser can never ask for another person's room. |
| Status filter on the public board? | Not added. A building filter was added. | The board lists only open and matched reports (PUB-3); a "matched" filter would show which ones staff linked. The building is already on the card (PUB-2). |
| Extra fields in report step 3 (verification, contact)? | Not added. Step 3 holds the photo and a review of what was entered. | The data model has no such fields, and the private description already serves ownership checks. |
| How do live filters work? | The same URL with `?partial=1` answers with just the results list, rendered by the same templates and rules as the full page, with `Cache-Control: no-store`. | One set of rules, no duplicated markup, values escaped by EJS, the address bar stays shareable. |
| How are alerts coloured? | An explicit list in `services/realtime.service.js`: green good news, red refusal, amber waiting for you, blue information. | A new notification key cannot change colour by accident. |
| Timing | Toast 3.5 seconds (paused on hover or focus); live alerts 7 seconds. | The default asked for; alerts carry a link and need longer to read. |
| Failure of the socket layer | Never undoes the action that caused the notification. It is logged. | The notification is always stored first. |

### 6.5 Decisions made in version 1.4.0

Changed at the owner's request: AUTH-1 used to say that registration needs a university e-mail address. Now a second way exists for people without one. Benefit: students who only use Gmail can join. Trade-off: membership then rests on a photo and an administrator's check, not on a mailbox the university controls.

| Question | Choice | Why |
|---|---|---|
| One form or two | Two pages, `/auth/register` and `/auth/register/id-card`, joined by a tab of plain links | Each way has its own rules and validation; it works without JavaScript; the fields shared by both are one partial |
| Who decides | The administrator only (the owner's words), at `/admin/id-reviews` | Security Cell and approver roles stay as locked |
| When a photo is queued | After the e-mail address is confirmed | Typing someone else's address cannot fill the administrator's list |
| What opens the account | Only the administrator's approval of the photo | E-mail confirmation, the old Approve button and suspend then reactivate are blocked for these accounts (tests break each one on purpose) |
| Sign-in afterwards | The address given at registration, with the password, as for everyone | No change to login except clearer messages after a right password: waiting, rejected, final |
| Rejection | Reason from a list (`other` needs a note), e-mailed with a link for a new photo; also reached by signing in; at most 3 photos; "reject for good" or the 3rd rejection frees the university ID | A mistake should be fixable, abuse should end, and a false claim on someone's ID number must not block the real owner forever |
| Photo storage | The existing image pipeline (random name, checked by content, local or private Cloudinary), but never served by `/uploads/:file`; admin-only route, no cache, every viewing audited | An ID card is the most sensitive file in the system |
| Photo deletion | `ID_CARD_KEEP_DAYS` (30) after the decision, by the six-hourly job; the decision stays | Data minimisation, with time to resolve a dispute |
| Number of photos | One photo of the side with name and ID number | Two files would need a new upload parser; a reviewer can reject with "unreadable" and ask again |
| University address on the ID card form | Refused with a pointer to the other form | An address that proves membership by itself should use the stronger way |
| Authority accounts | Still need a university address (AUTH-5 unchanged) | Roles with power should not depend on a photo |
| Demo data | No demo ID-card user is seeded | Seeding needs a photo file on every start; the flow takes a minute to try (see README) |

### 6.4 Decisions made in versions 1.3.1 and 1.3.2

Version 1.3.0 redesigned the home page from the owner's concept and was rejected: the owner had asked for the concept's own design, with fixes, additions and an illustration. Version 1.3.1 followed the concept except for the hero image, which it replaced with a drawn shelf; that was not what the concept shows, and version 1.3.2 puts the concept's ticket diagram back.

| Question | Choice | Why |
|---|---|---|
| Whose design | The owner's concept (`safefind-home-concept-v5.html`), as drawn: the same sections in the same order, with its sizes, colours, spacing and wording | The owner asked for the project's page to be like the concept. A browser comparison of about 65 element pairs found 1,706 of 1,728 computed style values identical in light mode (1,696 of 1,728 in dark); the rest are structural or have no visual effect |
| The image spot | The concept's ticket diagram, as drawn: a Lost and a Found ticket, each with "Case code" and `SF-YYYY-NNNN`, a dashed bracket to "Security Cell reviews and matches", then "Returned to the owner", and the caption without the word "Illustration:" | The owner showed this diagram and asked for the image "the way the HTML file shows". The code on the tickets is the format, not a real case number. The drawn shelf of 1.3.1 was removed. |
| The tickets on a 360 px phone | They stay side by side, with a 34 px stub, 12 px code and smaller padding | At the concept's sizes the code is about 100 px wide and does not fit in a 150 px ticket. |
| Bangla on the tickets | No letter spacing and no capitals on the Bangla labels | The wide spacing meant for English capitals breaks joined Bengali letters. |
| Header | The concept's header with the missing Lost and found link, so five links. The BUP website link is in the footer. Below 1060 px the links fold into a menu button; below 480 px Sign in, Create account and My workspace go into that menu | Five links plus the tools need more than the 1100 px the container allows; the concept's four links just fit |
| Real data | The three figures and the board rows come from the database; links go to the real pages; the header, the follow card and the sign-up band have signed-in versions | The concept had placeholders and no signed-in state |
| Wording corrected | The board sentence and the "Private by default" text now say the board shows a short title as well as the type, category, building and date | `publicCard` returns a title for every category except the sensitive ones, where the category name stands in |
| Other fixes | Contact placeholder replaced by the existing sentence; supervisors added to the team card; space above the "Who can use it" band; the third tile in dark mode; without scripts the four steps are listed in order | Each was wrong, missing or inconvenient in the concept |
| Kept as drawn | The eyebrow labels, the coloured and underlined "on campus?", the icon tiles, the stats box, the four feature columns, the label "Today", the sentence under "Who can use it" | They are the owner's design |
| Left out | The preview banner, the in-browser translation and `localStorage` code, the Google Fonts link, inline `style` attributes | The application translates on the server, serves its own fonts and blocks inline styles |

### 6.6 Decisions made in version 1.6.0

| Question | Choice | Why |
|---|---|---|
| Delete a person who has cases | Keep the row, clear the password, email, phone and university ID, and mark `deleted_at` | Cases, claims and the audit log point at the user. The audit log cannot be edited. A real DELETE would fail, and removing the cases would erase the record the owner asked to keep for later |
| What "delete" frees | The email and the university ID | So the same person, or the real owner of a wrong ID, can register again |
| Who cannot be deleted | The signed-in administrator if they are the only active one | The system must keep one administrator |
| What an administrator may edit | Name, email, phone, role, student or staff, language | The owner asked for everything except the password and the ID |
| Where all statuses are listed | `/security/records`, for Security Cell staff and the administrator | The review queue, inventory and unclaimed lists are each one slice of the work. This one shows every status together |
| Where past handovers are listed | `/security/handover/history`, same two roles | The desk only shows codes that are still open. Completed and cancelled ones stay, without the code itself |

### 6.7 Decisions made in version 1.7.0

| Question | Choice | Why |
|---|---|---|
| Who reads a note | The person who reported the case, plus Security Cell and the administrator | The owner asked that the complainant see the note, not only the Security Cell |
| Camera name and time window | Still only Security Cell and the administrator | Those details identify a camera. The findings are enough for the reporter |
| Who else sees the thread | Not the public, not another student, not the approver | A note can describe the item more closely than the public card |
| Updates | A second panel beside the notes. Security Cell and the reporter can each write, and each can attach a photo | The owner asked for a way to send an update, with a photo from either side |
| Removing a note, an update or a photo | The row stays, the text or file is cleared, and the timeline says it was removed | The owner asked for a delete option and a history line. The old text is not kept on the page |
| Who may remove what | Security Cell removes a note. Security Cell or the author removes an update. Security Cell or the reporter removes any photo on that case | A photo can be the wrong picture. The reporter should be able to take it down. The note itself stays a Security Cell record |
| Where the QR is | **Claims** in the personal menu (`/claims`), and still on the claim page | The owner asked for a Claims menu that shows the QR. It appears while the claim is verified and the code has not expired |

### 6.8 Decisions made in version 1.7.1

| Question | Choice | Why |
|---|---|---|
| The "approval is switched off" panel | Not shown on the administrator dashboard | The owner asked for that block not to be written there |
| When a list still appears | Only if an ID card is waiting for review, or approval is on and an account is waiting | An empty explanation is not useful. The pending count still opens Users |

## 7. Open items

| ID | Item | Why it matters |
|---|---|---|
| O-1 | Try Cloudinary with real credentials: one upload, one photo view, look for `[images]` log lines, check the plan's quota. | The SDK upload and the signed download were only tested against stand-ins. Each photo view makes one download request to Cloudinary. |
| O-2 | Team decisions listed in `README.md` under "Decisions the team needs to confirm" (1 to 9): e-mail domains and ID formats, administrator approval or a roster, real contact details and places, a second approver, administrator access to claim details, retention clock start, photos of identity documents outside the university server, deleting photos after closure, a status filter on the public board. | Several defaults are placeholders. |
| O-3 | Done in 1.5.0. The models write PostgreSQL. What remains is running it on the university's own server and restoring `database/safefind.sql` there. | A restart no longer empties cases or accounts. |
| O-4 | Test on Safari, Firefox, Windows, a real phone camera, touch drag-and-drop and Node 20. | Only Node 22 on Linux with headless Chromium was used. |
| O-5 | Production set-up: HTTPS, SMTP, `TRUST_PROXY`, WebSocket pass-through on the proxy, a single server process (or the Socket.io Redis adapter, which is not built), the first administrator through `ADMIN_*`. | Listed in `README.md`, deployment notes. |
| O-6 | Photo privacy: strip GPS and other metadata on upload, and decide when to delete photos. | Photos keep their metadata and outlive their cases. |
| O-7 | Bring the academic documents in step with the built system: the proposal's diagrams, the planned folder structure PDF and the midterm slides differ from the real code. | The final report and the viva should describe what was built. |
| O-8 | Remaining academic deliverables from the proposal timeline: usability and security testing, final report, final presentation, viva preparation. | Weeks 11 to 14 of the plan. |
| O-9 | Have a Bangla speaker read the new home page text (64 new keys). | Most of it is the concept's own Bangla; a few sentences were added or corrected here. None was checked by a native speaker. |
| O-10 | Confirm which side the hero image goes on. The concept and the first request say right; a later message said left. It is on the right. | To move it to the left, put the figure before the text in `views/home.ejs` and add an `order` rule. |

| O-11 | Have a Bangla speaker read the 60-odd new keys of 1.4.0 (registration with an ID card, login messages, rejection e-mails, reasons). | Written here, not checked by a native speaker. |
| O-12 | Decide how to handle someone entering another person's student ID before the real owner registers. Now the first claim holds the number until it is rejected for good. Option: allow several waiting claims on one ID and enforce uniqueness only at approval (schema and `findByUniversityId` change). | The real student gets "ID already in use" and must contact the administrator. |
| O-13 | Decide whether an ID card photo is enough proof, or whether to check names against an official roster (links to O-2), and whether to also keep a note of who the administrator compared it with. | An ID photo can be stolen or faked; the check is only as good as the reviewer. |
| O-14 | `MAX_UPLOAD_MB` is 3. Phone camera photos are often larger. Raise it or resize in the browser. | People will meet "image too large" when sending an ID card photo. |
| O-15 | Let a person who has a university e-mail add a second sign-in address later (not requested, not built). | Only if students ask for it. |
| O-16 | Photos still keep their metadata (O-6); ID card photos may carry GPS. Strip it on upload. | Privacy. |
| O-17 | Have a Bangla speaker read the new account, all-cases and handover-history strings. | Written here, not checked by a native speaker. |
| O-18 | Have a Bangla speaker read the new note, update and Claims strings. | Written here, not checked by a native speaker. |

Risks to keep in view:

- The app needs a reachable PostgreSQL. Without `DATABASE_URL` it will not start (tests are the exception: they use PGlite).
- Behind one shared campus address, students share one rate-limit allowance (`RATE_LIMIT_GLOBAL`).
- If WebSocket is blocked, live toasts do not appear. Notifications are still stored and shown in the bell and on the notifications page.
- Failed-login counters are in `login_failures`, so they survive a restart. Two server processes share them.

## 8. Verification record

Repeat the checks with the commands in section 5.7.

| Version | What was run | Result | Environment |
|---|---|---|---|
| 1.1.0 | As reported in its README: 131 automated tests; a browser pass over 198 page loads (desktop and 360 px, light and dark, English and Bangla; a QR scan with a simulated camera) | Passed. Not repeated by the 1.2 work. | Not recorded |
| 1.2.0 | `npm test`, `npm run smoke` and `npm run browser-check`, run again from a fresh unzip and `npm install` | 160 of 160 tests; smoke clean; 32 of 32 browser checks | Node 22.22.2, npm 10.9.7, Linux; Chromium headless shell 153 through Playwright 1.63.0 |
| 1.2.1 | `npm test` and `npm run smoke` from a fresh unzip; a file comparison with the 1.2.0 tree | 164 of 164 tests; smoke clean; only documents, one test file and the version lines of `package.json` and `package-lock.json` differ from 1.2.0 | Same |
| 1.3.0 | `npm test`, `npm run smoke`, `npm run browser-check` | 169 of 169 tests; smoke clean; 40 of 40 browser checks. Replaced by 1.3.1 | Same as 1.2.0 |
| 1.3.1 | `npm test`, `npm run smoke` and `npm run browser-check`; a browser comparison with the owner's concept | 169 of 169 tests; smoke clean; 40 of 40 browser checks; 1,706 of 1,728 computed style values identical to the concept in light mode and 1,696 of 1,728 in dark | Same as 1.2.0 |
| 1.3.2 | `npm test`, `npm run smoke` and `npm run browser-check`; the hero compared with the concept's in a browser, in light, dark, Bangla and at 360 px | 169 of 169 tests; smoke clean; 40 of 40 browser checks | Same as 1.2.0 |

| 1.4.0 | `npm test`, `npm run smoke`; a one-off Playwright script that loads the new pages at 1280 and 360 px in light and dark and uploads a photo with the uploader; four deliberate breaks of the security guards (each made a test fail) | 201 of 201 tests (169 before); smoke clean; no sideways scroll at 360 px; photo preview works; the review page loads the photo. The screenshots showed a real bug (the sidebar named the applicant), now fixed and tested. `npm run browser-check` was not extended for the new pages. | Node 22, Linux, headless Chromium 156 through Playwright |
| 1.6.0 | `npm test` | 205 of 205 tests passed | Node on Linux |
| 1.7.0 | `npm test` | 206 of 206 tests passed | Node on Linux |
| 1.7.1 | `npm test` | 207 of 207 tests passed | Node on Linux |

The 1.2.0 tests that are new: `tests/ui.test.js` (10 tests), `tests/images.test.js` (8) and `tests/realtime.test.js` (11, over a real WebSocket connection). The browser check covers the toasts, the uploader, the report steps, live filters, live alerts, text contrast in both themes and both languages, and 360 px width.

The 1.3.0 tests that are new: five in `tests/ui.test.js` (the header links, the structure and the board sentence, the four steps in the HTML, the signed-in variant, the team and contact block), one assertion in `tests/assets.test.js`, and eight browser checks (the header at 1024, 1280 and 1440 px in both languages, the highlight while scrolling, the step panel with the keyboard, the steps without JavaScript, the signed-in page, focus rings, no sideways scrolling and the phone bar at 360, 768, 1024 and 1440 px in both themes and languages, and reduced motion). The home page is also in the contrast scan in both themes and both languages. Not covered for the home page: a screen reader and a touch device.

In 1.3.1 the home page was also compared with the owner's concept by a one-off script: it loads the concept and the real page at 1440 px and compares computed styles (font size, weight, colour, spacing, border, radius, grid) of about 65 pairs of elements. The differences that remain are structural (a table where the concept has a grid), have no visual effect, or are the concept's own dark-mode bug.

Never verified so far: a real Cloudinary account, WebSocket through a real reverse proxy, Safari, Firefox, Windows, a real phone camera, touch drag-and-drop, Node versions other than 22, and the requirement-by-requirement coverage of the proposal (Appendix A lists where each requirement lives, but the 1.2 work did not audit them one by one).

## 9. Change history (newest first)

### v1.7.1 (2026-10-18) No waiting-accounts panel on the administrator dashboard
Asked for: that part should not be written on the admin dashboard; remove it.
Done: the empty "Accounts waiting for approval" panel is gone, including the sentence about `REQUIRE_ADMIN_APPROVAL`. Recent activity stays. A line appears only when an ID card is waiting, or when approval is on and someone is waiting. The pending count still opens Users.
Decisions: section 6.8.
Files: `views/admin/dashboard.ejs`, `controllers/admin.controller.js`, `tests/http.test.js`, `package.json`, `package-lock.json`, `docs/CHANGELOG.md`, `docs/PROJECT_MEMORY.md`.
Verified: `npm test` (207 passed).

### v1.7.0 (2026-10-18) Notes for the reporter, updates with photos, Claims menu
Asked for: the person who filed the report should see Security Cell notes; Security Cell should be able to send an update, and either side should be able to attach a photo; a photo or a note can be removed, and the history should say that it was removed; the user should have a Claims menu that shows the QR.
Done: notes and an Updates panel on the case, for the reporter and for Security Cell. Removing a note, an update or a photo clears the content and leaves a timeline line. **Claims** (`/claims`) lists the person's claims and shows the QR and the handover code while the claim is verified.
Decisions: section 6.7. Camera name and time window stay with Security Cell. The approver and other people do not see the thread.
Verified: `npm test` (206 passed).
Open after this: O-18.

### v1.6.0 (2026-10-12) Account edit and delete, all statuses, handover history
Asked for: an administrator should be able to delete an account, and edit everything except the password and the ID; handover items should stay visible for later; admin and staff should have one place that shows every status together.
Done: edit and delete on Users; All cases at `/security/records`; Handover history at `/security/handover/history`. Both lists are for Security Cell staff and the administrator.
Decisions: section 6.6. A deleted account stays as a row so cases and the audit log keep their link. The email and ID are freed.
Verified: `npm test` (205 passed).
Open after this: O-17.

### v1.5.0 (2026-10-11) PostgreSQL is the data store
Asked for: connect the existing frontend to the backend, make the database, and leave a copy that can be restored on another PostgreSQL.
Done: every model reads and writes `docs/schema.sql`. The pages, controllers and services are the same. An empty database is migrated on first start and then seeded. `database/safefind.sql` is the dump to restore. Failed logins are stored in `login_failures`.
Decisions: keep the model function names, so no page changed. Tests use PGlite with the same schema and still need no database server.
Verified: `npm test`.
Open after this: put `DATABASE_URL` on the machine that will keep the real data, and restore the dump there.

### v1.4.0 (2026-10-08) Registration with an ID card photo
Asked for: students do not all use the university e-mail, so give another way to prove they belong to BUP: upload an ID card image; the administrator checks it and, at that time, the person's other e-mail (such as Gmail) is the one they sign in with from then on.
Done: a second registration form and tab; the administrator's ID checks (list, review, approve, reject with reason, reject for good); resubmission after a rejection; private, audited, time-limited photo storage; guards so no other action can open such an account; schema, locales (English and Bangla), settings, tests. Details in section 6.5 and `docs/CHANGELOG.md`.
Files: 10 new, 37 changed against 1.3.2 (Appendix B).
Decisions: section 6.5. AUTH-1 was reworded and AUTH-8 to AUTH-12 added in `docs/SAFEFIND_MASTER_PROMPT.md`.
Found and fixed: the review page's `user` variable replaced the signed-in user in the sidebar (found by looking at a screenshot, not by the tests); a test now checks it. Also found while designing: the old Approve button and suspend then reactivate would have skipped the ID check; both are blocked.
Verified: section 8.
Not verified: Safari, Firefox, a phone camera, real SMTP, a real Cloudinary account (its delete call is tested against a stand-in), a screen reader; the Bangla text was not read by a native speaker; the browser check script was not extended; the console errors for `socket.io.js` seen in a one-off script come from that script starting the server without live alerts (not confirmed in a normal run).
Open after this: O-11 to O-16 opened.

### v1.3.2 (2026-10-05) Hero image is the concept's ticket diagram
Asked for: the same correction as for 1.3.1, read again: "I just told you to give an image on the side the way the HTML file I gave you shows, and fix the other things the way I asked." The image in the HTML is its ticket diagram, not a new drawing.
Done: the concept's diagram in the hero (a Lost and a Found ticket with the case code format, the Security Cell step, the return to the owner, the caption), in light and dark, English and Bangla and at 360 px; the drawn shelf, its generator and its styles removed; working rule 17 in section 3 made stricter.
Files: 0 new, 11 changed, 2 removed against 1.3.1 (Appendix B).
Decisions: section 6.4 (the image spot, the tickets on a phone, Bangla on the tickets).
Found and fixed: Bangla ticket labels had English letter spacing; the tickets' placeholder lines needed classes instead of `style` attributes.
Verified: section 8; a browser comparison of the hero with the concept's.
Not verified: Safari, Firefox, touch devices, a screen reader; the Bangla text was not read by a native speaker.
Open after this: O-9 and O-10 (which side the image goes on).

### v1.3.1 (2026-10-05) Home page follows the owner's concept
Asked for: "stop there": the page of 1.3.0 was not wanted. "I did not tell you to change the whole home page in illustration type; I just told you to give an image on the side the way the HTML file shows, and fix the other things the way I asked."
Done: the page rebuilt from the concept as drawn (section 6.4); the concept's header with the Lost and found link; a drawn Security Cell shelf in the image spot (replaced in 1.3.2); the board rows, the footer and the comparison back to the concept's look; real data and signed-in variants; the record gets a working rule for supplied designs (section 3, rule 17).
Files: 0 new, 17 changed, 1 removed against 1.3.0 (Appendix B).
Decisions: section 6.4.
Found and fixed: the board sentence and the "Private by default" text were not true; the concept's contact placeholder mentioned the site configuration; its third tile kept light colours in dark mode; the sign-up band touched the section above; the signed-in page was 39 px too wide on a 360 px phone.
Verified: section 8.
Not verified: Safari, Firefox, touch devices, a screen reader; the Bangla text was not read by a native speaker.
Open after this: O-9 and O-10.

### v1.3.0 (2026-10-04) New home page (replaced by 1.3.1)
Outcome: the owner rejected it. It redesigned the page (case stubs, register rows, drawn feature pictures, a ledger line) instead of following the concept.
Asked for: "make our project home page like this" (the owner's concept, `safefind-home-concept-v5.html`): align the project's page with it, fix wrong information or anything inconvenient, add what is missing (for example the Lost and found link, which the concept's header lacked), make it attractive and unique and not machine-made (no generic shapes or symbols), and draw an illustration on the right that fits the project and its theme.
Done: the home page rebuilt (sections 5.1 and 6.4); the header with five links, a reading line and a highlight for the section in view; the board rows as a register on the home page and on `/browse`; a drawn Security Cell shelf and four small feature drawings, generated by `docs/design/hero-art.py`; a phone bar for the two reporting actions; 60 new locale keys in English and Bangla; tests and browser checks for all of it.
Files: 4 new and 16 changed (Appendix B).
Decisions: section 6.4.
Found and fixed: the dark logo was drawn invisibly beside the real one in the light theme and took 113 px of the header; the sentence under the board said a card shows only type, category, building and date, but a card also shows a short title.
Verified: section 8.
Not verified: Safari, Firefox, touch devices, a screen reader; the Bangla text was not read by a native speaker.
Open after this: O-9.

### v1.2.1 (2026-10-04) Project record added, documents only
Asked for: "whatever change or update made in the project, track or record that and update or write that with previous memory / context", delivered with every update, so the work can continue with another account or AI without training it from the start.
Done: this file, `docs/PROJECT_MEMORY.md`, with the project context, the owner's working rules, the current state, decisions, open items, verification record and the full history; `tests/records.test.js`; the README and the master prompt mention the rule.
Files: new `docs/PROJECT_MEMORY.md` and `tests/records.test.js`. Changed `package.json`, `package-lock.json` (version only), `README.md`, `docs/CHANGELOG.md`, `docs/SAFEFIND_MASTER_PROMPT.md`.
Decisions: the record is a plain Markdown file inside the repository, not a feature of any chat tool, so it survives the loss of the account. A test keeps its version in step with `package.json` and the changelog. The proposal's student ID numbers are left out of it.
Found and fixed: `package-lock.json` still said version 1.1.0 while `package.json` said 1.2.0; both say 1.2.1 now. An empty folder named `views/{partials,auth,errors,items,member,security,approver,admin}`, left by a mistyped `mkdir`, is removed (it was already left out of the 1.2.0 zip).
Verified: see section 8.
Not verified: the record was written from the chat history and the project files and has not been read through by the team. Facts about versions before 1.2.0 come from the README and the changelog, not from the original work.
Open after this: no change to section 7.

### v1.2.0 (2026-10-04) Eight interface and infrastructure additions
Asked for: eight changes to the existing app "SafeFind-BUP": a drag-and-drop image uploader with instant preview, a three-step report form, live search and filtering without reloading, floating toast alerts, better empty states, an interactive status timeline, Cloudinary storage with a local fallback, and real-time Socket.io alerts for new claims and claim status changes. First as a code guide, then as a runnable demo, then merged into the real project the owner uploaded (`SafeFind-BUP-complete.zip`, version 1.1.0).
Done: all eight, adapted to the project's own rules (locale keys in English and Bangla, CSRF, strict CSP, the in-memory data layer, the public privacy rules). Details are in `docs/CHANGELOG.md`, 1.2.0.
Files: 15 new and 57 changed (Appendix B).
Decisions: section 6.3.
Found and fixed: the step form wiped the uploader's own error and red border; the "not in the future" limit in the report form went stale while the page stayed open; the review line did not follow the photo; two more banners (sign-out on the login page, "link sent again") were not part of the toast change; alert colours were a text pattern and are now an explicit list.
Verified: section 8.
Not verified: a real Cloudinary account, WebSocket through a proxy, Safari, Firefox, Windows, a real phone camera, touch drag-and-drop.
Open after this: O-1, O-4, O-5 and O-6 were opened or sharpened by this version.

### v1.1.0 (date not recorded) First complete version of the real project
From `docs/CHANGELOG.md`: defects D1 to D16 of the first draft fixed; the complete workflow for members, Security Cell staff, the approver and the administrator; a PostgreSQL schema tested on PGlite; 131 automated tests and a browser pass over 198 page loads.

### v1.0 draft "SafeFind-BUP-Person1" (date not recorded)
Express, EJS, a custom stylesheet, English and Bangla locale files, light and dark themes and in-memory user and item stores. Sixteen defects were reproduced in it (the table in `docs/SAFEFIND_MASTER_PROMPT.md`, section 3).

### Earlier work in chats (not versions of the repository)

- The project was set up in a Claude Project named "SafeFind" with the four documents in section 4 and the owner's role prompt (summarised in section 3).
- 2026-10-04: the eight additions were first answered as a step-by-step code guide, written against assumed file names because the real repository was not visible. Superseded by v1.2.0.
- 2026-10-04: a standalone demo, `safefind-bup-demo.zip`, was built to try the eight additions: Express 4, EJS 3, an in-memory PostgreSQL emulator (pg-mem) and sample data. It is a preview only and not the real code. Ignore it for development.
- 2026-10-04: the owner uploaded `SafeFind-BUP-complete.zip`; the additions were merged into it as v1.2.0.
- 2026-10-04: the owner asked for this record (v1.2.1).
- 2026-10-04: the owner shared a home page concept (`safefind-home-concept-v5.html`); first built as v1.3.0, which redesigned the page and was rejected.
- 2026-10-05: rebuilt as v1.3.1, following the concept as drawn.
- 2026-10-05: the hero image changed from a drawn shelf to the concept's ticket diagram (v1.3.2).
- 2026-10-08: the owner asked for registration with an ID card photo (v1.4.0). The assistant read the code, proposed the design in the chat, built it and found two bypass routes before they were reachable.

## Appendix A. Requirements from the proposal

Statuses were not re-audited in the 1.2 work. The last column says where the requirement lives in the code.

| ID | Requirement | Where |
|---|---|---|
| FR-01 | Authorized BUP users can register and log in. | `auth.service`, `auth.controller` |
| FR-02 | Authenticate users and give access by role. | `middleware/auth.js`, `config/roles.js` |
| FR-03 | Submit lost-item reports with category, description, location, date/time and photograph. | `case.service` (`createReport`), `member.controller` |
| FR-04 | Security Cell staff record found-item information. | `case.service` (`intakeFound`), `security.controller` |
| FR-05 | A unique case ID for each report. | `models/case.model.js` (`nextRef`) |
| FR-06 | Users view and track case status. | `member.controller` (`track`), `utils/progress.js` |
| FR-07 | Approvers approve or reject applications digitally. | `approver.controller`, `case.service` |
| FR-08 | Staff search, filter and manage reports. | `security.controller` (`queue`, `inventory`) |
| FR-09 | A digital inventory of found items. | `security.controller` (`inventory`) |
| FR-10 | Compare lost and found reports by category, description, location and date/time. | `matching.service` |
| FR-11 | A ranked match score for potential pairs. | `matching.service` |
| FR-12 | Show the main attributes behind a suggested match. | `matching.service`, `partials/match-card.ejs` |
| FR-13 | Notify relevant users of a potential match. | `notification.service`, `realtime.service` |
| FR-14 | Users submit a claim for a potential match. | `claim.service`, `claim.controller` |
| FR-15 | Tiered ownership verification: basic details first, then private or photo confirmation for high-value items. | `claim.service` |
| FR-16 | Record CCTV investigation notes. | `case.service` (`addNote`), `investigation.model`. From 1.7.0 the reporter can read the findings; camera details stay with staff |
| FR-17 | A unique QR code for an approved handover. | `handover.service`, `claim.controller` (`qr`) |
| FR-18 | Authorized staff scan the QR code and confirm the handover. | `handover.service`, `public/js/handover-scanner.js` |
| FR-19 | Store date, time, responsible staff member and case information for completed handovers. | `handover.service`, `models/handover.model.js` |
| FR-20 | Update the case status after handover and close the case. | `handover.service` |
| FR-21 | Analytics by category, location, status, recovery rate and resolution time. | `analytics.service`, `admin/analytics.ejs` |
| FR-22 | Administrators manage users, categories, locations and configuration. | `admin.controller`, `user.service`, `settings.service` |
| FR-23 | An audit trail of important case activities. | `audit.service` |
| FR-24 | Restrict sensitive item and claimant information from unauthorized users. | `case.service`, `tests/privacy.test.js` |
| FR-25 | Flag unclaimed items for review after a configurable retention period. | `retention.service` |
| NFR-01 | Common requests answer in about two seconds (excluding large uploads and heavy analytics). | Not measured |
| NFR-02 | Secure password hashing and role-based authorization. | bcrypt in `auth.service`; `middleware/auth.js` |
| NFR-03 | A first-time user submits a standard report in about three minutes without help. | Not measured with users |
| NFR-04 | Data stays consistent during reporting, approval, claim, verification and handover. | Service rules and `tests/lifecycle.test.js` |
| NFR-05 | Sensitive ownership and claimant information is not public. | `case.service`, `tests/privacy.test.js` |
| NFR-06 | Works on modern browsers including Chrome, Edge and Firefox. | Only headless Chromium was used |
| NFR-07 | Usable on desktop, tablet and mobile browsers. | Checked at 360 px in Chromium |
| NFR-08 | Modular code organization. | Section 5.3 |
| NFR-09 | Supports growth in users, reports and records. | Needs O-3 |
| NFR-10 | Important administrative actions are recorded with the user and a timestamp. | `audit.service` |

## Appendix B. Files by version

### Version 1.4.0 (against 1.3.2)

New (10): `controllers/idreview.controller.js`, `models/identityProof.model.js`, `services/identity.service.js`, `tests/idcard.test.js`, `views/admin/id-review.ejs`, `views/admin/id-reviews.ejs`, `views/auth/id-resubmit.ejs`, `views/auth/register-id.ejs`, `views/partials/register-fields.ejs`, `views/partials/register-tabs.ejs`.

Changed: `.env.example`, `README.md`, `app.js`, `config/index.js`, `config/nav.js`, `config/statuses.js`, `controllers/admin.controller.js`, `controllers/auth.controller.js`, `docs/CHANGELOG.md`, `docs/PROJECT_MEMORY.md`, `docs/SAFEFIND_MASTER_PROMPT.md`, `docs/schema.sql`, `locales/bn.json`, `locales/en.json`, `middleware/upload.js`, `middleware/viewHelpers.js`, `models/user.model.js`, `package-lock.json`, `package.json`, `public/css/style.css`, `routes/admin.routes.js`, `routes/auth.routes.js`, `scripts/collect-keys.js`, `scripts/smoke.js`, `services/auth.service.js`, `services/user.service.js`, `tests/assets.test.js`, `tests/schema.test.js`, `tests/unit.test.js`, `utils/images.js`, `validators/schemas.js`, `views/admin/dashboard.ejs`, `views/admin/users.ejs`, `views/auth/check-email.ejs`, `views/auth/login.ejs`, `views/auth/register.ejs`, `views/auth/verified.ejs`.

### Version 1.3.2 (against 1.3.1)

New (0): none.

Removed (2): `docs/design/hero-art.py`, `views/partials/hero-art.ejs`.

Changed (11): `README.md`, `docs/CHANGELOG.md`, `docs/PROJECT_MEMORY.md`, `locales/bn.json`, `locales/en.json`, `package-lock.json`, `package.json`, `public/css/style.css`, `scripts/browser-check.js`, `tests/ui.test.js`, `views/home.ejs`.

### Version 1.3.1 (against 1.3.0)

New (0): none.

Removed (1): `views/partials/spot.ejs`.

Changed (17): `README.md`, `docs/CHANGELOG.md`, `docs/PROJECT_MEMORY.md`, `docs/design/hero-art.py`, `locales/bn.json`, `locales/en.json`, `package-lock.json`, `package.json`, `public/css/style.css`, `public/js/site.js`, `scripts/browser-check.js`, `tests/ui.test.js`, `views/home.ejs`, `views/partials/bottom.ejs`, `views/partials/feed.ejs`, `views/partials/icons.ejs`, `views/partials/top.ejs`.

### Version 1.3.0

New (4): `docs/design/hero-art.py`, `public/js/home.js`, `views/partials/hero-art.ejs`, `views/partials/spot.ejs`.

Changed (16): `README.md`, `controllers/home.controller.js`, `docs/CHANGELOG.md`, `docs/PROJECT_MEMORY.md`, `locales/bn.json`, `locales/en.json`, `package-lock.json`, `package.json`, `public/css/style.css`, `scripts/browser-check.js`, `tests/assets.test.js`, `tests/ui.test.js`, `views/home.ejs`, `views/partials/bottom.ejs`, `views/partials/feed.ejs`, `views/partials/top.ejs`.

### Version 1.2.0

New (15): `public/js/dropzone.js`, `public/js/live-filter.js`, `public/js/realtime.js`, `public/js/wizard.js`, `scripts/browser-check.js`, `services/realtime.service.js`, `tests/images.test.js`, `tests/realtime.test.js`, `tests/ui.test.js`, `utils/progress.js`, `views/partials/browse-results.ejs`, `views/partials/dropzone.ejs`, `views/partials/empty.ejs`, `views/partials/list-results.ejs`, `views/partials/status-progress.ejs`.

Changed (57):
- Root: `.env.example`, `README.md`, `RUN_INSTRUCTIONS.txt`, `app.js`, `package-lock.json`, `package.json`.
- `config/index.js`; `utils/images.js`; `models/case.model.js`.
- Controllers: `_helpers.js`, `home.controller.js`, `items.controller.js`, `member.controller.js`, `security.controller.js`.
- Services: `case.service.js`, `claim.service.js`, `notification.service.js`, `user.service.js`.
- Middleware: `security.js`, `viewHelpers.js`.
- Docs: `docs/CHANGELOG.md`, `docs/DB_NOTES.md`, `docs/SAFEFIND_MASTER_PROMPT.md`.
- Locales: `en.json`, `bn.json` (40 keys added to each).
- Public: `css/style.css`, `js/site.js`, `js/theme-init.js`.
- Scripts and tests: `scripts/collect-keys.js`, `scripts/smoke.js`, `tests/assets.test.js`, `tests/helpers.js`.
- Views: `admin/audit.ejs`, `admin/users.ejs`, `auth/check-email.ejs`, `auth/login.ejs`, `browse.ejs`, `items/show.ejs`, `member/claim-form.ejs`, `member/claim.ejs`, `member/dashboard.ejs`, `member/notifications.ejs`, `member/report-form.ejs`, `member/track.ejs`, `partials/bottom.ejs`, `partials/case-list.ejs`, `partials/feed.ejs`, `partials/field.ejs`, `partials/flash.ejs`, `partials/icons.ejs`, `partials/textarea.ejs`, `partials/top.ejs`, `security/claims.ejs`, `security/intake.ejs`, `security/inventory.ejs`, `security/matches.ejs`, `security/queue.ejs`.

## Appendix C. Terms

- Case: one report, lost or found. Its reference looks like `SF-2026-0001`.
- Claim: a member's request to take a found item. A claim goes through tier 1 (details) and, for high-value categories, tier 2 (proof photo).
- Handover: the Security Cell gives the item to the verified claimant, using a signed single-use code that is shown as a QR code.
- Retention period: how long an unclaimed found item is held before staff are asked to decide (90 days by default).
- D1 to D16: defects found in the first draft. AUTH-1 to AUTH-7 and PUB-1 to PUB-6: testable rules for accounts and for the public board. Both are defined in `docs/SAFEFIND_MASTER_PROMPT.md`.
- FR and NFR: functional and non-functional requirements of the proposal (Appendix A).
