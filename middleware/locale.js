'use strict';
// Language for this request: the "lang" cookie (set by /lang/:code), English by default.
const { translate, normalize } = require('../utils/i18n');
const { formatters } = require('../utils/format');

module.exports = (req, res, next) => {
  const lang = normalize(req.cookies && req.cookies.lang);
  req.lang = lang;
  res.locals.lang = lang;
  res.locals.t = (key, params) => translate(lang, key, params);
  res.locals.fmt = formatters(lang);
  next();
};
