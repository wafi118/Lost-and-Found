'use strict';
// Small input helpers. Output escaping is done by EJS; these only normalise what is stored.
const CTRL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

const oneLine = (s, max = 200) => String(s ?? '').replace(CTRL, '').replace(/\s+/g, ' ').trim().slice(0, max);
const multiLine = (s, max = 2000) => String(s ?? '').replace(CTRL, '').replace(/\r\n/g, '\n').trim().slice(0, max);

module.exports = { oneLine, multiLine };
