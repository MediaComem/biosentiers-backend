const _ = require('lodash');
const fetcher = require('../fetcher');
const Installation = require('../../models/installation');
const np = require('../../lib/native-promisify');
const policy = require('./installations.policy');
const QueryBuilder = require('../query-builder');
const route = require('../route');
const serialize = require('../serialize');
const validate = require('../validate');
const validations = require('./installations.validations');

// API resource name (used in some API errors)
exports.resourceName = 'installation';

exports.create = route.transactional(async function(req, res) {
  await np(validateInstallation(req));
  const installation = policy.parse(req);
  await installation.save();
  res.status(201).send(await serialize(req, installation, policy, { sharedSecret: true }));
});

exports.list = route(async function(req, res) {

  const installations = await new QueryBuilder(req, res, policy.scope(req))
    .paginate()
    .sorts('createdAt', 'updatedAt')
    .defaultSort('createdAt', 'desc')
    .fetch();

  res.send(await serialize(req, installations, policy));
});

exports.retrieve = route(async function(req, res) {
  res.send(await serialize(req, req.installation, policy));
});

exports.update = route.transactional(async function(req, res) {
  await np(validateInstallation(req, true));
  policy.parse(req, req.installation);
  await req.installation.save();
  res.send(await serialize(req, req.installation, policy));
});

exports.fetchInstallation = fetcher({
  model: Installation,
  resourceName: exports.resourceName
});

function validateInstallation(req, patchMode) {
  return validate.requestBody(req, function() {
    return this.parallel(
      this.if(!patchMode, this.validate(
        this.json('/id'),
        this.while(this.isSet()),
        this.type('string'),
        this.notBlank(),
        validations.idAvailable()
      )),
      this.validate(
        this.json('/properties'),
        this.while(this.isSet()),
        this.type('object')
      )
    );
  });
}
