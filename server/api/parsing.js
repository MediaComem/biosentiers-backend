const _ = require('lodash');
const inflection = require('inflection');
const moment = require('moment');

exports.parseJsonIntoRecord = function(source, record, ...properties) {

  const propertiesParsers = _.map(properties, createPropertiesParser);
  _.each(propertiesParsers, parser => parser(source, record));

  return record;
};

function createPropertiesParser(parser) {
  if (_.isFunction(parser)) {
    return parser;
  }

  let propertiesMap;
  if (_.isPlainObject(parser)) {
    propertiesMap = parser;
  } else if (_.isString(parser)) {
    propertiesMap = {
      [inflection.underscore(parser)]: parser
    };
  } else if (_.isArray(parser)) {
    propertiesMap = _.reduce(parser, function(memo, property) {
      memo[inflection.underscore(property)] = property;
      return memo;
    }, {});
  }

  if (!propertiesMap) {
    throw new Error('Parsing arguments must be a string, array, object or function');
  }

  return function(source, record) {
    _.each(propertiesMap, function(sourceProperty, recordProperty) {
      if (_.isFunction(sourceProperty)) {
        record.set(recordProperty, sourceProperty(source));
      } else if (_.has(source, sourceProperty)) {

        let value = source[sourceProperty];
        if (sourceProperty.match(/.At$/)) {
          value = moment(value).toDate();
        }

        record.set(recordProperty, value);
      }
    });
  };
}
