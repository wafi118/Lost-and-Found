'use strict';
// Explainable matching (FR-10 to FR-13). Four factors, each scored 0..1 and combined with
// weights the administrator sets. The result is a suggestion for Security Cell staff to review.
// It never decides ownership.
const caseModel = require('../models/case.model');
const matchModel = require('../models/match.model');
const categoryModel = require('../models/category.model');
const locationModel = require('../models/location.model');
const settingsModel = require('../models/settings.model');
const audit = require('./audit.service');
const notifications = require('./notification.service');
const { CASE } = require('../config/statuses');
const { ROLES } = require('../config/roles');

class MatchError extends Error {
  constructor(code) { super(code); this.name = 'MatchError'; this.code = code; }
}

const STOP = new Set(('a an the and or of in on at to for with my your our this that these those is are was were be been it its i me we you he she they them ' +
  'has have had lost found item items one some very near inside outside from by as not no but if then there here also near around ' +
  'আমার আমি এবং ও এর একটি এই সেই থেকে জন্য হারিয়ে পাওয়া গেছে').split(/\s+/));

function stem(w) {
  if (!/^[a-z]+$/.test(w) || w.length <= 3) return w;
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (/(ses|xes|zes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

function tokenize(text) {
  const raw = String(text || '').toLowerCase().normalize('NFKC').match(/[\p{L}\p{M}\p{N}]+/gu) || [];
  return raw.filter((w) => (w.length > 1 || /\d/.test(w)) && !STOP.has(w)).map(stem);
}

const docText = (c) => `${c.title} ${c.title} ${c.description}`; // the title counts double

function buildIdf(cases) {
  const df = new Map();
  for (const c of cases) for (const t of new Set(tokenize(docText(c)))) df.set(t, (df.get(t) || 0) + 1);
  const n = cases.length;
  return (term) => Math.log((n + 1) / ((df.get(term) || 0) + 1)) + 1;
}

function vectorize(text, idf) {
  const counts = new Map();
  for (const t of tokenize(text)) counts.set(t, (counts.get(t) || 0) + 1);
  const vec = new Map();
  let norm = 0;
  for (const [t, c] of counts) {
    const w = (1 + Math.log(c)) * idf(t);
    vec.set(t, w);
    norm += w * w;
  }
  norm = Math.sqrt(norm) || 1;
  for (const [t, w] of vec) vec.set(t, w / norm);
  return vec;
}

function cosine(a, b) {
  let dot = 0;
  const shared = [];
  for (const [t, w] of a) {
    const o = b.get(t);
    if (o) { dot += w * o; shared.push({ term: t, weight: w * o }); }
  }
  shared.sort((x, y) => y.weight - x.weight);
  return { sim: Math.min(1, dot), shared: shared.slice(0, 5).map((s) => s.term) };
}

const DAY = 86400000;
function timeScore(lost, found) {
  const days = (new Date(found.occurredAt) - new Date(lost.occurredAt)) / DAY;
  if (days < -0.25) return { score: 0, days }; // found more than six hours before it was lost
  return { score: Math.exp(-Math.max(days, 0) / 14), days: Math.max(days, 0) };
}

function locationScore(lostLoc, foundLoc) {
  if (!lostLoc || !foundLoc) return { score: 0, kind: 'none' };
  if (lostLoc.id === foundLoc.id) return { score: 1, kind: 'same' };
  if (lostLoc.building && lostLoc.building === foundLoc.building) return { score: 0.6, kind: 'building' };
  return { score: 0, kind: 'none' };
}

// Pure scoring function: easy to unit test, no database access.
function scorePair({ lost, found, lostCat, foundCat, lostLoc, foundLoc, lostVec, foundVec, settings }) {
  const w = settings.weights;
  const totalWeight = (w.category + w.description + w.location + w.time) || 1;
  const category = lostCat && foundCat && lostCat.id === foundCat.id ? 1 : 0;
  const desc = cosine(lostVec, foundVec);
  const loc = locationScore(lostLoc, foundLoc);
  const time = timeScore(lost, found);

  const parts = {
    category: { score: category, weight: w.category },
    description: { score: desc.sim, weight: w.description },
    location: { score: loc.score, weight: w.location },
    time: { score: time.score, weight: w.time }
  };
  for (const p of Object.values(parts)) p.points = Math.round(((p.score * p.weight) / totalWeight) * 1000) / 10;
  const total = Math.round(Object.values(parts).reduce((s, p) => s + p.points, 0));

  const reasons = [];
  if (category) reasons.push({ key: 'mr_category', params: { name: lostCat.name } });
  if (desc.sim >= 0.15 && desc.shared.length) reasons.push({ key: 'mr_description', params: { words: desc.shared.join(', '), pct: Math.round(desc.sim * 100) } });
  if (loc.kind === 'same') reasons.push({ key: 'mr_location_same', params: { place: lostLoc.name } });
  if (loc.kind === 'building') reasons.push({ key: 'mr_location_building', params: { building: lostLoc.building } });
  if (time.score > 0) reasons.push({ key: 'mr_time', params: { days: Math.round(time.days * 10) / 10 } });

  const publicReasons = [];
  if (category) publicReasons.push('mr_pub_category');
  if (desc.sim >= 0.3) publicReasons.push('mr_pub_description');
  if (loc.score >= 0.6) publicReasons.push('mr_pub_location');
  if (time.score >= 0.5) publicReasons.push('mr_pub_time');

  return { total, parts, reasons, publicReasons, descSim: desc.sim, sameCategory: !!category };
}

async function context() {
  const [settings, cats, locs, all] = await Promise.all([
    settingsModel.get(), categoryModel.list(), locationModel.list(), caseModel.all()
  ]);
  const catMap = new Map(cats.map((c) => [c.id, c]));
  const locMap = new Map(locs.map((l) => [l.id, l]));
  const corpus = all.filter((c) => c.status !== CASE.REJECTED);
  return { settings, catMap, locMap, all, idf: buildIdf(corpus) };
}

// Compare one open case with every open case of the opposite type and store new suggestions.
async function runForCase(caseId, { notify = true } = {}) {
  const c = await caseModel.findById(caseId);
  if (!c || ![CASE.OPEN, CASE.MATCHED].includes(c.status)) return [];
  const ctx = await context();
  const pool = ctx.all.filter((x) => x.type !== c.type && x.userId !== c.userId && [CASE.OPEN, CASE.MATCHED].includes(x.status));
  const created = [];

  for (const other of pool) {
    const lost = c.type === 'lost' ? c : other;
    const found = c.type === 'found' ? c : other;
    const result = scorePair({
      lost, found, lostCat: ctx.catMap.get(lost.categoryId), foundCat: ctx.catMap.get(found.categoryId),
      lostLoc: ctx.locMap.get(lost.locationId), foundLoc: ctx.locMap.get(found.locationId),
      lostVec: vectorize(docText(lost), ctx.idf), foundVec: vectorize(docText(found), ctx.idf), settings: ctx.settings
    });
    // A pair is only worth showing if the category agrees or the wording clearly overlaps.
    if (!result.sameCategory && result.descSim < 0.2) continue;
    if (result.total < ctx.settings.matchThreshold) continue;
    if (await matchModel.findPair(lost.id, found.id)) continue;

    const m = await matchModel.create({
      lostCaseId: lost.id, foundCaseId: found.id, score: result.total,
      breakdown: result.parts, reasons: result.reasons, publicReasons: result.publicReasons
    });
    created.push(m);
    if (notify) await notifications.notifyRole(ROLES.SECURITY, 'notif_match_suggested', { lost: lost.ref, found: found.ref, score: result.total }, '/security/matches');
  }
  return created;
}

async function rerunAll() {
  const open = (await caseModel.all()).filter((c) => c.type === 'lost' && [CASE.OPEN, CASE.MATCHED].includes(c.status));
  let n = 0;
  for (const c of open) n += (await runForCase(c.id, { notify: false })).length;
  return n;
}

// ---------------------------------------------------------------- views of matches
async function hydrate(m, level) {
  const [lost, found, cats, locs] = await Promise.all([
    caseModel.findById(m.lostCaseId), caseModel.findById(m.foundCaseId), categoryModel.list(), locationModel.list()
  ]);
  if (!lost || !found) return null;
  const catMap = new Map(cats.map((c) => [c.id, c]));
  const locMap = new Map(locs.map((l) => [l.id, l]));
  // Members never see the private title of a found item in a sensitive category (PUB-2).
  const side = (c, hide = false) => {
    const category = catMap.get(c.categoryId);
    const masked = hide && Boolean(category && category.sensitive);
    return { id: c.id, ref: c.ref, title: masked ? null : c.title, titleMasked: masked, status: c.status, category, location: locMap.get(c.locationId), occurredAt: c.occurredAt };
  };
  const base = { id: m.id, status: m.status, createdAt: m.createdAt, lost: side(lost), found: side(found, level !== 'staff') };
  if (level === 'staff') return { ...base, score: m.score, breakdown: m.breakdown, reasons: m.reasons };
  return { ...base, publicReasons: m.publicReasons };
}

async function suggested() {
  const rows = await matchModel.listByStatus('suggested');
  const out = [];
  for (const m of rows) {
    const h = await hydrate(m, 'staff');
    const live = [CASE.OPEN, CASE.MATCHED];
    if (h && live.includes(h.lost.status) && live.includes(h.found.status)) out.push(h);
  }
  return out;
}

// For a case detail page. Members only see matches staff have confirmed, with coarse reasons.
async function forCaseView(caseId, level) {
  const rows = await matchModel.forCase(caseId);
  const out = [];
  for (const m of rows) {
    if (level !== 'staff' && m.status !== 'confirmed') continue;
    if (level === 'staff' && m.status === 'rejected') continue;
    const h = await hydrate(m, level === 'staff' ? 'staff' : 'member');
    if (h) out.push(h);
  }
  return out;
}

async function recomputeStatus(caseId) {
  const c = await caseModel.findById(caseId);
  if (!c || ![CASE.OPEN, CASE.MATCHED].includes(c.status)) return;
  const confirmed = await matchModel.forCase(caseId, 'confirmed');
  const next = confirmed.length ? CASE.MATCHED : CASE.OPEN;
  if (next !== c.status) await caseModel.update(caseId, { status: next });
}

async function confirm(staff, matchId, ip = '') {
  const m = await matchModel.get(matchId);
  if (!m || m.status !== 'suggested') throw new MatchError('NOT_SUGGESTED');
  const [lost, found] = await Promise.all([caseModel.findById(m.lostCaseId), caseModel.findById(m.foundCaseId)]);
  if (!lost || !found) throw new MatchError('NOT_FOUND');
  if (staff.id === lost.userId || staff.id === found.userId) throw new MatchError('OWN_CASE');
  if (![CASE.OPEN, CASE.MATCHED].includes(lost.status) || ![CASE.OPEN, CASE.MATCHED].includes(found.status)) throw new MatchError('NOT_AVAILABLE');

  await matchModel.update(m.id, { status: 'confirmed', reviewedBy: staff.id, reviewedAt: new Date() });
  for (const c of [lost, found]) {
    if (c.status === CASE.OPEN) await caseModel.update(c.id, { status: CASE.MATCHED });
    await caseModel.addEvent(c.id, { key: 'ev_match_confirmed', params: { other: c.id === lost.id ? found.ref : lost.ref }, staffOnly: false });
  }
  await notifications.notify(lost.userId, 'notif_match_confirmed', { ref: lost.ref }, `/items/${lost.ref}`, { email: true });
  await audit.record(staff, 'match.confirmed', `${lost.ref} / ${found.ref}`, `score ${m.score}`, ip);
}

async function reject(staff, matchId, ip = '') {
  const m = await matchModel.get(matchId);
  if (!m || !['suggested', 'confirmed'].includes(m.status)) throw new MatchError('NOT_SUGGESTED');
  const [lost, found] = await Promise.all([caseModel.findById(m.lostCaseId), caseModel.findById(m.foundCaseId)]);
  if (lost && found && (staff.id === lost.userId || staff.id === found.userId)) throw new MatchError('OWN_CASE');
  await matchModel.update(m.id, { status: 'rejected', reviewedBy: staff.id, reviewedAt: new Date() });
  if (lost) await recomputeStatus(lost.id);
  if (found) await recomputeStatus(found.id);
  await audit.record(staff, 'match.rejected', lost && found ? `${lost.ref} / ${found.ref}` : String(m.id), `score ${m.score}`, ip);
}

module.exports = {
  MatchError, tokenize, scorePair, vectorize, buildIdf, cosine, timeScore,
  runForCase, rerunAll, suggested, forCaseView, confirm, reject, recomputeStatus
};
