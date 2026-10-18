'use strict';
// SafeFind BUP: application setup. `build()` wires the middleware and routes (used by the tests);
// `start()` seeds the starting data, schedules the retention sweep and listens.
const path = require('path');
const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const config = require('./config');
const security = require('./middleware/security');
const sessionMiddleware = require('./middleware/session');
const localeMiddleware = require('./middleware/locale');
const currentUser = require('./middleware/currentUser');
const csrf = require('./middleware/csrf');
const viewHelpers = require('./middleware/viewHelpers');
const rateLimiter = require('./middleware/rateLimiter');
const errors = require('./middleware/errors');
const realtime = require('./services/realtime.service');

const root = __dirname;
const vendor = (p) => path.join(root, 'node_modules', p);

function build() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.set('views', path.join(root, 'views'));
  app.set('view engine', 'ejs');
  app.set('view options', { root: path.join(root, 'views') }); // lets templates include('/partials/x')
  app.set('view cache', config.isProd);

  app.use(security());

  // Request log without the query string: upload forms carry their CSRF token there.
  morgan.token('path', (req) => String(req.originalUrl || req.url).split('?')[0]);
  if (!config.isTest) app.use(morgan(':method :path :status :response-time ms'));

  // Static files come before sessions, so asset requests never touch the session store.
  const assets = { maxAge: config.isProd ? '7d' : 0, index: false };
  const longLived = { maxAge: config.isProd ? '30d' : 0, index: false };
  app.use(express.static(path.join(root, 'public'), assets));
  app.use('/vendor/fonts/inter', express.static(vendor('@fontsource/inter/files'), longLived));
  app.use('/vendor/fonts/poppins', express.static(vendor('@fontsource/poppins/files'), longLived));
  app.use('/vendor/fonts/bengali', express.static(vendor('@fontsource/noto-sans-bengali/files'), longLived));
  app.use('/vendor/leaflet', express.static(vendor('leaflet/dist'), longLived));
  app.get('/vendor/chart.js', (req, res) => res.sendFile(vendor('chart.js/dist/chart.umd.js')));
  app.get('/vendor/jsqr.js', (req, res) => res.sendFile(vendor('jsqr/dist/jsQR.js')));
  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

  app.use(cookieParser());
  app.use(express.urlencoded({ extended: false, limit: '30kb' }));
  app.use(express.json({ limit: '10kb' }));
  const sessions = sessionMiddleware();
  app.use(sessions);
  app.set('sessionMiddleware', sessions); // Socket.io reads the same login session
  app.use(localeMiddleware);
  app.use(currentUser);
  app.use(csrf.locals);
  app.use(viewHelpers);
  app.use(rateLimiter.global);
  // Every state-changing request is checked here, before any body (including an upload) is read.
  app.use(csrf.verify);

  app.use('/', require('./routes/home.routes'));
  app.use('/auth', require('./routes/auth.routes'));
  app.use('/', require('./routes/member.routes'));
  app.use('/security', require('./routes/security.routes'));
  app.use('/approver', require('./routes/approver.routes'));
  app.use('/admin', require('./routes/admin.routes'));

  app.use(errors.notFound);
  app.use(errors.handler);
  return app;
}

async function boot() {
  const db = require('./db');
  await db.init();
  await require('./services/seed.service').seedAll();
  return build();
}

async function start() {
  const app = await boot();
  const retention = require('./services/retention.service');
  const identity = require('./services/identity.service');
  // Every six hours: flag unclaimed items (FR-25) and delete ID card photos whose time has passed (AUTH-12).
  const housekeeping = () => Promise.all([
    retention.sweep().catch((e) => console.error('[retention]', e)),
    identity.purgeDue().catch((e) => console.error('[identity]', e))
  ]);
  await housekeeping();
  const timer = setInterval(housekeeping, 6 * 60 * 60 * 1000);
  timer.unref();

  // The HTTP server is created here (not by app.listen) so Socket.io can share it.
  const server = http.createServer(app);
  realtime.init(server, app.get('sessionMiddleware'));
  server.listen(config.port, () => {
    console.log(`[SafeFind] running at ${config.baseUrl} (${config.env})`);
    if (config.seedDemoData) console.log('[SafeFind] demo data loaded. Demo accounts are listed in README.md.');
    const db = require('./db');
    console.log(`[SafeFind] database: ${db.kind()}; photos: ${config.cloudinary.enabled ? 'Cloudinary (private)' : 'local uploads folder'}; live alerts: ${config.realtime.enabled ? 'on' : 'off'}`);
  });
  const stop = () => realtime.shutdown(server, () => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));
  return server;
}

if (require.main === module) {
  start().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { build, boot, start };
