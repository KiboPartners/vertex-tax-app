/*
 * Order factory
 */

const _ = require('lodash');
const isoCodes = require('iso-countries');
const common = require('./common');

// TODO FQN must be adjusted for new Dev Account once provisioned
const CUSTOMER_CODE_FULLY_QUALIFIED_NAME  = "Tenant~vertex-customer-code";
const CUSTOMER_CLASS_FULLY_QUALIFIED_NAME = "Tenant~vertex-customer-class";
const PRODUCT_CLASS_FULLY_QUALIFIED_NAME  = "Tenant~vertex-product-class";
const PRODUCT_CLASS_FULLY_QUALIFIED_NAME2  = "tenant~tax-code";

const ADDRESS_LINE_MAX = 100;

const orderFromKiboQuotation = (baseOrder) => {

  return new Promise((resolve, reject) => {
    var order = {};

    // create a camelCase version of the base orders attributes
    order.rawOrder = _.mapKeys(baseOrder, (v, k) => _.camelCase(k));
    // Flex fields expects the attributes to be in camel case
    console.log('order.rawOrder.attributes ', JSON.stringify(order.rawOrder.attributes));
    order.rawOrder.attributes = ((order.rawOrder.attributes || []).length > 0 ? order.rawOrder.attributes : []).map(attribute => {
      return _.mapKeys(attribute, (v, k) => _.camelCase(k));
    });

    var countryCodeDes = isoCodes.findCountryByCode(baseOrder.TaxContext.DestinationAddress.CountryCode);
    var countryCodeOrg = isoCodes.findCountryByCode(baseOrder.TaxContext.OriginAddress.CountryCode);

    order.documentDate = common.orderDocumentDate(baseOrder.OriginalOrderDate, baseOrder.OrderDate);
    order.currencyCode = baseOrder.CurrencyCode;
    order.hasTaxExemption = baseOrder.TaxContext && !_.isEmpty(baseOrder.TaxContext.TaxExemptId);
    order.taxExceptionNumber = (baseOrder.TaxContext || {}).TaxExemptId;

    order.originAddress = common.cleanAddress(baseOrder.TaxContext.OriginAddress);
    order.destinationAddress = common.cleanAddress(baseOrder.TaxContext.DestinationAddress);
    order.shipping = {
      "shippingMethodCode": baseOrder.ShippingMethodCode ? baseOrder.ShippingMethodCode : "Shipping",
      "shippingAmount": baseOrder.ShippingAmount
    };

    if(baseOrder.ShippingDiscount) {
      order.shipping.hasShippingDiscount = true;
      order.shipping.discount = {
        "couponCode": baseOrder.ShippingDiscount.CouponCode,
        "discountAmount": baseOrder.ShippingDiscount.Impact
      };
    }

    if(baseOrder.OrderDiscount) {
      order.hasOrderDiscount = true;
    }

    var hasLineItemLevelShipping = false;
    var lineItemLevelShippingTotal = 0.0;

    order.lineItems = _.map(baseOrder.LineItems, (lineItem, index) => {
      var item = {
        lineItemNumber: index,
        id: lineItem.Id,
        product: lineItem.ProductCode,
        extendedPrice: lineItem.LineItemPrice,
        quantity: lineItem.Quantity,
        shipping: null,
        properties: lineItem.ProductProperties
      };

      if(lineItem.ProductDiscount) {
        item.hasDiscount = true;
        item.discount = {
          "couponCode": lineItem.ProductDiscount.CouponCode,
          "discountAmount": lineItem.DiscountTotal
        };
      }

      if(lineItem.ShippingAmount > 0) {
        item.hasItemShipping = true;
        hasLineItemLevelShipping = true;
        lineItemLevelShippingTotal += lineItem.ShippingAmount;

        item.shipping = {
          "shippingMethodCode": order.shipping.shippingMethodCode,
          "shippingAmount": lineItem.ShippingAmount
        };

        if(lineItem.ShippingDiscount) {
          item.shipping.hasShippingDiscount = true;
          item.shipping.discount = {
            "couponCode": lineItem.ShippingDiscount.CouponCode,
            "discountAmount": lineItem.ShippingDiscount.Impact
          };
        }
      }

      if(order.hasOrderDiscount) {
        item.orderDiscount = {
          "couponCode": baseOrder.OrderDiscount.CouponCode,
          "discountAmount": Number((lineItem.DiscountedTotal - lineItem.LineItemPrice).toFixed(2))
        };
      }

      return item;
    });

    // If shipping was split out to the line items, then the base order shipping
    // is just the summation and not a separate order level shipping line
    if (hasLineItemLevelShipping && lineItemLevelShippingTotal === order.shipping.shippingAmount) {
      order.shipping.shippingAmount = 0.0;
    }

    // In the event the shipping is less than the order level shipping,
    // and that there are discounts on the line item level, the order shipping
    // total is likely inaccurate, but we will leave the delta as the order
    // level shipping.
    if (hasLineItemLevelShipping && lineItemLevelShippingTotal < order.shipping.shippingAmount) {
      if (_.some(order.lineItems, (item) => { return item.hasShippingDiscount; })) {
        order.shipping.shippingAmount -= lineItemLevelShippingTotal;
      }
    }

    // Handle odd situations when shipping has order level shipping discounts
    // that aren't passed down to the line item
    if (hasLineItemLevelShipping && order.shipping.hasShippingDiscount && lineItemLevelShippingTotal > order.shipping.shippingAmount) {
      // we should trust that the order _total_ shipping is correct. Kibo
      // doesn't give us enough info to know otherwise.
      _.each(order.lineItems, (item, index) => {
        item.shipping = null;
        item.hasItemShipping = false;
      });
    }

    resolve(order);
  });
};

const orderFromKiboInvoice = (baseOrder) => {
  return new Promise((resolve, reject) => {
    var order = {};

    // Store raw order as camel case. This action should already provide
    // the raw order in camelCase, but this adds a layer of defensibility
    order.rawOrder = _.mapKeys(baseOrder, (v, k) => _.camelCase(k));
    // Flex fields expects the attributes to be in camel case
    order.rawOrder.attributes = order.rawOrder.attributes.map(attribute => {
      return _.mapKeys(attribute, (v, k) => _.camelCase(k));
    });

    order.documentDate = common.orderDocumentDate(baseOrder.acceptedDate, baseOrder.submittedDate, baseOrder.closedDate);
    order.locationCode = baseOrder.locationCode;
    order.customerCode = baseOrder.customerAccountId;

    order.hasTaxExemption = !!(baseOrder.customerTaxId);
    order.taxExceptionNumber = baseOrder.customerTaxId;

    var addressInfo = baseOrder.fulfillmentInfo.fulfillmentContact.address;
    var countryCodeDes = isoCodes.findCountryByCode(addressInfo.countryCode);

    order.destinationAddress = common.cleanAddress(addressInfo);

    var billingAddress = baseOrder.billingInfo.billingContact.address;
    order.billingAddress = common.cleanAddress(billingAddress);

    order.id = baseOrder.id;
    order.orderNumber = baseOrder.orderNumber;
    order.shipping = {
      "shippingMethodCode": baseOrder.fulfillmentInfo.shippingMethodCode ? baseOrder.fulfillmentInfo.shippingMethodCode : "Shipping",
      "shippingAmount": baseOrder.shippingTotal,
      "discounts": []
    };

    _.each(baseOrder.shippingDiscounts, function(shippingDiscount) {
      order.shipping.discounts.push( {
        "couponCode": shippingDiscount.discount.couponCode,
        "discountAmount": shippingDiscount.discount.impact
      });
    });

    if(order.shipping.discounts.length > 0) {
      order.shipping.hasShippingDiscount = true;
    }

    if(baseOrder.OrderDiscount) {
      order.hasOrderDiscount = true;
    }

    // Add seller info to line item
    var hasLineItemLevelShipping = false;
    var lineItemLevelShippingTotal = 0.0;

    order.lineItems = _.map(baseOrder.items, (lineItem, index) => {
      var item = {
        id: lineItem.id,
        lineItemNumber: index,
        product: lineItem.product.productCode,
        extendedPrice: lineItem.adjustedLineItemSubtotal,
        quantity: lineItem.quantity,
        shipping: null,
        pickup: false,
        locationCode: lineItem.fulfillmentLocationCode,
        orderDiscounts: [],
        properties: lineItem.product.properties
      };

      if(lineItem.fulfillmentMethod === "Pickup") {
        item.pickup = true;
      }

      // Check if pick up and generate destination
      if(lineItem.productDiscount) {
        item.hasDiscount = true;
        item.discount = {
          "couponCode": lineItem.productDiscount.couponCode,
          "discountAmount": lineItem.productDiscount.impact
        };
      }

      if(lineItem.shippingTotal > 0) {
        item.hasItemShipping = true;
        hasLineItemLevelShipping = true;
        lineItemLevelShippingTotal += lineItem.shippingTotal;

        item.shipping = {
          "shippingMethodCode": order.shipping.shippingMethodCode,
          "shippingAmount": lineItem.shippingTotal
        };

        if(lineItem.shippingDiscount) {
          item.shipping.hasShippingDiscount = true;
          item.shipping.discount = {
            "couponCode": lineItem.shippingDiscount.couponCode,
            "discountAmount": lineItem.shippingDiscount.impact
          };
        }
      }

      _.each(baseOrder.orderDiscounts, function (discount) {
        if(!discount.excluded) {
          item.orderDiscounts.push( {
            "couponCode": discount.couponCode,
            "discountAmount":  lineItem.weightedOrderDiscount
          }
          );
        }
      });

      if(item.orderDiscounts.length > 0) {
        order.hasOrderDiscount = true;
      }

      return item;
    });

    // If shipping was split out to the line items, then the base order shipping
    // is just the summation and not a separate order level shipping line
    if (hasLineItemLevelShipping && lineItemLevelShippingTotal === order.shipping.shippingAmount) {
      order.shipping.shippingAmount = 0.0;
    }

    // In the event the shipping is less than the order level shipping,
    // and that there are discounts on the line item level, the order shipping
    // total is likely inaccurate, but we will leave the delta as the order
    // level shipping.
    if (hasLineItemLevelShipping && lineItemLevelShippingTotal < order.shipping.shippingAmount) {
      if (_.some(order.lineItems, (item) => { return item.hasShippingDiscount; })) {
        order.shipping.shippingAmount -= lineItemLevelShippingTotal;
      }
    }

    // Handle odd situations when shipping has order level shipping discounts
    // that aren't passed down to the line item
    if (hasLineItemLevelShipping && order.shipping.hasShippingDiscount && lineItemLevelShippingTotal > order.shipping.shippingAmount) {
      // we should trust that the order _total_ shipping is correct. Kibo
      // doesn't give us enough info to know otherwise.
      _.each(order.lineItems, (item, index) => {
        item.shipping = null;
        item.hasItemShipping = false;
      });
    }

    resolve(order);
  }).catch(error => {
    console.error("Error creating order from Kibo invoice: " + error);
  });
};

const generateDiscount = (item) => {
  if(!item || !item.discountAmount || !item.couponCode)
    return {};

  return {
    attributes: {
      userDefinedDiscountCode: item.couponCode
    },
    DiscountAmount: item.discountAmount
  };
};

const getCustomer = (customerId, context, args) => {
  return new Promise((resolve, reject) => {
    if (_.isEmpty(String(customerId))) {
      // we don't have a customer ID to work with. Lets avoid the API call.
      // This can happen early in the estimation process before an anonymous
      // customer is created or known customer identified.
      resolve({});
    }

    var customerResource = require('mozu-node-sdk/clients/commerce/customer/customerAccount')(context.apiContext);
    var customerP = (args && args.customer) ? args.customer : customerResource.getAccount(
      { accountId: customerId }
    ).catch(error => {
      console.error(error);
      reject(error);
    });

    customerP.then( account => {
      if(!account) {
        console.log("No customer found for given id");
        resolve({});
      } else {
        var customer = {};

        // store all attributes
        customer.attributes = account.attributes;
        _.each(account.attributes, function(attribute) {
          if(attribute.fullyQualifiedName === CUSTOMER_CODE_FULLY_QUALIFIED_NAME) {
            customer.customerCode = attribute.values[0];
          } else if( attribute.fullyQualifiedName === CUSTOMER_CLASS_FULLY_QUALIFIED_NAME) {
            if (!_.isEmpty(attribute.values[0])) {
              customer.customerClass = attribute.values[0];
            }
          }
        });
        resolve(customer);
      }
    }).catch(error => {
      console.error("Error getting customer infromation");
    });
  });
};

// Cache to store order results
const orderCache = new Map();

const getOrder = (orderId, context, args) => {
  return new Promise((resolve, reject) => {
    try {
      // Check if order is in cache
      if (orderCache.has(orderId)) {
        resolve(orderCache.get(orderId));
        return;
      }

      var ordersResource = require('mozu-node-sdk/clients/commerce/order')(context.apiContext);
      var orderPromise = ordersResource.getOrder({ orderId: orderId, draft: false, includeBin: false, responseFields: '' });
      
      orderPromise.then(order => {
        // Store result in cache before resolving
        orderCache.set(orderId, order);
        resolve(order);
      }).catch(error => {
        reject(error);
      });

    } catch (error) {
      console.error(error);
      reject(error); 
    }
  });
};

const getAsPromise = obj => new Promise((resolve, reject) => resolve(obj));

const getLineItemProduct = (orderId, lineItemId, context, args) => {
  return new Promise((resolve, reject) => {
    
    var lineItemP;

    // if lineItem already has properties no need to fetch order
    if (args.lineItem && args.lineItem.properties) {
      lineItemP = getAsPromise(args.lineItem);
    } else {
      lineItemP = getOrder(orderId, context, args).then(order => {
        const lineItem = order.items ? order.items.find(item => item.id === lineItemId) : undefined;
        return lineItem;
      }).catch(error => {
        console.error(`[getLineItemProduct] Error fetching order or lineItem:`, error);
        reject(error);
      });
    }

    return lineItemP.then(lineItem => {
      if(!lineItem) {
        resolve({});
      } else {
        var productObj = {};

        // store all attributes
        productObj.attributes = lineItem.product.properties;
        _.each(lineItem.properties, function(property) {
          if(property.AttributeFQN && property.AttributeFQN.toLowerCase() === PRODUCT_CLASS_FULLY_QUALIFIED_NAME.toLowerCase()) {
            productObj.class = property.Values[0].Value;
          } else if(property.AttributeFQN && property.AttributeFQN.toLowerCase() === PRODUCT_CLASS_FULLY_QUALIFIED_NAME2.toLowerCase()) {
            productObj.class = property.Values[0].Value;
          }
        });

        if (!productObj.class) {
          productObj.class = lineItem.product.productType;
        }

        resolve(productObj);
      }
    }).catch(error => {
      console.error(error);
    });
  });
};
module.exports.orderFromKiboQuotation = orderFromKiboQuotation;
module.exports.orderFromKiboInvoice = orderFromKiboInvoice;
module.exports.generateDiscount = generateDiscount;
module.exports.getCustomer = getCustomer;
module.exports.getLineItemProduct = getLineItemProduct;
