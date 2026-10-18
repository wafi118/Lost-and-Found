'use strict';
// Categories and locations (FR-22). Administrators manage these lists; nothing is ever
// deleted, only switched off, so old cases keep pointing at a real row.
const categoryModel = require('../models/category.model');
const locationModel = require('../models/location.model');
const audit = require('./audit.service');
const { ServiceError } = require('./errors');

const catFields = (i) => ({
  name: i.name, nameBn: i.nameBn || '', sensitive: Boolean(i.sensitive), highValue: Boolean(i.highValue),
  requiresApproval: Boolean(i.requiresApproval), active: Boolean(i.active)
});
const locFields = (i) => ({
  building: i.building, buildingBn: i.buildingBn || '', name: i.name, nameBn: i.nameBn || '',
  lat: i.lat === '' || i.lat === undefined ? null : i.lat, lng: i.lng === '' || i.lng === undefined ? null : i.lng,
  active: Boolean(i.active)
});

async function createCategory(admin, input, ip = '') {
  if (await categoryModel.findByName(input.name)) throw new ServiceError('CATEGORY_EXISTS');
  const c = await categoryModel.create(catFields({ ...input, active: true }));
  await audit.record(admin, 'admin.category_created', c.name, '', ip);
  return c;
}

async function updateCategory(admin, id, input, ip = '') {
  const cur = await categoryModel.get(id);
  if (!cur) throw new ServiceError('NOT_FOUND');
  const same = await categoryModel.findByName(input.name);
  if (same && same.id !== cur.id) throw new ServiceError('CATEGORY_EXISTS');
  const c = await categoryModel.update(cur.id, catFields(input));
  await audit.record(admin, 'admin.category_updated', c.name, '', ip);
  return c;
}

async function createLocation(admin, input, ip = '') {
  const l = await locationModel.create(locFields({ ...input, active: true }));
  await audit.record(admin, 'admin.location_created', `${l.building} / ${l.name}`, '', ip);
  return l;
}

async function updateLocation(admin, id, input, ip = '') {
  const cur = await locationModel.get(id);
  if (!cur) throw new ServiceError('NOT_FOUND');
  const l = await locationModel.update(cur.id, locFields(input));
  await audit.record(admin, 'admin.location_updated', `${l.building} / ${l.name}`, '', ip);
  return l;
}

module.exports = {
  listCategories: () => categoryModel.list(),
  listLocations: () => locationModel.list(),
  getCategory: (id) => categoryModel.get(id),
  getLocation: (id) => locationModel.get(id),
  createCategory, updateCategory, createLocation, updateLocation
};
