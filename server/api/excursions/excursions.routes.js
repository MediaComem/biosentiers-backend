var controller = require('./excursions.api'),
    express = require('express'),
    policy = require('./excursions.policy'),
    utils = require('../utils');

var router = express.Router();

router.post('/',
  utils.authorize(policy.canCreate),
  controller.create);

router.get('/',
  utils.authorize(policy.canList),
  controller.list);

module.exports = router;
