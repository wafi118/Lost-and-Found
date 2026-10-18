'use strict';
// What an anonymous visitor, another member and the wrong staff role may and may not see.
// The seed data has no real people in it, but the rules are the same for real data (PUB-1 to PUB-6).
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, Client, signedIn, tinyPng, refFrom } = require('./helpers');
const { toInputValue } = require('../utils/format');

const FORM = '/account';
const PUBLIC = ['open', 'matched'];

async function world() {
  const caseModel = require('../models/case.model');
  const categoryModel = require('../models/category.model');
  const locationModel = require('../models/location.model');
  const userModel = require('../models/user.model');
  const [cases, cats, locs] = await Promise.all([caseModel.all(), categoryModel.list(), locationModel.list()]);
  return { caseModel, userModel, cases, cats, locs, catOf: (c) => cats.find((x) => x.id === c.categoryId), locOf: (c) => locs.find((x) => x.id === c.locationId) };
}

const words = (text) => String(text || '').toLowerCase().match(/[a-z0-9][a-z0-9-]{3,}/g) || [];

test('the public board shows only type, public title, category, building, date and status', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const { cases, userModel, catOf } = await world();
  const anon = new Client(srv.base);
  const pages = ['/', '/browse', '/browse?type=lost', '/browse?type=found', '/browse?page=2'];
  const html = (await Promise.all(pages.map((p) => anon.get(p)))).map((r) => r.text).join('\n');

  const visible = cases.filter((c) => PUBLIC.includes(c.status));
  assert.ok(visible.length >= 5, 'seed has public cases');
  for (const c of visible) {
    assert.ok(html.includes(c.ref), `${c.ref} is on the board`);
    assert.ok(!html.includes(c.description), `${c.ref}: description leaked`);
    if (c.locationDetail) assert.ok(!html.includes(c.locationDetail), `${c.ref}: exact spot leaked`);
    if (c.storageSlot) assert.ok(!new RegExp(`\\b${c.storageSlot}\\b`).test(html), `${c.ref}: shelf slot leaked`);
    if (c.finder) for (const v of [c.finder.name, c.finder.contact, c.finder.universityId]) if (v) assert.ok(!html.includes(v), `${c.ref}: finder detail leaked`);
    if (c.photo) assert.ok(!html.includes(c.photo), `${c.ref}: photo name leaked`);
    if (c.userId) {
      const u = await userModel.findById(c.userId);
      for (const v of [u.name, u.email, u.universityId, u.phone]) if (v) assert.ok(!html.includes(v), `${c.ref}: reporter detail leaked`);
    }
    if (catOf(c).sensitive) assert.ok(!html.includes(c.title), `${c.ref}: sensitive title shown`);
  }
  for (const c of cases.filter((x) => !PUBLIC.includes(x.status))) assert.ok(!html.includes(c.ref), `${c.ref} (${c.status}) must not be public`);
});

test('search runs on public fields only: a word that exists only in private text finds nothing', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const { cases, cats, locs, catOf } = await world();
  const anon = new Client(srv.base);

  // Everything a visitor can legitimately search against.
  const publicCorpus = [
    ...cats.flatMap((c) => [c.name, c.nameBn]), ...locs.flatMap((l) => [l.building, l.buildingBn]),
    ...cases.filter((c) => !catOf(c).sensitive).map((c) => c.title)
  ].join(' ').toLowerCase();

  let probes = 0;
  for (const c of cases.filter((x) => PUBLIC.includes(x.status))) {
    const privateText = [c.description, c.locationDetail, c.storageSlot, c.finder && c.finder.name, c.finder && c.finder.contact, catOf(c).sensitive ? c.title : ''].join(' ');
    const onlyPrivate = [...new Set(words(privateText))].filter((w) => !publicCorpus.includes(w));
    for (const w of onlyPrivate) {
      const res = await anon.get(`/browse?q=${encodeURIComponent(w)}`);
      assert.equal(res.status, 200);
      assert.ok(!res.text.includes(`/items/${c.ref}`), `searching "${w}" (private word of ${c.ref}) found the case`);
      probes += 1;
    }
  }
  assert.ok(probes >= 20, `only ${probes} private words were probed`);

  // Search by a public title still works, so the check above is not passing because search is broken.
  const plain = cases.find((c) => PUBLIC.includes(c.status) && !catOf(c).sensitive);
  const res = await anon.get(`/browse?q=${encodeURIComponent(plain.title.split(' ')[0])}`);
  assert.ok(res.text.includes(plain.ref), 'public title search works');
});

test('the single-item page for a visitor is the same limited card, and hidden cases give 404', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const { cases, userModel, catOf } = await world();
  const anon = new Client(srv.base);

  for (const c of cases) {
    const res = await anon.get(`/items/${c.ref}`);
    if (!PUBLIC.includes(c.status)) { assert.equal(res.status, 404, `${c.ref} (${c.status})`); continue; }
    assert.equal(res.status, 200, c.ref);
    assert.ok(!res.text.includes(c.description), `${c.ref}: description`);
    if (c.locationDetail) assert.ok(!res.text.includes(c.locationDetail), `${c.ref}: exact spot`);
    if (c.userId) assert.ok(!res.text.includes((await userModel.findById(c.userId)).email), `${c.ref}: reporter e-mail`);
    if (catOf(c).sensitive) assert.ok(!res.text.includes(c.title), `${c.ref}: sensitive title`);
  }
  assert.equal((await anon.get('/items/not-a-ref')).status, 404);
  assert.equal((await anon.get('/items/SF-2026-9999')).status, 404);
});

test('another member sees a case without its private details; the owner and staff see everything', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const { cases, userModel } = await world();
  const { ACCOUNTS } = require('./helpers');
  const keyOf = async (c) => { const u = await userModel.findById(c.userId); return Object.keys(ACCOUNTS).find((k) => ACCOUNTS[k][0] === u.email); };

  // SF-2026-0007 is an open lost report. Sign in as whoever owns it, and as someone who does not.
  const lost = cases.find((c) => c.ref === 'SF-2026-0007');
  assert.equal(lost.status, 'open');
  const ownerKey = await keyOf(lost);
  const owner = await signedIn(srv.base, ownerKey);
  const other = await signedIn(srv.base, ownerKey === 'student' ? 'student2' : 'student');
  const staff = await signedIn(srv.base, 'security');

  const asOther = await other.get(`/items/${lost.ref}`);
  assert.equal(asOther.status, 200);
  assert.ok(!asOther.text.includes(lost.description), 'another member does not see the description');
  assert.ok(!asOther.text.includes((await userModel.findById(lost.userId)).email), 'nor the owner e-mail');
  assert.ok((await owner.get(`/items/${lost.ref}`)).text.includes(lost.description), 'owner sees their own text');
  assert.ok((await staff.get(`/items/${lost.ref}`)).text.includes(lost.description), 'staff see it');

  // A case that is not public is invisible, not "forbidden": the answer does not confirm it exists.
  const hidden = cases.find((c) => c.status === 'under_review');
  assert.ok(hidden);
  const stranger = await signedIn(srv.base, (await keyOf(hidden)) === 'student' ? 'student2' : 'student');
  assert.equal((await stranger.get(`/items/${hidden.ref}`)).status, 404);
  assert.equal((await (await signedIn(srv.base, await keyOf(hidden))).get(`/items/${hidden.ref}`)).status, 200, 'its owner can open it');
});

test('sensitive categories keep their real title private even for signed-in members', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const { cases, catOf } = await world();
  const member = await signedIn(srv.base, 'student');
  const idCard = cases.find((c) => catOf(c).sensitive && PUBLIC.includes(c.status));
  assert.ok(idCard, 'seed has an open ID-card report');
  const res = await member.get(`/items/${idCard.ref}`);
  assert.equal(res.status, 200);
  assert.ok(!res.text.includes(idCard.title), 'real title is hidden');
  assert.ok(!res.text.includes(idCard.description));
  assert.ok(res.text.includes(catOf(idCard).name), 'the category name is shown instead');
});

test('uploaded photos: only the owner and staff can open them, and bad files are refused', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const caseModel = require('../models/case.model');
  const owner = await signedIn(srv.base, 'student2');
  const other = await signedIn(srv.base, 'student');
  const staff = await signedIn(srv.base, 'security');
  const anon = new Client(srv.base);
  const when = toInputValue(new Date(Date.now() - 3600e3));
  const base = { type: 'lost', categoryId: 12, locationId: 6, title: 'Green lunch box', description: 'Green plastic lunch box with a white lid, name label scratched off.', occurredAt: when };

  const ok = await owner.multipart('/report', base, { field: 'photo', buffer: tinyPng(), type: 'image/png', name: 'x.png' }, { from: FORM });
  assert.equal(ok.status, 302, ok.text.slice(0, 200));
  const c = await caseModel.findByRef(refFrom(ok.location));
  assert.match(c.photo, /^[a-f0-9]{32}\.png$/, 'stored under a random name, not the uploaded name');

  const get = (client) => client.get(`/uploads/${c.photo}`, { raw: true });
  const asOwner = await get(owner);
  assert.equal(asOwner.status, 200);
  assert.equal(asOwner.headers.get('content-type'), 'image/png');
  assert.equal(asOwner.headers.get('x-content-type-options'), 'nosniff');
  assert.match(asOwner.headers.get('content-security-policy') || '', /sandbox/);
  assert.equal((await get(staff)).status, 200);
  assert.equal((await get(other)).status, 404, 'a member who does not own the case');
  assert.equal((await get(anon)).status, 302, 'not signed in');
  for (const p of ['/uploads/../app.js', '/uploads/..%2Fapp.js', '/uploads/%2e%2e%2f.env', `/uploads/${c.photo}/x`, '/uploads/' + 'a'.repeat(32) + '.png']) {
    assert.ok([302, 404].includes((await owner.get(p, { raw: true })).status), p);
  }

  const before = (await caseModel.all()).length;
  const disguised = await owner.multipart('/report', { ...base, title: 'Fake photo case' }, { field: 'photo', buffer: Buffer.from('<script>alert(1)</script>'.padEnd(64, ' ')), type: 'image/png', name: 'a.png' }, { from: FORM });
  assert.equal(disguised.status, 400, 'HTML sent as a PNG is refused by content, not by name');
  const svg = await owner.multipart('/report', { ...base, title: 'Svg photo case' }, { field: 'photo', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'.padEnd(80, ' ')), type: 'image/svg+xml', name: 'a.svg' }, { from: FORM });
  assert.equal(svg.status, 400, 'SVG is not accepted');
  const big = await owner.multipart('/report', { ...base, title: 'Large photo case' }, { field: 'photo', buffer: Buffer.concat([tinyPng(), Buffer.alloc(4 * 1024 * 1024)]), type: 'image/png', name: 'big.png' }, { from: FORM });
  assert.equal(big.status, 400, 'over the size limit');
  assert.equal((await caseModel.all()).length, before, 'no case was created by a refused upload');
});

test('a refused form keeps what the person typed', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const owner = await signedIn(srv.base, 'student2');
  const res = await owner.post('/report', { type: 'lost', categoryId: 12, locationId: 6, title: 'Green lunch box', description: 'short', occurredAt: toInputValue(new Date()) }, { from: FORM });
  assert.equal(res.status, 400);
  assert.ok(res.text.includes('Green lunch box'), 'title is kept');
  assert.ok(res.text.includes('short'), 'description is kept');
});

test('the approver sees approval cases only', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const approver = await signedIn(srv.base, 'approver');
  assert.equal((await approver.get('/approver/cases/SF-2026-0003')).status, 200, 'the phone report that needs approval');
  assert.equal((await approver.get('/approver/cases/SF-2026-0008')).status, 404, 'an ordinary report is not theirs to open');
  assert.equal((await approver.get('/security/cases/SF-2026-0003')).status, 403);
  assert.equal((await approver.get('/admin/audit')).status, 403);
});

test('public counts are aggregates only', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const { cases } = await world();
  const home = await new Client(srv.base).get('/');
  const nums = [...home.text.matchAll(/<span class="stat-num">([^<]*)<\/span>/g)].map((m) => m[1].trim());
  const count = (type) => cases.filter((c) => c.type === type && PUBLIC.includes(c.status)).length;
  const returned = cases.filter((c) => c.type === 'found' && c.closeReason === 'returned').length;
  assert.deepEqual(nums, [String(count('lost')), String(count('found')), String(returned)]);
});

test('a name typed into the title of a bank card or ID card never reaches the board or the search', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const caseModel = require('../models/case.model');
  const finder = await signedIn(srv.base, 'student');
  const staff = await signedIn(srv.base, 'security');
  const anon = new Client(srv.base);

  // Category 2 is "Bank or payment card", a sensitive category.
  const sent = await finder.multipart('/report', {
    type: 'found', categoryId: 2, locationId: 6, title: 'Debit card of Zubaida Khanom',
    description: 'Blue debit card, name printed on the front, found under a table in the dining area.',
    occurredAt: toInputValue(new Date(Date.now() - 3600e3))
  }, null, { from: FORM });
  assert.equal(sent.status, 302, sent.text.slice(0, 200));
  const ref = refFrom(sent.location);
  const accepted = await staff.post(`/security/cases/${ref}/review`, { decision: 'accept', storageSlot: 'K-01' }, { from: FORM });
  assert.equal(accepted.status, 302);
  assert.equal((await caseModel.findByRef(ref)).status, 'open');

  const board = await anon.get('/browse?type=found');
  assert.ok(board.text.includes(ref), 'the card is on the board');
  assert.ok(board.text.includes('Bank or payment card'), 'with the category name');
  assert.ok(!/zubaida|khanom/i.test(board.text), 'but not the name');

  for (const q of ['zubaida', 'khanom', 'debit card of zubaida']) {
    const res = await anon.get(`/browse?q=${encodeURIComponent(q)}`);
    assert.ok(!res.text.includes(ref), `"${q}" must not find it`);
  }
  assert.ok((await anon.get(`/browse?q=${encodeURIComponent('bank or payment')}`)).text.includes(ref), 'the category name does find it');

  const card = await anon.get(`/items/${ref}`);
  assert.equal(card.status, 200);
  assert.ok(!/zubaida|khanom/i.test(card.text));
  const other = await signedIn(srv.base, 'student2');
  assert.ok(!/zubaida|khanom/i.test((await other.get(`/items/${ref}`)).text), 'another member does not see it either');
  assert.ok(/zubaida/i.test((await staff.get(`/items/${ref}`)).text), 'staff do, to be able to find the owner');
});

test('publicCard is the only shape that leaves for a visitor, and it carries no private field', async () => {
  const cases = require('../services/case.service');
  const base = {
    id: 9, ref: 'SF-2026-0099', type: 'found', status: 'open', userId: 4, occurredAt: new Date('2026-09-01T10:00:00Z'),
    title: 'Debit card of Zubaida Khanom', description: 'secret description text', locationDetail: 'secret exact spot',
    storageSlot: 'Z-99', photo: 'ffffffffffffffffffffffffffffffff.png', finder: { name: 'Secret Finder', contact: '01700000000' },
    categoryId: 2, locationId: 6
  };
  const sensitive = { id: 2, name: 'Bank or payment card', nameBn: 'ব্যাংক বা পেমেন্ট কার্ড', sensitive: true };
  const plain = { id: 12, name: 'Water bottle or lunch box', nameBn: 'পানির বোতল', sensitive: false };
  const loc = { id: 6, building: 'Cafeteria', buildingBn: 'ক্যাফেটেরিয়া', name: 'Dining area', nameBn: 'ডাইনিং' };

  const masked = JSON.stringify(cases.publicCard(base, sensitive, loc, 'en'));
  for (const secret of ['Zubaida', 'secret description', 'secret exact', 'Z-99', 'ffffffff', 'Secret Finder', '01700000000', '"userId"', 'Dining area']) {
    assert.ok(!masked.includes(secret), `masked card carries "${secret}"`);
  }
  assert.ok(masked.includes('Bank or payment card'));

  const open = cases.publicCard({ ...base, title: 'Blue steel bottle', categoryId: 12 }, plain, loc, 'en');
  assert.deepEqual(Object.keys(open).sort(), ['building', 'categoryName', 'masked', 'occurredAt', 'ref', 'status', 'title', 'type']);
  assert.equal(open.title, 'Blue steel bottle');
  assert.equal(open.building, 'Cafeteria', 'building only, never the room');
  assert.equal(cases.publicCard(base, sensitive, loc, 'bn').title, 'ব্যাংক বা পেমেন্ট কার্ড', 'Bangla viewers get the Bangla category name');
});
