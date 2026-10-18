'use strict';
// File uploads. Files stay in memory until the controller has checked them by content (magic
// bytes), then are written under a random name. A failed upload does not abort the request:
// the error is stored on req so the form can be shown again with what the person typed.
const multer = require('multer');
const config = require('../config');

const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.upload.maxBytes, files: 1, fields: 30, fieldSize: 20 * 1024, parts: 40 }
});

function single(field) {
  const mw = parser.single(field);
  return (req, res, next) => mw(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      req.uploadError = err.code === 'LIMIT_FILE_SIZE' ? 'UPLOAD_SIZE' : 'UPLOAD_TYPE';
      req.body = req.body || {};
      return next();
    }
    return next(err);
  });
}

module.exports = { photo: single('photo'), proof: single('proof'), idcard: single('idcard') };
