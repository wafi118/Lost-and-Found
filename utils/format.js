'use strict';
// Locale-aware formatting. Times are shown in Bangladesh time regardless of server timezone.
const { timezone } = require('../config');

const cache = {};

function build(lang) {
  const loc = lang === 'bn' ? 'bn-BD' : 'en-GB';
  const date = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', year: 'numeric', timeZone: timezone });
  const dateTime = new Intl.DateTimeFormat(loc, {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone
  });
  const number = new Intl.NumberFormat(loc);
  const rtf = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' });
  const toDate = (d) => (d instanceof Date ? d : new Date(d));

  return {
    date: (d) => (d ? date.format(toDate(d)) : ''),
    dateTime: (d) => (d ? dateTime.format(toDate(d)) : ''),
    num: (n) => number.format(Number(n) || 0),
    ago: (d) => {
      if (!d) return '';
      const s = Math.round((toDate(d).getTime() - Date.now()) / 1000);
      const abs = Math.abs(s);
      if (abs < 60) return rtf.format(0, 'second');
      if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
      if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
      if (abs < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day');
      if (abs < 86400 * 365) return rtf.format(Math.round(s / (86400 * 30)), 'month');
      return rtf.format(Math.round(s / (86400 * 365)), 'year');
    }
  };
}

function formatters(lang) {
  const key = lang === 'bn' ? 'bn' : 'en';
  if (!cache[key]) cache[key] = build(key);
  return cache[key];
}

// <input type="datetime-local"> works in local wall-clock time without a zone.
// Convert to and from Bangladesh time (UTC+6, no DST).
const OFFSET_MS = 6 * 60 * 60 * 1000;
const toInputValue = (d) => new Date(new Date(d).getTime() + OFFSET_MS).toISOString().slice(0, 16);
function parseInputValue(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00+06:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

module.exports = { formatters, toInputValue, parseInputValue };
