/*
 * Return factory
 *
 * Takes a return an reformats the original order with the return data
 */

const _      = require('underscore');
const common = require('./common');
const order  = require('./order');

const invoiceCreator = require('./invoice');
const orderBuilder   = require('./order');

const kiboOrderClientFactory = require('mozu-node-sdk/clients/commerce/order');

class Return {
  constructor(kiboReturn) {
    this._rawReturn = kiboReturn;

    this.originalOrderId = kiboReturn.originalOrderId;

    this.hasRefund = kiboReturn.refundAmount > 0;

    this.itemMap = {};
    this.items = _.map(kiboReturn.items, (lineItem, index) => {
      const shippingIncludedInRefund = lineItem.refundAmount === lineItem.totalWithWeightedShippingAndHandling;

      var returnItem = {
        originalOrderLineId:  lineItem.orderItemId,
        extendedPrice:        shippingIncludedInRefund ? -1 * (lineItem.productLossAmount) : lineItem.refundAmount,
        shippingTotal:        shippingIncludedInRefund ? -1 * lineItem.shippingLossAmount : 0.0,
        quantity:             (lineItem.quantityReceived || 0) - (lineItem.quantityReplaced || 0)
      };

      this.itemMap[returnItem.originalOrderLineId] = returnItem;

      return returnItem;
    });

    this.itemIdSet = _.map(this.items, (item) => { return item.originalOrderLineId; });
  }

  // originalOrder - order object generated from order - orderFromKiboInvoice
  applyOverrides(originalOrder) {

    var returnOrder = _.clone(originalOrder);

    // Always start by zero-out order level shipping. Kibo breaks out shipping
    // "loss" on per item level, so order level shipping gets distributed on
    // partial orders as though it were on a sub-shipping line item.
    returnOrder.shipping.shippingAmount = 0.0;

    // Only select those items that are in the return
    var originalItems = returnOrder.lineItems;

    returnOrder.lineItems = _.filter(originalItems, (item) => {
      return _.contains(this.itemIdSet, item.id);
    });

    var origTotalOrderQuantity = 0.0;
    var returnOrderQuantity = 0.0;

    _.each(returnOrder.lineItems, (item) => {
      var returnOverrides = this.itemMap[item.id];

      var originalQuantity = item.quantity;

      var discountRatio = (returnOverrides.quantity / originalQuantity);

      origTotalOrderQuantity += originalQuantity;
      returnOrderQuantity += returnOverrides.quantity;

      // Override base line info
      item.extendedPrice = returnOverrides.extendedPrice;
      item.quantity = returnOverrides.quantity;

      // Override shipping
      if (item.hasItemShipping) {
        if (item.shippingAmount != 0.0) {
          item.shipping.shippingAmount = returnOverrides.shippingTotal;

          if (item.shipping.hasShippingDiscount) {
            item.shipping.shipping.discount.discountAmount *= (-1.0 * discountRatio);
          }
        } else { // shipping was not included in the refund for this item
          item.shipping = null;
        }
      } else if (returnOverrides.shippingTotal != 0.0) {
        // This means it's an order level shipping return; Add to order line
        returnOrder.shipping.shippingAmount += returnOverrides.shippingTotal;
      }

      if (item.hasDiscount) {
        item.discount.discountAmount *= (-1.0 * discountRatio);
      }

      if (item.hasOrderDiscount) {
        item.orderDiscount.discountAmount *= (-1.0 * discountRatio);
      }
    });

    if (origTotalOrderQuantity == 0.0) {
      // ... Houston, we hzve a problem. How we managed to craft a return for
      // a 0 item order is beyond us.
      throw new TypeError('Give a return for an order with no items. Check data');
    }

    const orderDiscountRatio = returnOrderQuantity / origTotalOrderQuantity;

    if (returnOrder.shipping.hasShippingDiscount) {
      _.each(returnOrder.shipping.discounts, (discount) => {
        discount.discountAmount *= (-1 * orderDiscountRatio);
      });
    }

    if (returnOrder.hasOrderDiscount) {
      _.each(returnOrder.orderDiscounts, (discount) => {
        discount.discountAmount *= (-1 * orderDiscountRatio);
      });
    }

    return returnOrder;
  }
}

const generateReturnOrder = (kiboReturn, context, options) => {
  return new Promise((resolve, reject) => {
    const orderReturn = new Return(kiboReturn);
    const orderClient = options.orderClient ? options.orderClient : kiboOrderClientFactory(context.apiContext);

    // If we haven't refunded the customer, we shouldn't create a negative
    // transaction
    if (!orderReturn.hasRefund) {
      console.info("Retutn was not refunded. Not taking any further action");
      resolve({});
    }

    orderClient.getOrder({ orderId: kiboReturn.originalOrderId }).then(order => {
      invoiceCreator.createInvoiceFromVertex(order, context, _.assign(options, { orderModifier: (order) => { return orderReturn.applyOverrides(order); } }))
        .then((res) => {
          resolve(res);
        })
        .catch(err => {
          console.error(err);
          reject("Could not perform return request on invoice Vertex");
        });
    }).catch(err => {
      console.error(err);
      reject("Could not retrieve original order details ");
    });
  });
};

module.exports.generateReturnOrder = generateReturnOrder;
module.exports.Return = Return;
