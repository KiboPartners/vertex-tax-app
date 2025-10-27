'use strict'


var assert = require('assert');
var chai = require('chai');
var expect = chai.expect;
var sampleOrder = require('./sample_order');
var sampleCompleteOrder = require('./sample_completed_order');

// needed to create a sample "context"
var Simulator = require('mozu-action-simulator');
const actionName = 'http.commerce.catalog.storefront.tax.estimateTaxes.before';
const context = Simulator.context(actionName, () => {});
const testConfigResource = (resp, reject) => {
  return {
    getEntity: (args) => {
      return !reject ? Promise.resolve(resp) : Promise.reject(resp);
    }
  }
}

var common = require('../src/util/common');
const orderBuilder = require('../src/util/order');
const configManager = require('../src/util/configurationManager');

const order1 = {
  OrderDate: null,
  OriginalOrderDate: new Date('2018-04-12T00:00:00Z')
}

const order2 = {
  OrderDate: new Date('2017-07-25T00:00:00Z'),
  OriginalOrderDate: new Date('2018-04-12T00:00:00Z')
}

const order3 = {
  OrderDate: new Date('1880-04-02T00:00:00'),
  OriginalOrderDate: new Date('2000-04-12T00:00:00Z')
}

describe('isValidDate', () => {
  it('valid date OrderDate', (done) => {
    expect(common.isValidDate(null)).to.eql(false);
    done();
  });

  it('valid date OriginalOrderDate', (done) => {
    expect(common.isValidDate(order1.OriginalOrderDate)).to.eql(true);
    done();
  });
});

describe('validDate', () => {
 it('found valid date', (done) => {
   expect(common.validDate([order1.OrderDate, order1.OriginalOrderDate])).to.eql(order1.OriginalOrderDate);
   done();
 });
});

// Testing orderDocumentDate and supporting functions
describe('orderDocumentDate', () => {
  it('Correct Order Date: null', (done) => {
    expect(common.orderDocumentDate(order1.OrderDate, order1.OriginalOrderDate)).to.eql('2018-04-12Z')
    done();
  });

  it('Correct Order Date: 2 valid', (done) => {
    expect(common.orderDocumentDate(order2.OrderDate, order2.OriginalOrderDate)).to.eql('2017-07-25Z')
    done();
  });

  it('Correct Order Date: Impossible', (done) => {
    expect(common.orderDocumentDate(order3.OrderDate, order3.OriginalOrderDate)).to.eql('2000-04-12Z')
    done();
  });
});

describe('flex field boolean values', () => {
  beforeEach((done) => {
    configManager.resetConfigPromise()
    done()
  })

  it('includes the value even if its `false`', () => {
    // Setup a test config resource stub for testing
    context.options = {
      configResource: testConfigResource({
        companyCode: 12312132,
        trustedId: 1238983,
        flex: {
          code: {
            "1": { "object": "Order Data", field: "order~isTaxExempt" }
          }
        }
      })
    }

    return orderBuilder.orderFromKiboInvoice(sampleCompleteOrder).then(order => {
      var item = {}
      return common.addFlexFields(item, order, {}, context, {}).then(itemWithFlex => {
        expect(itemWithFlex.FlexibleFields).to.not.be.undefined;
        expect(itemWithFlex.FlexibleFields).to.be.an.instanceof(Array);
        expect(itemWithFlex.FlexibleFields).to.have.lengthOf(1);
        expect(itemWithFlex.FlexibleFields[0]).to.have.property('FlexibleCodeField');
        expect(itemWithFlex.FlexibleFields[0].FlexibleCodeField["$value"]).to.eql(false);
      });
    });
  });
});
