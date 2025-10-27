/**
 * This is a scaffold for unit tests for the custom function for
 * `http.commerce.catalog.storefront.tax.estimateTaxes.before`.
 * Modify the test conditions below. You may:
 *  - add special assertions for code actions from Simulator.assert
 *  - create a mock context with Simulator.context() and modify it
 *  - use and modify mock Mozu business objects from Simulator.fixtures
 *  - use Express to simulate request/response pairs
 */

'use strict';

var Simulator = require('mozu-action-simulator');
var assert = Simulator.assert;

const sampleOrder = require('./sample_order.json');
sampleOrder.orderDate = new Date(sampleOrder.orderDate);

var actionName = 'http.commerce.catalog.storefront.tax.estimateTaxes.before';

describe('http.commerce.catalog.storefront.tax.estimateTaxes.before implementing http.commerce.catalog.storefront.tax.estimateTaxes.before', function () {

  var action;

  before(function () {
    action = require('../src/domains/commerce.catalog.storefront.tax/http.commerce.catalog.storefront.tax.estimateTaxes.before');
  });

  xit('runs successfully', function(done) {
    this.timeout(15000);

    var callback = function(err) {
      if (!err) {
        done();
      } else {
        // For now we'll consider any call to callback a success:
        done(err);
      }
    };

    var context = Simulator.context(actionName, callback);
    context.request.body = sampleOrder;

    // modify context as necessary

    /*
     the request/response pair will be a static mock.
     if you need an actual stream, use http!
     example:

     var http = require('http');
     var server = http.createServer(function(req, res) {
      context.request = req;
      context.response = res;
      assert.ok(Simulator.simulate(actionName, action, context, callback));
     }).listen(9000);
     http.get('http://localhost:9000/', function(req, res) {
      // add the request body here
     });

    */

    Simulator.simulate(actionName, action, context, callback);
  });
});
