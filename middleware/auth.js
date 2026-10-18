'use strict';
// Access control. Every protected route goes through requireAuth or requireRole on the server;
// hiding a link in the page is never treated as protection.
const safeRedirect = require('../utils/safeRedirect');
const { LANDING } = require('../config/roles');
const { forbidden, wantsJson } = require('./errors');

function requireAuth(req, res, next) {
  if (req.user) return next();
  if (wantsJson(req)) return res.status(401).json({ error: 'login_required' });
  // Send them to sign in, then bring them back to the page they wanted (GET requests only).
  const back = req.method === 'GET' ? safeRedirect(req.originalUrl) : null;
  req.flash('info', 'flash_login_required');
  return res.redirect('/auth/login' + (back ? `?next=${encodeURIComponent(back)}` : ''));
}

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return requireAuth(req, res, next);
  if (roles.includes(req.user.role)) return next();
  return forbidden(req, res);
};

// For sign-in and registration pages: people already signed in go to their own landing page.
const requireGuest = (req, res, next) => (req.user ? res.redirect(LANDING[req.user.role] || '/') : next());

module.exports = { requireAuth, requireRole, requireGuest };
