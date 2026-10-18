'use strict';
// The real SMTP path. The other tests run with no mail server, so a tiny fake SMTP server stands in for one.
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');

function fakeSmtp() {
  const received = [];
  const server = net.createServer((sock) => {
    let buffer = ''; let message = ''; let inData = false;
    sock.write('220 fake ESMTP\r\n');
    sock.on('error', () => {});
    sock.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let i;
      while ((i = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, i); buffer = buffer.slice(i + 2);
        if (inData) {
          if (line === '.') { inData = false; received.push(message); message = ''; sock.write('250 queued\r\n'); } else message += `${line}\n`;
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO') sock.write('250-fake\r\n250 8BITMIME\r\n');
        else if (cmd === 'DATA') { inData = true; sock.write('354 go ahead\r\n'); }
        else if (cmd === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
        else sock.write('250 OK\r\n');
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    port: server.address().port, received, close: () => new Promise((done) => server.close(() => done()))
  })));
}

test('mail leaves through SMTP, demo addresses never do, a header cannot be injected, a dead server does not throw', async (t) => {
  const smtp = await fakeSmtp();
  t.after(() => smtp.close());
  Object.assign(process.env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.port), SMTP_SECURE: 'false', MAIL_FROM: 'SafeFind BUP <no-reply@bup.edu.bd>' });
  const mailer = require('../services/mailer.service');
  assert.equal(mailer.isConfigured, true);

  assert.equal(await mailer.send({ to: 'student@bup.edu.bd', subject: 'Confirm your address', text: 'Open this link: https://safefind.example/auth/verify/abc' }), true);
  assert.equal(smtp.received.length, 1);
  const raw = smtp.received[0];
  assert.match(raw, /^From: SafeFind BUP <no-reply@bup\.edu\.bd>/m);
  assert.match(raw, /^To: student@bup\.edu\.bd/m);
  assert.match(raw, /^Subject: Confirm your address/m);
  assert.match(raw, /Open this link: https:\/\/safefind\.example\/auth\/verify\/abc/);

  assert.equal(await mailer.send({ to: 'student@safefind.example', subject: 'Demo', text: 'x' }), true);
  assert.equal(smtp.received.length, 1, 'a reserved .example address is never sent to');

  await mailer.send({ to: 'a@bup.edu.bd', subject: 'Hello\r\nBcc: attacker@evil.test', text: 'x' });
  assert.equal(smtp.received.length, 2);
  assert.ok(!/^Bcc:/mi.test(smtp.received[1]), 'a line break in the subject must not start a new header');

  await smtp.close();
  assert.equal(await mailer.send({ to: 'b@bup.edu.bd', subject: 'Nobody home', text: 'x' }), false, 'a failure is reported, not thrown');
});
