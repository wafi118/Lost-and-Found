'use strict';
// Express 4 does not catch errors thrown (or rejected) inside async handlers: the request
// hangs and Node logs an unhandled rejection. Wrapping every handler forwards the error
// to the error middleware instead.
const wrap = (fn) => (req, res, next) => {
  try {
    Promise.resolve(fn(req, res, next)).catch(next);
  } catch (err) {
    next(err);
  }
};

module.exports = (controller) =>
  Object.fromEntries(Object.entries(controller).map(([name, fn]) => [name, typeof fn === 'function' ? wrap(fn) : fn]));
module.exports.wrap = wrap;
