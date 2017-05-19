const BPromise = require('bluebird');
const isGenerator = require('is-generator').fn;

module.exports = function(routeFunc) {
  if (!isGenerator(routeFunc)) {
    throw new Error('Route function must be a generator function (declared with "function*()")');
  }

  return function(req, res, next) {
    BPromise.coroutine(routeFunc)(req, res, next).catch(next);
  };
};