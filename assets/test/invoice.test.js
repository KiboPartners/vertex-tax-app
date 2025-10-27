'use strict'

var assert = require('assert');
var chai = require('chai');
var expect = chai.expect;
var sampleOrder = require('./sample_completed_order');
var sampleShipping = require('./sample_completed_shipping.json');
var sampleLocation = require('./sample_location');
var samplePickup = require('./sample_invoice_order_multi_location.json');
var sampleLineShip = require('./sample_invoice_line_ship.json');
var sampleDifBilling = require('./sample_completed_order_different_billing_address');
var dis1 = require('./sample_complete_discount_order.json');
var dis2 = require('./sample_complete_discount_line.json');
var dis3 = require('./sample_complete_discount_line2.json');
var dis4 = require('./sample_complete_discount_ship.json');
var orderBuilder = require('../src/util/order');
var sampleTaxExempt = require('./sample_complete_tax_exempt.json');

var Simulator = require('mozu-action-simulator');
const actionName = 'embedded.commerce.orders.action.before';
const context = Simulator.context(actionName, () => {});
const isoCodes = require('iso-countries');
const testConfigResource = (resp, reject) => {
  return {
    getEntity: (args) => {
      return !reject ? Promise.resolve(resp) : Promise.reject(resp);
    }
  }
}

// Setup a test config resource stub for testing
context.options = { configResource: testConfigResource({ companyCode: 12312132, trustedId: 1238983 }) }


var invoiceCreator = require('../src/util/invoice');
const configManager = require('../src/util/configurationManager');

var args = {
  customer: Promise.resolve(require('./sample_customer.json')),
  location : Promise.resolve(require('./sample_location.json')),
  product : Promise.resolve(require('./sample_product.json'))
};

describe('confirmNeededInvoice', () => {
  const orderTrue = {
    fulfillmentStatus : "Fulfilled",
    paymentStatus : "Paid"
  };

  const orderNoPay = {
    fulfillmentStatus : "Fulfilled",
    paymentStatus : "Unpaid"
  }

  const orderNoFulfill = {
    fulfillmentStatus : "NotFulfilled",
    paymentStatus : "Paid"
  }

  it('Needs Invoice', (done) => {
    expect(invoiceCreator.confirmInvoiceStatus(orderTrue, context)).to.eql(true);
    expect(invoiceCreator.confirmInvoiceStatus(orderNoPay, context)).to.eql(false);
    expect(invoiceCreator.confirmInvoiceStatus(orderNoFulfill, context)).to.eql(false);
    done();
  });
});

describe('Configuration controlled generate invoice flag', () => {

  beforeEach((done) => {
    configManager.resetConfigPromise()
    done()
  })

  it('does not generate an invoice if the flag is set to false', () => {
    const testContext = Simulator.context(actionName, () => {});

    // Setup a test config resource stub for testing
    testContext.options = {
      configResource: testConfigResource({
        companyCode: 12312132,
        trustedId: 1238983,
        generateInvoice: false
      })
    }

    var invoiceP = invoiceCreator.createInvoiceFromVertex(sampleOrder, testContext, args);

    return invoiceP.then(invoice => {
      expect(invoice).to.be.empty;
    });
  });
});

// Testing the getOriginAddress functionality and validity
describe('Test Origin Address', () => {
  var originAddressP = invoiceCreator.getOriginAddress(sampleOrder, context, args);

  it('valid origin address', () => {
    return originAddressP.then(originAddress => {
      expect(originAddress.City).to.eql("Plano");
      expect(originAddress.MainDivision).to.eql("TX");
      expect(originAddress.PostalCode).to.eql("75024");
      expect(originAddress.Country).to.eql("USA");
    });
  });
});

describe('Test Invoice Destination', (done) => {
  var invoiceRequestP = invoiceCreator.generateInvoiceRequest(sampleOrder, context, args);

  it('valid invoice creation', () => {
    return invoiceRequestP.then(invoiceRequest => {
      expect(invoiceRequest.InvoiceRequest.Customer.Destination.City).to.eql('Addison');
      expect(invoiceRequest.InvoiceRequest.Customer.Destination.MainDivision).to.eql('TX');
      expect(invoiceRequest.InvoiceRequest.Customer.Destination.PostalCode).to.eql('75001');
      expect(invoiceRequest.InvoiceRequest.Customer.Destination.Country).to.eql('USA');
    });
  });
});

describe('Test Line Item Creation', (done) => {
  var generatedOrderP = orderBuilder.orderFromKiboInvoice(sampleOrder);
  return generatedOrderP.then(generatedOrder => {
    var lineItemsP = invoiceCreator.generateLineItems(generatedOrder, context, args);

    it('valid line item creation', () => {
      return lineItemsP.then(lineItems => {
        expect(lineItems).not.to.be.empty;
        expect(lineItems[0].Product.$value).to.eql("1001");
        expect(lineItems[0].ExtendedPrice).to.eql(50);
        expect(lineItems[0].Quantity).to.eql(1);
        expect(lineItems[1].Product.$value).to.eql("acc-1001");
        expect(lineItems[1].ExtendedPrice).to.eql(79.0);
        expect(lineItems[1].Quantity).to.eql(1);
      });
    });
  });
});

describe('Test Shipping Line Item', (done) => {
  it('has valid individual shipping amount', () => {
    var generatedOrderP = orderBuilder.orderFromKiboInvoice(sampleShipping);
    return generatedOrderP.then(generatedOrder => {
      var lineItemsP = invoiceCreator.generateLineItems(generatedOrder, context, args);
      return lineItemsP.then(lineItems => {
        expect(lineItems[0].Product.$value).to.eql("1004");
        expect(lineItems[0].ExtendedPrice).to.eql(735.0);
        expect(lineItems[0].LineItem.ExtendedPrice).to.eql(45.0);
        expect(lineItems[0].LineItem.Product).to.eql("cf36feeccb4540aaa569dca206f25c6d");
        expect(lineItems[1].Product.$value).to.eql("1011");
        expect(lineItems[1].ExtendedPrice).to.eql(130.0);
        expect(lineItems[1].LineItem.ExtendedPrice).to.eql(15.0);
        expect(lineItems[1].LineItem.Product).to.eql("cf36feeccb4540aaa569dca206f25c6d");
        expect(lineItems[2].Product).to.eql("cf36feeccb4540aaa569dca206f25c6d");

        // Expect that the last shipping item is zeroed out as the line items
        // have the shipping split out between them.
        expect(lineItems[2].ExtendedPrice).to.eql(0);
      });
    });
  });

  it('creates valid shipping line item', () => {
    var generatedOrderP = orderBuilder.orderFromKiboInvoice(sampleOrder);
    return generatedOrderP.then(generatedOrder => {
      var lineItems2P = invoiceCreator.generateLineItems(generatedOrder, context, args);
      return lineItems2P.then(lineItems => {
        expect(lineItems[lineItems.length - 1].Product).to.eql("cf36feeccb4540aaa569dca206f25c6d");
        expect(lineItems[lineItems.length - 1].ExtendedPrice).to.eql(15.0);
      });
    });
  });
});

describe('Test Different Shipping Locations', (done) => {
  it('valid line items with pickup', () => {
    var generatedOrderP = orderBuilder.orderFromKiboInvoice(samplePickup);
    return generatedOrderP.then(generatedOrder => {
      var lineItemsP = invoiceCreator.generateLineItems(generatedOrder, context, args);
      return lineItemsP.then(lineItems => {
        expect(lineItems[0].Product.$value).to.eql("1004");
        expect(lineItems[0].Customer).to.be.undefined;
        expect(lineItems[0].Seller).to.have.property("PhysicalOrigin");
        expect(lineItems[0].Seller.PhysicalOrigin.MainDivision).to.eql("TX")
        expect(lineItems[1].Product.$value).to.eql("1006");
        expect(lineItems[1].Customer.Destination.City).to.eql("Plano");
        expect(lineItems[2].Product.$value).to.eql("1011");
      });
    });
  });
});

describe('Test Destination Generation', (done) => {
  // Need to test to make sure that the destination per line item is different
  var addisonFF = {
    City: "Addison", 
    MainDivision: "TX", 
    PostalCode: "75001", 
    Country: "USA" 
  };
  var denverFF = {
    City: "Denver", 
    MainDivision: "CO", 
    PostalCode: "80202", 
    Country: "USA" 
  };

  var generatedOrderP = orderBuilder.orderFromKiboInvoice(sampleLineShip);
  return generatedOrderP.then(generatedOrder => {

    var lineItems2P = invoiceCreator.generateLineItems(generatedOrder, context, args);
    it('valid destination with individual shipping', () => {
      return lineItems2P.then(lineItems => {
        expect(lineItems[0].Product.$value).to.eql("2004");
        expect(lineItems[0].Customer).to.be.undefined;
        expect(lineItems[1].Product.$value).to.eql("2005");
        expect(lineItems[1].Customer.Destination.City).to.eql("Plano");
      });
    });
  });
});

describe('Test item discount', (done) => {
  var item1 = {
    couponCode: "2A30A6F3",
    discountAmount: 0.89
  };

  var discount = orderBuilder.generateDiscount(item1);

  it('valid item discount', (done) => {
    expect(discount.DiscountAmount).to.eql(0.89);
    expect(discount.attributes.userDefinedDiscountCode).to.eql("2A30A6F3");
    done();
  });
});

describe('Test order discount', (done) => {
  var discount1 = {
    couponCode: "ORDER10",
    discountAmount: 10.00
  };

  var discount = orderBuilder.generateDiscount(discount1);
  it('valid order discount', (done) => {
    expect(discount.DiscountAmount).to.eql(10.00);
    expect(discount.attributes.userDefinedDiscountCode).to.eql("ORDER10");
    done();
  });

  var invOrderP = invoiceCreator.generateInvoiceRequest(dis1, context, args);
  it('Extended price is discounted total', () => {
    return invOrderP.then( order => {

      expect(order.InvoiceRequest.LineItem[0].ExtendedPrice).to.eql(98.62);
      expect(order.InvoiceRequest.LineItem[1].ExtendedPrice).to.eql(256.41);
      expect(order.InvoiceRequest.LineItem[0].Discount[0].DiscountAmount).to.eql(1.38);
      expect(order.InvoiceRequest.LineItem[1].Discount[0].DiscountAmount).to.eql(3.59);
      expect(order.InvoiceRequest.LineItem[2].Discount[0].DiscountAmount).to.eql(1.65);
      expect(order.InvoiceRequest.LineItem[3].Discount[0].DiscountAmount).to.eql(3.38);
      expect(order.InvoiceRequest.LineItem[0].Discount[0].attributes.userDefinedDiscountCode).to.eql("SUMMER10");
    });
  });
});

describe('Test shipping discount', (done) => {
  var discount1 = {
    couponCode: "SHIP10",
    discountAmount: 10.00
  };
  var discount = orderBuilder.generateDiscount(discount1);
  var invLine1 = invoiceCreator.generateInvoiceRequest(dis2, context, args);
  var invLine2 = invoiceCreator.generateInvoiceRequest(dis3, context, args);

  it('valid shipping discount', (done) => {
    expect(discount.DiscountAmount).to.eql(10.00);
    expect(discount.attributes.userDefinedDiscountCode).to.eql("SHIP10");
    done();
  });

  it('Extended price is discounted total', () => {
    return invLine1.then( order => {
      expect(order.InvoiceRequest.LineItem[0].ExtendedPrice).to.eql(129.11);
      expect(order.InvoiceRequest.LineItem[0].Discount[0].DiscountAmount).to.eql(0.89);
      expect(order.InvoiceRequest.LineItem[0].Discount[0].attributes.userDefinedDiscountCode).to.eql("2A30A6F3");
      expect(order.InvoiceRequest.Discount).to.be.undefined;
    });
  });

  it('Extended price is discounted total', () => {
    return invLine2.then( order => {
      expect(order.InvoiceRequest.LineItem[0].ExtendedPrice).to.eql(79.00);
      expect(order.InvoiceRequest.LineItem[0].Discount).to.be.empty;
      expect(order.InvoiceRequest.LineItem[1].ExtendedPrice).to.eql(50.00);
      expect(order.InvoiceRequest.LineItem[1].Discount).to.be.empty;
      expect(order.InvoiceRequest.LineItem[2].ExtendedPrice).to.eql(54.00);
      expect(order.InvoiceRequest.LineItem[2].Discount[0].DiscountAmount).to.eql(6.00);
      expect(order.InvoiceRequest.LineItem[2].Discount[0].attributes.userDefinedDiscountCode).to.eql("97A5087F");
    });
  });
});

describe('Test shipping discount', (done) => {
  var order1 = {
    shippingDiscounts : {
      couponCode: "2A30A6F3",
      discountAmount: "0.89"
    }
  };
  var invShip = invoiceCreator.generateInvoiceRequest(dis4, context, args);

  it('Extended price is discounted total', () => {
    return invShip.then( order => {

      var len = order.InvoiceRequest.LineItem.length;
      expect(order.InvoiceRequest.LineItem[len - 1].ExtendedPrice).to.eql(10.00);
      expect(order.InvoiceRequest.LineItem[len - 1].Discount[0].attributes.userDefinedDiscountCode).to.eql("E0C3ABA6");
      expect(order.InvoiceRequest.LineItem[len - 1].Discount[0].DiscountAmount).to.eql(5.0);
    });
  });
});

describe('Test tax exemption', (done) => {
  var taxExemptOrderP = invoiceCreator.generateInvoiceRequest(sampleTaxExempt, context, args);
  it('Tax Exemption for customer', () => {
    return taxExemptOrderP.then( order => {
      expect(order.InvoiceRequest.Customer).to.have.property("ExemptionCertificate")
      expect(order.InvoiceRequest.Customer.ExemptionCertificate.attributes).to.have.property("exemptionCertificateNumber")
      expect(order.InvoiceRequest.Customer.ExemptionCertificate.attributes.exemptionCertificateNumber).to.eql("1234567890");
    });
  });
});

describe('Test Document Number and Transaction id invoice request attributes', () => {
  var invoiceP = invoiceCreator.generateInvoiceRequest(sampleOrder, context, args);
  it('sets the document Number to the Order Number', () => {
    return invoiceP.then(invoice => {
      expect(invoice.InvoiceRequest).to.have.property("attributes");
      expect(invoice.InvoiceRequest.attributes.documentNumber).to.eql(10);
    });
  });

  it('sets the transaction Id to the order ID', () => {
    return invoiceP.then(invoice => {
      expect(invoice.InvoiceRequest).to.have.property("attributes");
      expect(invoice.InvoiceRequest.attributes.transactionId).to.eql("0c51102c153e1e29dc0c328a00006323");
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
    var invoiceP = invoiceCreator.generateInvoiceRequest(sampleOrder, testContext, args);

    return invoiceP.then(invoice => {
      expect(invoice.InvoiceRequest.Seller).to.have.property("AdministrativeOrigin");
      expect(invoice.InvoiceRequest.Seller.AdministrativeOrigin.MainDivision).to.eql("TX");
      expect(invoice.InvoiceRequest.Seller.AdministrativeOrigin.Country).to.eql("USA");
      expect(invoice.InvoiceRequest.Seller.AdministrativeOrigin.City).to.eql("GEORGETOWN");
      expect(invoice.InvoiceRequest.Seller.AdministrativeOrigin.PostalCode).to.eql("78633");
    });
  });

  it('includes the customer administrative destination if the order has billing info', () => {
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
    var invoiceP = invoiceCreator.generateInvoiceRequest(sampleDifBilling, testContext, args);

    return invoiceP.then(invoice => {
      expect(invoice.InvoiceRequest.Customer).to.have.property("AdministrativeDestination");
      expect(invoice.InvoiceRequest.Customer.AdministrativeDestination.StreetAddress1).to.eql("518 York St #300"); // address line 1 & 2 are combined
      expect(invoice.InvoiceRequest.Customer.AdministrativeDestination.StreetAddress2).to.eql("Room 12 Desk A"); // address line 3 & 4 are combined
      expect(invoice.InvoiceRequest.Customer.AdministrativeDestination.MainDivision).to.eql("CO");
      expect(invoice.InvoiceRequest.Customer.AdministrativeDestination.City).to.eql("Westminster");
      expect(invoice.InvoiceRequest.Customer.AdministrativeDestination.PostalCode).to.eql("80031");
    });
  });

  it('does not include the administrative origin if the configuration does not have state', () => {
    const testContext = Simulator.context(actionName, () => {});

    // Setup a test config resource stub for testing
    testContext.options = {
      configResource: testConfigResource({
        companyCode: 12312132,
        trustedId: 1238983,
        city: "GEORGETOWN",
        zip: "78633" // NOTE we've omitted country
      })
    }
    var invoiceP = invoiceCreator.generateInvoiceRequest(sampleOrder, testContext, args);

    return invoiceP.then(invoice => {
      expect(invoice.InvoiceRequest.Seller).not.to.have.property("AdministrativeOrigin");
    });
  });
});

describe('Test customer information args', () => {
  var invoiceCustomer = invoiceCreator.generateInvoiceRequest(sampleOrder, context, args);

  it('Customer Code and Group Valid', () => {
    return invoiceCustomer.then(order => {
      expect(order.InvoiceRequest.Customer.CustomerCode.$value).to.eql("CODE 1");
      expect(order.InvoiceRequest.Customer.CustomerCode.attributes.classCode).to.eql("JV");
    });
  });
});

describe('Test product information args', () => {
  var invoiceCustomer = invoiceCreator.generateInvoiceRequest(sampleOrder, context, args);
  it('Product class is Valid', () => {
    return invoiceCustomer.then(order => {
      expect(order.InvoiceRequest.LineItem[0].Product.attributes.productClass).to.eql("Class-A");
    });
  });
});
