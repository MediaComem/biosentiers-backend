const _ = require('lodash');
const db = require('../../db');
const expect = require('../chai').expect;
const moment = require('moment');
const spec = require('../utils');
const Trail = require('../../models/trail');

module.exports = spec.enrichExpectation(function(actual, expected) {

  // Check the actual object.
  expect(actual, 'trail').to.be.an('object');

  const keys = [ 'id', 'name', 'geometry', 'length', 'createdAt', 'updatedAt' ];
  expect(actual, 'res.body').to.have.all.keys(keys);

  expect(actual.id, 'trail.id').to.be.a('string');
  expect(actual.name, 'trail.name').to.equal(expected.name);
  expect(actual.geometry, 'trail.geometry').to.eql(expected.geometry);
  expect(actual.length, 'trail.length').to.equal(expected.length);

  spec.expectTimestamp('trail', actual, expected, 'created');
  spec.expectTimestamp('trail', actual, expected, 'updated');

  // Check that the corresponding trail exists in the database.
  return module.exports.inDb(actual.id, actual);
});

module.exports.inDb = function(apiId, expected) {

  const query = new Trail({ api_id: apiId })
    .query(qb => qb.select('*', db.st.asGeoJSON('geom')))
    .fetch();

  return query.then(function(trail) {
    expect(trail, 'db.trail').to.be.an.instanceof(Trail);
    expect(trail.get('id'), 'db.trail.id').to.be.a('string');
    expect(trail.get('api_id'), 'db.trail.api_id').to.equal(expected.id);
    expect(trail.get('name'), 'db.trail.name').to.equal(expected.name);
    expect(trail.get('geom'), 'db.trail.geom').to.eql(expected.geometry);
    expect(trail.get('length'), 'db.trail.length').to.equal(expected.length);
    expect(trail.get('created_at'), 'db.trail.created_at').to.be.sameMoment(expected.createdAt);
    expect(trail.get('updated_at'), 'db.trail.updated_at').to.be.sameMoment(expected.updatedAt);
  });
};
