/*
 * Main util file for creating the final invoice from Vertex
 */

const _ = require('underscore');
const isoCodes = require('iso-countries');

const soapWsdlUtils = require('./wsdlUtils');
const configManager = require('./configurationManager');
const common = require('./common');
const orderBuilder = require('./order');

const confirmInvoiceStatus = (order) => {
  return order.fulfillmentStatus === "Fulfilled" && order.paymentStatus === "Paid";
};

const generateShippingItem = (item, index) => {
  if (!item)
    return {};

  var shippingItem = {
    attributes: {
      lineItemNumber: index
    },
    Product: item.shippingMethodCode,
    ExtendedPrice: item.shippingAmount
  };

  if (item.hasShippingDiscount) {
    shippingItem.Discount = [];
    _.each(item.discounts, function(discount) {
      shippingItem.Discount.push(orderBuilder.generateDiscount(discount));
    });
  }

  return shippingItem;
};

const generateLineItems = (order, context, args) => {
  var itemsP = new Promise((resolve, reject) => {
    var productItemsP = _.map(order.lineItems, (lineItem) => {
      var originAddressP = getOriginAddress(lineItem.locationCode, context, args);
      var productP = orderBuilder.getLineItemProduct(order.rawOrder.orderId, lineItem.id, context, Object.assign({}, args, { lineItem: lineItem }));
      return Promise.all([originAddressP, productP]).then(values => {
        var originAddress = values[0];
        var product = values[1];
        var item = {
          attributes: {
            lineItemNumber: lineItem.lineItemNumber
          },
          Product: {
            $value: lineItem.product
          },
          ExtendedPrice: lineItem.extendedPrice,
          Quantity: lineItem.quantity,
          Discount: [],
        };

        if (!_.isEmpty(originAddress)) {
          item.Seller = {
            PhysicalOrigin: originAddress
          };
        }

        if (!_.isEmpty(product) && product.class) {
          item.Product.attributes = {
            productClass: product.class
          };
        }

        if (lineItem.pickup) {
          item.Customer = { "Destination" : originAddress };
        }

        if (lineItem.hasItemShipping) {
          item.LineItem = generateShippingItem(lineItem.shipping, 0);
        }

        if (lineItem.hasDiscount) {
          item.Discount.push(orderBuilder.generateDiscount(lineItem.discount));
        }

        if (order.hasOrderDiscount) {
          _.each(lineItem.orderDiscounts, function(discount) {
            item.Discount.push(orderBuilder.generateDiscount(discount));
          });
        }

        return common.addFlexFields(item, order, product, context, args).then(resItem => {
           return resItem;
        }).catch(err => {
          console.warn('Error adding flex fields, falling back to item without flex. Error:', err);
          return item;
        });

      }).catch(err => {
        console.error('Error returning individual line items: ', err);
        reject(err);
      });
    });

    Promise.all(productItemsP).then(productItems => {
      resolve(productItems);
    }).catch(error => {
      console.error("Error returning line item array: " + error);
    });
  });

  return itemsP.then(productItems => {
    productItems.push(generateShippingItem(order.shipping, productItems.length));
    return productItems;
  }).catch(err => {
    console.error('Error adding shipping line item');
    throw err;
  });
};

const generateInvoiceRequest = (order, context, args) => {
  const configP = configManager.getVertexConfig(context, context.options);
  var orderObjP = orderBuilder.orderFromKiboInvoice(order);
  if (args && args.orderModifier) {
    orderObjP = orderObjP.then(args.orderModifier)
    .catch(err => {
      console.error(err);
      return Promise.reject(err); // Do not let an invoice be created.
    });
  }
  var customerP = orderBuilder.getCustomer(order.customerAccountId, context, args).catch(err => {
    console.error(err);
  });

  var orderObj;
  return orderObjP.then(orderObject => {
    console.info("Collecting Origin address and generating line items");
    var originAddressP = getOriginAddress(orderObject.locationCode, context, args);

    return customerP.then(customer => {
      orderObject.customer = customer;
      var lineItemsP = generateLineItems(orderObject, context, args);
      orderObj = orderObject;
      return Promise.all([originAddressP, lineItemsP, configP, customerP]);
    });
  }).then( function (values) {
    var originAddress = values[0];
    var lineItems = values[1];
    var config = values[2];
    var customer = values[3];

    var invoice = {};
    _.assign(invoice, config.generateAuthWrapper());

    invoice.InvoiceRequest = {
      attributes: {
        transactionType: "SALE",
        documentDate: orderObj.documentDate,
        transactionId: orderObj.id,
        documentNumber: orderObj.orderNumber,
        returnAssistedParametersIndicator: true
      },
      Seller: {},
      "Customer" : {
        "Destination": orderObj.destinationAddress,
      },
      LineItem: lineItems
    };

    if (!_.isEmpty(orderObj.billingAddress)) {
      invoice.InvoiceRequest.Customer.AdministrativeDestination = orderObj.billingAddress;
    }

    var seller = originAddress;
    if (!_.isEmpty(seller)) {
      invoice.InvoiceRequest.Seller.PhysicalOrigin = seller;
    }

    if (config.country) {
      // add default address from config
      invoice.InvoiceRequest.Seller.AdministrativeOrigin = {
        StreetAddress1: config.address1,
        StreetAddress2: config.address2,
        City: config.city,
        MainDivision: config.state,
        PostalCode: config.zip,
        Country: config.country
      };
    }

    if (config.companyCode) {
      invoice.InvoiceRequest.Seller.Company = config.companyCode;
    } else if (config.companyCodeOSeries) {
      invoice.InvoiceRequest.Seller.Company = config.companyCodeOSeries;
    }

    if (!_.isEmpty(customer)) {
      invoice.InvoiceRequest.Customer.CustomerCode = {
        $value: customer.customerCode,
      };

      if (customer.customerClass) {
        invoice.InvoiceRequest.Customer.CustomerCode.attributes = {
          "classCode":  customer.customerClass
        };
      }
    }

    if (orderObj.hasTaxExemption) {
      invoice.InvoiceRequest.Customer.ExemptionCertificate = {
        attributes: { exemptionCertificateNumber: orderObj.taxExceptionNumber }
      };
      invoice.InvoiceRequest.Customer.attributes = { "isTaxExempt": true };
    }

    console.info("Generated invoice request");

    return invoice;
  }).catch(error => {
    console.error("Error generating Vertex Invoice Request: " + error);
  });
};

// Retreive company origin address information from Kibo API
const getOriginAddress = (locationCode, context, args) => {
  return new Promise((resolve, reject) => {
    var locationResource = require('mozu-node-sdk/clients/commerce/admin/location')(context.apiContext);

    var locationP =  (args && args.location) ? args.location : locationResource.getLocation(
      { locationCode: locationCode}
    ).catch(error => {
      console.error(error);
      reject(error);
    });

    locationP.then(location => {
      if (!(location && location.address)) {
        // reject?
        console.info('No location found for code ' + locationCode);
        // return default configured location?
        resolve({});
      } else {
        resolve(common.cleanAddress(location.address));
      }
    }).catch(error => {
      console.error("Error creating origin location: " + error);
    });
  });
};

const createInvoiceFromVertex = function(order, context, args) {
console.error("createInvoiceFromVertex >> ");
  return new Promise((resolve, reject) => {

    const configP = configManager.getVertexConfig(context, context.options).then(config => {

      // Explicitly check if flag is a falsey value that is *not* undefined
      // Undefined values could mean that the config schema has not been updated
      // with this options. In those instances, we should default to generating
      // invoices till the user updates their configuration via the UI.
      if (config.generateInvoice !== undefined && !config.generateInvoice) {
        console.info("User has configured not to generate invoices");
        resolve({});
      } else {
        common.buildTaxSoapClient(context).then(client => {

          generateInvoiceRequest(order, context, args).then(invoiceReq => {
            const taxP = client.calculateTax_Async(invoiceReq, {
              postProcess: common.postProcessLogXml
            });

            taxP.then(res => {

              const rawSoapRes = res[0];
              const rawBody = res[1];
              const invoice = rawSoapRes.InvoiceResponse;
              common.postProcessLogXml(rawBody);

              const lineItems = _.map(
                _.filter(_.isArray(invoice.LineItem) ? invoice.LineItem : [ invoice.LineItem ], (lineItem) => {
                  return lineItem.attributes.lineItemNumber < order.items.length;
                }), (lineItem) => {
                  console.log("Line item ", lineItem.attributes.lineItemNumber, ": ", lineItem);
                  return {
                    id: order.items[Number(lineItem.attributes.lineItemNumber)].id,
                    productCode: lineItem.Product,
                    quantity: Math.floor(Number(lineItem.Quantity)), // Quantity is returned as a decimal 1.0 and Kibo expects an Integer
                    shippingTax: 0.0, // TODO support shipping from child line items
                    tax: Number(lineItem.TotalTax),
                    taxData: null
                  };
                });
              // TODO add tax contexts for individual line items
              resolve({
                handlingFeeTax: 0.0,
                itemTaxContexts: lineItems,
                orderTax: Number(invoice.TotalTax),
                shippingTax: 0.0
              });
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
            .catch(error => {
              console.error('Error generating invoice');
              reject(error);
            });
        })
          .catch(error => {
            console.error('Error building vertex client');
            reject(error);
          });
      }
    });
  });
};

module.exports.generateLineItems = generateLineItems;
module.exports.generateInvoiceRequest = generateInvoiceRequest;
module.exports.getOriginAddress = getOriginAddress;
module.exports.createInvoiceFromVertex = createInvoiceFromVertex;
module.exports.confirmInvoiceStatus = confirmInvoiceStatus;
