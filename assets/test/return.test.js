'use strict'

var assert = require('assert');
var chai = require('chai');
var expect = chai.expect;

const orderBuilder = require('../src/util/order');
var returnFactory = require('../src/util/return');

var sampleReturnOrder              = require('./sample_return_orig_invoice.json');
var sampleReturn                   = require('./sample_return_closed.json');
var sampleOrderLevelShippingReturn = require('./sample_recieved_return_order_level_shipping.json');
var sampleOrderLevelShippingOrder  = require('./sample_recieved_return_order_level_shipping_original_order.json');

var Simulator = require('mozu-action-simulator');
const actionName = 'embedded.commerce.return.actions.before';
const context = Simulator.context(actionName, () => {});
const testConfigResource = (resp, reject) => {
  return {
    getEntity: (args) => {
      return !reject ? Promise.resolve(resp) : Promise.reject(resp);
    }
  }
}

// Setup a test config resource stub for testing
context.options = { configResource: testConfigResource({ companyCode: 12312132, trustedId: 1238983 }) }

var args = {
  customer:    Promise.resolve(require('./sample_customer.json')),
  location:    Promise.resolve(require('./sample_location.json')),
  product:     Promise.resolve(require('./sample_product.json')),
  orderClient: Promise.resolve(sampleReturnOrder)
};

describe('Return#constructor', () => {
  it('stores return information', () => {
    var orderReturn = new returnFactory.Return(sampleReturn);
    expect(orderReturn.originalOrderId).to.eql("0c964fa325028b44f01cbd2f000063d7");
    expect(orderReturn.items).not.to.be.empty;
    expect(orderReturn.itemMap).not.to.be.empty;
    expect(orderReturn.itemIdSet).not.to.be.empty;
    expect(orderReturn.items[0].quantity).to.eql(1);
    expect(orderReturn.items[0].extendedPrice).to.eql(-145.0);
    expect(orderReturn.items[0].shippingTotal).to.eql(-9.99);
  });
});

describe('Return#applyOverrides', () => {
  const orderReturn = new returnFactory.Return(sampleReturn);

  it('updates shipping total to 0.0 when line item level shipping is used', () => {
    return orderBuilder.orderFromKiboInvoice(sampleReturnOrder).then(order => {
      var overrideOrder = orderReturn.applyOverrides(order);
      expect(overrideOrder.shipping.shippingAmount).to.eql(0.0);
    });
  });

  it('updates shipping total to sum of line item distributed loss', () => {
    return orderBuilder.orderFromKiboInvoice(sampleOrderLevelShippingOrder).then(order => {
      var overrideOrder = new returnFactory.Return(sampleOrderLevelShippingReturn).applyOverrides(order);
      expect(overrideOrder.shipping.shippingAmount).to.eql(-7.5);
    });
  });

  it('only contains those lines in the return', () => {
    return orderBuilder.orderFromKiboInvoice(sampleReturnOrder).then(order => {
      var overrideOrder = orderReturn.applyOverrides(order);
      expect(order.lineItems).to.have.lengthOf(2, 'sample test order should have at least 2 items');
      expect(orderReturn.items).to.have.lengthOf(1, 'sample return should have less than the number of order items');
      expect(overrideOrder.lineItems[0].extendedPrice).to.eql(orderReturn.items[0].extendedPrice);
      expect(overrideOrder.lineItems[0].id).to.eql(orderReturn.items[0].originalOrderLineId);
    });
  })
});
