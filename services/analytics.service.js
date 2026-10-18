'use strict';
// Numbers for dashboards and the analytics page (FR-21). Definitions are shown on the page:
//   recovery rate     = found items returned to their owner / found items received
//   resolution time   = days from the found report to handover, for returned items
const caseModel = require('../models/case.model');
const claimModel = require('../models/claim.model');
const handoverModel = require('../models/handover.model');
const matchModel = require('../models/match.model');
const categoryModel = require('../models/category.model');
const locationModel = require('../models/location.model');
const { CASE, CLAIM } = require('../config/statuses');

const DAY = 86400000;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

async function overview({ months = 6 } = {}) {
  const [cases, cats, locs] = await Promise.all([caseModel.all(), categoryModel.list(), locationModel.list()]);
  const found = cases.filter((c) => c.type === 'found' && ![CASE.PENDING_APPROVAL, CASE.UNDER_REVIEW, CASE.REJECTED].includes(c.status));
  const returned = cases.filter((c) => c.type === 'found' && c.closeReason === 'returned');
  const days = returned.map((c) => (new Date(c.closedAt) - new Date(c.createdAt)) / DAY);
  const avg = days.length ? Math.round((days.reduce((s, d) => s + d, 0) / days.length) * 10) / 10 : null;

  const byCategory = cats.map((cat) => ({
    name: cat.name, nameBn: cat.nameBn,
    lost: cases.filter((c) => c.type === 'lost' && c.categoryId === cat.id).length,
    found: cases.filter((c) => c.type === 'found' && c.categoryId === cat.id).length
  })).filter((r) => r.lost + r.found > 0).sort((a, b) => b.lost + b.found - a.lost - a.found);

  const statusOrder = Object.values(CASE);
  const byStatus = statusOrder.map((s) => ({ status: s, count: cases.filter((c) => c.status === s).length })).filter((r) => r.count > 0);

  const now = new Date();
  const monthly = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const inMonth = cases.filter((c) => c.createdAt >= start && c.createdAt < end);
    monthly.push({
      label: start.toLocaleString('en-GB', { month: 'short', year: '2-digit' }),
      lost: inMonth.filter((c) => c.type === 'lost').length,
      found: inMonth.filter((c) => c.type === 'found').length
    });
  }

  const hotspots = locs.map((l) => ({
    id: l.id, building: l.building, buildingBn: l.buildingBn, name: l.name, nameBn: l.nameBn, lat: l.lat, lng: l.lng,
    count: cases.filter((c) => c.locationId === l.id).length
  })).filter((h) => h.count > 0).sort((a, b) => b.count - a.count);

  return {
    totals: {
      lost: cases.filter((c) => c.type === 'lost').length,
      found: cases.filter((c) => c.type === 'found').length,
      returned: returned.length,
      foundReceived: found.length,
      recoveryRate: pct(returned.length, found.length),
      avgResolutionDays: avg,
      unclaimed: cases.filter((c) => c.retentionFlaggedAt && c.status !== CASE.DISPOSED).length,
      disposed: cases.filter((c) => c.status === CASE.DISPOSED).length
    },
    byCategory, byStatus, monthly, hotspots
  };
}

// Work waiting for each role, for dashboards.
async function staffSummary() {
  const [cases, claims, handovers, suggested] = await Promise.all([
    caseModel.all(), claimModel.all(), handoverModel.listByStatus('pending'), matchModel.listByStatus('suggested')
  ]);
  return {
    toReview: cases.filter((c) => c.status === CASE.UNDER_REVIEW).length,
    claimsWaiting: claims.filter((c) => c.status === CLAIM.SUBMITTED).length,
    proofWaiting: claims.filter((c) => c.status === CLAIM.PROOF_REQUESTED).length,
    handoversPending: handovers.length,
    matchesToReview: suggested.length,
    inCustody: cases.filter((c) => c.type === 'found' && [CASE.OPEN, CASE.MATCHED, CASE.CLAIM_PENDING, CASE.READY].includes(c.status)).length,
    flagged: cases.filter((c) => c.retentionFlaggedAt && [CASE.OPEN, CASE.MATCHED].includes(c.status)).length
  };
}

async function approverSummary() {
  const cases = (await caseModel.all()).filter((c) => c.approvalRequired);
  return {
    pending: cases.filter((c) => c.status === CASE.PENDING_APPROVAL).length,
    approved: cases.filter((c) => c.approval && c.approval.decision === 'approved').length,
    rejected: cases.filter((c) => c.approval && c.approval.decision === 'rejected').length
  };
}

async function memberSummary(user) {
  const mine = (await caseModel.all()).filter((c) => c.userId === user.id);
  const claims = await claimModel.forUser(user.id);
  return {
    active: mine.filter((c) => ![CASE.CLOSED, CASE.REJECTED, CASE.DISPOSED].includes(c.status)).length,
    matched: mine.filter((c) => c.status === CASE.MATCHED).length,
    activeClaims: claims.filter((c) => [CLAIM.SUBMITTED, CLAIM.PROOF_REQUESTED, CLAIM.VERIFIED].includes(c.status)).length,
    closed: mine.filter((c) => c.status === CASE.CLOSED).length
  };
}

module.exports = { overview, staffSummary, approverSummary, memberSummary };
