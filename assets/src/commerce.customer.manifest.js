module.exports = {
  'http.commerce.customer.address.validation.before':{
    actionName: 'http.commerce.customer.address.validation.before',
    customFunction: require('./domains/commerce.customer/http.address.validation.before')
  },
  'http.commerce.customer.address.validation.after':{
    actionName: 'http.commerce.customer.address.validation.after',
    customFunction: require('./domains/commerce.customer/http.address.validation.after')
  }
};
