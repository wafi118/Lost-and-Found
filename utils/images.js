'use strict';
// Upload handling. The browser-supplied MIME type and filename are never trusted:
// the file type is decided from the first bytes, and the stored name is random.
//
// Where photos live: in Cloudinary when credentials are configured (config.cloudinary), otherwise in
// the local uploads folder. Photos are private user data either way, so a Cloudinary photo is stored
// with delivery type "authenticated" and is never linked from a page. /uploads/:file checks who may
// see it, then this module fetches it with a short-lived signed address and passes the bytes on.
// The browser only ever talks to this server (so the Content-Security-Policy needs no extra host).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const config = require('../config');

function sniff(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: '.jpg', mime: 'image/jpeg' };
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: '.png', mime: 'image/png' };
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return { ext: '.webp', mime: 'image/webp' };
  return null;
}

const MIME_BY_EXT = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

// Tests replace `fetch` here so no network call is made.
const state = {
  fetch: (...args) => globalThis.fetch(...args),
  destroy: (publicId, options) => sdk().uploader.destroy(publicId, options)
};

// ---------------------------------------------------------------- Cloudinary
// Settings are read at call time (not at load), and the SDK is only required when it is used.
function sdk() {
  const { v2 } = require('cloudinary');
  const c = config.cloudinary;
  v2.config({ cloud_name: c.cloudName, api_key: c.apiKey, api_secret: c.apiSecret, secure: true });
  return v2;
}
const cloudId = (file) => `${config.cloudinary.folder}/${file.replace(/\.[a-z0-9]+$/i, '')}`;

function uploadToCloud(buf, file) {
  const cloud = sdk();
  return new Promise((resolve, reject) => {
    const stream = cloud.uploader.upload_stream(
      { public_id: cloudId(file), type: 'authenticated', resource_type: 'image', overwrite: false, allowed_formats: ['jpg', 'png', 'webp'] },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buf);
  });
}

// ---------------------------------------------------------------- saving
// Returns { file, mime } or throws Error('UPLOAD_TYPE') (not an image) or Error('UPLOAD_STORAGE')
// (the storage service refused or could not be reached).
async function saveImage(buf) {
  const type = sniff(buf);
  if (!type) throw new Error('UPLOAD_TYPE');
  const file = crypto.randomBytes(16).toString('hex') + type.ext;

  if (config.cloudinary.enabled) {
    // No silent fallback to the local folder: on a hosting platform with a temporary disk the photo
    // would vanish on the next deploy. The person is asked to try again instead.
    try {
      await uploadToCloud(buf, file);
    } catch (err) {
      console.error('[images] Cloudinary upload failed:', err && (err.message || err));
      throw new Error('UPLOAD_STORAGE');
    }
    return { file, mime: type.mime };
  }

  await fs.promises.mkdir(config.upload.dir, { recursive: true, mode: 0o700 });
  await fs.promises.writeFile(path.join(config.upload.dir, file), buf, { mode: 0o600 });
  return { file, mime: type.mime };
}

// ---------------------------------------------------------------- sending
const exists = (p) => fs.promises.access(p).then(() => true, () => false);

// Sends a stored image to the response. Resolves true when it was sent, false when there is no such
// photo. The caller has already checked that this person may see it and has set the headers.
// A photo saved before Cloudinary was switched on is still served from the local folder.
async function sendStored(res, file) {
  const local = path.join(config.upload.dir, file);
  if (await exists(local)) {
    await new Promise((resolve, reject) => res.sendFile(local, (err) => (err ? reject(err) : resolve())));
    return true;
  }
  if (!config.cloudinary.enabled) return false;

  const format = file.split('.').pop();
  const url = sdk().utils.private_download_url(cloudId(file), format, {
    resource_type: 'image', type: 'authenticated', expires_at: Math.floor(Date.now() / 1000) + 60
  });
  const upstream = await state.fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!upstream.ok || !upstream.body) {
    console.error('[images] Cloudinary answered', upstream.status, 'for a stored photo (check the cloud name, key and secret)');
    if (upstream.body && upstream.body.cancel) upstream.body.cancel().catch(() => {});
    return false;
  }
  const length = upstream.headers.get('content-length');
  if (length) res.set('Content-Length', length);
  await pipeline(Readable.fromWeb(upstream.body), res);
  return true;
}

// ---------------------------------------------------------------- deleting
// Removes a stored image from the local folder and from Cloudinary. A file that is already gone counts as
// deleted. Throws only when Cloudinary could not be reached, so the caller can try again later.
const STORED_NAME = /^[a-f0-9]{32}\.(jpg|png|webp)$/;

async function deleteStored(file) {
  if (!STORED_NAME.test(String(file || ''))) return false; // never builds a path from anything but our own names
  let removed = false;
  try {
    await fs.promises.unlink(path.join(config.upload.dir, file));
    removed = true;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  if (config.cloudinary.enabled) {
    const result = await state.destroy(cloudId(file), { type: 'authenticated', resource_type: 'image', invalidate: true });
    if (result && result.result === 'ok') removed = true;
  }
  return removed;
}

module.exports = { sniff, saveImage, sendStored, deleteStored, MIME_BY_EXT, _state: state };
