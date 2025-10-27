'use strict'

var assert = require('assert');
var chai = require('chai');
const _ = require('underscore');

var expect = chai.expect;
var orderBuilder = require('../src/util/order');
var sampleOrder = require('./sample_order');
var dis1 = require('./sample_discount_order_dol.json');
var dis2 = require('./sample_discount_order_per.json');
var dis3 = require('./sample_discount_line_per.json');
var dis4 = require('./sample_discount_line_item.json');
var dis5 = require('./sample_discount_shipping_dol.json');
var dis6 = require('./sample_discount_shipping_per.json');
var multi1 = require('./sample_order_multiple_items.json');
var multi2 = require('./sample_order_multiple_items2');
var sampleTaxExempt = require('./sample_tax_exempt.json');

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

var args = {
  customer: Promise.resolve(require('./sample_customer.json')),
  product: Promise.resolve(require('./sample_product.json'))
};

// Setup a test config resource stub for testing
context.options = { configResource: testConfigResource({ companyCode: 12312132, trustedId: 1238983 }) }

var estimator = require('../src/util/estimator');

const configManager = require('../src/util/configurationManager');

// Testing that quotation request generation geterates a JSON object
describe('generateQuotationRequest', () => {
  it('generates valid quotation body', () => {
    var quoteReqP = estimator.generateQuotationRequest(sampleOrder, context, args);

    return quoteReqP.then(quoteReq => {
      expect(quoteReq).to.have.property('Login');
      expect(quoteReq).to.have.property('QuotationRequest');
    });
  });

  it('has a valid documentDate', () => {
    var quoteReqP = estimator.generateQuotationRequest(sampleOrder, context, args);

    return quoteReqP.then(quoteReq => {
      expect(quoteReq).to.have.property('QuotationRequest');
      expect(quoteReq.QuotationRequest).to.have.property('attributes');
      expect(quoteReq.QuotationRequest.attributes.documentDate).to.eql('2018-07-13Z')
    });
  });
});

describe('generateLineItems', () => {

  it('mapping line items: one', () => {
    var orderObjP = orderBuilder.orderFromKiboQuotation(sampleOrder);

    return orderObjP.then(orderObj => {
      var quotationsP = estimator.generateLineItems(orderObj, context, args);
      return quotationsP.then(quotations => {
        expect(quotations).not.to.be.empty;
        expect(quotations[0].Product.$value).to.eql("blz-1001");
        expect(quotations[0].ExtendedPrice).to.eql(199.0);
        expect(quotations[0].Quantity).to.eql(1);
      });
    });
  });

  it('mapping line items: multiple', () => {
    var orderObjP = orderBuilder.orderFromKiboQuotation(multi1);

    return orderObjP.then(orderObj => {
      var quotationP = estimator.generateLineItems(orderObj, context, args);
      return quotationP.then(quotation => {
        expect(quotation[0].Product.$value).to.eql("blz-1000");
        expect(quotation[1].ExtendedPrice).to.eql(10.00);
        expect(quotation[3].Quantity).to.eql(4);
      });
    });
  });

  it('generated line items', () => {
    var quotationP = estimator.generateQuotationRequest(sampleOrder, context, args);
    return quotationP.then(quotation => {
      expect(quotation.QuotationRequest.LineItem[0].Product.$value).to.eql("blz-1001");
      expect(quotation.QuotationRequest.LineItem[0].ExtendedPrice).to.eql(199.0);
      expect(quotation.QuotationRequest.LineItem[0].Product.$value).to.eql("blz-1001");
      expect(quotation.QuotationRequest.LineItem[0].ExtendedPrice).to.eql(199.0);
      expect(quotation.QuotationRequest.LineItem[0].Quantity).to.eql(1);
    });
  });

});


describe('Testing shipping information', () => {
  it('Individual shipping amount', () => {
    var orderObjP = orderBuilder.orderFromKiboQuotation(multi2);

    return orderObjP.then(orderObj => {
      var quotationP = estimator.generateLineItems(orderObj, context, args);
      return quotationP.then(quotation => {
        expect(quotation[0].LineItem).to.eql(undefined);
        expect(quotation[1].LineItem.Product).to.eql("31423");
        expect(quotation[1].LineItem.ExtendedPrice).to.eql(140);
        expect(quotation[2].LineItem.Product).to.eql("31423");
        expect(quotation[2].LineItem.ExtendedPrice).to.eql(14.50);
        expect(quotation[3].LineItem.Product).to.eql("31423");
        expect(quotation[3].LineItem.ExtendedPrice).to.eql(0.50);
      });
    });
  });

  it('Shipping total as line item', () => {
    var orderObjP = orderBuilder.orderFromKiboQuotation(sampleOrder);
    return orderObjP.then(orderObj => {
      var quotationP = estimator.generateLineItems(orderObj, context, args);
      return quotationP.then(quotation => {
        expect(quotation[quotation.length - 1].Product).to.eql("Shipping");
        expect(quotation[quotation.length - 1].ExtendedPrice).to.eql(100.0);
      });
    });
  });

  it('Shipping total and individual shipping', () => {
    var orderObjP = orderBuilder.orderFromKiboQuotation(multi2);

    return orderObjP.then(orderObj => {
      var quotationP = estimator.generateLineItems(orderObj, context, args);
      return quotationP.then(quotation => {
        expect(quotation[1].LineItem.Product).to.eql("31423");
        expect(quotation[4].ExtendedPrice).to.eql(123.23);
        expect(quotation[4].Product).to.eql("31423");
      });
    });
  });
});

describe('Testing Discounted Total Correct', () => {
  var quoteTotalOrderDollarP = estimator.generateQuotationRequest(dis1, context, args);
  var quoteTotalOrderPercentP = estimator.generateQuotationRequest(dis2, context, args);
  var quoteLineDollarP = estimator.generateQuotationRequest(dis4, context, args);
  var quoteLinePercentP = estimator.generateQuotationRequest(dis3, context, args);
  var quoteShipDollarP = estimator.generateQuotationRequest(dis5, context, args);
  var quoteShipPercentP = estimator.generateQuotationRequest(dis6, context, args);

  it('Order price is discounted dollar price', () => {
    return quoteTotalOrderDollarP.then(quoteTotalOrderD => {
      expect(quoteTotalOrderD.QuotationRequest.LineItem[0].ExtendedPrice).to.eql(98.62);
      expect(quoteTotalOrderD.QuotationRequest.LineItem[1].ExtendedPrice).to.eql(256.41);
    });
  });

  it('Order price is discounted percentage', () => {
    return quoteTotalOrderPercentP.then(quoteTotalOrderPer => {
      expect(quoteTotalOrderPer.QuotationRequest.LineItem[0].ExtendedPrice).to.eql(180);
    });
  });

  it('Line item price is discounted dollar price', () => {
    return quoteLineDollarP.then(quoteLineD => {
      expect(quoteLineD.QuotationRequest.LineItem[0].ExtendedPrice).to.eql(516.44);
    });
  });

  it('Order price is discounted dollar price', () => {
    return quoteLinePercentP.then(quoteLinePer => {
      expect(quoteLinePer.QuotationRequest.LineItem[0].ExtendedPrice).to.eql(57.60);
    });
  });

  it('Order price is discounted dollar price', () => {
    return quoteShipDollarP.then(quoteShipD => {
      expect(quoteShipD.QuotationRequest.LineItem[0].ExtendedPrice).to.eql(50.00);
      expect(quoteShipD.QuotationRequest.LineItem[1].ExtendedPrice).to.eql(10.00);
    });
  });

  it('Order price is discounted dollar price', () => {
    return quoteShipPercentP.then(quoteShipPer => {
      expect(quoteShipPer.QuotationRequest.LineItem[0].ExtendedPrice).to.eql(60.00);
      expect(quoteShipPer.QuotationRequest.LineItem[1].ExtendedPrice).to.eql(12.00);
    });
  });
});

describe('Testing discounted order', () => {
  var orderDolP = estimator.generateQuotationRequest(dis1, context, args);
  var orderPerP = estimator.generateQuotationRequest(dis2, context, args);
  var orderDiscount = {
    couponCode: "TestCode",
    discountAmount: 45.0
  };
  var orderNone = null;
  it('Discounted order dollar amount is valid', () => {
    return orderDolP.then(orderDol => {
      expect(orderDol.QuotationRequest.LineItem[0].Discount[0].attributes.userDefinedDiscountCode).to.eql("SUMMER10");
      expect(orderDol.QuotationRequest.LineItem[0].Discount[0].DiscountAmount).to.eql(1.38);
    });
  });

  it('Discounted order percentage is valid', () => {
    return orderPerP.then(orderPer => {
      expect(orderPer.QuotationRequest.LineItem[0].Discount[0].attributes.userDefinedDiscountCode).to.eql("CREDERA");
      expect(orderPer.QuotationRequest.LineItem[0].Discount[0].DiscountAmount).to.eql(20);
    });
  });

  var genOrderDis = orderBuilder.generateDiscount(orderDiscount);
  var genOrderNon = orderBuilder.generateDiscount(orderNone);
  it('Order discount generator works as expected', (done) => {
    expect(genOrderDis.DiscountAmount).to.be.eql(45);
    expect(genOrderNon).to.be.empty;
    done();
  });
});

describe('Testing discounted shipping', () => {
  it('Discounted shipping is valid', () => {
    var orderObjDolP = orderBuilder.orderFromKiboQuotation(dis5);
    return orderObjDolP.then(orderObjDol => {
      var shipDolP = estimator.generateLineItems(orderObjDol, context, args);
      shipDolP.then(shipDol => {
        expect(shipDol[shipDol.length - 1].Discount.attributes.userDefinedDiscountCode).to.eql("E0C3ABA6");
        expect(shipDol[shipDol.length - 1].Discount.DiscountAmount).to.eql(5.0);
      });
    });
  });

  it('Discounted shipping per line is valid', () => {
    var orderObjPerP = orderBuilder.orderFromKiboQuotation(dis6);
    return orderObjPerP.then(orderObjPer => {
      var shipPerP = estimator.generateLineItems(orderObjPer, context, args);
      shipPerP.then(shipPer => {
        expect(shipPer[shipPer.length - 1].Discount.attributes.userDefinedDiscountCode).to.eql("ABF0337D");
        expect(shipPer[shipPer.length - 1].Discount.DiscountAmount).to.eql(3.0);
      });
    });
  });

  it('assumes the order level shipping is accurate if there is an order level discount and the order shipping does not add up to the line item shipping total', () => {
    var shippingPerLineWithDiscount = require('./sample_shipping_per_item_with_discount');
    return estimator.generateQuotationRequest(shippingPerLineWithDiscount, context, args).then(quote => {
      expect(quote.QuotationRequest).to.have.property("LineItem");
      _.each(quote.QuotationRequest.LineItem, that => {
        expect(that.LineItem).to.be.undefined; // no nested shipping line items
      });
      var shippingLine = quote.QuotationRequest.LineItem[2]

      expect(shippingLine.ExtendedPrice).to.eql(14.25)
      expect(shippingLine.Discount.DiscountAmount).to.eql(0.75);
    });
  });

  var shipDiscount = {
    couponCode: "TestCode",
    discountAmount: 45.0
  };
  var shipNone = null;
  var genShipDis = orderBuilder.generateDiscount(shipDiscount);
  var genShipNon = orderBuilder.generateDiscount(shipNone);

  it('Ship discount generator works as expected', (done) => {
    expect(genShipDis.DiscountAmount).to.be.eql(45);
    expect(genShipNon).to.be.empty;
    done();
  });
});

describe('Testing discounted line items', () => {
  var orderDiscountDolP = orderBuilder.orderFromKiboQuotation(dis4);
  return orderDiscountDolP.then(orderDiscountDol => {
    var itemsDolP = estimator.generateLineItems(orderDiscountDol, context, args);
    itemsDolP.then(itemsDol => {
      it('Discounted line items are valid', () => {
        expect(itemsDol[0].Discount[0].attributes.userDefinedDiscountCode).to.eql("2A30A6F3");
        expect(itemsDol[0].Discount[0].DiscountAmount).to.eql(3.56);
      });
    });
  });

  var orderDiscountPerP = orderBuilder.orderFromKiboQuotation(dis3);
  return orderDiscountPerP.then(orderDiscountPer => {
    var itemsPerP = estimator.generateLineItems(orderDiscountPer, context, args);
    itemsPerP.then(itemsPer => {
      it('Discounted line items are valid', (done) => {
        expect(itemsPer[0].Discount[0].attributes.userDefinedDiscountCode).to.eql("97A5087F");
        expect(itemsPer[0].Discount[0].DiscountAmount).to.eql(2.4);
      });
    });
  });

  var indvItemPer  = {
    "couponCode": "97A5087F",
    "discountAmount": 40.0
  };
  var itemDiscount = orderBuilder.generateDiscount(indvItemPer);

  it('Discount generator works as expected', (done) => {
    expect(itemDiscount.DiscountAmount).to.eql(40.0);
    expect(itemDiscount.DiscountPercent).to.be.undefined;
    done();
  });
});

describe('Test tax exempt customer', () => {
  var taxExempt = estimator.generateQuotationRequest(sampleTaxExempt, context, args);

  it('Tax Exemption field is valid', () => {
    return taxExempt.then(order => {
      expect(order.QuotationRequest.Customer).to.have.property("ExemptionCertificate")
      expect(order.QuotationRequest.Customer.ExemptionCertificate.attributes).to.have.property("exemptionCertificateNumber")
      expect(order.QuotationRequest.Customer.ExemptionCertificate.attributes.exemptionCertificateNumber).to.eql("1234567890");
    });
  });

});

describe('Test Administrative Origin', () => {

  beforeEach((done) => {
    configManager.resetConfigPromise()
    done()
  })

  it('includes the administrative origin if the configuration has an address set', () => {
    const testContext = Simulator.context(actionName, () => {});

    // Setup a test config resource stub for testing
    testContext.options = {
      configResource: testConfigResource({
        companyCode: 12312132,
        trustedId: 1238983,
        city: "GEORGETOWN",
        state: "TX",
        zip: "78633",
        country: "USA"
      })
    }
    var quoteP = estimator.generateQuotationRequest(sampleOrder, testContext, args);

    return quoteP.then(quote => {
      expect(quote.QuotationRequest.Seller).to.have.property("AdministrativeOrigin");
      expect(quote.QuotationRequest.Seller.AdministrativeOrigin.MainDivision).to.eql("TX");
      expect(quote.QuotationRequest.Seller.AdministrativeOrigin.Country).to.eql("USA");
      expect(quote.QuotationRequest.Seller.AdministrativeOrigin.City).to.eql("GEORGETOWN");
      expect(quote.QuotationRequest.Seller.AdministrativeOrigin.PostalCode).to.eql("78633");
    });
  });

  it('does not include the customer administrative destination if the order does not have billing info', () => {
    const testContext = Simulator.context(actionName, () => {});

    // Setup a test config resource stub for testing
    testContext.options = {
      configResource: testConfigResource({
        companyCode: 12312132,
        trustedId: 1238983,
        city: "GEORGETOWN",
        state: "TX",
        zip: "78633",
        country: "USA"
      })
    }

    // At the time of this commit, estimate taxes (i.e. quote) requests don't
    // include billing info for the customer (like a regular order object does)
    var quoteP = estimator.generateQuotationRequest(sampleOrder, testContext, args);

    return quoteP.then(quote => {
      expect(quote.QuotationRequest.Customer).not.to.have.property("AdministrativeDestination");
    });
  });

  it('does not include the seller administrative origin if the configuration does not have country', () => {
    const testContext = Simulator.context(actionName, () => {});

    // Setup a test config resource stub for testing
    testContext.options = {
      configResource: testConfigResource({
        companyCode: 12312132,
        trustedId: 1238983,
        city: "GEORGETOWN",
        state: "TX",
        zip: "78633" // NOTE we've omitted country
      })
    }
    var quoteP = estimator.generateQuotationRequest(sampleOrder, testContext, args);

    return quoteP.then(quote => {
      expect(quote.QuotationRequest.Seller).not.to.have.property("AdministrativeOrigin");
    });
  });
});

describe('Test customer information args', () => {
  var quotationCustomer = estimator.generateQuotationRequest(sampleOrder, context, args);

  it('Customer Code and Group Valid', () => {
    return quotationCustomer.then(order => {
      expect(order.QuotationRequest.Customer.CustomerCode.$value).to.eql("CODE 1");
      expect(order.QuotationRequest.Customer.CustomerCode.attributes.classCode).to.eql("JV");
    });
  });
});

describe('Test product information args', () => {
  var quotationCustomer = estimator.generateQuotationRequest(sampleOrder, context, args);
  it('Product Class is Valid', () => {
    return quotationCustomer.then(order => {
      expect(order.QuotationRequest.LineItem[0].Product.attributes.productClass).to.eql("Class-A");
    });
  });
});

/*
describe('Test estimate tax from vertex', () => {
  var estimateTax = estimator.estimateTaxFromVertex(sampleOrder, context, args);
  it('estimate tax is valid', () => {
    return estimateTax.then(tax => {
      // console.log(tax, "tax")
      expect(tax.handlingFeeTax).to.eql(0);
      expect(tax.orderTax).to.eql(14.92);
      expect(tax.shippingTax).to.eql(1.13);
      expect(tax.taxData).to.eql("");
      expect(tax.itemTaxContexts[0].id).to.eql(2);
      expect(tax.productCode[0].id).to.eql(1005);
      expect(tax.productCode[0].quantity).to.eql(2);
      expect(tax.productCode[0].shippingTax).to.eql(8.33);
      expect(tax.productCode[0].tax).to.eql(9);
      expect(tax.productCode[0].taxData).to.eql("");
    });
  });
});
*/

describe('Test number format of the tax', () => {
  it('rounds order tax to the nearest cent', (done) => {
    var lineItems = [
      {
        "id":7998,
        "productCode":7888,
        "quantity":10,
        "tax": 30.8989
      }
    ];
    var quote =
    {
      TotalTax: 87.03600122,
      LineItem:[
        {
          Product: "foo",
        }
      ]
    };
    var order ={
      LineItems:[
        {
          Product: "foo"
        }
      ]
    };

    var orderTax = estimator.buildOrderTax(lineItems, quote, order);
    expect(orderTax.handlingFeeTax).to.eql(0.0);
    expect(orderTax.orderTax).to.eql("87.04");
    expect(orderTax.itemTaxContexts).to.be.an('array')
    expect(orderTax.shippingTax).to.eql("0.00");

    done();
  });

  it('rounds shippingTax to the nearest cent', (done) => {
    var lineItems = [
      {
        "id":7998,
        "productCode":7888,
        "quantity":10,
        "tax": 30.8989
      }
    ];
    var quote =
    {
      TotalTax: 87.03200122,
      LineItem:[
        {
          Product: "foo",
          TotalTax: 87.03200122
        },
        {
          Product: "shipping line",
          TotalTax: 5.438765
        }
      ]
    };
    var order ={
      LineItems:[
        {
          Product: "foo"
        }
      ]
    };

    var shippingTax = estimator.buildOrderTax(lineItems, quote, order);
    expect(shippingTax.shippingTax).to.eql("5.44");
    expect(shippingTax.orderTax).to.eql("81.59");

    done();
  });

  it('does not produce an off-by-one cent problem', (done) => {
    var lineItems = [
      {
        "id":7998,
        "productCode":7888,
        "quantity":10,
        "tax": 30.89894
      }
    ];
    var quote =
    {
      TotalTax: 87.036,
      LineItem:[
        {
          Product: "foo",
        },
        {
          Product: "shipping line",
          TotalTax: 5.044
        }
      ]
    };
    var order ={
      LineItems:[
        {
          Product: "foo"
        }
      ]
    };

    var shippingTax = estimator.buildOrderTax(lineItems, quote, order);
    expect(shippingTax.shippingTax).to.eql("5.04");
    expect(shippingTax.orderTax).to.eql("81.99");

    done();
  });
});
