const _ = require('lodash');
const expectRes = require('../../spec/expectations/response');
const expectExcursion = require('../../spec/expectations/excursion');
const jwt = require('../../lib/jwt');
const moment = require('moment');
const spec = require('../../spec/utils');
const trailFixtures = require('../../spec/fixtures/trail');
const userFixtures = require('../../spec/fixtures/user');

describe('Excursions API', function() {

  let data;
  beforeEach(function() {
    data = {};
  });

  describe('POST /api/excursions', function() {
    beforeEach(function() {
      return spec.setUp(data, function() {
        data.user = userFixtures.user();
        data.trail = trailFixtures.trail();

        data.reqBody = {
          trailId: data.trail.call('get', 'api_id'),
          plannedAt: moment().add(2, 'days').toDate()
        };
      });
    });

    it('should create an excursion', function() {

      const expected = _.extend({
        trailId: data.trail.get('api_id'),
        creatorId: data.user.get('api_id'),
        createdAfter: data.now,
        updatedAt: 'createdAt'
      }, data.reqBody);

      return spec
        .testCreate('/excursions', data.reqBody)
        .set('Authorization', 'Bearer ' + data.user.generateJwt())
        .then(expectExcursion.inBody(expected));
    });
  });
});
