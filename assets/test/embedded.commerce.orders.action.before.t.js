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

const sampleLocation = require('./sample_location.json');
const actionName = 'embedded.commerce.orders.action.before';
const invoice = require('../src/util/invoice');
const isoCodes = require('iso-countries');

xdescribe('embedded.commerce.orders.action.before', function() {

  var action;

  before(function () {
    action = require('../src/domains/commerce.orders/embedded.commerce.orders.action.before');
  });

  it('runs successfully', function(done) {
    this.timeout(10000);

    var callback = function(err) {
      if (!err) {
        done();
      } else {
        // For now we'll consider any call to callback a success:
        done(err);
      }
    };

    // Creating test data
    var context = Simulator.context(actionName, callback);
    var order = context.get.order();
    order.items.push({
      "product" : {
        productCode: "123",
        quantity: 4
      },
      "unitPrice": {
        listAmount: 12.99,
        extendedAmount: 12.99
      }
    });
    order.fulfillmentInfo.fulfillmentContact.address.cityOrTown = "Frisco";
    order.fulfillmentInfo.fulfillmentContact.address.StateOrProvince = "TX";
    order.fulfillmentInfo.fulfillmentContact.address.PostalOrZipCode = "75034";
    order.fulfillmentInfo.fulfillmentContact.address.countryCode = "US";
    order.fulfillmentStatus = "Fulfilled";
    order.paymentStatus = "Paid";

    // Overriding the get order function for context
    context.get.order = function() {
      return order;
    };

    // Overriding the getOriginAddress for the invoice util
    invoice.getOriginAddress = () => {

      var countryCode = isoCodes.findCountryByCode(sampleLocation.address.countryCode);

      return {
        "Company": sampleLocation.name,
        "PhysicalOrigin": {
          City: sampleLocation.address.cityOrTown,
          MainDivision: sampleLocation.address.stateOrProvince,
          PostalCode: sampleLocation.address.postalOrZipCode,
          Country: countryCode ? countryCode.alpha3 : "USA"
        }
      };
    };

    action.invoiceCreator = invoice;

   Simulator.simulate(actionName, action, context, callback);
  });
});
