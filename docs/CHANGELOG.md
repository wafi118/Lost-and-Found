# Changelog

## 1.7.1

The administrator dashboard no longer shows the note that account approval is switched off.

### Changed

- The empty "Accounts waiting for approval" panel is gone, including the `REQUIRE_ADMIN_APPROVAL` sentence. Recent activity stays. The pending count still opens Users. A line appears only when an ID card is actually waiting, or when approval is on and someone is waiting.

## 1.7.0

The person who reported a case can read Security Cell notes. Either side can send an update and attach a photo. Removing a note, an update or a photo leaves a line in the case history. Claims is in the personal menu and shows the QR.

### Added

- On a case, the reporter sees the notes. The camera name and the time window stay with Security Cell and the administrator.
- **Updates**, beside the notes. Security Cell and the reporter can write a message and attach a JPEG, PNG or WebP photo. The other side is notified.
- **Remove note**, **Remove update** and **Remove photo**. The text or the file is cleared. The case timeline says that a note, an update or a photo was removed.
- **Claims** (`/claims`) in the personal menu. A verified claim shows the QR code and the handover code there, and the claim page links back to this list.

### Changed

- `investigations.deleted_at` and the `case_updates` table are in `docs/schema.sql`. A database created before this version gets them the next time the app starts.

## 1.6.0

An administrator can correct an account and remove it. Security Cell staff and the administrator can see every case status in one list, and can look up handovers after they are finished.

### Added

- On Users, **Edit** changes the name, email, phone, role, student or staff, and language. The password and the ID number are shown and cannot be changed.
- **Delete** signs the person out, frees the email and the ID number for a new account, and keeps their reports. Deleted accounts are listed with the status filter "Deleted". The last active administrator cannot be deleted.
- **All cases** (`/security/records`) for Security Cell staff and the administrator: every report, with a status filter that includes all statuses.
- **Handover history** (`/security/handover/history`): completed, cancelled, open and expired handovers, without showing the code.

### Changed

- `users.deleted_at` is in `docs/schema.sql`. A database created before this version gets the column the next time the app starts.

## 1.5.0

The existing pages now read and write PostgreSQL. Restarting the server no longer drops cases, accounts or claims.

### Added

- `db/index.js` connects with `DATABASE_URL`, applies `docs/schema.sql` to an empty database, and keeps a transaction open for the models that need one.
- `database/safefind.sql` is a dump of the schema plus the demo data, so the same database can be restored on another PostgreSQL with `psql`.
- Failed-login counters live in `login_failures`, so a restart does not clear a lock.

### Changed

- Every file in `models/` uses the schema instead of the in-memory tables. Services and pages are unchanged.
- `npm test` applies the same schema to PGlite. It still does not need a database server.

## 1.4.0

Registration with an ID card photo, for students and staff who have no university e-mail address. They give any address they use (for example Gmail), send a photo of their BUP ID card, confirm the address, and an administrator checks the card. After approval they sign in with that address.

### Added

- A second registration form, `/auth/register/id-card`, reached by a tab on the registration page. Fields: the usual ones, any e-mail address that is not a university address, and the ID card photo (the existing uploader).
- `/admin/id-reviews`: the administrator's list (waiting, approved, rejected) and a review page that shows what the person typed next to the photo. Approving needs a tick: "I compared the name and the ID number on the card". Rejecting needs a reason (unreadable, name differs, ID number differs, not a BUP card, other with a note) and may be "for good".
- After a rejection the person gets an e-mail with the reason and a link to send a new photo. Signing in with the right password leads to the same page. At most `ID_CARD_MAX_ATTEMPTS` photos (3); a final rejection frees the university ID.
- The photo is private: only an administrator can open it (`/admin/id-reviews/:id/image`), every viewing is written to the audit log, it is never served by `/uploads/:file`, and it is deleted `ID_CARD_KEEP_DAYS` days (30) after the decision. The decision stays. `utils/images.deleteStored` removes the local and Cloudinary copies.
- Schema: `users.verification_method`, the table `identity_proofs`, and the token purpose `resubmit`.
- Settings: `ALLOW_ID_CARD_REGISTRATION`, `ID_CARD_MAX_ATTEMPTS`, `ID_CARD_KEEP_DAYS`.
- 32 new tests in all (15 in `tests/idcard.test.js`, 2 unit, the rest schema checks on PostgreSQL) and the new pages in the smoke and asset tests.

### Changed

- AUTH-1 is reworded and AUTH-8 to AUTH-12 are added (`docs/SAFEFIND_MASTER_PROMPT.md`). University e-mail registration works as before.
- Confirming the e-mail address never opens an ID-card account. The administrator's decision does.
- The admin "Approve" button, and suspend followed by reactivate, cannot open an ID-card account that has no approved photo.
- A photo enters the administrator's list only after the person confirmed the address.
- Registration fields moved to the partial `views/partials/register-fields.ejs`, shared by both forms.

### Fixed

- The review page first passed a variable named `user`, which replaced the signed-in user in the sidebar (it showed the applicant's name). Renamed to `applicant`; a test checks it.

Authority accounts (Security Cell, approver, administrator) still need a university address (AUTH-5).

## 1.3.2

The hero image is the concept's ticket diagram again. Version 1.3.1 had put a drawn Security Cell shelf in its place, which is not what the concept shows ("give an image on the side the way the HTML file shows").

### Changed

- The image beside the headline is the concept's diagram as drawn: a Lost ticket and a Found ticket, each with "Case code" and `SF-YYYY-NNNN`, a dashed bracket down to "Security Cell reviews and matches", then "Returned to the owner", and a caption. It uses the theme colours in light and dark, and its text comes from the language files (English and Bangla). The label read by screen readers is the concept's own sentence.
- The caption is the concept's sentence without the word "Illustration:", which was a note to the designer.
- On phones the two tickets stay side by side with smaller type (the concept has no rule for narrow screens, and at its sizes the code would be cut off).

### Fixed

- Bangla ticket labels no longer get the wide letter spacing meant for English capitals, which broke the joined letters.
- The tickets' placeholder lines are set with classes, not `style` attributes, which the content security policy blocks.

### Removed

- The drawn shelf (`views/partials/hero-art.ejs`), the script that drew it (`docs/design/hero-art.py`) and its styles.

## 1.3.1

The home page now follows the owner's concept (`safefind-home-concept-v5.html`) as drawn. Version 1.3.0 redesigned it instead and was rejected.

### Changed

- Home page rebuilt from the concept: the same sections in the same order, with its sizes, colours, spacing and wording. A script compared about 1,700 computed style values with the concept in a browser; 1,706 of 1,728 are identical in the light theme and 1,696 of 1,728 in the dark theme (the rest are structural, have no visual effect, or are the concept's own dark-mode bug).
- The image spot in the hero holds a drawing of a Security Cell shelf where every item carries a tag with its own case code, in place of the concept's small ticket diagram. It follows both themes. It is on the right, as in the concept. Replaced in 1.3.2 by the concept's ticket diagram.
- The header is the concept's, with the missing Lost and found link added. Five links do not fit beside the tools, so the BUP website link is in the footer, and below 1060 px the links fold into a menu button. On small phones Sign in, Create account and My workspace are in that menu.
- Board rows on the home page and on `/browse` are the original rows again; only the home page lays them out as one column.
- Real data in place of the concept's placeholders: the three figures, the board rows, links to the real pages, and signed-in versions of the header, the follow card and the sign-up band.
- The concept's wording is kept, including the label "Today" and the sentence under "Who can use it".

### Fixed

- The sentence under the board and the "Private by default" text said the board shows only the type, category, building and date. A card also shows a short title; both sentences now say so, in English and Bangla.
- The concept's contact placeholder mentioned the "site configuration". The page shows "No contact details have been set up yet." until contact details are configured.
- In the concept, the third tile keeps light colours in dark mode when the theme comes from the system setting. Fixed.
- The "Who can use it" band touched the section above it; it now has space.
- The signed-in home page was 39 px too wide on a 360 px phone because "My workspace" did not fit beside the other header buttons.
- Left out of the concept on purpose: the preview banner, the in-browser translation and `localStorage` code (the application translates on the server), the Google Fonts link (the fonts come from this server) and inline `style` attributes (the policy blocks them).

### Removed

- From 1.3.0: the case stubs, the register-style board rows, the drawn feature pictures (`views/partials/spot.ejs`), the ledger line, the restyled step panel and footer links added for 1.3.0.

## 1.3.0

Replaced by 1.3.1. The owner rejected this redesign because it changed the page far beyond what was asked.

### Added

- A new home page, built from the owner's concept (`safefind-home-concept-v5.html`) and fitted to the real application. A drawn Security Cell shelf where every item carries a case tag; three case stubs for the main actions (lost, found, follow my case); the board as a register with a ledger line of three figures; the campus photograph; "How it works" as a four-step panel; four features with small drawings; a before-and-after table; who can sign in; the project team, supervisors and Security Cell contact.
- The header gets the missing Lost and found link and now has five links: Lost and found, How it works, Features, About, Contact and team. On the home page the link of the section you are in is marked while you scroll, and a thin line under the header shows how far you have read (`public/js/home.js`).
- A bar with the two reporting actions at the bottom of the screen on phones.
- `docs/design/hero-art.py`, the script that draws the illustrations (`views/partials/hero-art.ejs`, `views/partials/spot.ejs`). Colours and line styles are classes in the stylesheet, so the drawings follow the light and dark themes.
- 60 locale keys in English and Bangla; 9 unused ones removed.
- Tests: five in `tests/ui.test.js`, one more assertion in `tests/assets.test.js`, eight real-browser checks, and the home page in the contrast scan.

### Changed

- The board list on the home page and on `/browse` is a register: a stamp for the type, the title with the category beneath it, the building, the date. Markup in `views/partials/feed.ejs`.
- The "How it works" steps use the names of the progress path on the case page (Reported, Under review, Approved, Handed over), so the home page and My cases say the same words. With scripts, one step is shown at a time; without them, all four are written out in order.
- On phones the header scrolls away instead of staying fixed, and the figures are three ledger lines.
- Below 1100 px the header's Create account button steps aside (the home page offers it twice more).
- The BUP website link moved from the concept's header to the footer.

### Fixed

- The sentence under the board said it shows only the type, category, building and date. A public card also shows a short title (the category replaces it for identity and bank cards). The sentence now says so, in English and Bangla.
- The dark logo was drawn, invisibly, beside the real one in the light theme and took 113 px of the header (the rule `.brand img` with `display: block` beat `.logo-dark` with `display: none`). It stayed unnoticed while the header had three links.
- Left out of the concept on purpose: its preview banner, its in-browser translation and `localStorage` code (the application translates on the server), the Google Fonts link (the fonts are served from this server), inline `style` attributes (the policy blocks them), the contact text that mentioned "site configuration", and the column label "Today" (now "Paper process").

## 1.2.1

### Added

- `docs/PROJECT_MEMORY.md`: the memory of the project. What it is, how the owner wants the work done, the current state, the decisions and their reasons, the open items, the verification record and the history of every version, so the work can continue with another assistant or account without re-explaining anything. Every change updates it and ships with it.
- `tests/records.test.js`: fails when the version in `package.json`, the newest history entry in `PROJECT_MEMORY.md` and the top entry of this file disagree.

### Changed

- The README and the master prompt mention the record and the rule. The application code is unchanged from 1.2.0.

### Fixed

- `package-lock.json` still said version 1.1.0 while `package.json` said 1.2.0. Both say 1.2.1 now.
- Removed an empty folder named `views/{partials,auth,errors,items,member,security,approver,admin}`, left by a mistyped `mkdir`.

## 1.2.0

### Added

| Area | What it does now |
|---|---|
| Photo uploader | One component (`partials/dropzone.ejs`, `public/js/dropzone.js`) on the report form, the Security Cell intake form and the claim proof forms. Drag a photo or choose a file, see it at once, remove it. Type and size are checked in the browser for convenience; the server still checks the real content and the size limit (`MAX_UPLOAD_MB`, shown to the browser from the same setting). Messages follow the page language. |
| Report in three steps | Item details, place and time, photo and review (`member/report-form.ejs`, `public/js/wizard.js`). Each step is checked before the next, every message appears next to its field, Back keeps what you typed, and the last step lists what you entered. When the server refuses a form, it comes back on the step that has the problem. Without JavaScript the form is one long page. |
| Live filters | The public board, "My cases" and the Security Cell review queue update as you type or choose, without reloading. `?partial=1` on the same address answers with just the results list, rendered by the same templates and rules as the full page. The address bar follows the filters, so a filtered view can be shared. The public board also filters by building. |
| Toast messages | The flash banner becomes a floating message that goes away after 3.5 seconds, pauses while the pointer or keyboard focus is on it, and has a close button. Success, error, warning and information look different. With JavaScript off, or if the script fails to load, the original banner is shown. |
| Empty states | One component (`partials/empty.ejs`): an icon, a heading, one sentence and, when there is something to do, one button. Used in eight lists that had a plain line of text. |
| Progress path | Reported, under review, approved, handed over (`utils/progress.js`). Shown on the case page and as a small bar in "My cases". A rejected, withdrawn or disposed case stops at the step it reached and says why. |
| Photos in Cloudinary | Set `CLOUDINARY_*` (or `CLOUDINARY_URL`) and photos are stored there with private delivery. Without it they stay in `UPLOAD_DIR`. Pages never contain a Cloudinary address: `/uploads/:file` checks who may see the case, then fetches the image with a signed address that lasts one minute and passes it on. Photos saved locally before the switch keep working. |
| Live alerts | A notification that is stored is also pushed to the person's open pages over Socket.io, as a message and a new count on the bell (`services/realtime.service.js`, `public/js/realtime.js`). `REALTIME=false` switches it off. |

### Decisions

| Question | Choice | Why |
|---|---|---|
| Use `multer-storage-cloudinary`? | No. Memory upload, content check, then the Cloudinary SDK. | The existing pipeline checks the file's first bytes before anything is stored, and the package would have uploaded first. It also needs the old 1.x SDK. |
| Public or private Cloudinary delivery? | Private (`type: authenticated`). | Photos may show ID cards. A public address would let anyone with the link see the image, and it would also need a Cloudinary host in the Content-Security-Policy. |
| WebSocket or long polling? | WebSocket only. | Each polling request would read the session store (PostgreSQL in production). If WebSocket is blocked, nothing is lost: notifications are stored. |
| Status filter on the public board? | Not added. | The board lists only open and matched reports (PUB-3). A "matched" filter would show which ones staff have linked. A building filter shows what the card already shows (PUB-2). |

### Found and fixed while building it

- The step form cleared a field's message whenever you typed. It also cleared the uploader's own error and its red border, because both reacted to the same event. The step form now leaves the uploader alone.
- The "not in the future" limit in the report form is printed when the page is built. Left open for a few minutes, a form would refuse a time that was no longer in the future. The step form now moves the limit to the current Bangladesh time before each check.
- The review line "Photo" did not follow the photo being added or removed.
- Two more banners that are really messages (sign-out on the login page, "link sent again") were not part of the toast change. They are now.
- The alert colours were a text pattern on the notification key. They are an explicit list now, so a new key cannot change colour by accident.

### Not tested

A real Cloudinary account (the SDK upload and the signed download are replaced by stand-ins in `tests/images.test.js`), WebSocket through a real reverse proxy, Safari and Firefox, a real phone camera, drag and drop with a touch screen.

## 1.1.0

### Fixed from the first draft (D1 to D16)

| # | Problem in the draft | What it does now |
|---|---|---|
| D1 | Any e-mail address could register and sign in | Only addresses on the allowed university domains can register, and the mailbox must be confirmed with a single-use link. Staff, approver and administrator accounts are created by an administrator invitation. |
| D2 | A visit to the home page set a cookie | Public pages never touch the session; an anonymous visitor receives no cookie. |
| D3 | Open redirect through `/\evil.com` after sign-in | One `safeRedirect` helper accepts local paths only. |
| D4 | An error inside an async handler left the request hanging | Every handler is wrapped; failures end in a 500 page. |
| D5 | The rate limiter answered HTML forms with JSON and counted forged requests and successful sign-ins | Forms get a readable 429 page, scripts get JSON, successful sign-ins are not counted, and the check runs after the CSRF check. |
| D6 | The locale loader was copied six times and read the disk on every request | One cached i18n module with English fallback. |
| D7 | Suspending an account did not end its session | The account is re-checked on every request. |
| D8 | Sign-in timing revealed whether an address had an account | One generic error, with comparable timing for unknown addresses. |
| D9 | The session was not saved before the redirect; sign-out kept the cookie | The session id changes at sign-in, is saved before redirecting, and sign-out clears the cookie. |
| D10 | The public list exposed specifics of each report | The public board shows type, public title, category, building, date and status. Titles in sensitive categories are replaced by the category name, and search runs on those public fields only. |
| D11 | Off-by-one in the hero route dots | The hero was redesigned and no longer has them. |
| D12 | Teal text failed AA contrast; no focus styles; no reduced-motion support | Darker text tokens, visible focus rings and a reduced-motion rule. A computed-contrast scan of 198 page loads in both themes found no failures. |
| D13 | Theme script at the end of the page (dark flash); Google Fonts under a disabled CSP | The theme script runs in `<head>`; fonts and map/chart libraries are served from the app; a strict CSP is on (no inline scripts or styles). |
| D14 | Duplicate sign-in links, an empty "Contact & Team" block, copy that overclaimed | Links and copy rewritten. The site says it confirms control of a university mailbox, not enrolment. |
| D15 | Validation messages hard-coded in English, only the first error shown, forms lost what was typed | One validation engine with locale keys; all errors are shown and the input is kept. |
| D16 | `/report`, `/track` and the item page were placeholders; no screens for non-admin roles | The complete workflow for members, Security Cell staff, the approver and the administrator. |

### Added

A PostgreSQL schema (`docs/schema.sql`, tested on a real engine) with notes for writing the models. Reporting with photos, approval for categories that need it, a found-item inventory, explainable matching (category, TF-IDF cosine similarity of the description, location, time; weights set by the administrator), claims with tiered ownership checks, signed single-use QR handover with an ID-check step, unclaimed-item flagging, notifications, analytics with charts and a hotspot map, an audit trail, English and Bangla.

### Found and fixed during the final checks

- `npm test` failed on Node 22 (`node --test tests/` is not accepted). The script is now `node --test`.
- Page scripts never loaded. Three views passed `scripts` to the top include only, so the QR scanner, the report-form hint and the analytics charts and map did nothing. Each view now declares its assets once and passes them to both includes. A test covers it.
- The `hidden` attribute lost to `display: flex`, so the "needs approval" note showed on every report form and "Stop camera" showed before the camera started. A global `[hidden]` rule fixes it.
- On a 360 px screen the dashboard and Security overview were 574 px and 495 px wide: single-column grids used `1fr` instead of `minmax(0, 1fr)`.
- Two forms on the claim page shared the element id `f-reason`.
- Staff and administrators could claim items by posting directly, because the rule existed only as a hidden button. It is now enforced in the claim service.
- A rejected handover code answered 200 on lookup but 400 on completion. Both answer 400.
- The public search failed open if a caller left out its list of searchable categories. It now fails closed.
- The global rate limit (600 requests per 15 minutes per address) would lock out a whole campus behind one shared address. It is now configurable and defaults to 3000.
- Removed three unused files and an unused helper that threw on a malformed `Referer` header.
- `npm audit` reported 4 vulnerabilities (3 high, 1 critical) in production dependencies. Upgraded `nodemailer` 6.10 to 10.0 and `bcrypt` 5.1 to 6.0; `npm audit` now reports none. A hash made by bcrypt 5 still verifies under bcrypt 6, and a new test covers sending mail through SMTP.
- `nodemailer` 10 needs Node 20 or newer, so the `engines` field now says `>=20`.
