'use strict';
// The matching engine is a pure scoring function plus a small text pipeline, so it is tested
// directly: same inputs, same score, and every point of the score can be traced to a factor.
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers'); // sets the test environment
const m = require('../services/matching.service');

const W = { weights: { category: 30, description: 35, location: 20, time: 15 } };
const cat = (id) => ({ id, name: `Category ${id}` });
const loc = (id, building) => ({ id, building, name: `Place ${id}` });
const at = (hoursFromBase) => new Date(Date.UTC(2026, 8, 1, 6, 0) + hoursFromBase * 3600e3);

function score(lost, found, settings = W) {
  const idf = m.buildIdf([lost, found]);
  const text = (c) => `${c.title} ${c.title} ${c.description}`;
  return m.scorePair({
    lost, found, lostCat: lost.cat, foundCat: found.cat, lostLoc: lost.loc, foundLoc: found.loc,
    lostVec: m.vectorize(text(lost), idf), foundVec: m.vectorize(text(found), idf), settings
  });
}
const item = (over = {}) => ({
  title: 'Black leather wallet', description: 'Black leather wallet with a brown stitch and two card slots.',
  cat: cat(5), loc: loc(1, 'Library'), occurredAt: at(0), ...over
});

test('an identical pair scores the full weight, a different pair scores low', () => {
  assert.equal(score(item(), item()).total, 100);
  const unrelated = score(item(), item({ title: 'Green water bottle', description: 'Green steel bottle with a dented cap.', cat: cat(12), loc: loc(9, 'Sports ground'), occurredAt: at(24 * 30) }));
  assert.ok(unrelated.total < 20, `unrelated pair scored ${unrelated.total}`);
});

test('every point of the total comes from one named factor and the factors add up', () => {
  const r = score(item(), item({ title: 'Brown wallet', description: 'Brown leather wallet with card slots.', loc: loc(2, 'Library'), occurredAt: at(30) }));
  assert.deepEqual(Object.keys(r.parts).sort(), ['category', 'description', 'location', 'time']);
  const sum = Object.values(r.parts).reduce((s, p) => s + p.points, 0);
  assert.ok(Math.abs(sum - r.total) <= 1, `parts add to ${sum}, total ${r.total}`);
  for (const p of Object.values(r.parts)) { assert.ok(p.score >= 0 && p.score <= 1); assert.ok(p.points <= p.weight); }
});

test('the administrator weights change the result, and a zero weight switches a factor off', () => {
  const lost = item();
  const found = item({ cat: cat(6), title: 'Wallet', description: 'Black leather wallet' });
  const onlyCategory = { weights: { category: 100, description: 0, location: 0, time: 0 } };
  assert.equal(score(lost, item(), onlyCategory).total, 100);
  assert.equal(score(lost, found, onlyCategory).total, 0, 'different category, only category counts');
  const onlyText = { weights: { category: 0, description: 100, location: 0, time: 0 } };
  assert.ok(score(lost, found, onlyText).total > 40);
});

test('time: not before the loss, full right after it, fading over weeks', () => {
  const lost = item();
  assert.equal(score(lost, item({ occurredAt: at(-7) })).parts.time.score, 0, 'found 7 hours before it was lost');
  assert.equal(score(lost, item({ occurredAt: at(0) })).parts.time.score, 1);
  const week2 = score(lost, item({ occurredAt: at(24 * 14) })).parts.time.score;
  assert.ok(week2 > 0.3 && week2 < 0.4, `14 days: ${week2}`);
  assert.ok(score(lost, item({ occurredAt: at(24 * 60) })).parts.time.score < 0.05);
});

test('location: same place full, same building partly, otherwise nothing', () => {
  const lost = item();
  assert.equal(score(lost, item()).parts.location.score, 1);
  assert.equal(score(lost, item({ loc: loc(2, 'Library') })).parts.location.score, 0.6);
  assert.equal(score(lost, item({ loc: loc(7, 'Cafeteria') })).parts.location.score, 0);
});

test('the reasons staff see name real shared words; the reasons members see carry no words at all', () => {
  const r = score(item(), item({ title: 'Wallet, black leather', description: 'Leather wallet in black with a stitch.' }));
  const desc = r.reasons.find((x) => x.key === 'mr_description');
  assert.ok(desc, 'description reason present');
  assert.ok(desc.params.words.split(', ').every((w) => ['black', 'leather', 'wallet', 'stitch'].includes(w)), desc.params.words);
  assert.ok(r.publicReasons.every((k) => /^mr_pub_/.test(k)), 'coarse keys only');
  assert.ok(r.publicReasons.every((k) => typeof k === 'string'), 'no parameters, so no shared words');
});

test('text pipeline: stop words out, plurals folded, Bangla letters kept', () => {
  assert.deepEqual(m.tokenize('Lost my Black Backpacks'), ['black', 'backpack']);
  assert.deepEqual(m.tokenize('Batteries and boxes'), ['battery', 'box']);
  const bn = m.tokenize('আমার কালো ব্যাগ');
  assert.deepEqual(bn, ['কালো', 'ব্যাগ']);
  assert.deepEqual(m.tokenize(''), []);
  assert.deepEqual(m.tokenize(null), []);
});

test('the same input always gives the same score', () => {
  const a = score(item(), item({ title: 'Wallet', description: 'Leather wallet, black' }));
  const b = score(item(), item({ title: 'Wallet', description: 'Leather wallet, black' }));
  assert.deepEqual(a, b);
});

test('a suggestion never changes a case: only staff confirmation does', async () => {
  const caseModel = require('../models/case.model');
  const matchModel = require('../models/match.model');
  await require('../services/seed.service').seedAll();
  const before = (await caseModel.all()).map((c) => [c.id, c.status]);
  await m.rerunAll();
  const after = (await caseModel.all()).map((c) => [c.id, c.status]);
  assert.deepEqual(after, before, 'running the engine leaves every status as it was');
  for (const x of await matchModel.listByStatus('suggested')) assert.equal(x.status, 'suggested');
});
