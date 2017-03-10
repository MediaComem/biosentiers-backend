var _ = require('lodash'),
    Excursion = require('../../models/excursion'),
    trailsPolicy = require('../trails/trails.policy'),
    utils = require('../utils');

exports.canCreate = function(req) {
  return this.authenticated();
};

exports.canList = function(req) {
  return this.authenticated();
};

exports.canRetrieve = function(req) {
  return this.authenticated();
};

exports.scope = function(req) {
  return new Excursion();
};

exports.serialize = function(excursion, req) {
  var result = {
    id: excursion.get('api_id'),
    trailId: excursion.related('trail').get('api_id'),
    plannedAt: excursion.get('planned_at'),
    createdAt: excursion.get('created_at'),
    updatedAt: excursion.get('updated_at')
  };

  if (utils.includes(req, 'trail')) {
    result.trail = trailsPolicy.serialize(excursion.related('trail'), req);
  }

  return result;
};
