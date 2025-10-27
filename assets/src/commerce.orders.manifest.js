module.exports = {

  'embedded.commerce.orders.action.before': {
      actionName: 'embedded.commerce.orders.action.before',
      customFunction: require('./domains/commerce.orders/embedded.commerce.orders.action.before')
  },

  'embedded.commerce.orders.action.after': {
      actionName: 'embedded.commerce.orders.action.after',
      customFunction: require('./domains/commerce.orders/embedded.commerce.orders.action.after')
  }
};
