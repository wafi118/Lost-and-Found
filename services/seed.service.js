'use strict';
// Starting data.
//   baseline: categories and a generic place list. Replace the places with BUP's real ones
//             in Admin > Locations; they are placeholders, not facts about the campus.
//   demo:     users for every role and sample reports, so each screen has something to show.
//             Only runs when SEED_DEMO_DATA is on (the default outside production).
const config = require('../config');
const { ROLES } = require('../config/roles');
const { USER } = require('../config/statuses');
const userModel = require('../models/user.model');
const categoryModel = require('../models/category.model');
const locationModel = require('../models/location.model');
const caseModel = require('../models/case.model');
const claimModel = require('../models/claim.model');
const auth = require('./auth.service');
const cases = require('./case.service');
const claims = require('./claim.service');
const handovers = require('./handover.service');
const retention = require('./retention.service');

const DAY = 86400000;
const ago = (days, hours = 0) => new Date(Date.now() - days * DAY - hours * 3600000);

const CATEGORIES = [
  { name: 'Student or staff ID card', nameBn: 'শিক্ষার্থী বা কর্মীর পরিচয়পত্র', sensitive: true },
  { name: 'Bank or payment card', nameBn: 'ব্যাংক বা পেমেন্ট কার্ড', sensitive: true, highValue: true },
  { name: 'Mobile phone', nameBn: 'মোবাইল ফোন', highValue: true, requiresApproval: true },
  { name: 'Laptop or tablet', nameBn: 'ল্যাপটপ বা ট্যাবলেট', highValue: true, requiresApproval: true },
  { name: 'Wallet or purse', nameBn: 'মানিব্যাগ বা পার্স', highValue: true },
  { name: 'Watch or jewellery', nameBn: 'ঘড়ি বা গয়না', highValue: true },
  { name: 'Keys', nameBn: 'চাবি' },
  { name: 'Bag or backpack', nameBn: 'ব্যাগ বা ব্যাকপ্যাক' },
  { name: 'Books and notes', nameBn: 'বই ও খাতা' },
  { name: 'Earphones or headphones', nameBn: 'ইয়ারফোন বা হেডফোন' },
  { name: 'USB drive or storage', nameBn: 'ইউএসবি ড্রাইভ বা স্টোরেজ' },
  { name: 'Water bottle or lunch box', nameBn: 'পানির বোতল বা টিফিন বক্স' },
  { name: 'Clothing or umbrella', nameBn: 'পোশাক বা ছাতা' },
  { name: 'Spectacles', nameBn: 'চশমা' },
  { name: 'Other', nameBn: 'অন্যান্য' }
];

const LOCATIONS = [
  ['Academic area', 'একাডেমিক এলাকা', 'Classrooms', 'শ্রেণিকক্ষ'],
  ['Academic area', 'একাডেমিক এলাকা', 'Corridors and lobbies', 'করিডোর ও লবি'],
  ['Academic area', 'একাডেমিক এলাকা', 'Labs', 'ল্যাব'],
  ['Library', 'গ্রন্থাগার', 'Reading hall', 'পাঠকক্ষ'],
  ['Library', 'গ্রন্থাগার', 'Entrance and lockers', 'প্রবেশপথ ও লকার'],
  ['Cafeteria', 'ক্যাফেটেরিয়া', 'Dining area', 'খাবারের স্থান'],
  ['Sports ground', 'খেলার মাঠ', 'Field and courts', 'মাঠ ও কোর্ট'],
  ['Gate and parking', 'গেট ও পার্কিং', 'Main gate', 'প্রধান ফটক'],
  ['Gate and parking', 'গেট ও পার্কিং', 'Parking area', 'পার্কিং এলাকা'],
  ['Administration', 'প্রশাসন', 'Offices', 'অফিস'],
  ['Prayer space', 'নামাজের স্থান', 'Prayer space', 'নামাজের স্থান'],
  ['Other', 'অন্যান্য', 'Not sure or elsewhere', 'নিশ্চিত নই বা অন্য কোথাও']
];

// Demo only: rough offsets from the configured campus point, so the analytics map has pins.
// They are placeholders. Set real coordinates in Admin > Locations.
const DEMO_OFFSETS = {
  Classrooms: [0.0006, 0.0004], 'Corridors and lobbies': [0.0004, -0.0003], Labs: [0.0008, 0.0002], 'Reading hall': [-0.0004, 0.0006],
  'Entrance and lockers': [-0.0005, 0.0004], 'Dining area': [-0.0008, -0.0006], 'Field and courts': [0.0002, -0.0016],
  'Main gate': [-0.0016, 0.0002], 'Parking area': [-0.0013, 0.0011], Offices: [0.0011, 0.0009]
};

async function seedBaseline() {
  if ((await categoryModel.list()).length) return false;
  for (const c of CATEGORIES) await categoryModel.create(c);
  for (const [building, buildingBn, name, nameBn] of LOCATIONS) await locationModel.create({ building, buildingBn, name, nameBn });
  return true;
}

// ---------------------------------------------------------------- demo
async function makeUser(input) {
  const passwordHash = await auth.hashPassword(input.password);
  return userModel.create({
    name: input.name, email: input.email, passwordHash, role: input.role, affiliation: input.affiliation,
    universityId: input.universityId, status: USER.ACTIVE, emailVerified: true, lang: 'en'
  });
}

// Move a case (and its timeline) back in time, so demo dates look natural.
async function age(ref, days) {
  const c = await caseModel.findByRef(ref);
  const shift = (d) => new Date(new Date(d).getTime() - days * DAY);
  await caseModel.update(c.id, {
    createdAt: shift(c.createdAt), occurredAt: shift(c.occurredAt), closedAt: c.closedAt ? shift(c.closedAt) : null,
    events: c.events.map((e) => ({ ...e, at: shift(e.at) }))
  });
}

async function seedDemo() {
  if (await userModel.findByEmail('admin@safefind.example')) return false;

  const locs = await locationModel.list();
  for (const l of locs) {
    const off = DEMO_OFFSETS[l.name];
    if (off) await locationModel.update(l.id, { lat: +(config.campus.lat + off[0]).toFixed(6), lng: +(config.campus.lng + off[1]).toFixed(6) });
  }
  const cat = async (name) => (await categoryModel.findByName(name)).id;
  const loc = (name) => locs.find((l) => l.name === name).id;

  const admin = await makeUser({ name: 'Demo Administrator', email: 'admin@safefind.example', password: 'Admin@12345', role: ROLES.ADMIN });
  const sec1 = await makeUser({ name: 'Demo Security Officer', email: 'security@safefind.example', password: 'Security@12345', role: ROLES.SECURITY });
  const sec2 = await makeUser({ name: 'Demo Security Officer Two', email: 'security2@safefind.example', password: 'Security@12345', role: ROLES.SECURITY });
  const approver = await makeUser({ name: 'Demo Approver', email: 'approver@safefind.example', password: 'Approver@12345', role: ROLES.APPROVER });
  const student = await makeUser({ name: 'Demo Student', email: 'student@safefind.example', password: 'Student@12345', role: ROLES.MEMBER, affiliation: 'student', universityId: '20240000001' });
  const student2 = await makeUser({ name: 'Demo Student Two', email: 'student2@safefind.example', password: 'Student@12345', role: ROLES.MEMBER, affiliation: 'student', universityId: '20240000002' });
  const staff = await makeUser({ name: 'Demo Staff Member', email: 'staff@safefind.example', password: 'Staff@12345', role: ROLES.MEMBER, affiliation: 'staff', universityId: 'EMP-1001' });

  const accept = (ref, by = sec1) => cases.reviewDecision(by, ref, { decision: 'accept', note: '' });

  // 1. A lost backpack and a found one that resemble each other (shows the match flow).
  const lostBag = await cases.createReport(student, {
    type: 'lost', categoryId: await cat('Bag or backpack'), locationId: loc('Reading hall'), locationDetail: 'Second table from the window',
    title: 'Black backpack', description: 'Black backpack with a red zip, a blue water bottle in the side pocket and a notebook labelled Physics inside. Small tear near the handle.',
    occurredAt: ago(3)
  });
  await accept(lostBag.ref);
  const foundBag = await cases.intakeFound(sec2, {
    categoryId: await cat('Bag or backpack'), locationId: loc('Entrance and lockers'), locationDetail: 'Left beside the lockers',
    title: 'Black backpack', description: 'Black backpack, red zipper, blue bottle in the side pocket, exercise books inside. Small tear on the handle.',
    occurredAt: ago(2), finderName: 'Walk-in finder', finderContact: '', finderUniversityId: '', storageSlot: 'B-07'
  });
  const suggestion = (await require('./matching.service').suggested())[0];
  if (suggestion) await require('./matching.service').confirm(sec1, suggestion.id);
  await claims.submit(student, foundBag.ref, { statement: 'Black backpack with a red zip. A blue bottle is in the side pocket, and the notebook inside says Physics. There is a small tear near the handle.', lostRef: lostBag.ref }, null);
  await age(lostBag.ref, 1);

  // 2. A lost phone that needs the approver (shows the approval queue).
  await cases.createReport(student2, {
    type: 'lost', categoryId: await cat('Mobile phone'), locationId: loc('Classrooms'), locationDetail: 'Back row',
    title: 'Black smartphone', description: 'Black smartphone in a clear case with a cracked corner and a blue sticker on the back.', occurredAt: ago(1, 4)
  });

  // 3. A report waiting for Security Cell review.
  await cases.createReport(staff, {
    type: 'lost', categoryId: await cat('Clothing or umbrella'), locationId: loc('Corridors and lobbies'), locationDetail: '',
    title: 'Blue umbrella', description: 'Large blue umbrella with a wooden handle and a torn strap.', occurredAt: ago(0, 6)
  });

  // 4. A found report made online by a student, waiting for the item to be handed in.
  await cases.createReport(student2, {
    type: 'found', categoryId: await cat('Wallet or purse'), locationId: loc('Dining area'), locationDetail: 'Under a table',
    title: 'Brown wallet', description: 'Brown leather wallet with a zip pocket. It holds some cash and two cards.', occurredAt: ago(0, 3)
  });

  // 5. A found ID card (title is hidden on the public board).
  const idCard = await cases.intakeFound(sec1, {
    categoryId: await cat('Student or staff ID card'), locationId: loc('Corridors and lobbies'), locationDetail: 'On a bench',
    title: 'Student ID card', description: 'University ID card in a clear holder. Name and department are printed on the front.',
    occurredAt: ago(1), finderName: 'Walk-in finder', storageSlot: 'A-02'
  });
  await age(idCard.ref, 0);

  // 6. A few more open reports for the public board.
  const watch = await cases.createReport(staff, {
    type: 'lost', categoryId: await cat('Watch or jewellery'), locationId: loc('Dining area'), locationDetail: 'Near the water cooler',
    title: 'Silver wristwatch', description: 'Silver analogue wristwatch with a brown leather strap and a cracked glass.', occurredAt: ago(4)
  });
  await accept(watch.ref);
  const book = await cases.createReport(student, {
    type: 'lost', categoryId: await cat('Books and notes'), locationId: loc('Labs'), locationDetail: '',
    title: 'Organic Chemistry textbook', description: 'Hardcover textbook with a green cover. The first page has a name written in pencil.', occurredAt: ago(5)
  });
  await accept(book.ref);
  const keys = await cases.intakeFound(sec2, {
    categoryId: await cat('Keys'), locationId: loc('Main gate'), locationDetail: 'Near the guard booth',
    title: 'Set of keys with a green tag', description: 'Three keys on a steel ring with a green plastic tag.', occurredAt: ago(3), finderName: 'Guard on duty', storageSlot: 'A-05'
  });
  const earbuds = await cases.intakeFound(sec1, {
    categoryId: await cat('Earphones or headphones'), locationId: loc('Reading hall'), locationDetail: '',
    title: 'White wireless earbuds', description: 'White earbuds in a small charging case with a scratch on the lid.', occurredAt: ago(6), finderName: 'Walk-in finder', storageSlot: 'A-06'
  });

  // 7. A found phone with a claim waiting for proof (tier 2).
  const phone = await cases.intakeFound(sec2, {
    categoryId: await cat('Mobile phone'), locationId: loc('Classrooms'), locationDetail: 'Left on a desk',
    title: 'Black phone with cracked screen', description: 'Black smartphone, screen cracked in the top corner, clear case with a blue sticker on the back.', occurredAt: ago(1, 2), finderName: 'Walk-in finder', storageSlot: 'C-01'
  });
  const phoneClaim = await claims.submit(student2, phone.ref, { statement: 'My black phone with a cracked corner. The case is clear and has a blue sticker on the back.' }, null);
  await claims.requestProof(sec1, phoneClaim.id, 'Please upload a photo of the phone box, receipt or a photo of you using it.');

  // 8. A verified claim with a handover waiting (shows the QR code).
  const bottle = await cases.intakeFound(sec1, {
    categoryId: await cat('Water bottle or lunch box'), locationId: loc('Field and courts'), locationDetail: '',
    title: 'Blue steel water bottle', description: 'Blue steel bottle with a dent near the base and a sticker of a mountain.', occurredAt: ago(2), finderName: 'Walk-in finder', storageSlot: 'B-02'
  });
  const bottleClaim = await claims.submit(staff, bottle.ref, { statement: 'Blue steel bottle, dent near the bottom and a mountain sticker on the side.' }, null);
  await claims.verify(sec2, bottleClaim.id, { note: 'Statement matches the private description.' });

  // 9. A completed return, for the analytics numbers.
  const hoodie = await cases.intakeFound(sec2, {
    categoryId: await cat('Clothing or umbrella'), locationId: loc('Parking area'), locationDetail: '',
    title: 'Grey hoodie', description: 'Grey zip hoodie, size M, with a small hole in the left cuff.', occurredAt: ago(9), finderName: 'Walk-in finder', storageSlot: 'B-09'
  });
  const hoodieClaim = await claims.submit(student, hoodie.ref, { statement: 'Grey zip hoodie, medium. The left cuff has a small hole.' }, null);
  await claims.verify(sec1, hoodieClaim.id, { note: 'Matched.' });
  const h = await handovers.forClaim(hoodieClaim.id);
  await handovers.complete(sec2, handovers.makeToken(h), { idChecked: true });
  await age(hoodie.ref, 8);

  // 10. An item held past the retention period (shows the unclaimed board).
  const calc = await cases.intakeFound(sec1, {
    categoryId: await cat('Other'), locationId: loc('Offices'), locationDetail: '',
    title: 'Scientific calculator', description: 'Black scientific calculator with a cracked cover and initials scratched on the back.', occurredAt: ago(100), finderName: 'Office staff', storageSlot: 'D-03'
  });
  await age(calc.ref, 99);
  await retention.sweep();

  void admin; void approver; void keys; void earbuds; void claimModel;
  return true;
}

async function seedAll() {
  await seedBaseline();
  if (config.seedDemoData) await seedDemo();
  await auth.bootstrapAdmin();
}

module.exports = { seedBaseline, seedDemo, seedAll, CATEGORIES, LOCATIONS };
