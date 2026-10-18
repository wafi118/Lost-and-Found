'use strict';
const notificationModel = require('../models/notification.model');
const userModel = require('../models/user.model');
const mailer = require('./mailer.service');
const realtime = require('./realtime.service');
const { translate } = require('../utils/i18n');
const config = require('../config');

// key: locale key for the message; params fill its {placeholders}.
// email: also send by email (used for the events people should not miss).
async function notify(userId, key, params = {}, link = null, { email = false } = {}) {
  const n = await notificationModel.create({ userId, key, params, link });
  await realtime.push(userId, n); // live toast for open pages; never throws
  if (email) {
    const user = await userModel.findById(userId);
    if (user && user.status === 'active') {
      const lang = user.lang || 'en';
      await mailer.send({
        to: user.email,
        subject: translate(lang, 'mail_notify_subject'),
        text: `${translate(lang, key, params)}\n\n${link ? config.baseUrl + link : ''}`.trim()
      });
    }
  }
  return n;
}

async function notifyRole(role, key, params = {}, link = null) {
  const users = await userModel.listByRole(role);
  await Promise.all(users.map((u) => notify(u.id, key, params, link)));
}

module.exports = {
  notify, notifyRole,
  unreadCount: (userId) => notificationModel.countUnread(userId),
  list: (userId, opts) => notificationModel.forUser(userId, opts),
  recent: (userId, n) => notificationModel.recent(userId, n),
  markAllRead: (userId) => notificationModel.markAllRead(userId)
};
