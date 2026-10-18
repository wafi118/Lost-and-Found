'use strict';
// The project record must stay in step with the code. Whoever changes the version also updates
// docs/PROJECT_MEMORY.md and docs/CHANGELOG.md in the same change (section 2 of PROJECT_MEMORY.md).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const { version } = require('../package.json');
const memory = read('docs/PROJECT_MEMORY.md');
const history = memory.split(/^## 9\. /m)[1] || '';

test('the project record names the current version, and its newest history entry is for that version', () => {
  assert.match(memory, new RegExp(`^App version: ${version.replace(/\./g, '\\.')}$`, 'm'), `set "App version: ${version}" at the top of docs/PROJECT_MEMORY.md`);
  const newest = /^### v(\d+\.\d+\.\d+) \((\d{4}-\d{2}-\d{2})\)/m.exec(history);
  assert.ok(newest, 'section 9 needs a newest entry like "### v1.2.3 (2026-10-04) Summary"');
  assert.equal(newest[1], version, `the newest entry in section 9 is v${newest[1]} but package.json says ${version}`);
  const updated = /^Last updated: (\d{4}-\d{2}-\d{2})$/m.exec(memory);
  assert.ok(updated, 'the "Last updated: YYYY-MM-DD" line is missing');
  assert.equal(updated[1], newest[2], '"Last updated" must be the date of the newest history entry');
});

test('the changelog has an entry for the current version at the top', () => {
  const first = /^## (\d+\.\d+\.\d+)$/m.exec(read('docs/CHANGELOG.md'));
  assert.equal(first && first[1], version, `add "## ${version}" at the top of docs/CHANGELOG.md`);
});

test('the record keeps the numbered sections a new assistant is told to read', () => {
  for (let n = 1; n <= 9; n += 1) assert.match(memory, new RegExp(`^## ${n}\\. `, 'm'), `section ${n} is missing from docs/PROJECT_MEMORY.md`);
  assert.match(memory, /^## 1\. Start here/m);
  assert.match(memory, /^## 2\. How this record is kept up to date/m);
});

test('the README points to the record', () => {
  assert.match(read('README.md'), /docs\/PROJECT_MEMORY\.md/);
});
