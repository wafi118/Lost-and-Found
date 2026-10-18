'use strict';
// Security headers with a real Content-Security-Policy. Everything comes from this server:
// no inline scripts, no inline style attributes, no CDN (photos in Cloudinary are passed through this server). The one outside host is OpenStreetMap,
// for map tiles on the admin analytics page only (images, nothing executable).
const helmet = require('helmet');
const config = require('../config');

module.exports = () => [
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org', 'https://*.tile.openstreetmap.org'],
        fontSrc: ["'self'"],
        // Live alerts use a WebSocket back to this same host.
        connectSrc: ["'self'", ...(config.realtime.enabled ? [config.baseUrl.replace(/^http/, 'ws')] : [])],
        mediaSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        ...(config.isProd ? { upgradeInsecureRequests: [] } : {})
      }
    },
    crossOriginEmbedderPolicy: false,
    // Map tiles are fetched from another origin and expect at least the origin as referrer.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: config.isProd ? { maxAge: 15552000, includeSubDomains: true } : false
  }),
  (req, res, next) => {
    // The camera is used only by the handover scanner.
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=()');
    next();
  }
];
