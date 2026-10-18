'use strict';
// Public pages: anyone can read these without signing in.
const wrap = require('../utils/wrapController');
const cases = require('../services/case.service');
const categoryModel = require('../models/category.model');
const locationModel = require('../models/location.model');
const safeRedirect = require('../utils/safeRedirect');
const team = require('../config/team');
const config = require('../config');
const { isPartial, pageNum, oneOfOr, intOr, shortText } = require('./_helpers');

// Buildings people can filter by: one entry per building name, in the visitor's language.
function buildingOptions(locations, lang) {
  const seen = new Map();
  locations.filter((l) => l.active).forEach((l) => {
    if (!seen.has(l.building)) seen.set(l.building, lang === 'bn' && l.buildingBn ? l.buildingBn : l.building);
  });
  return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}

async function feed(req, pageSize) {
  const [categories, locations] = await Promise.all([categoryModel.list({ activeOnly: true }), locationModel.list({ activeOnly: true })]);
  const buildings = buildingOptions(locations, req.lang);
  const wanted = shortText(req.query.building, 80);
  const filters = {
    type: oneOfOr(req.query.type, ['lost', 'found']),
    categoryId: intOr(req.query.category),
    building: buildings.some((b) => b.value === wanted) ? wanted : '', // anything else in the URL is ignored
    q: shortText(req.query.q)
  };
  const list = await cases.publicFeed({ ...filters, page: pageNum(req), pageSize }, req.lang);
  return { filters, list, categories, buildings };
}

module.exports = wrap({
  async home(req, res) {
    const [data, stats] = await Promise.all([feed(req, 8), cases.publicStats()]);
    res.render('home', { pageTitle: res.locals.t('site_name'), ...data, stats, contact: config.contact, team });
  },

  async browse(req, res) {
    const data = await feed(req, 12);
    if (isPartial(req)) {
      res.set('Cache-Control', 'no-store'); // never let a results fragment be shown as a page
      return res.render('partials/browse-results', data);
    }
    return res.render('browse', { pageTitle: res.locals.t('browse_title'), ...data });
  },

  about(req, res) {
    res.render('about', { pageTitle: res.locals.t('about_title'), team, contact: config.contact });
  },

  // Language switch. Works without JavaScript; returns to the page the person was on.
  setLang(req, res) {
    const lang = req.params.code === 'bn' ? 'bn' : 'en';
    res.cookie('lang', lang, { maxAge: 365 * 24 * 3600 * 1000, sameSite: 'lax', httpOnly: true, secure: config.cookieSecure, path: '/' });
    res.redirect(safeRedirect(req.query.next, '/', { allowAuth: true }));
  }
});
