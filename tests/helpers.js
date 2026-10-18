'use strict';
// Shared test helpers: a real server on a random port and a tiny cookie-keeping HTTP client.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SEED_DEMO_DATA = 'true';
const http = require('http');
const os = require('os');
const path = require('path');
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(os.tmpdir(), `safefind-test-${process.pid}`);

// { realtime: true } also attaches the Socket.io server, the way app.js does when the site starts.
async function startServer({ realtime = false } = {}) {
  const { boot } = require('../app');
  const app = await boot();
  const server = await new Promise((resolve) => { const s = http.createServer(app).listen(0, '127.0.0.1', () => resolve(s)); });
  const live = realtime ? require('../services/realtime.service') : null;
  if (live) live.init(server, app.get('sessionMiddleware'));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => (live ? live.shutdown(server, r) : server.close(r))) };
}

class Client {
  constructor(base) { this.base = base; this.cookies = new Map(); }

  cookieHeader() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '); }

  async request(url, { method = 'GET', form, body, headers = {}, raw = false } = {}) {
    const h = { ...headers };
    if (this.cookies.size) h.cookie = this.cookieHeader();
    let payload = body;
    if (form) { h['content-type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(form).toString(); }
    const res = await fetch(this.base + url, { method, headers: h, body: payload, redirect: 'manual' });
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      const gone = !value || attrs.some((a) => /max-age=0|expires=thu, 01 jan 1970/i.test(a));
      if (gone) this.cookies.delete(name); else this.cookies.set(name, value);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, location: res.headers.get('location'), buffer, text: raw ? '' : buffer.toString('utf8'), setCookie: res.headers.getSetCookie() };
  }

  get(url, opts) { return this.request(url, opts); }

  async csrf(fromUrl = '/auth/login') {
    const page = await this.get(fromUrl);
    const m = /name="_csrf" value="([^"]+)"/.exec(page.text) || /[?&]_csrf=([A-Za-z0-9_-]+)/.exec(page.text);
    if (!m) throw new Error(`no CSRF token on ${fromUrl} (status ${page.status})`);
    return m[1];
  }

  // POST a form. The token is read from `from` (a page that shows a form) unless one is given.
  async post(url, fields = {}, { from, token } = {}) {
    const t = token || await this.csrf(from || '/auth/login');
    return this.request(url, { method: 'POST', form: { _csrf: t, ...fields } });
  }

  // POST a multipart form with one file, the way the upload forms do: the CSRF token travels
  // in the query string because the multipart body is not parsed at the CSRF check.
  async multipart(url, fields = {}, file = null, { from, token } = {}) {
    const t = token || await this.csrf(from || '/auth/login');
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
    if (file) form.append(file.field, new Blob([file.buffer], { type: file.type || 'application/octet-stream' }), file.name || 'upload.bin');
    return this.request(`${url}${url.includes('?') ? '&' : '?'}_csrf=${encodeURIComponent(t)}`, { method: 'POST', body: form });
  }

  async login(email, password) {
    const res = await this.post('/auth/login', { email, password }, { from: '/auth/login' });
    if (res.status !== 302) throw new Error(`login failed for ${email}: ${res.status}`);
    return res;
  }
}

const ACCOUNTS = {
  admin: ['admin@safefind.example', 'Admin@12345'],
  security: ['security@safefind.example', 'Security@12345'],
  security2: ['security2@safefind.example', 'Security@12345'],
  approver: ['approver@safefind.example', 'Approver@12345'],
  student: ['student@safefind.example', 'Student@12345'],
  student2: ['student2@safefind.example', 'Student@12345'],
  staff: ['staff@safefind.example', 'Staff@12345']
};

async function signedIn(base, who) {
  const c = new Client(base);
  await c.login(...ACCOUNTS[who]);
  return c;
}

// A valid 8x8 PNG, generated rather than stored, so tests need no fixture files.
function tinyPng(rgb = [200, 80, 40]) {
  const { PNG } = require('pngjs');
  const png = new PNG({ width: 8, height: 8 });
  for (let i = 0; i < 64; i += 1) { png.data[i * 4] = rgb[0]; png.data[i * 4 + 1] = rgb[1]; png.data[i * 4 + 2] = rgb[2]; png.data[i * 4 + 3] = 255; }
  return PNG.sync.write(png);
}

// Reads the text out of a QR code image, as the browser scanner does.
function decodeQr(pngBuffer) {
  const { PNG } = require('pngjs');
  const jsQR = require('jsqr');
  const img = PNG.sync.read(pngBuffer);
  const result = jsQR(new Uint8ClampedArray(img.data), img.width, img.height);
  return result ? result.data : null;
}

const refFrom = (location) => { const m = /(SF-\d{4}-\d{4})/.exec(location || ''); return m ? m[1] : null; };

module.exports = { startServer, Client, ACCOUNTS, signedIn, tinyPng, decodeQr, refFrom };
