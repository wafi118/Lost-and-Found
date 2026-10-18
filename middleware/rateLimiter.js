'use strict';
// Rate limits. Unlike the draft, these answer HTML forms with a proper page, do not count
// successful logins, and sit behind the CSRF check so forged requests do not use up a
// visitor's allowance (fixes D5).
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { tooMany, wantsJson } = require('./errors');

function make(options) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => config.isTest && !process.env.TEST_RATE_LIMIT,
    handler: (req, res) => {
      const reset = req.rateLimit && req.rateLimit.resetTime ? req.rateLimit.resetTime.getTime() : Date.now() + options.windowMs;
      const minutes = Math.max(1, Math.ceil((reset - Date.now()) / 60000));
      res.set('Retry-After', String(minutes * 60));
      if (wantsJson(req)) return res.status(429).json({ error: 'rate_limited', minutes });
      return tooMany(req, res, minutes);
    },
    ...options
  });
}

const MIN = 60 * 1000;
module.exports = {
  global: make({ windowMs: 15 * MIN, limit: config.rateLimits.global }),
  login: make({ windowMs: 15 * MIN, limit: config.rateLimits.loginFailures, skipSuccessfulRequests: true }),
  register: make({ windowMs: 60 * MIN, limit: 10 }),
  emailActions: make({ windowMs: 60 * MIN, limit: 10 }),
  uploads: make({ windowMs: 60 * MIN, limit: 60 }),
  scan: make({ windowMs: 5 * MIN, limit: 60 })
};
