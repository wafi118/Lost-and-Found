'use strict';
// Photo storage: local folder by default, Cloudinary (private delivery) when configured.
// The Cloudinary SDK upload and the download are replaced here, so no network call is made and no
// account is needed. What these tests prove is how this app uses the service, not that Cloudinary is up.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { Writable } = require('stream');
const { spawnSync } = require('child_process');
const { startServer, Client, signedIn, tinyPng, refFrom } = require('./helpers');
const config = require('../config');
const images = require('../utils/images');
const categoryModel = require('../models/category.model');

const FILE = /^[a-f0-9]{32}\.(jpg|png|webp)$/;
const inUploads = () => (fs.existsSync(config.upload.dir) ? fs.readdirSync(config.upload.dir).filter((f) => FILE.test(f)) : []);

// Switches Cloudinary on for one test, with a fake upload and a fake download, and restores everything after.
function fakeCloud(t, { uploadError = null, download } = {}) {
  const saved = { ...config.cloudinary };
  Object.assign(config.cloudinary, { enabled: true, cloudName: 'demo-cloud', apiKey: 'key123', apiSecret: 'secret456', folder: 'safefind-test' });
  const cloud = require('cloudinary').v2;
  const original = cloud.uploader.upload_stream;
  const uploads = [];
  const downloads = [];
  cloud.uploader.upload_stream = (options, done) => {
    const chunks = [];
    return new Writable({
      write(chunk, enc, cb) { chunks.push(chunk); cb(); },
      final(cb) {
        uploads.push({ options, bytes: Buffer.concat(chunks) });
        if (uploadError) done(new Error(uploadError)); else done(null, { public_id: options.public_id, secure_url: 'https://res.cloudinary.com/demo-cloud/image/authenticated/s--x--/' + options.public_id });
        cb();
      }
    });
  };
  const originalFetch = images._state.fetch;
  images._state.fetch = async (url) => {
    downloads.push(url);
    if (download) return download(url, uploads);
    const last = uploads[uploads.length - 1];
    return new Response(last ? last.bytes : 'missing', { status: last ? 200 : 404, headers: { 'content-type': 'image/png' } });
  };
  t.after(() => { Object.assign(config.cloudinary, saved); cloud.uploader.upload_stream = original; images._state.fetch = originalFetch; });
  return { uploads, downloads };
}

const reportFields = async () => ({
  type: 'lost', title: 'Blue umbrella', categoryId: (await categoryModel.findByName('Clothing or umbrella')).id, locationId: 1,
  description: 'A blue folding umbrella with a wooden handle', occurredAt: new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 16)
});
const photoFile = () => ({ field: 'photo', buffer: tinyPng(), name: 'phone.png', type: 'image/png' });

test('without Cloudinary credentials a photo is saved in the local folder under a random name', async () => {
  assert.equal(config.cloudinary.enabled, false, 'the test environment has no Cloudinary settings');
  const before = new Set(inUploads());
  const saved = await images.saveImage(tinyPng());
  assert.match(saved.file, FILE);
  assert.equal(saved.mime, 'image/png');
  assert.ok(!before.has(saved.file) && inUploads().includes(saved.file));
  assert.equal(fs.readFileSync(path.join(config.upload.dir, saved.file)).length, tinyPng().length);
  await assert.rejects(images.saveImage(Buffer.from('plain text, not an image')), { message: 'UPLOAD_TYPE' });
});

test('Cloudinary settings: three variables, or the single CLOUDINARY_URL, otherwise off', () => {
  const read = (env) => JSON.parse(spawnSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(require("./config").cloudinary))'], {
    cwd: path.join(__dirname, '..'), env: { PATH: process.env.PATH, NODE_ENV: 'test', ...env }, encoding: 'utf8'
  }).stdout);
  assert.equal(read({}).enabled, false);
  assert.equal(read({ CLOUDINARY_CLOUD_NAME: 'c', CLOUDINARY_API_KEY: 'k' }).enabled, false, 'a missing secret leaves it off');
  const three = read({ CLOUDINARY_CLOUD_NAME: 'c', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's', CLOUDINARY_FOLDER: '/photos/' });
  assert.deepEqual([three.enabled, three.cloudName, three.folder], [true, 'c', 'photos']);
  const url = read({ CLOUDINARY_URL: 'cloudinary://key:se%40cret@my-cloud' });
  assert.deepEqual([url.enabled, url.cloudName, url.apiKey, url.apiSecret], [true, 'my-cloud', 'key', 'se@cret']);
  assert.equal(read({ CLOUDINARY_URL: 'not a url' }).enabled, false);
});

test('with Cloudinary on, a photo is stored privately and nothing is written locally', async (t) => {
  const { uploads } = fakeCloud(t);
  const before = inUploads().length;
  const saved = await images.saveImage(tinyPng());
  assert.match(saved.file, FILE, 'the stored name keeps the same shape, so no database change is needed');
  assert.equal(inUploads().length, before);
  assert.equal(uploads.length, 1);
  const { options, bytes } = uploads[0];
  assert.equal(options.type, 'authenticated', 'private delivery: there is no public address');
  assert.equal(options.resource_type, 'image');
  assert.equal(options.overwrite, false);
  assert.deepEqual(options.allowed_formats, ['jpg', 'png', 'webp']);
  assert.equal(options.public_id, `safefind-test/${saved.file.replace(/\.png$/, '')}`);
  assert.deepEqual(bytes, tinyPng());
  // a file that is not an image never reaches the service
  await assert.rejects(images.saveImage(Buffer.from('<?php echo 1; ?>        ')), { message: 'UPLOAD_TYPE' });
  assert.equal(uploads.length, 1);
});

test('a storage failure is reported to the person, never saved locally by stealth', async (t) => {
  fakeCloud(t, { uploadError: 'Invalid API key' });
  const before = inUploads().length;
  await assert.rejects(images.saveImage(tinyPng()), { message: 'UPLOAD_STORAGE' });
  assert.equal(inUploads().length, before);

  const srv = await startServer();
  t.after(() => srv.close());
  const c = await signedIn(srv.base, 'student');
  const res = await c.multipart('/report', await reportFields(), photoFile(), { from: '/report' });
  assert.equal(res.status, 400);
  assert.match(res.text, /The photo could not be stored/);
  assert.match(res.text, /data-start-step="3"/, 'the photo step reopens');
  assert.match(res.text, /value="Blue umbrella"/, 'what was typed is kept');
  assert.equal(inUploads().length, before);
});

test('a private Cloudinary photo reaches only people who may see the case, through this server', async (t) => {
  const cloud = fakeCloud(t);
  const srv = await startServer();
  t.after(() => srv.close());
  const owner = await signedIn(srv.base, 'student');
  const sent = await owner.multipart('/report', await reportFields(), photoFile(), { from: '/report' });
  assert.equal(sent.status, 302, sent.text.slice(0, 200));
  const ref = refFrom(sent.location);
  const page = (await owner.get(`/items/${ref}`)).text;
  const file = (/\/uploads\/([a-f0-9]{32}\.png)/.exec(page) || [])[1];
  assert.ok(file, 'the case page links the photo through this server');
  assert.ok(!/cloudinary/i.test(page), 'no Cloudinary address is ever put in a page');
  assert.equal(cloud.uploads.length, 1);

  const img = await owner.get(`/uploads/${file}`, { raw: true });
  assert.equal(img.status, 200);
  assert.deepEqual(img.buffer, tinyPng());
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.equal(img.headers.get('cache-control'), 'private, no-store');
  assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(img.headers.get('content-security-policy'), "default-src 'none'; sandbox");

  // the download address is signed, short-lived, and asks for the authenticated copy
  assert.equal(cloud.downloads.length, 1);
  const url = new URL(cloud.downloads[0]);
  assert.equal(url.hostname, 'api.cloudinary.com');
  assert.equal(url.searchParams.get('type'), 'authenticated');
  assert.equal(url.searchParams.get('public_id'), `safefind-test/${file.replace(/\.png$/, '')}`);
  assert.equal(url.searchParams.get('format'), 'png');
  assert.ok(url.searchParams.get('signature'), 'signed');
  const expires = Number(url.searchParams.get('expires_at'));
  assert.ok(expires > Date.now() / 1000 && expires <= Date.now() / 1000 + 61, 'expires within a minute');
  assert.ok(!cloud.downloads[0].includes('secret456'), 'the API secret is never part of an address');

  // everyone else gets the same answer as for a missing file, and the service is not even asked
  const other = await signedIn(srv.base, 'student2');
  assert.equal((await other.get(`/uploads/${file}`)).status, 404);
  assert.equal((await new Client(srv.base).get(`/uploads/${file}`)).status, 302);
  assert.equal((await owner.get(`/uploads/${'0'.repeat(32)}.png`)).status, 404);
  assert.equal((await owner.get('/uploads/not-a-photo.png')).status, 404);
  assert.equal(cloud.downloads.length, 1, 'only the owner reached the service: every refusal is decided here, before it is asked');
  // staff may see it
  assert.equal((await (await signedIn(srv.base, 'security')).get(`/uploads/${file}`, { raw: true })).status, 200);
});

test('if the storage service cannot be reached the photo answers 404 and the page still works', async (t) => {
  const cloud = fakeCloud(t, { download: async () => { throw new Error('connect ETIMEDOUT'); } });
  const srv = await startServer();
  t.after(() => srv.close());
  const owner = await signedIn(srv.base, 'student');
  const sent = await owner.multipart('/report', await reportFields(), photoFile(), { from: '/report' });
  const ref = refFrom(sent.location);
  const file = (/\/uploads\/([a-f0-9]{32}\.png)/.exec((await owner.get(`/items/${ref}`)).text) || [])[1];
  const logged = [];
  const orig = console.error; console.error = (...a) => logged.push(a.join(' '));
  t.after(() => { console.error = orig; });
  assert.equal((await owner.get(`/uploads/${file}`)).status, 404);
  assert.equal((await owner.get(`/items/${ref}`)).status, 200);
  assert.ok(logged.some((l) => l.includes('ETIMEDOUT')), 'the failure is logged for the team');
  assert.equal(cloud.downloads.length, 1);

  // the service answering "not found" is also just a 404
  images._state.fetch = async () => new Response('nope', { status: 404 });
  assert.equal((await owner.get(`/uploads/${file}`)).status, 404);
});

test('a photo saved locally before Cloudinary was switched on is still served, without asking the service', async (t) => {
  const saved = await images.saveImage(tinyPng()); // Cloudinary is off here: written to the local folder
  const cloud = fakeCloud(t);
  const srv = await startServer();
  t.after(() => srv.close());
  const owner = await signedIn(srv.base, 'student');
  // attach the old local file to a case by creating the report in local mode first, then looking it up
  Object.assign(config.cloudinary, { enabled: false });
  const sent = await owner.multipart('/report', await reportFields(), photoFile(), { from: '/report' });
  const file = (/\/uploads\/([a-f0-9]{32}\.png)/.exec((await owner.get(`/items/${refFrom(sent.location)}`)).text) || [])[1];
  Object.assign(config.cloudinary, { enabled: true });
  const img = await owner.get(`/uploads/${file}`, { raw: true });
  assert.equal(img.status, 200);
  assert.equal(cloud.downloads.length, 0);
  assert.ok(saved.file);
});

test('the Content-Security-Policy needs no Cloudinary host, because photos pass through this server', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const csp = (await new Client(srv.base).get('/browse', { raw: true })).headers.get('content-security-policy');
  assert.ok(!/cloudinary/i.test(csp));
  assert.match(csp, /img-src 'self' data: blob:/, 'blob: lets the uploader show its preview');
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /connect-src 'self' ws:\/\/127\.0\.0\.1:\d+|connect-src 'self' ws:\/\/localhost:\d+/, "the site's own WebSocket address");
});
