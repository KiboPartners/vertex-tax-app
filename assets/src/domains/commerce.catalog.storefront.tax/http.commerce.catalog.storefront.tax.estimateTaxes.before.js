/**
 * Implementation for http.commerce.catainfo.storefront.tax.estimateTaxes.before


 * HTTP Actions all receive a similar context object that includes
 * `request` and `response` objects. These objects are similar to
 * http.IncomingMessage objects in NodeJS.

{
  configuration: {},
  request: http.ClientRequest,
  response: http.ClientResponse
}

 * Call `response.end()` to end the response early.
 * Call `response.set(headerName)` to set an HTTP header for the response.
 * `request.headers` is an object containing the HTTP headers for the request.
 *
 * The `request` and `response` objects are both Streams and you can read
 * data out of them the way that you would in Node.

 */

/* Response Format
{
  "handlingFeeTax": "decimal",
    "itemTaxContexts": [
      {
        "id": "string",
        "productCode": "string",
        "quantity": "int",
        "shippingTax": "decimal",
        "tax": "decimal",
        "taxData": "string"
      }
    ],
    "orderTax": "decimal",
    "shippingTax": "decimal",
    "taxData": "string"
}
*/

const _ = require('underscore');

var contextBuilder = require('mozu-node-sdk/clients/platform/applications');

const soapUtils = require('../../util/wsdlUtils');

const taxEstimator = require('../../util/estimator');

const common = require('../../util/common');

module.exports = function(context, callback) {
  var _apiVersion = (contextBuilder(context.apiContext).context || {}).version;
  console.info("BEFORE");
  let request = common.changeCaseOfObjectKeys(context.request.body, Object.getPrototypeOf("").toUpperCase);
  console.info(request);
  console.info("Version info, connector = " + context.apiContext.appKey, " Kibo API Version = " + _apiVersion);
  taxEstimator.estimateTaxFromVertex(request, context, callback)
    .then((res) => {
      console.info(res);
      context.response.body = common.changeCaseOfObjectKeys(res, Object.getPrototypeOf("").toLowerCase);
      context.response.end();
    })
    .catch(err => {
      var taxAreas = /no.*tax.*areas/gi;
      console.error(err);
      if (err && err.toString().match(taxAreas))
        callback("Taxes could not be calculated for the given addresses, please verify addresses and try again.");
      else
        callback('One or more errors occurred');
    });
};
