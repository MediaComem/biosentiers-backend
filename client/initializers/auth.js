(function() {
  'use strict';

  angular
    .module('bio')
    .run(initialize);

  /**
   * Initializes the authentication services when the app starts,
   * e.g. to load the logged in user from local storage.
   */
  function initialize(BioAuth, BioAuthRouting) {
    BioAuth.initialize();
    BioAuthRouting.initialize();
  }
})();