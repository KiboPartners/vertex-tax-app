/**
 * Implementation for embedded.commerce.return.actions.before

 * This custom function will receive the following context object:
{
  "exec": {
    "addReturnItem": {
      "parameters": [
        {
          "name": "returnItem",
          "type": "object"
        }
      ],
      "return": {
        "type": "mozu.commerceRuntime.contracts.returns.return"
      }
    },
    "setRMADeadline": {
      "parameters": [
        {
          "name": "rmaDeadline",
          "type": "date"
        }
      ]
    }
  },
  "get": {
    "rma": {
      "parameters": [],
      "return": {
        "type": "mozu.commerceRuntime.contracts.returns.return"
      }
    },
    "returnAction": {
      "parameters": [],
      "return": {
        "type": "mozu.commerceRuntime.contracts.returns.returnAction"
      }
    }
  }
}


 */

const returnHandler = require('../../util/return');
const CLOSE_ACTION = "Close";
var contextBuilder = require('mozu-node-sdk/clients/platform/applications');

module.exports = function(context, callback) {
  var _apiVersion = (contextBuilder(context.apiContext).context || {}).version;
  console.info("Processing return action:", context.get.returnAction(), "on return:");
  console.info(context.get.rma());
  console.info("Version info, connector = " + context.apiContext.appKey, " Kibo API Version = " + _apiVersion);
  // only process negative transaction if return is being closed:
  if (context.get.returnAction().actionName === CLOSE_ACTION) {
    // call invoicer with negative line items
    returnHandler.generateReturnOrder(context.get.rma(), context, {})
      .then((res) => {
        console.info(res);
        callback();
      })
      .catch(err => {
        console.warn(err);
        // purposefully don't stop return process
        callback();
      });
  } else {
    callback();
  }
};
