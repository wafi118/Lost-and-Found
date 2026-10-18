'use strict';
// Live alerts over Socket.io. A notification is always stored first (notification.service); this
// module only pushes the same message to the person's open pages, so a toast can appear at once.
// Nothing depends on it: if the connection fails, the bell badge and the notifications page still work.
//
// Access: a socket joins one room, "user:<id>", and only after the session cookie has been checked
// the same way currentUser does it on every request (account active, session newer than the last
// password change). The browser cannot ask for any other room. The Origin header must match this host.
const { Server } = require('socket.io');
const config = require('../config');
const userModel = require('../models/user.model');
const notificationModel = require('../models/notification.model');
const { USER } = require('../config/statuses');
const { translate } = require('../utils/i18n');

let io = null;

const room = (userId) => `user:${userId}`;

// Messages that only repeat what the person has just done themselves are not pushed.
const SKIP = new Set(['notif_report_received']);

// How a notification is shown. Green: good news for the person. Red: a refusal. Amber: something is waiting
// for them. Anything not listed is blue (information). Quoted keys so scripts/collect-keys.js checks each one.
const TONE = {
  'notif_account_approved': 'success', 'notif_case_approved': 'success', 'notif_case_open': 'success', 'notif_claim_verified': 'success',
  'notif_found_received': 'success', 'notif_handover_done': 'success', 'notif_intake_recorded': 'success', 'notif_match_confirmed': 'success',
  'notif_case_rejected': 'error', 'notif_claim_rejected': 'error',
  'notif_approval_needed': 'warn', 'notif_review_needed': 'warn', 'notif_claim_submitted': 'warn', 'notif_proof_received': 'warn',
  'notif_case_note': 'info', 'notif_case_update': 'info', 'notif_case_update_reply': 'warn',
  'notif_proof_requested': 'warn', 'notif_retention_flagged': 'warn', 'notif_user_awaiting': 'warn', 'notif_match_suggested': 'warn'
};
const toneOf = (key) => TONE[key] || 'info';

async function authenticate(socket) {
  const session = socket.request.session;
  const id = session && session.userId;
  if (!id) return null;
  const user = await userModel.findById(id);
  if (!user || user.status !== USER.ACTIVE) return null;
  if (user.passwordChangedAt && (session.authAt || 0) < new Date(user.passwordChangedAt).getTime()) return null;
  return user;
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // not a browser (a browser always sends Origin on a WebSocket handshake)
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

// Attach to the HTTP server. `sessionMiddleware` is the same express-session instance the app uses,
// so a socket sees the same login session as a normal request. Returns null when switched off.
function init(server, sessionMiddleware) {
  if (!config.realtime.enabled) return null;
  io = new Server(server, {
    // WebSocket only: no long-polling requests that would each read the session store.
    transports: ['websocket'],
    allowRequest: (req, callback) => { const ok = sameOrigin(req); callback(ok ? null : 'origin not allowed', ok); }
  });
  io.engine.use(sessionMiddleware);
  io.use(async (socket, next) => {
    try {
      const user = await authenticate(socket);
      if (!user) return next(new Error('unauthorized'));
      socket.data.userId = user.id;
      return next();
    } catch (err) {
      return next(err);
    }
  });
  io.on('connection', (socket) => { socket.join(room(socket.data.userId)); });
  return io;
}

// Called by notification.service after a notification is stored. Never throws: a broken socket
// must not undo the business action that caused the notification.
async function push(userId, n) {
  if (!io || SKIP.has(n.key)) return;
  try {
    const unread = await notificationModel.countUnread(userId);
    io.to(room(userId)).emit('notification', {
      id: n.id,
      tone: toneOf(n.key),
      link: n.link || null,
      unread,
      // Both languages are sent, because the person may switch language without reloading.
      message: { en: translate('en', n.key, n.params), bn: translate('bn', n.key, n.params) },
      at: n.createdAt
    });
  } catch (err) {
    console.error('[realtime] push failed:', err && err.message);
  }
}

// A suspended person is cut off at once, like the session check does for normal requests.
function disconnectUser(userId) {
  if (io) io.in(room(userId)).disconnectSockets(true);
}

// io.close() also closes the HTTP server it is attached to.
function shutdown(server, done) {
  if (io) { const s = io; io = null; s.close(() => done()); } else server.close(() => done());
}

module.exports = { init, push, disconnectUser, shutdown, toneOf, _io: () => io };
