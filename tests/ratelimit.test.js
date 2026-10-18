'use strict';
// Rate limits are off in the other test files so they can sign in hundreds of times. Here they are on.
process.env.TEST_RATE_LIMIT = '1';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, Client, ACCOUNTS } = require('./helpers');

test('the sign-in limit answers a form with a page, and a script with JSON (D5)', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const [email, password] = ACCOUNTS.student;

  // 1. Forged requests (no valid CSRF token) never reach the limiter, so they cannot use up anyone's allowance.
  const forger = new Client(srv.base);
  await forger.get('/auth/login');
  for (let i = 0; i < 30; i += 1) {
    const res = await forger.request('/auth/login', { method: 'POST', form: { email, password: 'x', _csrf: 'forged' } });
    assert.equal(res.status, 403, `forged request ${i}`);
  }

  // 2. Successful sign-ins are not counted either.
  for (let i = 0; i < 25; i += 1) {
    const c = new Client(srv.base);
    const res = await c.post('/auth/login', { email, password });
    assert.equal(res.status, 302, `successful sign-in ${i} was limited`);
  }

  // 3. Failed attempts are. Twenty are allowed in the window; the next one is refused with a readable page.
  let last;
  for (let i = 0; i < 20; i += 1) {
    const c = new Client(srv.base);
    last = await c.post('/auth/login', { email: `nobody${i}@safefind.example`, password: 'Wrong@12345' });
    assert.notEqual(last.status, 429, `failure ${i} was limited too early`);
    assert.notEqual(last.status, 302);
  }
  const c = new Client(srv.base);
  const blocked = await c.post('/auth/login', { email: 'nobody99@safefind.example', password: 'Wrong@12345' });
  assert.equal(blocked.status, 429);
  assert.match(blocked.headers.get('content-type'), /text\/html/, 'a browser form gets a page, not JSON');
  assert.ok(Number(blocked.headers.get('retry-after')) >= 60, 'Retry-After is set');
  assert.ok(/<h1/.test(blocked.text) && /minute/i.test(blocked.text), 'the page says how long to wait');
  assert.ok(!blocked.text.includes('"error"'));

  const asScript = await c.request('/auth/login', { method: 'POST', form: { _csrf: await c.csrf('/auth/forgot'), email: 'x@safefind.example', password: 'x' }, headers: { 'x-requested-with': 'fetch' } });
  assert.equal(asScript.status, 429);
  assert.match(asScript.headers.get('content-type'), /application\/json/);
  assert.equal(JSON.parse(asScript.text).error, 'rate_limited');

  // Browsing is unaffected by the sign-in limit.
  assert.equal((await new Client(srv.base).get('/browse')).status, 200);
});
