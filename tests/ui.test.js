'use strict';
// Enhancements: live filters, steps on the report form, toast hook, empty states, progress path.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, Client, signedIn } = require('./helpers');
const { progressFor } = require('../utils/progress');
const { CASE } = require('../config/statuses');

const count = (html) => Number((/data-count="(\d+)"/.exec(html) || [])[1]);
const titles = (html) => [...html.matchAll(/<span class="feed-title">([^<]*)<\/span>/g)].map((m) => m[1]);

test('progress path: every real status lands on the right step', () => {
  const states = (c) => progressFor(c).steps.map((s) => s.state).join(' ');
  assert.equal(states({ status: CASE.PENDING_APPROVAL }), 'complete current upcoming upcoming');
  assert.equal(states({ status: CASE.UNDER_REVIEW }), 'complete current upcoming upcoming');
  for (const status of [CASE.OPEN, CASE.MATCHED, CASE.CLAIM_PENDING]) assert.equal(states({ status }), 'complete complete current upcoming', status);
  assert.equal(states({ status: CASE.READY }), 'complete complete complete current');
  assert.equal(states({ status: CASE.CLOSED, closeReason: 'returned' }), 'complete complete complete complete');
  assert.equal(states({ status: CASE.CLOSED, closeReason: 'recovered' }), 'complete complete complete complete');
  assert.equal(states({ status: CASE.REJECTED }), 'complete stopped upcoming upcoming');
  assert.equal(states({ status: CASE.DISPOSED }), 'complete complete complete stopped');
  // withdrawn: stops at review if the Security Cell never accepted it, otherwise at the last step
  assert.equal(states({ status: CASE.CLOSED, closeReason: 'withdrawn' }), 'complete stopped upcoming upcoming');
  assert.equal(states({ status: CASE.CLOSED, closeReason: 'withdrawn', review: { decision: 'accepted' } }), 'complete complete complete stopped');
  // an unknown status never breaks a page
  assert.equal(states({ status: 'something_new' }), 'current upcoming upcoming upcoming');
  assert.equal(progressFor({ status: 'something_new' }).detailKey, null);
  // the terminal reason is shown in place of the step it never reached
  assert.equal(progressFor({ status: CASE.REJECTED }).steps[1].key, 'status_rejected');
  assert.equal(progressFor({ status: CASE.CLOSED, closeReason: 'withdrawn' }).steps[1].key, 'close_withdrawn');
});

test('the progress path is on the case page for the owner and staff, never for a public viewer', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const owner = await signedIn(srv.base, 'student'); // owns SF-2026-0001 (claim_pending)
  const page = (await owner.get('/items/SF-2026-0001')).text;
  assert.equal((page.match(/<li class="progress-step/g) || []).length, 4);
  assert.match(page, /progress-step is-complete/);
  assert.match(page, /aria-current="step"/);
  assert.ok(page.includes('Claim being checked'), 'the finer status is shown for the step in progress');
  assert.ok((await (await signedIn(srv.base, 'security')).get('/items/SF-2026-0001')).text.includes('progress-steps'));
  // another member looking at somebody else's open found item gets the limited view: no progress path
  const other = await signedIn(srv.base, 'student2');
  const viewer = (await other.get('/items/SF-2026-0009')).text;
  assert.ok(!viewer.includes('progress-steps'));
  // "My cases" shows the small bar for each row
  const mine = (await owner.get('/track')).text;
  assert.ok(/class="mini-progress" role="img" aria-label="Step \d of 4: /.test(mine));
});

test('the public board can be filtered by building, and the results list can be fetched on its own', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const anon = new Client(srv.base);
  const full = await anon.get('/browse');
  assert.equal(full.status, 200);
  assert.deepEqual(anon.cookies.size, 0, 'a visitor who only reads the board gets no cookie');
  assert.match(full.text, /data-live-filter="#browse-results"/);
  assert.match(full.text, /<option value="Library"/);
  const total = count(full.text);

  const part = await anon.get('/browse?partial=1');
  assert.equal(part.status, 200);
  assert.ok(!part.text.includes('<html') && !part.text.includes('filters'), 'a fragment, not a page');
  assert.equal(part.headers.get('cache-control'), 'no-store');
  assert.equal(count(part.text), total);
  assert.equal(anon.cookies.size, 0);

  const library = await anon.get('/browse?partial=1&building=Library');
  assert.ok(count(library.text) > 0 && count(library.text) < total);
  assert.ok(/Library/.test(library.text) && !/Cafeteria/.test(library.text));
  // an unknown building is ignored, not an error and not an empty page
  assert.equal(count((await anon.get('/browse?partial=1&building=Nowhere')).text), total);
  assert.equal(count((await anon.get('/browse?partial=1&building[]=Library&building[x]=y')).text), total);
  // filters combine, and the page URL and the fragment agree
  const both = await anon.get('/browse?partial=1&building=Library&type=found');
  assert.ok(count(both.text) > 0 && count(both.text) <= count(library.text));
  assert.equal(count((await anon.get('/browse?building=Library&type=found')).text), count(both.text));
  assert.match((await anon.get('/browse?building=Library')).text, /<option value="Library" selected>/);
});

test('live results keep the privacy rules of the public board (PUB-2 to PUB-4)', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const anon = new Client(srv.base);
  const html = (await anon.get('/browse?partial=1')).text;
  // the ID-card report (sensitive category) shows the category, not its title, and never a photo or a spot
  assert.ok(html.includes('Details are private'));
  assert.ok(!/<img|\/uploads\//.test(html));
  // a word that only exists in a private description finds nothing, in the fragment as on the page
  const probe = await anon.get('/browse?partial=1&q=' + encodeURIComponent('analogue'));
  assert.equal(count(probe.text), 0);
  assert.match(probe.text, /class="empty"/);
  assert.match(probe.text, /data-live-reset/, 'an empty filtered result offers to clear the filters');
  // statuses other than open and matched never appear
  assert.ok(!/pending_approval|Waiting for approval|under_review/.test(html));
});

test('"My cases" and the review queue filter live too, and answer with the same list', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const student = await signedIn(srv.base, 'student');
  const full = await student.get('/track?type=lost');
  const part = await student.get('/track?type=lost&partial=1');
  assert.equal(part.status, 200);
  assert.ok(!part.text.includes('<html'));
  assert.equal(count(part.text), count(full.text));
  assert.ok(part.text.includes('mini-progress'));
  assert.match(full.text, /data-live-filter="#track-results"/);

  const staff = await signedIn(srv.base, 'security');
  const q = await staff.get('/security/queue?status=open&partial=1');
  assert.equal(q.status, 200);
  assert.ok(!q.text.includes('<html') && count(q.text) > 0);
  assert.equal(count((await staff.get('/security/queue?status=open')).text), count(q.text));
  // a student cannot use the fragment to read the staff queue
  assert.equal((await student.get('/security/queue?status=open&partial=1')).status, 403);
  assert.equal((await new Client(srv.base).get('/track?partial=1')).status, 302);
});

test('empty states explain what to do next', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const staff = await signedIn(srv.base, 'security');
  const none = (await staff.get('/security/queue?status=rejected&partial=1')).text;
  assert.match(none, /class="empty"/);
  assert.match(none, /empty-art/);
  const filtered = (await staff.get('/security/queue?status=rejected&type=lost&partial=1')).text;
  assert.match(filtered, /Clear filters/);
  const student = await signedIn(srv.base, 'student');
  const noMatch = (await student.get('/track?status=disposed&partial=1')).text;
  assert.match(noMatch, /Clear filters/);
  const claims = (await staff.get('/security/claims?tab=closed')).text;
  assert.ok(/class="empty"/.test(claims) || /<table/.test(claims));
});

test('the flash banner carries the hook the toast script looks for, in both languages', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const c = await signedIn(srv.base, 'student');
  const r = await c.post('/items/SF-2026-0008/withdraw', {}, { from: '/items/SF-2026-0008' });
  assert.equal(r.status, 302);
  const page = (await c.get(r.location)).text;
  assert.match(page, /class="flash flash-success"[^>]*data-flash data-type="success"/);
  assert.match(page, /Report withdrawn\./);
  // the sign-out message on the login page is a transient message too, so it carries the hook as well
  assert.match((await new Client(srv.base).get('/auth/login?out=1')).text, /class="flash flash-success" data-flash data-type="success"/);
  // a page without a message has no banner at all
  assert.ok(!(await c.get('/dashboard')).text.includes('data-flash'));
  // the page declares itself script-enabled before painting, which hides the banner until it becomes a toast
  const theme = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'js', 'theme-init.js'), 'utf8');
  assert.match(theme, /classList\.add\('js'\)/);
  const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'css', 'style.css'), 'utf8');
  assert.match(css, /\.js \[data-flash\]/);
  // Bangla pages carry the Bangla labels the scripts read
  const bn = new Client(srv.base);
  await bn.get('/lang/bn?next=/');
  const bnPage = (await bn.get('/browse')).text;
  assert.match(bnPage, /data-close-label="বন্ধ করুন"/);
  assert.match(bnPage, /ভবন/);
});

test('report form: three steps, the uploader, and the right step reopens after a server error', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const c = await signedIn(srv.base, 'student');
  const page = (await c.get('/report')).text;
  assert.equal((page.match(/data-step data-title=/g) || []).length, 3);
  assert.equal((page.match(/data-step-goto=/g) || []).length, 3);
  assert.equal((page.match(/data-dropzone/g) || []).length, 1);
  assert.match(page, /data-start-step="1"/);
  // the submit button is present without JavaScript, and the three steps are one form
  assert.match(page, /<button class="btn btn-primary" type="submit" data-wizard-submit>/);
  assert.equal((page.match(/<form [^>]*data-wizard/g) || []).length, 1);
  assert.ok(!/<script[^>]*>[^<]/.test(page), 'no inline script (the CSP forbids it)');
  assert.match(page, /\/report\?_csrf=/, 'upload forms keep the token in the query string');

  const good = { type: 'lost', title: 'Blue umbrella', categoryId: 1, locationId: 1, description: 'A blue folding umbrella with a wooden handle', occurredAt: '' };
  const withErrors = async (extra) => (await c.multipart('/report', { ...good, occurredAt: new Date(Date.now() + 6 * 3600e3 - 3600e3).toISOString().slice(0, 16), ...extra }, null, { from: '/report' }));
  // a problem in step 2 (no place) reopens step 2
  const noPlace = await withErrors({ locationId: '' });
  assert.equal(noPlace.status, 400);
  assert.match(noPlace.text, /data-start-step="2"/);
  assert.match(noPlace.text, /value="Blue umbrella"/, 'what was typed is kept');
  // a problem in step 1 (title too short) reopens step 1
  assert.match((await withErrors({ title: 'x' })).text, /data-start-step="1"/);
  // a bad photo reopens the photo step
  const badPhoto = await c.multipart('/report', { ...good, occurredAt: new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 16) }, { field: 'photo', buffer: Buffer.from('not an image at all'), name: 'x.png', type: 'image/png' }, { from: '/report' });
  assert.equal(badPhoto.status, 400);
  assert.match(badPhoto.text, /data-start-step="3"/);
});

test('the uploader is on the intake and claim forms, with the limit from configuration', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const staff = await signedIn(srv.base, 'security');
  const intake = (await staff.get('/security/intake')).text;
  assert.match(intake, /data-dropzone data-max-bytes="3145728"/);
  assert.match(intake, /name="photo"/);
  const student = await signedIn(srv.base, 'student');
  const claim = (await student.get('/items/SF-2026-0009/claim')).text;
  assert.match(claim, /data-dropzone/);
  assert.match(claim, /name="proof"/);
  // every message the script shows comes from the server in the page language
  for (const attr of ['data-msg-type', 'data-msg-size', 'data-msg-read', 'data-msg-multi', 'data-msg-nodnd']) assert.ok(intake.includes(attr), attr);
});

test('the empty state of a list says what to do next, and only offers a button when there is something to press', async () => {
  const app = require('../app').build();
  const render = (view, data) => new Promise((resolve, reject) => {
    const res = { locals: {} };
    require('../middleware/locale')({ cookies: {} }, res, () => {});
    require('../middleware/viewHelpers')({ lang: 'en', path: '/', originalUrl: '/' }, res, () => {});
    app.render(view, { ...res.locals, ...data }, (err, html) => (err ? reject(err) : resolve(html)));
  });
  const mine = await render('partials/case-list', { rows: [], base: '/items/', emptyKind: 'mine' });
  assert.match(mine, /You have not reported anything yet/);
  assert.match(mine, /href="\/report"/);
  assert.match(mine, /empty-art/);
  const staff = await render('partials/case-list', { rows: [], base: '/security/cases/', emptyKind: 'staff' });
  assert.match(staff, /Nothing to show/);
  assert.ok(!/<a class="btn/.test(staff), 'no button when there is nothing to do');
  const filtered = await render('partials/case-list', { rows: [], base: '/security/cases/', filtered: true, clearHref: '/security/queue' });
  assert.match(filtered, /Nothing matches these filters/);
  assert.match(filtered, /href="\/security\/queue" data-live-reset/);
  const bn = await new Promise((resolve, reject) => {
    const res = { locals: {} };
    require('../middleware/locale')({ cookies: { lang: 'bn' } }, res, () => {});
    require('../middleware/viewHelpers')({ lang: 'bn', path: '/', originalUrl: '/' }, res, () => {});
    app.render('partials/case-list', { ...res.locals, rows: [], base: '/items/', emptyKind: 'mine' }, (err, html) => (err ? reject(err) : resolve(html)));
  });
  assert.match(bn, /আপনি এখনো কিছু রিপোর্ট করেননি/);
});

// ---------------------------------------------------------------- home page (1.3.1)
const homeOf = async (srv, who, lang) => {
  const c = who ? await signedIn(srv.base, who) : new Client(srv.base);
  if (lang) c.cookies.set('lang', lang);
  return (await c.get('/')).text;
};

test('home page: the header has the five links with Lost and found first, and every page or section they point to exists', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const html = await homeOf(srv);
  const nav = /<nav class="nav-links"[^>]*>([\s\S]*?)<\/nav>/.exec(html)[1];
  const links = [...nav.matchAll(/<a href="([^"]+)"[^>]*>([^<]*)<\/a>/g)].map((m) => [m[1], m[2].replace(/&amp;/g, '&')]);
  assert.deepEqual(links, [['/browse', 'Lost and found'], ['/#how', 'How it works'], ['/#features', 'Features'], ['/about', 'About'], ['/#contact', 'Contact & Team']]);
  for (const id of ['board', 'how', 'features', 'why', 'who', 'contact']) assert.ok(html.includes(`id="${id}"`), `the #${id} section exists`);
  assert.match(nav, /class="nav-extra" href="\/auth\/login"/, 'on small phones Sign in sits inside the menu');
  assert.match(await homeOf(srv, null, 'bn'), /<nav class="nav-links"[\s\S]*?হারানো ও প্রাপ্ত[\s\S]*?<\/nav>/);
  // the other public pages carry the same header and mark their own link as the current page
  const c = new Client(srv.base);
  assert.match((await c.get('/browse')).text, /<a href="\/browse" aria-current="page">Lost and found<\/a>/);
  assert.match((await c.get('/about')).text, /<a href="\/about" aria-current="page">About<\/a>/);
});

test('home page: the concept\'s own wording and sections, one heading, no style attributes, and a board sentence that is true', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const html = await homeOf(srv);
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
  assert.ok(!/ style=/.test(html), 'a style attribute would be blocked by the content security policy');
  assert.match(html, /<span class="hp-ul">on campus\?<svg/);
  const art = /<figure class="hp-vis">([\s\S]*?)<\/figure>/.exec(html)[1];
  assert.match(art, /<div class="hp-vis-art" role="img" aria-label="Lost and found reports each become a case, reviewed by the Security Cell and returned to the owner\."/);
  assert.equal((art.match(/<div class="hp-tk[ "]/g) || []).length, 2, 'a Lost ticket and a Found ticket');
  assert.equal((art.match(/<code>SF-YYYY-NNNN<\/code>/g) || []).length, 2, 'each ticket shows the code format, not an invented number');
  assert.ok(art.includes('Security Cell reviews and matches') && art.includes('Returned to the owner') && art.includes('Every report becomes a case with its own code.'));
  assert.ok(!/<svg class="il"/.test(html), 'no drawn shelf');
  for (const text of ['Lost or found something', 'Today', 'With SafeFind', 'Who can use it', 'Built around the Security Cell workflow', 'From paper applications to one case record']) assert.ok(html.includes(text), text);
  // a public card also shows a short title (the category replaces it for identity and bank cards); the page must say so
  assert.ok(html.includes('The board shows the type, a short title, the category, the building and the date'));
  assert.ok(html.includes('The public board shows the type, a short title, the category, the building and the date'));
  assert.ok(!html.includes('shows only the type, category, building and date'));
  assert.ok(titles(html).length > 0);
  assert.equal((html.match(/<span class="stat-num">/g) || []).length, 3);
  // one logo is drawn: the dark one is hidden by a rule that wins over `.brand img`
  assert.match((await new Client(srv.base).get('/css/style.css')).text, /\.brand \.logo-dark \{ display: none; \}/);
});

test('home page: all four steps are written out in order, so they read without scripts; the strip starts on step 1', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const html = await homeOf(srv);
  const panels = [...html.matchAll(/<div class="how-panel( is-active)?" role="tabpanel" id="how-panel-(\d)"/g)];
  assert.deepEqual(panels.map((m) => m[2]), ['1', '2', '3', '4']);
  assert.equal(panels.filter((m) => m[1]).length, 1, 'only the first panel starts active');
  assert.equal((html.match(/role="tab"/g) || []).length, 4);
  assert.match(html, /id="how-tab-1"[^>]*aria-selected="true"/);
  for (const name of ['Reported', 'Under review', 'Approved', 'Handed over']) assert.ok(html.includes(`<span class="how-name">${name}</span>`), name);
  for (const text of ['You get a case code', 'Security Cell staff are notified', 'Some categories need the authorized approver', 'matching has started', 'Staff decide whether a match is real', 'check your ID card']) assert.ok(html.includes(text), text);
  // the step names are the ones the case page uses, so the home page and My cases say the same words
  const { STEPS } = require('../utils/progress');
  const en = require('../locales/en.json');
  assert.deepEqual(STEPS.map((k) => en[k]), ['Reported', 'Under review', 'Approved', 'Handed over']);
});

test('home page: a signed-in member sees My cases and Report an item in place of Sign in and Create account', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const anon = await homeOf(srv);
  const followOf = (h) => /<aside class="follow"[\s\S]*?<\/aside>/.exec(h)[0];
  const whoOf = (h) => /id="who"[\s\S]*?<\/section>/.exec(h)[0];
  assert.ok(followOf(anon).includes('Sign in') && followOf(anon).includes('Create account'));
  assert.ok(whoOf(anon).includes('Create account'));
  const member = await homeOf(srv, 'student');
  assert.ok(followOf(member).includes('My cases') && !/Sign in|Create account/.test(followOf(member)));
  assert.ok(whoOf(member).includes('Report an item') && !whoOf(member).includes('Create account'));
  assert.ok(member.includes('My workspace'));
});

test('home page: team, supervisors and contact come from configuration, and the BUP website link is in the footer', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const html = await homeOf(srv);
  const team = require('../config/team');
  for (const name of [...team.students, ...team.supervisors.map((s) => s.name)]) assert.ok(html.includes(name), name);
  assert.ok(html.includes(team.cohort));
  assert.ok(html.includes('No contact details have been set up yet.') || html.includes('<dl class="kv">'));
  assert.ok(!html.includes('site configuration'), 'internal wording does not belong on a public page');
  assert.match(html, /<footer class="site-footer">[\s\S]*href="https:\/\/www\.bup\.edu\.bd"[\s\S]*<\/footer>/);
});
