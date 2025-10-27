module.exports = {

  'http.commerce.catalog.storefront.tax.estimateTaxes.before': {
      actionName: 'http.commerce.catalog.storefront.tax.estimateTaxes.before',
      customFunction: require('./domains/commerce.catalog.storefront.tax/http.commerce.catalog.storefront.tax.estimateTaxes.before')
  },

  'http.commerce.catalog.storefront.tax.estimateTaxes.after': {
      actionName: 'http.commerce.catalog.storefront.tax.estimateTaxes.after',
      customFunction: require('./domains/commerce.catalog.storefront.tax/http.commerce.catalog.storefront.tax.estimateTaxes.after')
  }
};
