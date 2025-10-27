'use strict'

var chai = require('chai');
var expect = chai.expect;

// needed to create a sample "context"
var Simulator = require('mozu-action-simulator');
const actionName = 'http.commerce.catalog.storefront.tax.estimateTaxes.before';
const context = Simulator.context(actionName, () => {});

describe('getVertexConfig', ()=> {
  var configManager = require('../src/util/configurationManager');
  beforeEach(() => { configManager.resetConfigPromise(); });

  const testConfigResource = (resp, reject) => {
    return {
      getEntity: (args) => {
        return !reject ? Promise.resolve(resp) : Promise.reject(resp);
      }
    }
  }

  it('can be given a "configResource" in a second option object argument to use instead of the mozu SDK', () => {
    var configP = configManager.getVertexConfig(context, { configResource: testConfigResource({ companyCode: 12312132, trustedIdCloud: 1238983 })})

    return configP.then(config => {
      expect(config).to.be.instanceof(configManager.CloudConfiguration);
    });
  });

  it('maps the custom Cloud trusted Id to the "trustedId" property', () => {
    var configP = configManager.getVertexConfig(context, { configResource: testConfigResource({ companyCode: 12312132, trustedIdCloud: 1238983 })})

    return configP.then(config => {
      expect(config).to.be.instanceof(configManager.CloudConfiguration);
      expect(config.trustedId).to.eq(1238983);
    });
  });

  it('maps the custom O Series trusted Id to the "trustedId" property', () => {
    var configP = configManager.getVertexConfig(context, { configResource: testConfigResource({ companyCodeOSeries: 12312132, trustedIdOSeries: 1238983 })})

    return configP.then(config => {
      expect(config).to.be.instanceof(configManager.OSeriesConfiguration);
      expect(config.trustedId).to.eq(1238983);
    });
  });


  it('treats "blank" strings as undefined - O Series', () => {
    var testOptions = {
      configResource: testConfigResource({
        username: '',
        password: '',
        trustedIdOSeries: '',
        companyCodeOSeries: ''
      })
    }

    return configManager.getVertexConfig(context, testOptions).then(config => {
      expect(config.trustedIdOSeries).to.be.undefined;
      expect(config.username).to.be.undefined;
      expect(config.password).to.be.undefined;
      expect(config.companyCode).to.be.undefined;
    });
  });

  it('treats "blank" strings as undefined', () => {
    var testOptions = { configResource: testConfigResource({ username: 'kibotest', password: 'kibotest!', trustedIdCloud: '', companyCode: ''}) }

    return configManager.getVertexConfig(context, testOptions).then(config => {
      expect(config.trustedIdOSeries).to.be.undefined;
      expect(config.companyCode).to.be.undefined;
    });
  });
});
