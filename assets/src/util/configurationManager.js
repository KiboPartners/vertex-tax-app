/*
 * Retreive Vertex Configuration from Kibo
 *
 * exports
 * getVertexConfig(context)
 */
const _ = require('underscore');
const entityFactory = require('mozu-node-sdk/clients/platform/entitylists/entity');

/*
    Requires Mozu Node SDK
*/

//constants for configuration lookup and cloud defaults
const NAMESPACE = 'vertex_tax_connector';
const ENTITY_LIST_NAME = 'vertexConfig';
const ENTITY_FULL_NAME = `${ENTITY_LIST_NAME}@${NAMESPACE}`;
const ENTITY_ID = 'vertexTaxConnectorConfig';
const VERTEX_CLOUD_CONNECTION_TYPE = 'vertexCloud';
const VERTEX_O_SERIES_CONNECTION_TYPE = 'vertexOSeries';
const VERTEX_CLOUD_TAX_WSDL_URL = 'https://calccsconnect.vertexsmb.com/vertex-ws/services/CalculateTax70?wsdl';
const VERTEX_CLOUD_ADDRESS_WSDL_URL = 'https://calccsconnect.vertexsmb.com/vertex-ws/services/LookupTaxAreas70?wsdl';

class Configuration {
  constructor(config) {
    this._rawConfig      = config;
    this.address1        = config.addressLine1;
    this.address2        = config.addressLine2;
    this.city            = config.city;
    this.state           = config.state;
    this.zip             = config.zip;
    this.country         = config.country;
    this.generateInvoice = config.generateInvoice;
    this.flex            = config.flex;

    // v1.2.0
    this.addressCleansingEnabled = config.addressCleansingEnabled;
    this.addressCleansingAutoAccept = config.addressCleansingAutoAccept;
  }

  // Not implemented on base class
  generateAuthWrapper() {}
}

class CloudConfiguration extends Configuration {
  constructor(config) {
    super(config);
    this.calculateTaxWsdl = VERTEX_CLOUD_TAX_WSDL_URL;
    this.addressCleansingWsdl = VERTEX_CLOUD_ADDRESS_WSDL_URL;
    this.type             = VERTEX_CLOUD_CONNECTION_TYPE;
    this.companyCode      = config.companyCode    || undefined;
    this.trustedId        = config.trustedIdCloud || undefined;
  }

  generateAuthWrapper() {
    return {
      Login: {
        TrustedId:    this.trustedId,
      }
    };
  }
}

class OSeriesConfiguration extends Configuration {
  constructor(config) {
    super(config);
    this.calculateTaxWsdl = config.calculateTaxWsdl;
    this.addressCleansingWsdl = config.addressCleansingWsdl;
    this.type             = VERTEX_O_SERIES_CONNECTION_TYPE;
    this.username         = config.username           || undefined;
    this.password         = config.password           || undefined;
    this.companyCode      = config.companyCodeOSeries || undefined;
    this.trustedId        = config.trustedIdOSeries   || undefined;
  }

  generateAuthWrapper() {
    return {
      Login: {
        UserName: this.username,
        Password: this.password,
        TrustedId: this.trustedId,
      }
    };
  }
}

var configurationPromise;

const resetConfigPromise = function() {
  configurationPromise = undefined;
};

const getVertexConfig = function(context, options) {
  // Supports testing with a mock SDK
  const configResource = options && options.configResource ? options.configResource : entityFactory(context.apiContext ? context.apiContext : context);

  //get vertex config for Tenant
  configurationPromise = configurationPromise || configResource.getEntity({
    entityListFullName: ENTITY_FULL_NAME,
    id: ENTITY_ID
  }).then((entity) => {
    console.info("Retrieved configuration entity with keys ", _.keys(entity));

    // determine type of configuration
    var configuration;
    switch (entity.vertexConnection) {
      case VERTEX_CLOUD_CONNECTION_TYPE:
        configuration = new CloudConfiguration(entity);
        break;
      case VERTEX_O_SERIES_CONNECTION_TYPE:
        configuration = new OSeriesConfiguration(entity);
        break;
      default:
        // attempt to determine from properties
        if(_.has(entity, "companyCode")) {
          // assume cloud
          configuration = new CloudConfiguration(entity);
        } else if (_.has(entity, "trustedIdOSeries")) {
          configuration = new OSeriesConfiguration(entity);
        }
    }

    if (!configuration) {
      throw new TypeError("Configuration entity is in an unrecognized format");
    }

    return configuration;
  }).catch((err) => {
    console.error(err);
    throw new Error("Vertex Configuration could not be retrieved");
  });

  return configurationPromise;
};

module.exports.getVertexConfig = getVertexConfig;
module.exports.resetConfigPromise = resetConfigPromise;
module.exports.Configuration = Configuration;
module.exports.CloudConfiguration = CloudConfiguration;
module.exports.OSeriesConfiguration = OSeriesConfiguration;
