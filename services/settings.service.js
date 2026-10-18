'use strict';
// Runtime configuration (FR-22): retention period, matching weights and threshold, QR lifetime.
const settingsModel = require('../models/settings.model');
const audit = require('./audit.service');
const matching = require('./matching.service');
const { ServiceError } = require('./errors');

const get = () => settingsModel.get();

async function update(admin, input, ip = '') {
  const sum = input.wCategory + input.wDescription + input.wLocation + input.wTime;
  // The weights are shares of a 100-point score, so they must add up to 100.
  if (sum !== 100) throw new ServiceError('WEIGHTS_SUM', { sum });
  const before = await settingsModel.get();
  const next = await settingsModel.set({
    retentionDays: input.retentionDays, matchThreshold: input.matchThreshold, handoverValidDays: input.handoverValidDays,
    weights: { category: input.wCategory, description: input.wDescription, location: input.wLocation, time: input.wTime }
  });
  const changed = Object.keys(next).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(before[k]));
  await audit.record(admin, 'admin.settings_updated', 'settings', changed.join(', '), ip);
  // New weights can surface pairs the old ones hid. Existing suggestions are kept as they are.
  const added = changed.some((k) => k === 'weights' || k === 'matchThreshold') ? await matching.rerunAll() : 0;
  return { settings: next, added };
}

module.exports = { get, update };
