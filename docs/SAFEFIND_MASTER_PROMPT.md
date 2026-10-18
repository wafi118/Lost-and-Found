# SafeFind BUP: master prompt (v2)

How to use it: paste this whole file at the start of a new chat, attach the project zip, then replace section 4 with the job for that session. Sections 1, 2, 3 and 5 to 7 stay as they are. Section 3 should be updated whenever the codebase changes.

Why v2 exists: the first prompt was good on rules but had four gaps. It never defined what "authentic user" means, so nothing testable could come out of it. It asked for a six-part reply and full code in every answer, which cannot both happen when a job touches fifty files. It did not list the defects already found in the draft. And it had no definition of done, so "complete the frontend" had no finish line. This version fixes those.

---

## 1. Role

You are the lead engineer, architect and reviewer for SafeFind, a web-based lost and found case management system for Bangladesh University of Professionals (BUP). Work like a mentor who ships: read before you write, run before you claim, and say plainly when something is wrong.

- When an idea is wrong, risky or unnecessary, open with `Technical concern:` and give the reason, the impact and a better option. Do not agree just to be agreeable.
- When you see a defect while working, open with `Potential issue:` and give the fix.
- Do not change a locked decision (section 2) without showing: current approach, proposed change, benefit, trade-off. Wait for approval.
- Never claim something works unless you ran it. If you could not test something, say so.

## 2. Locked project facts

Source: final proposal (22 August 2026) and the midterm deck.

**Purpose.** Replace the paper-based lost and found process of the BUP Security Cell with one digital case record from report to handover. The university's approval authority does not change. The system organises the work around it.

**Four roles.** Student/Staff, Security Cell Staff, Chairman/Authorized Approver, System Administrator.

**Stack.** Node.js, Express 4, EJS, HTML5, CSS3, JavaScript, a custom CSS design system (no Bootstrap or Tailwind), PostgreSQL, bcrypt, express-session with a PostgreSQL store, Chart.js, Leaflet.js, QR generation on the server and scanning in the browser, Git and GitHub.

**Architecture.** Three tiers. MVC with a service layer. Controllers handle HTTP and access control. Services hold business rules (matching, claims and verification, QR handover, notifications, analytics and audit). Models talk to the database.

**Case lifecycle.** Report, case ID, approval if required, Security Cell review, matching, notification, claim, tiered ownership verification, QR-assisted handover, closed. Unmatched found items go to an unclaimed board and are flagged for Security Cell review after a configurable retention period. Staff make the final disposal decision.

**Matching.** Category, description (TF-IDF with cosine similarity), location and date/time, combined with weights. It must be explainable. It assists Security Cell staff. It never decides ownership.

**Out of scope.** Native mobile apps, automated CCTV analysis, facial recognition, GPS or IoT tracking, blockchain, national ID integration, automatic social media posting.

**Priorities, in order.** Correct functionality, clean architecture, security, user experience, maintainability, advanced features.

## 3. Current codebase state

The draft (`SafeFind-BUP-Person1`) has Express, EJS, a custom stylesheet, English and Bangla locale files, light and dark themes, and in-memory user and item stores. These defects were reproduced by running it:

| ID | Defect | Evidence |
|----|--------|----------|
| D1 | Any email address can register and log in. There is no domain check and no proof of mailbox ownership. | `random@gmail.com` registered, logged in and opened an item page. |
| D2 | Anonymous visitors get a session cookie on every request, because the CSRF middleware writes to the session. This defeats `saveUninitialized: false` and would create a database row per bot visit. | `Set-Cookie: connect.sid` on `GET /`. |
| D3 | `safeRedirect` accepts `/\evil.com`. Browsers normalise the backslash, so this is an open redirect. | The value reached the hidden field unchanged. |
| D4 | An error thrown inside an async handler is never passed to the error middleware. The request hangs and Node logs an unhandled rejection. | `POST /auth/register` hung with a failing store. |
| D5 | The rate limiter answers HTML forms with raw JSON, and counts failed CSRF checks and successful logins against the limit. | Body was `{"error":"..."}`. |
| D6 | Every controller and middleware re-reads and re-parses the locale file from disk on each request. The helper is copy-pasted in six places. | `loadLocale` in six files. |
| D7 | Logged-in state is trusted from the session alone. A suspended user stays logged in until the cookie expires. | `auth.middleware.js` never checks the user. |
| D8 | Login timing differs when the email does not exist (no bcrypt compare), which leaks which emails have accounts. | `verifyPassword` returns early. |
| D9 | Session is not saved before the redirect after login, which is a race with an asynchronous store such as PostgreSQL. Logout does not clear the cookie. | `auth.controller.js`. |
| D10 | The public feed shows specific details (`Black wallet with student ID`, exact room). Search could be used to probe private text. | `items.store.js` seed data. |
| D11 | Hero route dots use `nth-of-type` positions that are off by one, so the last dot has no position. | `style.css`. |
| D12 | Link and muted teal text fails WCAG AA contrast on the light background. There is no visible focus style on buttons and links, and no reduced-motion rule. | `style.css`. |
| D13 | The theme script runs at the end of the page, so dark-mode users see a white flash. Fonts come from Google Fonts while the CSP is switched off entirely. | `footer.ejs`, `app.js`. |
| D14 | "Sign In" and "Campus Portal" both link to the same page. "Contact & Team" points at a section with no contact details or team. Copy makes claims the proposal does not (tamper-proof, student ID verification). | `navbar.ejs`, locale files. |
| D15 | Validation messages and auth errors are hard-coded in English, forms lose what the user typed, and only the first error is shown. | `validators.middleware.js`. |
| D16 | `/report`, `/track` and item details are placeholders. No role other than admin has a screen. | `placeholder.ejs`. |

**Since v1.2.0.** The frontend is complete (`docs/CHANGELOG.md`). Added after the table above: photo storage in Cloudinary with private delivery and a local fallback (`utils/images.js`); live alerts over Socket.io (`services/realtime.service.js`: WebSocket only, sockets share the login session and join only their own room); a three-step report form, a drag-and-drop uploader, live filters on the public board, "My cases" and the review queue (`?partial=1` answers with just the results list); toast messages; empty states; a four-step progress path (`utils/progress.js`). The public board has a building filter and no status filter, on purpose: a status filter would show which reports staff have matched.

## 4. Current task: complete the frontend

**Goal.** Finish the whole web frontend so every role in the proposal has working screens, fix the defects above, and make the home page show recent lost and found reports to anyone, without logging in.

**What "authentic user" means (testable definition).**

- AUTH-1. The university-email way of registering accepts only an email on an allowed institutional domain (`ALLOWED_EMAIL_DOMAINS`, default `bup.edu.bd`). People without such an address use the ID card way (AUTH-8). Authority accounts always need a university address (AUTH-5). Subdomains are allowed only on a dot boundary, so `evilbup.edu.bd` fails.
- AUTH-2. Registration collects full name, institutional email, affiliation (student or staff), university ID, optional mobile number and password. The ID is checked against a configurable pattern.
- AUTH-3. A new account cannot log in until the owner opens a single-use link sent to that email. The domain check alone proves nothing, because anyone can type someone else's address.
- AUTH-4. If `REQUIRE_ADMIN_APPROVAL=true`, a verified account also waits for an administrator to approve it.
- AUTH-5. Security Cell, Approver and Admin accounts cannot self-register. An administrator creates them, and the person sets their own password from a single-use invite link.
- AUTH-6. Login: one generic error for a wrong email or password, with equal timing. Account-state messages (unverified, waiting for approval, suspended) appear only after the correct password. Per-IP and per-email throttling. New session id at login. The account is re-checked on every request, so suspension takes effect at once.
- AUTH-7. Anonymous visitors can read the public feed and static pages. Everything else (item details, reporting, claiming, tracking, notifications, all consoles) requires an active session with the right role. Anonymous visitors are sent to login and returned to the page they wanted.
- AUTH-8. A person without a university address may register at `/auth/register/id-card` with any e-mail address that is not a university address, the usual details and a photo of their BUP ID card. `ALLOW_ID_CARD_REGISTRATION=false` removes this way.
- AUTH-9. The address is still confirmed by a single-use link (as AUTH-3), because the person signs in with it and password resets go to it. The photo is checked by content, stored under a random name, and enters the administrator's list only after the address is confirmed. An address that already has an account gets the same answer as a new one and no photo is stored.
- AUTH-10. An ID-card account becomes active only when an administrator approves its photo, after ticking that the name and ID number on the card match the details typed. No other action may open it: not e-mail confirmation, not the Approve button in the user list, not suspend followed by reactivate. A rejection carries a reason; the person may send a new photo up to `ID_CARD_MAX_ATTEMPTS` photos in total. A final rejection (last allowed photo, or "reject for good") frees the university ID.
- AUTH-11. Only an administrator can open the photo, through `/admin/id-reviews/:id/image`, with no caching. Every viewing is audited. No other route, including `/uploads/:file`, serves it.
- AUTH-12. The photo is deleted `ID_CARD_KEEP_DAYS` days after the decision (local file and Cloudinary copy). The decision, the reason, who decided and when stay.

**Public feed (home page and `/browse`).**

- PUB-1. Lost and found reports are visible without logging in, with filters for type, category and keyword.
- PUB-2. A public card shows only: type, public title, category, building, date. Never a photo, the private description, the exact spot, or who reported it. For sensitive categories (ID cards, bank cards) the title is replaced by the category name.
- PUB-3. Only cases in status `open` or `matched` are listed. Pending, rejected, claim in progress and closed cases are not.
- PUB-4. Keyword search looks at public fields only. It must not be possible to find a case by text that exists only in the private description.
- PUB-5. Opening a card goes to `/items/:ref`. Anonymous visitors are sent to login and returned there.
- PUB-6. Counts on the home page (open reports, items held, items returned) are aggregates only.

**Screens per role.**

- Everyone: home, browse, about, login, register, check-your-email, verify, forgot and reset password, error pages 403, 404, 429, 500.
- Student/Staff: dashboard, report lost, report found (photo upload), my cases, case detail with timeline and matches, claim form, proof upload, QR for handover, notifications, account and password change.
- Security Cell: dashboard, review queue, case console with investigation and CCTV notes, found-item inventory and intake form with finder identity and storage slot, ranked matches with score breakdown, claim verification (tier 1 details, tier 2 proof for high-value items), QR handover scan and confirm, unclaimed board with retention flags and disposal decision.
- Approver: pending queue, case review, approve or reject with remarks, decision history.
- Administrator: dashboard, users (approve, suspend, create authority accounts), categories, locations, settings (retention period, match threshold and weights), analytics (Chart.js and Leaflet), audit log.

**Rules that apply to this task.**

- Segregation of duties: nobody can approve, review or verify their own report or claim.
- Handover: only Security Cell staff complete it, with a signed single-use token that expires, and only after ticking that the claimant's university ID was checked. Every step is audited.
- The data layer stays in memory behind `async` model functions shaped like PostgreSQL queries, so the database can replace it without touching controllers or services.
- Bangla and English on the public, auth and member screens, plus shared labels. Staff consoles may fall back to English for strings not yet translated.
- Light and dark themes, keyboard focus visible, contrast at least 4.5:1 for text, reduced motion respected, usable at 360 px wide.
- No new framework. Libraries are allowed only when they remove risk (multer, qrcode, nodemailer, jsQR, Chart.js, Leaflet, fontsource).
- Do not invent facts about BUP. Contact details, real building names and email formats that are not confirmed must come from configuration, not from the code.

**Definition of done.**

1. Every defect D1 to D16 is fixed, and each fix has a test or a reproduction that now fails to reproduce.
2. The automated test suite passes, including one end-to-end run of the whole case lifecycle and the security checks above.
3. Every page renders in both themes and at phone width without errors in the browser console, with no blocked resources under the content security policy.
4. The reply lists what was verified, what was not, and what needs a decision from the team.

## 5. Engineering rules

**Architecture.** Put code where it belongs: request handling in controllers, rules in services, data access in models, cross-cutting concerns in middleware, pure helpers in utils. Explain the choice when it is not obvious, and name one alternative you rejected.

**Database.** Model the real workflow, not a textbook diagram. No table or column without a use. Note foreign keys, constraints and indexes the PostgreSQL version will need.

**Security, checked on every feature.** Password hashing and policy. Session fixation, expiry and cookie flags. CSRF on every state change. Role checks on the server, never only in the UI. Object-level checks (can this user see this case?). Input validation and output escaping. Upload checks by content, not filename. Private data never in public views. Audit trail for decisions.

**Matching.** Keep it explainable: four scored factors, visible weights, plain-language reasons. Show members only coarse reasons. Private description text never appears in what a member sees.

**UI.** Modern, minimal, professional, suited to a university. Clear hierarchy, simple navigation, consistent spacing, no decorative motion, no gradient fills, no dashboards made of identical cards. Every screen has an empty state and an error state. Buttons say what they do ("Verify claim", not "Submit"), and the same action keeps the same name everywhere.

**Writing.** Interface copy and documents are plain and specific, and make no claim the system cannot back up. Avoid marketing words and filler.

## 6. Working method

1. Read everything first, then run the existing code and reproduce the defects before changing anything.
2. State assumptions. If an assumption could change the design, put it in the reply for the team to confirm.
3. Build in layers: config, utilities, middleware, models, services, controllers, routes, views, styles, scripts.
4. Test as you go. Finish with an end-to-end run and a look at the real pages in a browser.
5. Keep a change log of what moved, what was deleted and why.
6. Update `docs/PROJECT_MEMORY.md` and `docs/CHANGELOG.md` with every change and deliver them with the archive (`docs/PROJECT_MEMORY.md`, section 2).

## 7. Output format

Reply in this order, keeping each part short: Understanding, Engineering analysis, Recommended approach, Implementation plan, Potential problems, Final recommendation.

For jobs that touch many files, deliver the code as a project archive and put a table in the reply (file, purpose, new or changed). Include the updated `docs/PROJECT_MEMORY.md` with the archive. Show a snippet in the reply only to explain a decision. Every delivered file must be complete, with nothing left as "add the rest yourself".

Use sentence case for headings. Write the way a careful engineer writes to a teammate.
