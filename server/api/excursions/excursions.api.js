const _ = require('lodash');
const db = require('../../db');
const Excursion = require('../../models/excursion');
const fetcher = require('../fetcher');
const filters = require('../lib/filters');
const hrefToApiId = require('../../lib/href').hrefToApiId;
const np = require('../../lib/native-promisify');
const params = require('../lib/params');
const policy = require('./excursions.policy');
const QueryBuilder = require('../query-builder');
const route = require('../route');
const serialize = require('../serialize');
const sorting = require('../sorting');
const Theme = require('../../models/theme');
const Trail = require('../../models/trail');
const { updateManyToMany } = require('../../lib/models');
const validate = require('../validate');
const Zone = require('../../models/zone');

const EAGER_LOAD = [
  'creator',
  'themes',
  'trail',
  'zones'
];

// API resource name (used in some API errors).
exports.resourceName = 'excursion';

exports.create = route.transactional(async function(req, res) {
  await np(validateExcursion(req));

  const excursion = policy.parse(req.body);
  excursion.set('creator_id', req.currentUser.get('id'));

  await saveExcursion(excursion, req);

  await excursion.load(EAGER_LOAD);
  res.status(201).send(await serialize(req, excursion, policy));
});

exports.head = route(async function(req, res) {
  await createExcursionQueryBuilder(req, res).fetch({ head: true });
  res.sendStatus(200);
});

exports.list = route(async function(req, res) {
  const excursions = await createExcursionQueryBuilder(req, res).fetch();
  res.send(await serialize(req, excursions, policy));
});

exports.retrieve = route(async function(req, res) {
  res.send(await serialize(req, req.excursion, policy));
});

exports.update = route.transactional(async function(req, res) {
  await np(validateExcursion(req, true));

  policy.parse(req.body, req.excursion);
  await saveExcursion(req.excursion, req);

  res.send(await serialize(req, req.excursion, policy));
});

exports.fetchExcursion = fetcher({
  model: Excursion,
  eagerLoad: EAGER_LOAD,
  resourceName: 'excursion'
});

function createExcursionQueryBuilder(req, res) {
  return new QueryBuilder(req, res, policy.scope(req))
    .joins('excursion', j => {
      j.join('creator', { joinTable: 'user_account', key: 'excursion.creator_id', joinKey: 'creator.id' });
    })
    .filter(search)
    .filter(filterByCreator)
    .filter(filters.date('createdAt'))
    .filter(filters.date('plannedAt'))
    .filter(filters.date('updatedAt'))
    .paginate()
    .sorts('name', 'participantsCount', 'createdAt', 'plannedAt', 'updatedAt')
    .sort('creatorLastName', sorting.sortByRelated('creator', 'lastName'))
    .sort('creatorFirstName', sorting.sortByRelated('creator', 'firstName'))
    .defaultSort('createdAt', 'desc')
    .eagerLoad(EAGER_LOAD);
}

function validateExcursion(req, patchMode) {

  const excursion = req.excursion;

  return validate.requestBody(req, function() {
    return this.series(
      // Pre-load themes
      validate.relatedArrayData('themes', preloadThemes()),
      // Validate the excursion (except the zones, see below this parallel call)
      this.parallel(
        this.validate(
          this.json('/trailHref'),
          this.if(patchMode, this.while(this.isSet())),
          this.required(),
          this.type('string'),
          this.resource(fetchTrailByHref).moveTo('/trailId').replace(trail => trail.get('id'))
        ),
        this.validate(
          this.json('/name'),
          this.while(context => context.get('valueSet') && context.get('value') !== null),
          this.type('string')
        ),
        this.validate(
          this.json('/plannedAt'),
          this.if(patchMode, this.while(this.isSet()), this.while(this.changed(excursion ? excursion.get('planned_at').toISOString() : ''))),
          this.required(),
          this.type('string')
        ),
        this.validate(
          this.json('/themes'),
          this.ifElse(
            // If the excursion is new or themes have changed...
            validate.newOrChanged(patchMode, themesHaveChanged(excursion)),
            // Validate the themes
            this.each((c, value, i) => {
              return this.validate(
                this.json(`/${i}`),
                this.resource(validate.related('themes', 'name')).replace(_.identity)
              );
            }),
            // Otherwise remove them from the request body
            validate.remove()
          )
        )
      ),
      // Validate the zones (but only if the trail ID is valid, otherwise we cannot tell which zones are valid)
      this.if(
        this.noError({ location: '/trailHref' }),
        validate.relatedArrayData('zones', 'zoneHrefs', preloadZones(excursion)),
        this.parallel(
          this.validate(
            this.json('/zoneHrefs'),
            this.type('array'),
            this.ifElse(
              // If the excursion is new or zones have changed...
              validate.newOrChanged(patchMode, zonesHaveChanged(excursion)),
              // Validate the zones
              this.each((c, value, i) => {
                return this.validate(
                  this.json(`/${i}`),
                  this.type('string'),
                  this.resource(validate.related('zones', (zones, href) => zones.findWhere({ api_id: hrefToApiId(href) }))).replace(_.identity)
                );
              }),
              // Otherwise remove them from the request body
              validate.remove()
            )
          )
        )
      )
    );
  });
}

function preloadThemes() {
  return function(names) {
    return new Theme().where('name', 'in', names).fetchAll();
  };
}

function preloadZones(excursion) {
  return function(apiIds, context) {
    const trailId = context.get('value').trailId || excursion.get('trail_id');
    return new Trail({ id: trailId }).fetch().then(trail => {
      return trail.zones().query(qb => {
        return qb.where('zone.api_id', 'in', zoneHrefsToApiIds(apiIds));
      }).fetch();
    });
  };
}

function themesHaveChanged(excursion) {
  return function(themes) {
    return !_.isEqual(_.uniq(excursion.related('themes').pluck('name')).sort(), _.uniq(themes).sort());
  };
}

function zonesHaveChanged(excursion) {
  return function(zones) {
    return !_.isEqual(_.uniq(excursion.related('zones').pluck('api_id')).sort(), zoneHrefsToApiIds(zones));
  };
}

function fetchTrailByHref(href) {
  return new Trail({ api_id: hrefToApiId(href) }).fetch();
}

function saveExcursion(excursion, req) {
  return excursion.save().then(() => {
    return Promise.all([
      updateManyToMany(excursion, 'themes', req.body.themes),
      updateManyToMany(excursion, 'zones', req.body.zoneHrefs)
    ]);
  });
}

function zoneHrefsToApiIds(hrefs) {
  return _.uniq(_.filter(hrefs, _.isString).map(hrefToApiId)).sort();
}

function filterByCreator(query, req, qb) {

  const hrefs = params.multiValue(req.query.creator, _.isString, hrefToApiId);
  if (!hrefs.length) {
    return;
  }

  qb.requireRelation('creator');
  return query.query(qb => qb.where('creator.api_id', 'in', hrefs));
}

function search(query, req, qb) {
  if (!_.isString(req.query.search)) {
    return;
  }

  const term = `%${req.query.search.toLowerCase()}%`;

  let clauses = [ 'LOWER(excursion.name) LIKE ?' ];

  if (req.currentUser.hasRole('admin')) {
    qb.requireRelation('creator');
    clauses.push('LOWER(creator.first_name) LIKE ?', 'LOWER(creator.last_name) LIKE ?');
  }

  return query.query(qb => qb.whereRaw(`(${clauses.join(' OR ')})`, Array(clauses.length).fill(term)));
}
