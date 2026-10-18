'use strict';
// Single place where environment variables are read and validated.
// Everything else imports from here, never from process.env directly.
require('dotenv').config();
const crypto = require('crypto');
const path = require('path');

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';
const isTest = env === 'test';

const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(String(v)));
const int = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};
const num = (v, d) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};
const list = (v, d) => {
  const a = String(v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return a.length ? a : d;
};
const regex = (v, fallback) => {
  try { return new RegExp(v || fallback); } catch { return new RegExp(fallback); }
};

const port = int(process.env.PORT, 3000);

// Cloudinary holds uploaded photos when these are set (see utils/images.js). Either the three
// separate variables or the single CLOUDINARY_URL that Cloudinary shows in its dashboard works.
// With neither, photos stay in the local uploads folder.
const cloudinary = (() => {
  let cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
  let apiKey = process.env.CLOUDINARY_API_KEY || '';
  let apiSecret = process.env.CLOUDINARY_API_SECRET || '';
  if ((!cloudName || !apiKey || !apiSecret) && process.env.CLOUDINARY_URL) {
    try {
      const u = new URL(process.env.CLOUDINARY_URL);
      cloudName = u.hostname; apiKey = decodeURIComponent(u.username); apiSecret = decodeURIComponent(u.password);
    } catch { /* a malformed URL leaves Cloudinary switched off */ }
  }
  return {
    cloudName, apiKey, apiSecret,
    folder: (process.env.CLOUDINARY_FOLDER || 'safefind').replace(/^\/+|\/+$/g, ''),
    enabled: Boolean(cloudName && apiKey && apiSecret)
  };
})();

// A weak or missing secret is fatal in production. In development we use a
// random one, so sessions reset on restart but nothing insecure is committed.
let sessionSecret = process.env.SESSION_SECRET || '';
const weakSecret = sessionSecret.length < 24 || /change_this|dev_only|changeme|secret$/i.test(sessionSecret);
if (weakSecret) {
  if (isProd) throw new Error('SESSION_SECRET must be a random string of at least 24 characters in production.');
  sessionSecret = crypto.randomBytes(32).toString('hex');
  if (!isTest) console.warn('[SafeFind] SESSION_SECRET missing or weak, using a random one for this run (sessions reset on restart).');
}

const trustProxyRaw = process.env.TRUST_PROXY;
const trustProxy = trustProxyRaw === undefined || trustProxyRaw === ''
  ? false
  : (/^\d+$/.test(trustProxyRaw) ? Number(trustProxyRaw) : bool(trustProxyRaw, false));

module.exports = {
  env, isProd, isTest, port,
  baseUrl: (process.env.BASE_URL || `http://localhost:${port}`).replace(/\/+$/, ''),
  trustProxy,
  sessionSecret,
  // Key used to sign handover QR tokens. Separate from the session secret on purpose.
  qrSecret: process.env.QR_SECRET || crypto.createHmac('sha256', sessionSecret).update('safefind-qr').digest('hex'),
  databaseUrl: process.env.DATABASE_URL || '',
  bcryptRounds: int(process.env.BCRYPT_ROUNDS, isTest ? 4 : 12),
  // Secure cookies need HTTPS. Set COOKIE_SECURE=false only to try production mode on plain http://localhost.
  cookieSecure: bool(process.env.COOKIE_SECURE, isProd),

  auth: {
    // Who may hold an account. Matching is done on a dot boundary (see auth.service).
    allowedEmailDomains: list(process.env.ALLOWED_EMAIL_DOMAINS, ['bup.edu.bd']),
    allowSubdomains: bool(process.env.ALLOW_EMAIL_SUBDOMAINS, true),
    requireAdminApproval: bool(process.env.REQUIRE_ADMIN_APPROVAL, false),
    studentIdPattern: regex(process.env.STUDENT_ID_PATTERN, '^\\d{8,14}$'),
    staffIdPattern: regex(process.env.STAFF_ID_PATTERN, '^[A-Za-z0-9][A-Za-z0-9\\-/]{2,19}$'),
    verifyTtlMs: 24 * 60 * 60 * 1000,
    resetTtlMs: 60 * 60 * 1000,
    inviteTtlMs: 48 * 60 * 60 * 1000,
    sessionIdleMs: 2 * 60 * 60 * 1000,
    maxFailedPerEmail: 6,
    // Registration with an ID card photo, for people who have no university address (AUTH-8 to AUTH-12).
    idCard: {
      enabled: bool(process.env.ALLOW_ID_CARD_REGISTRATION, true),
      // How many photos one person may send in total. A rejection that reaches this number is final.
      maxAttempts: Math.max(1, int(process.env.ID_CARD_MAX_ATTEMPTS, 3)),
      // The photo is deleted this many days after the decision. 0 deletes it at the next clean-up run.
      keepDays: Math.max(0, int(process.env.ID_CARD_KEEP_DAYS, 30)),
      resubmitTtlMs: 7 * 24 * 60 * 60 * 1000
    }
  },

  mail: {
    host: process.env.SMTP_HOST || '',
    port: int(process.env.SMTP_PORT, 587),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'SafeFind BUP <no-reply@bup.edu.bd>'
  },

  upload: {
    dir: path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads')),
    maxBytes: int(process.env.MAX_UPLOAD_MB, 3) * 1024 * 1024
  },

  cloudinary,

  // Live alerts over Socket.io. Set REALTIME=false if the server sits behind a proxy that cannot pass
  // WebSocket connections: everything still works, people just see new notifications on the next page.
  realtime: { enabled: bool(process.env.REALTIME, true) },

  seedDemoData: bool(process.env.SEED_DEMO_DATA, !isProd),

  // Used only when no administrator exists yet (first deployment). Never a default password.
  bootstrapAdmin: {
    email: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
    password: process.env.ADMIN_PASSWORD || '',
    name: process.env.ADMIN_NAME || 'System Administrator'
  },

  limits: {
    reportsPerDay: int(process.env.MAX_REPORTS_PER_DAY, 10),
    claimsPerDay: int(process.env.MAX_CLAIMS_PER_DAY, 5)
  },

  // Requests per IP address in a 15-minute window. If many students reach the server through one
  // shared public address (campus NAT), they share one allowance: raise these, or put the app behind
  // a proxy that passes the real client address and set TRUST_PROXY.
  rateLimits: {
    global: int(process.env.RATE_LIMIT_GLOBAL, 3000),
    loginFailures: int(process.env.RATE_LIMIT_LOGIN_FAILURES, 20)
  },

  // Optional public contact details. Shown only when set, never invented.
  contact: {
    location: process.env.SECURITY_CELL_LOCATION || '',
    phone: process.env.SECURITY_CELL_PHONE || '',
    email: process.env.SECURITY_CELL_EMAIL || '',
    hours: process.env.SECURITY_CELL_HOURS || ''
  },

  // Bangladesh does not observe daylight saving, so a fixed offset is safe.
  timezone: 'Asia/Dhaka',
  tzOffset: '+06:00',
  campus: { lat: num(process.env.CAMPUS_LAT, 23.8411), lng: num(process.env.CAMPUS_LNG, 90.3577) }
};
