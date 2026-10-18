'use strict';
// Locale files are read once at startup. Any key missing from Bangla falls back to English,
// so an untranslated string shows up in English instead of as a blank.
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'locales');
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

const en = read('en.json');
const bnOwn = read('bn.json');
const bundles = { en, bn: { ...en, ...bnOwn } };

const interpolate = (str, params) =>
  String(str).replace(/\{(\w+)\}/g, (m, k) => (params && params[k] !== undefined && params[k] !== null ? params[k] : m));

const normalize = (lang) => (lang === 'bn' ? 'bn' : 'en');
const getBundle = (lang) => bundles[normalize(lang)];
const translate = (lang, key, params) => {
  const b = getBundle(lang);
  return interpolate(b[key] !== undefined ? b[key] : key, params);
};

module.exports = { getBundle, translate, interpolate, normalize, _own: { en, bn: bnOwn } };
