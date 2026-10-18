'use strict';
// Live alerts over a real WebSocket connection (socket.io-client): who may connect, who receives what,
// and that a broken socket layer never undoes the action that caused the notification.
const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { startServer, Client, signedIn, refFrom } = require('./helpers');
const config = require('../config');
const realtime = require('../services/realtime.service');
const userModel = require('../models/user.model');
const notificationModel = require('../models/notification.model');
const categoryModel = require('../models/category.model');
const { toInputValue } = require('../utils/format');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (check()) return true; await wait(20); }
  return false;
}

// Opens a WebSocket with the person's session cookie. Resolves with the socket, rejects with the connect error.
function open(base, client, headers = {}) {
  return new Promise((resolve, reject) => {
    const extraHeaders = { ...headers };
    if (client) extraHeaders.cookie = client.cookieHeader();
    const socket = connect(base, { transports: ['websocket'], extraHeaders, reconnection: false, forceNew: true });
    socket.received = [];
    socket.on('notification', (n) => socket.received.push(n));
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => { socket.close(); reject(err); });
  });
}

// A server with live alerts, and the named people signed in and connected.
async function setup(t, who) {
  const srv = await startServer({ realtime: true });
  const sockets = [];
  const people = {};
  for (const name of who) {
    const client = await signedIn(srv.base, name);
    const socket = await open(srv.base, client);
    sockets.push(socket);
    people[name] = { client, socket };
  }
  t.after(async () => { sockets.forEach((s) => s.close()); await srv.close(); });
  await wait(60); // the server has put each socket in its room
  const quiet = () => Object.values(people).forEach((p) => { p.socket.received.length = 0; });
  return { srv, people, quiet };
}

let counter = 0;
// A found item recorded by Security Cell staff, so each test has a fresh one to claim.
async function newFoundItem(security) {
  counter += 1;
  const category = await categoryModel.findByName('Other');
  const res = await security.multipart('/security/intake', {
    categoryId: category.id, locationId: 4, title: `Test item number ${counter}`,
    description: 'A plain object left on a table by the window, nothing written on it.', locationDetail: 'Table by the window',
    occurredAt: toInputValue(new Date(Date.now() - 3 * 3600e3)), finderName: 'Library attendant', storageSlot: `T-${counter}`
  }, null, { from: '/security/intake' });
  assert.equal(res.status, 302, res.text.slice(0, 300));
  return refFrom(res.location);
}

async function submitClaim(client, ref) {
  const res = await client.multipart(`/items/${ref}/claim`, { statement: 'It is mine: a plain object with a scratch on one side, I left it on that table.' }, null, { from: `/items/${ref}/claim` });
  assert.equal(res.status, 302, res.text.slice(0, 300));
  return Number(/\/claims\/(\d+)/.exec(res.location)[1]);
}

test('a visitor without a valid session cannot open a live connection', async (t) => {
  const srv = await startServer({ realtime: true });
  t.after(() => srv.close());
  await assert.rejects(open(srv.base, null), (err) => err.message === 'unauthorized');
  const forged = new Client(srv.base);
  forged.cookies.set('sf.sid', 's%3Anot-a-real-session.abc');
  await assert.rejects(open(srv.base, forged), (err) => err.message === 'unauthorized');
  const real = await signedIn(srv.base, 'student');
  (await open(srv.base, real)).close();
});

test('a page on another website cannot open a live connection for the visitor', async (t) => {
  const srv = await startServer({ realtime: true });
  t.after(() => srv.close());
  const c = await signedIn(srv.base, 'student');
  await assert.rejects(open(srv.base, c, { origin: 'https://evil.example' }));
  (await open(srv.base, c, { origin: srv.base })).close();
});

test('a new claim alerts both Security Cell staff, and nobody else', async (t) => {
  const { people, quiet } = await setup(t, ['security', 'security2', 'admin', 'student', 'student2']);
  const ref = await newFoundItem(people.security.client);
  await wait(150); quiet();
  const id = await submitClaim(people.student2.client, ref);
  assert.ok(await until(() => people.security.socket.received.length >= 1 && people.security2.socket.received.length >= 1));
  await wait(150);
  for (const who of ['security', 'security2']) {
    assert.equal(people[who].socket.received.length, 1, who);
    const n = people[who].socket.received[0];
    assert.equal(n.message.en, `New claim for ${ref}.`);
    assert.equal(n.tone, 'warn');
    assert.equal(n.link, `/security/claims/${id}`);
    assert.ok(Number.isInteger(n.unread) && n.unread >= 1);
  }
  assert.equal(people.admin.socket.received.length, 0, 'the administrator is not a Security Cell recipient');
  assert.equal(people.student.socket.received.length, 0);
  assert.equal(people.student2.socket.received.length, 0, 'the claimant is not alerted about their own action');
});

test('a verified claim alerts the claimant only, in both languages, with nothing extra in the message', async (t) => {
  const { people, quiet } = await setup(t, ['security', 'staff', 'student']);
  const ref = await newFoundItem(people.security.client);
  const id = await submitClaim(people.staff.client, ref);
  await wait(150); quiet();
  const res = await people.security.client.post(`/security/claims/${id}/verify`, { note: 'Described it correctly.' }, { from: `/security/claims/${id}` });
  assert.equal(res.status, 302);
  assert.ok(await until(() => people.staff.socket.received.length >= 1));
  await wait(150);
  assert.equal(people.staff.socket.received.length, 1);
  const n = people.staff.socket.received[0];
  assert.deepEqual(Object.keys(n).sort(), ['at', 'id', 'link', 'message', 'tone', 'unread']);
  assert.equal(n.tone, 'success');
  assert.equal(n.message.en, `Your claim for ${ref} is verified. Collect the item with your QR code.`);
  assert.ok(n.message.bn.includes(ref) && n.message.bn !== n.message.en, 'the Bangla text is sent too');
  assert.equal(n.link, `/claims/${id}`);
  const staffUser = await userModel.findByEmail('staff@safefind.example');
  assert.equal(n.unread, await notificationModel.countUnread(staffUser.id), 'the badge count matches the stored notifications');
  assert.equal(people.security.socket.received.length, 0);
  assert.equal(people.student.socket.received.length, 0);
});

test('a proof request is amber and a rejection is red', async (t) => {
  const { people, quiet } = await setup(t, ['security', 'student']);
  const ref = await newFoundItem(people.security.client);
  const id = await submitClaim(people.student.client, ref);
  await wait(150); quiet();
  const page = `/security/claims/${id}`;
  let res = await people.security.client.post(`${page}/request-proof`, { reason: 'Please send a clear photo of the object.' }, { from: page });
  assert.equal(res.status, 302);
  assert.ok(await until(() => people.student.socket.received.length >= 1));
  assert.equal(people.student.socket.received[0].tone, 'warn');
  assert.match(people.student.socket.received[0].message.en, /asked for proof/);
  res = await people.security.client.post(`${page}/reject`, { reason: 'The description did not match the object.' }, { from: page });
  assert.equal(res.status, 302);
  assert.ok(await until(() => people.student.socket.received.length >= 2));
  assert.equal(people.student.socket.received[1].tone, 'error');
  assert.match(people.student.socket.received[1].message.en, /rejected/);
});

test('your own report is not pushed back to you, and the Security Cell hears about it', async (t) => {
  const { people, quiet } = await setup(t, ['student', 'security']);
  quiet();
  const category = await categoryModel.findByName('Clothing or umbrella');
  const res = await people.student.client.multipart('/report', {
    type: 'lost', title: 'Grey wool scarf', categoryId: category.id, locationId: 1,
    description: 'A long grey wool scarf with a short fringe at both ends.', occurredAt: toInputValue(new Date(Date.now() - 3600e3))
  }, null, { from: '/report' });
  assert.equal(res.status, 302, res.text.slice(0, 300));
  assert.ok(await until(() => people.security.socket.received.length >= 1));
  assert.match(people.security.socket.received[0].message.en, /is waiting for review\./);
  assert.equal(people.security.socket.received[0].tone, 'warn');
  await wait(200);
  assert.equal(people.student.socket.received.length, 0, 'a message that only repeats what you just did is not pushed');
  const me = await userModel.findByEmail('student@safefind.example');
  assert.equal((await notificationModel.forUser(me.id)).rows[0].key, 'notif_report_received', 'it is still stored for the notifications page');
});

test('a browser cannot ask to join another person\'s room', async (t) => {
  const { people, quiet } = await setup(t, ['student', 'student2', 'security']);
  const rogue = people.student.socket;
  const targets = ['role:security', 'user:6', 'user:2', 'security'];
  for (const event of ['join', 'subscribe', 'room', 'joinRoom', 'watch']) targets.forEach((x) => rogue.emit(event, x));
  await wait(150); quiet();
  const ref = await newFoundItem(people.security.client);
  await submitClaim(people.student2.client, ref);
  assert.ok(await until(() => people.security.socket.received.length >= 1));
  await wait(200);
  assert.equal(rogue.received.length, 0);
});

test('a failing socket layer never undoes the action that caused the alert', async (t) => {
  const { srv, people, quiet } = await setup(t, ['security', 'student2']);
  const ref = await newFoundItem(people.security.client);
  await wait(100); quiet();
  const io = realtime._io();
  const original = io.to;
  const logged = [];
  const originalError = console.error;
  console.error = (...a) => logged.push(a.join(' '));
  io.to = () => { throw new Error('the socket layer exploded'); };
  t.after(() => { io.to = original; console.error = originalError; });

  const id = await submitClaim(people.student2.client, ref); // submitClaim asserts a 302
  const res = await people.security.client.post(`/security/claims/${id}/verify`, { note: 'ok' }, { from: `/security/claims/${id}` });
  assert.equal(res.status, 302);
  const user = await userModel.findByEmail('student2@safefind.example');
  assert.ok((await notificationModel.forUser(user.id)).rows.some((n) => n.key === 'notif_claim_verified'), 'the notification is stored');
  assert.ok(logged.some((l) => l.includes('[realtime] push failed')), 'and the failure is logged');
  assert.equal((await new Client(srv.base).get('/healthz')).status, 200);
});

test('suspending an account closes its open connections and blocks new ones', async (t) => {
  const { srv, people } = await setup(t, ['admin', 'approver']);
  const user = await userModel.findByEmail('approver@safefind.example');
  const closed = new Promise((resolve) => people.approver.socket.on('disconnect', resolve));
  const res = await people.admin.client.post(`/admin/users/${user.id}/suspend`, {}, { from: '/admin/users' });
  assert.equal(res.status, 302);
  assert.equal(await Promise.race([closed, wait(3000).then(() => 'still open')]), 'io server disconnect');
  await assert.rejects(open(srv.base, people.approver.client), (err) => err.message === 'unauthorized');
});

test('a session older than the last password change cannot connect', async (t) => {
  const srv = await startServer({ realtime: true });
  t.after(() => srv.close());
  const c = await signedIn(srv.base, 'security2');
  (await open(srv.base, c)).close();
  const user = await userModel.findByEmail('security2@safefind.example');
  await userModel.update(user.id, { passwordChangedAt: new Date(Date.now() + 60000) });
  await assert.rejects(open(srv.base, c), (err) => err.message === 'unauthorized');
});

test('with live alerts switched off there is no socket endpoint and no socket script in the pages', async (t) => {
  const saved = config.realtime.enabled;
  config.realtime.enabled = false;
  t.after(() => { config.realtime.enabled = saved; });
  const srv = await startServer({ realtime: true });
  t.after(() => srv.close());
  const c = await signedIn(srv.base, 'student');
  const page = (await c.get('/dashboard')).text;
  assert.ok(!page.includes('socket.io') && !page.includes('realtime.js'));
  assert.equal((await new Client(srv.base).get('/socket.io/?EIO=4&transport=polling')).status, 404);
  assert.equal((await c.get('/notifications')).status, 200, 'the stored notifications still work');
});
