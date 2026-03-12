/*
 * Main Utility file for Estimating tax from vertex
 */

const _ = require('underscore');
const soapWsdlUtils = require('./wsdlUtils');
const configManager = require('./configurationManager');
const common = require('./common');
const orderBuilder = require('./order');

const generateShippingItem = (item, index) => {
  var shipItem = {
    attributes: {
      lineItemNumber: index
    },
    Product: {
      $value: item.shippingMethodCode,
    },
    ExtendedPrice: item.shippingAmount
  };

  if (item.hasShippingDiscount) {
    shipItem.Discount = orderBuilder.generateDiscount(item.discount);
  }

  return shipItem;
};


const generateLineItems = (order, context, args) => {
  var itemsP = new Promise((resolve, reject) => {
    var productItemsP = _.map(order.lineItems, (lineItem) => {
      return orderBuilder.getLineItemProduct(order.rawOrder.orderId, lineItem.id, context, Object.assign({}, args, { lineItem: lineItem })).then(product => {
        var item = {
          attributes: {
            lineItemNumber: lineItem.lineItemNumber
          },
          Product: {
            $value: lineItem.product,
          },
          ExtendedPrice: lineItem.extendedPrice,
          Quantity: lineItem.quantity,
          Discount: []
        };

        if (!_.isEmpty(product) && product.class) {
          item.Product.attributes = {
            productClass: product.class
          };
        }

        if (lineItem.hasDiscount) {
          item.Discount.push(orderBuilder.generateDiscount(lineItem.discount));
        }

        if (lineItem.hasItemShipping) {
          item.LineItem = generateShippingItem(lineItem.shipping, 0);
        }

        if (order.hasOrderDiscount) {
          item.Discount.push(orderBuilder.generateDiscount(lineItem.orderDiscount));
        }

        return common.addFlexFields(item, order, product, context, args).then(resItem => {
          return resItem;
        }).catch(err => {
          console.warn('Error adding flex fields, falling back to item without flex. Error:', err);
          return item;
        });

      }).catch(error => {
        console.error(error);
        reject(error);
      });
    });

    Promise.all(productItemsP).then(productItems => {
      resolve(productItems);
    }).catch(error => {
      console.error(error);
    });
  });

  return itemsP.then(productItems => {
    productItems.push(generateShippingItem(order.shipping, productItems.length));
    return productItems;
  }).catch(error => {
    console.error(error);
    throw error;
  });
};

const generateQuotationRequest = (order, context, args) => {
  const orderObjP = orderBuilder.orderFromKiboQuotation(order);
  const configP = configManager.getVertexConfig(context, context.options);
  const customerP = orderBuilder.getCustomer(order.TaxContext.CustomerId, context, args);
  var orderObj;
  return Promise.all([orderObjP, customerP]).then(values => {
    var orderObject = values[0];
    var customer = values[1];
    orderObject.customer = customer;

    var lineItemsP = generateLineItems(orderObject, context, args);
    orderObj = orderObject;
    return Promise.all([lineItemsP, configP, customerP]);
  }).then(values => {
    var lineItems = values[0];
    var config = values[1];
    var customer = values[2];

    var quotation = {};
    _.assign(quotation, config.generateAuthWrapper());

    quotation.QuotationRequest = {
      attributes: {
        transactionType: "SALE",
        documentDate: orderObj.documentDate,
        returnAssistedParametersIndicator: true
      },
      "Currency": {
        attributes: { isoCurrencyCodeAlpha: orderObj.currencyCode || "USD" }
      },
      "Seller": {
        "PhysicalOrigin": orderObj.originAddress
      },
      "Customer": {
        "Destination": orderObj.destinationAddress
      },
      LineItem: lineItems
    };

    if (!_.isEmpty(orderObj.billingCountry)) {
      quotation.QuotationRequest.Customer.AdministrativeOrigin = orderObj.billingAddress;
    }

    if (!_.isEmpty(customer)) {
      quotation.QuotationRequest.Customer.CustomerCode = {
        $value: customer.customerCode
      };

      if (customer.customerClass) {
        quotation.QuotationRequest.Customer.CustomerCode.attributes = {
          "classCode": customer.customerClass
        };
      }
    }

    if (orderObj.hasTaxExemption) {
      quotation.QuotationRequest.Customer.ExemptionCertificate = {
        attributes: { exemptionCertificateNumber: orderObj.taxExceptionNumber }
      };
      quotation.QuotationRequest.Customer.attributes = { "isTaxExempt": true };
    }

    if (config.companyCode) {
      quotation.QuotationRequest.Seller.Company = config.companyCode;
    } else if (config.companyCodeOSeries) {
      quotation.QuotationRequest.Seller.Company = config.companyCodeOSeries;
    }

    if (config._rawConfig.sellerDivision) {
      quotation.QuotationRequest.Seller.Division = config._rawConfig.sellerDivision;
    }

    if (config._rawConfig.sellerDepartment) {
      quotation.QuotationRequest.Seller.Department = config._rawConfig.sellerDepartment;
    }

    if (config.country) {
      quotation.QuotationRequest.Seller.AdministrativeOrigin = {
        StreetAddress1: config.address1,
        StreetAddress2: config.address2,
        City: config.city,
        MainDivision: config.state,
        PostalCode: config.zip,
        Country: config.country
      };
    }

    return quotation;
  }).catch(err => {
    console.error(err);
  });
};

const buildOrderTax = function (lineItems, quote, order) {
  var orderTax = {
    handlingFeeTax: 0.0,
    shippingTax: 0.0,
    itemTaxContexts: lineItems,
    orderTax: Number(lineItems.reduce((sum, item) => sum + Number(item.tax), 0)),
  };

  if (quote.LineItem.length > order.LineItems.length) {
    orderTax.shippingTax = Number(quote.LineItem[Number(quote.LineItem.length - 1)].TotalTax);

    orderTax.orderTax = Number(lineItems.reduce((sum, item) => sum + Number(item.tax), 0));

  }
  orderTax.shippingTax = orderTax.shippingTax.toFixed(2);
  orderTax.orderTax = orderTax.orderTax.toFixed(2);
  return orderTax;
};

const estimateTaxFromVertex = function(order, context, callback, args) {
  return new Promise((resolve, reject) => {
    common.buildTaxSoapClient(context).then(client => {
      const quotationP = generateQuotationRequest(order, context, args);
      quotationP.then(quotation => {
        const taxP = client.calculateTax_Async(quotation, {
          postProcess: common.postProcessLogXml
        });

        taxP.then(res => {
          const rawSoapRes = res[0];
          const rawBody = res[1];
          const quote = rawSoapRes.QuotationResponse;
          common.postProcessLogXml(rawBody);

          const lineItems = _.map(
            _.filter(_.isArray(quote.LineItem) ? quote.LineItem : [ quote.LineItem ], (lineItem) => {
              return Number(lineItem.attributes.lineItemNumber) < order.LineItems.length;
            }), (lineItem) => {
              var lineItemTax = {
                id: order.LineItems[Number(lineItem.attributes.lineItemNumber)].Id,
                productCode: lineItem.Product.$value,
                quantity: Math.floor(Number(lineItem.Quantity)), // Quantity is returned as a decimal 1.0 and Kibo expects an Integer
                tax: Number(lineItem.TotalTax).toFixed(2),
                taxData: null
              };

              // Handles shipping product codes  which doesn't have a value associated with it
              lineItemTax.productCode = lineItem.Product.$value ? lineItem.Product.$value : lineItem.Product;

              if (lineItem.LineItem && !_.isEmpty(lineItem.LineItem.TotalTax)) {
                lineItemTax.shippingTax = Number(lineItem.LineItem.TotalTax);
              }

              return lineItemTax;
            });

          var orderTax = buildOrderTax(lineItems, quote, order);
          resolve(orderTax);

        }).catch(err => {
          console.error('Error recieving response from SOAP client');
          var errorResponse;
          if (err.hasOwnProperty("body")) {
            errorResponse = common.postProcessLogXml(err.body);
          } else {
            errorResponse = err;
          }

          reject(errorResponse);
        });
      })
        .catch(err => {
          console.error('Building Quotation');
        });
    })
      .catch(error => {
        console.error('Error building vertex client');
        reject(error);
      });
  });
};

module.exports.buildOrderTax = buildOrderTax;
module.exports.estimateTaxFromVertex = estimateTaxFromVertex;
module.exports.generateQuotationRequest = generateQuotationRequest;
module.exports.generateLineItems = generateLineItems;
module.exports.generateShippingItem = generateShippingItem;
