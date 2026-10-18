'use strict';
// Outgoing email. With SMTP settings it sends for real; without them (development) it prints
// the message and keeps the last few so the verification link can be shown on screen.
const nodemailer = require('nodemailer');
const config = require('../config');

const transport = config.mail.host
  ? nodemailer.createTransport({
      host: config.mail.host, port: config.mail.port, secure: config.mail.secure,
      auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined
    })
  : null;

const outbox = [];

async function send({ to, subject, text, link = null }) {
  // Demo accounts use the reserved .example TLD, which never has a real mailbox.
  const reserved = /\.example$/i.test(String(to));
  if (transport && !reserved) {
    try {
      await transport.sendMail({ from: config.mail.from, to, subject, text });
      return true;
    } catch (err) {
      console.error('[mail] send failed:', err.message);
      return false;
    }
  }
  if (!config.isProd) {
    outbox.unshift({ to, subject, text, link, at: new Date() });
    outbox.length = Math.min(outbox.length, 25);
    if (!config.isTest) console.log(`[mail:dev] to=${to} subject="${subject}"${link ? `\n           link: ${link}` : ''}`);
  }
  return true;
}

// Development only: lets the "check your email" page show the link when no SMTP is configured.
const latestLinkFor = (to) => {
  if (config.isProd) return null;
  const m = outbox.find((x) => x.to === to && x.link);
  return m ? m.link : null;
};

module.exports = { send, latestLinkFor, isConfigured: !!transport };
