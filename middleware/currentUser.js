'use strict';
// Loads the signed-in user on every request and checks that the account is still allowed in
// (fixes D7). A suspended user, or a session older than the last password change, is signed out
// at once instead of staying in until the cookie expires.
const userModel = require('../models/user.model');
const notifications = require('../services/notification.service');
const { navFor } = require('../config/nav');
const { USER } = require('../config/statuses');

const publicUser = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, affiliation: u.affiliation,
  universityId: u.universityId, phone: u.phone, lang: u.lang, status: u.status
});

const regenerate = (req) => new Promise((resolve) => req.session.regenerate(() => resolve()));

module.exports = async function currentUser(req, res, next) {
  try {
    req.user = null;
    res.locals.user = null;
    res.locals.unread = 0;
    res.locals.nav = null;

    const id = req.session && req.session.userId;
    if (id) {
      const user = await userModel.findById(id);
      const changed = user && user.passwordChangedAt && (req.session.authAt || 0) < new Date(user.passwordChangedAt).getTime();
      if (!user || user.status !== USER.ACTIVE || changed) {
        await regenerate(req);
        req.session.flash = { type: 'warn', key: 'flash_session_ended' };
      } else {
        req.user = publicUser(user);
        res.locals.user = req.user;
        res.locals.unread = await notifications.unreadCount(user.id);
        res.locals.nav = navFor(user.role);
      }
    }

    req.flash = (type, key, params) => { req.session.flash = { type, key, params }; };
    res.locals.flash = null;
    if (req.session && req.session.flash) {
      res.locals.flash = req.session.flash;
      delete req.session.flash;
    }
    next();
  } catch (err) {
    next(err);
  }
};
module.exports.publicUser = publicUser;
