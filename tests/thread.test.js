'use strict';
// Notes are readable by the person who reported the case. Updates sit beside them, photos can
// be removed, and the timeline keeps a line that says what was removed. Claims lists the QR.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, signedIn, tinyPng } = require('./helpers');

const REF = 'SF-2026-0008'; // the demo student's open textbook, visible on the public board
const FINDINGS = 'Checked the north camera for the blue bottle at the lockers.';
const CAMERA = 'CAM-NORTH-9';
const FROM_DESK = 'Please look in the side pocket again.';
const REPLY = 'Side pocket checked, photo attached.';
const DESK_PHOTO = 'Photo from the desk of the torn handle.';
const SNEAK = 'I should not be able to write on this case.';

const photo = (rgb) => ({ field: 'photo', buffer: tinyPng(rgb), type: 'image/png', name: 'photo.png' });

test('the reporter reads notes and updates, photos can be removed, and Claims shows the QR', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const student = await signedIn(srv.base, 'student');
  const other = await signedIn(srv.base, 'student2');
  const approver = await signedIn(srv.base, 'approver');
  const security = await signedIn(srv.base, 'security');
  const admin = await signedIn(srv.base, 'admin');
  const staff = await signedIn(srv.base, 'staff');
  const item = `/items/${REF}`;
  const desk = `/security/cases/${REF}`;

  const noted = await security.post(`${desk}/notes`, { kind: 'note', camera: CAMERA, findings: FINDINGS }, { from: desk });
  assert.equal(noted.status, 302, 'security can save a note');

  const owner = await student.get(item);
  assert.equal(owner.status, 200);
  assert.match(owner.text, /Checked the north camera/);
  assert.doesNotMatch(owner.text, new RegExp(CAMERA), 'camera name stays with Security Cell');
  assert.match(owner.text, /Updates/);

  const stranger = await other.get(item);
  assert.equal(stranger.status, 200);
  assert.doesNotMatch(stranger.text, /Checked the north camera/, 'another student does not see the note');
  const reviewer = await approver.get(item);
  assert.doesNotMatch(reviewer.text, /Checked the north camera/, 'an approver does not see the note');

  const staffPage = await security.get(desk);
  assert.match(staffPage.text, new RegExp(CAMERA));
  const adminPage = await admin.get(desk);
  assert.match(adminPage.text, new RegExp(CAMERA), 'an administrator still sees the camera details');

  const sent = await security.post(`${desk}/updates`, { body: FROM_DESK }, { from: desk });
  assert.equal(sent.status, 302);
  assert.match((await student.get(item)).text, /side pocket again/);
  const bell = await student.get('/notifications');
  assert.match(bell.text, /added a note|sent an update/);

  const empty = await security.post(`${desk}/updates`, { body: '   ' }, { from: desk });
  assert.equal(empty.status, 302);
  assert.match((await security.get(desk)).text, /Write a message or attach a photo/);

  const sneak = await other.post(`${item}/updates`, { body: SNEAK }, { from: '/account' });
  assert.equal(sneak.status, 302);
  assert.doesNotMatch((await student.get(item)).text, new RegExp(SNEAK));

  const reply = await student.multipart(`${item}/updates`, { body: REPLY }, photo([20, 140, 90]), { from: item });
  assert.equal(reply.status, 302, 'the reporter can attach a photo');
  const withPhoto = await security.get(desk);
  assert.match(withPhoto.text, /Side pocket checked/);
  const file = /\/uploads\/([a-f0-9]{32}\.png)/.exec(withPhoto.text);
  assert.ok(file, 'the photo is on the case');
  assert.equal((await student.get(`/uploads/${file[1]}`, { raw: true })).status, 200);
  assert.equal((await other.get(`/uploads/${file[1]}`, { raw: true })).status, 404, 'another student cannot open the photo');

  const imageForm = /action="(\/items\/SF-2026-0008\/updates\/\d+\/image)"/.exec((await student.get(item)).text);
  assert.ok(imageForm, 'the reporter can remove a photo');
  assert.equal((await student.post(imageForm[1], {}, { from: item })).status, 302);
  const afterImage = await student.get(item);
  assert.match(afterImage.text, /The photo was removed/);
  assert.match(afterImage.text, /A photo was removed/);
  assert.match(afterImage.text, /Side pocket checked/, 'the message stays when only the photo goes');
  assert.equal((await student.get(`/uploads/${file[1]}`, { raw: true })).status, 404, 'the file itself is gone');

  const deskPhoto = await security.multipart(`${desk}/updates`, { body: DESK_PHOTO }, photo([180, 40, 40]), { from: desk });
  assert.equal(deskPhoto.status, 302);
  const ownerAgain = await student.get(item);
  assert.match(ownerAgain.text, /Photo from the desk/);
  const deskFile = /\/uploads\/([a-f0-9]{32}\.png)/.exec(ownerAgain.text);
  assert.ok(deskFile);
  const removeDesk = /action="(\/items\/SF-2026-0008\/updates\/\d+\/image)"/.exec(ownerAgain.text);
  assert.equal((await student.post(removeDesk[1], {}, { from: item })).status, 302);
  const deskGone = await student.get(item);
  assert.match(deskGone.text, /Photo from the desk/);
  assert.match(deskGone.text, /The photo was removed/);
  assert.equal((await security.get(`/uploads/${deskFile[1]}`, { raw: true })).status, 404);

  const noteForm = /action="(\/security\/cases\/SF-2026-0008\/notes\/\d+\/delete)"/.exec((await security.get(desk)).text);
  assert.ok(noteForm);
  assert.equal((await student.post(noteForm[1], {}, { from: item })).status, 403, 'the reporter cannot remove a note');
  assert.equal((await security.post(noteForm[1], {}, { from: desk })).status, 302);
  const noteGone = await student.get(item);
  assert.doesNotMatch(noteGone.text, /Checked the north camera/, 'the note text is gone');
  assert.match(noteGone.text, /This note was removed/);
  assert.match(noteGone.text, /A note was removed/);
  assert.doesNotMatch((await security.get(desk)).text, new RegExp(CAMERA));

  const pocket = /side pocket again[\s\S]{0,800}?action="(\/security\/cases\/SF-2026-0008\/updates\/(\d+)\/delete)"/.exec((await security.get(desk)).text);
  assert.ok(pocket, 'security can remove their own update');
  assert.doesNotMatch((await student.get(item)).text, new RegExp(`/updates/${pocket[2]}/delete`), 'the reporter does not get a button for someone else\'s message');
  assert.equal((await security.post(pocket[1], {}, { from: desk })).status, 302);
  const updateGone = await student.get(item);
  assert.doesNotMatch(updateGone.text, /side pocket again/);
  assert.match(updateGone.text, /This update was removed/);
  assert.match(updateGone.text, /An update was removed/);

  const claims = await staff.get('/claims');
  assert.equal(claims.status, 200);
  assert.match(claims.text, /href="\/claims"/);
  assert.match(claims.text, /Blue steel water bottle/);
  assert.match(claims.text, /\/claims\/\d+\/qr\.png/);
  assert.match(claims.text, /[A-Z0-9]{4}-[A-Z0-9]{4}/);
  const qrPath = /\/claims\/(\d+)\/qr\.png/.exec(claims.text)[0];
  const qr = await staff.get(qrPath, { raw: true });
  assert.equal(qr.status, 200);
  assert.match(qr.headers.get('content-type') || '', /image\/png/);
  assert.equal((await other.get(qrPath, { raw: true })).status, 404, 'another person cannot open the QR');

  const mine = await student.get('/claims');
  assert.equal(mine.status, 200);
  assert.match(mine.text, /href="\/claims"/);
  assert.match(mine.text, /Grey hoodie|Black backpack/);
});
