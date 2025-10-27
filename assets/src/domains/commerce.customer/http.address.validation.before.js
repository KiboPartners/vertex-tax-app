const _ = require('underscore');
const configManager = require('../../util/configurationManager');
const addresscleansing = require('../../util/addresscleansing');
const common = require('../../util/common');

module.exports = function (context, callback) {
  let request = common.changeCaseOfObjectKeys(context.request.body, Object.getPrototypeOf("").toUpperCase);
  console.info(context.request.body);
  configManager.getVertexConfig(context, context.options).then(vertexConfig => {
    if (vertexConfig.addressCleansingEnabled) {
      addresscleansing.cleanseAddress(request, context, callback).then(addressCandidates => {
        context.response.body = addressCandidates;
        context.response.body = common.changeCaseOfObjectKeys(context.response.body, Object.getPrototypeOf("").toLowerCase);
        context.response.end();
      }).catch(err => {
        console.error(err);
        callback('Address could not be validated, please check your address and try again');
      });
    } else {
      callback();
    }
  }).catch(err => {
    console.error(`Could not retrieve configuration: ${err}, assumming address cleansing is disabled`);
    callback();
  });
};
