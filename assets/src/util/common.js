/*
 * Common Utility file for Vertex Tax Connector
 */
const url = require('url');
const _ = require('lodash');
const configManager = require('./configurationManager');
const soapWsdlUtils = require('./wsdlUtils');
const isoCodes = require('iso-countries');

const entityListResourceFactory = require('mozu-node-sdk/clients/platform/entityList');
const entityResourceFactory     = require('mozu-node-sdk/clients/platform/entitylists/entity');

const CACHE_ENTITY_NAMESPACE = 'Vertex';
const CACHE_ENTITY_LIST_NAME = 'wsdl_cache';
const CACHE_ENTITY_FULL_NAME = `${CACHE_ENTITY_LIST_NAME}@${CACHE_ENTITY_NAMESPACE}`;

const ADDRESS_LINE_MAX = 100;

const mergeAddressStrings = function() {
  var str = "";

  str = _.compact(_.toArray(arguments)).join(" ");

  return !_.isEmpty(str) ? str.substr(0, ADDRESS_LINE_MAX) : undefined;
};

const cleanAddress = function(kiboSourceAddress) {
  let kiboAddress = _.mapKeys(kiboSourceAddress.Address || kiboSourceAddress.address || kiboSourceAddress, (v, k) => _.camelCase(k));
  let countryCode = isoCodes.findCountryByCode(kiboAddress.countryCode);

  var vertexCompatibleAddress = {};
  vertexCompatibleAddress.StreetAddress1 = mergeAddressStrings(
    kiboAddress.address1,
    kiboAddress.address2
  );

  vertexCompatibleAddress.StreetAddress2 = mergeAddressStrings(
    kiboAddress.address3,
    kiboAddress.address4
  );

  vertexCompatibleAddress.City = kiboAddress.cityOrTown;
  vertexCompatibleAddress.MainDivision = kiboAddress.stateOrProvince;
  vertexCompatibleAddress.PostalCode = kiboAddress.postalOrZipCode;
  vertexCompatibleAddress.Country = countryCode ? countryCode.alpha3 : 'USA';

  return vertexCompatibleAddress;
};

const postProcessLogXml = function(_xml) {
  console.info(_xml.replace(/[\n\r]/g,'').replace(/<(\w+:)?(UserName|Password|TrustedId)>[^<]*<\/(\w+:)?(UserName|Password|TrustedId)>/g, "<$1$2>********</$3$4>"));
  return _xml;
};

const cleanUriToId = function(uriStr) {
  let uri = url.parse(uriStr);
  return uri.host.replace(/[\.:]/g,'_') + '-' + uri.pathname.replace(/\//g,'_') + uri.search.replace(/[\?&]/g, '_');
};

const checkErrorMessage = function(message, term) {
  return message.indexOf(term) !== -1;
};

const getCacheEntityListObj = () => {
  return {
    contextLevel: "Tenant",
    //createDate: new Date().toLocaleString(),
    isLocaleSpecific: "false",
    isSandboxDataCloningSupported: "false",
    isShopperSpecific: "false",
    isVisibleInStorefront: "false",
    name: CACHE_ENTITY_LIST_NAME,
    nameSpace: CACHE_ENTITY_NAMESPACE,
    useSystemAssignedId: "false",
    idProperty: {
      dataType: "string",
      propertyName: "id"
    }
  };
};

const getWsdlCache = function(wsdl, context) {
  return new Promise((resolve, reject) => {
    let entityResource = entityResourceFactory(context.apiContext);
    entityResource.getEntity({
      entityListFullName: CACHE_ENTITY_FULL_NAME,
      id: cleanUriToId(wsdl)
    }).catch(err => {
      var msg = `Could not retreive WSDL cache: ${err}`;
      console.info(msg);
      reject(msg);
    }).then(entity => {
      resolve(entity);
    });
  });
};

const saveWsdlCache = function(wsdlUrl, wsdlCache, context) {
  let entityResource = entityResourceFactory(context.apiContext);
  let wsdlEntityId = cleanUriToId(wsdlUrl);
  let wsdlCacheEntity = {
    id: wsdlEntityId,
    entityListFullName: CACHE_ENTITY_FULL_NAME,
    wsdlCache: wsdlCache
  };

  return new Promise((resolve, reject) => {
    entityResource.updateEntity(wsdlCacheEntity)
      .then(_ => resolve(true))
      .catch(err => {
        console.info(`Could not update entity. Checking Error Message. ${err}`);
        if(!err.originalError) {
          console.warn('No original error provided when saving entity.');
          resolve(false);
        }
        let code = err.originalError.errorCode;
        let message = err.originalError.message;

        if(code && code === "ITEM_NOT_FOUND" && message){
          let listResource = entityListResourceFactory(context.apiContext);

          if (checkErrorMessage(message, CACHE_ENTITY_LIST_NAME)) {
            console.info('Creating New Entity List');
            listResource.createEntityList(getCacheEntityListObj())
              .then((resp) => {
                console.info('Creating New Entity');
                entityResource.insertEntity(wsdlCacheEntity)
                  .then(resp => {
                    console.info('Sucessfully saved wsdl cache on tenant');
                    resolve(true);
                  })
                  .catch(err => {
                    console.warn(`Failed to save wsdl cache on tenant: ${err}`);
                    resolve(false);
                  });
              })
              .catch((err) => {
                console.warn(`Failed to create wsdl cache entity list on tenant: ${err}`);
                return;
              });
          } else if (checkErrorMessage(message, wsdlEntityId)) {
            console.info('Creating New Entity');
            entityResource.insertEntity(wsdlCacheEntity)
              .then(resp => {
                console.info('Sucessfully saved wsdl cache on tenant');
                resolve(true);
              })
              .catch(err => {
                console.warn(`Failed to save wsdl cache on tenant: ${err}`);
                resolve(false);
              });
          } else {
            console.warn(`Unknown error. Code: ${code}, Message: ${message}`);
            resolve(false);
          }

        }
      });
  });
};

const isValidDate = function (d) {
  return d instanceof Date && !isNaN(d) && d > new Date('1970-01-01T00:00:00Z');
};

const validDate = function(possibleDates) {
  // add Default of "today"
  possibleDates = _.toArray(possibleDates);
  possibleDates.push(new Date());
  return _.find(possibleDates, isValidDate);
};

// accepts any number of parameters
const getValidDate = function() {
  return validDate(_.map(_.toArray(arguments), (it) => { return new Date(it); })).toISOString().slice(0, 10) + "Z";
};

const orderDocumentDate = getValidDate;

const FLEX_FIELD_OBJECT_TYPES = {
  CUSTOMER_ATTRIBUTES: "Customer Attributes",
  PRODUCT_ATTRIBUTES: "Product Attributes",
  ORDER_ATTRIBUTES: "Order Attributes",
  ORDER: "Order Data",
  BILLING: "Billing Info",
  FULFILLMENT: "Fulfillment Info"
};

const FLEX_CODE_MAX    = 25;
const FLEX_NUMERIC_MAX = 10;
const FLEX_DATE_MAX    = 5;

const FLEX_FIELD_ID = "FlexibleFields";

const FLEX_CODE_TYPE    = "FlexibleCodeField";
const FLEX_NUMERIC_TYPE = "FlexibleNumericField";
const FLEX_DATE_TYPE    = "FlexibleDateField";

const FLEX_CODE_MAX_LENGTH = 40;

const addFlexFields = function(item, order, product, context, args) {
  return new Promise((resolve, reject) => {
    configManager.getVertexConfig(context, context.options).then(config => {

      const flexValid = !_.isEmpty(config.flex);

      const appendFlexField = function(flexType, index, value) {
        if (!item[FLEX_FIELD_ID]) {
          item[FLEX_FIELD_ID] = [];
        }

        // Flexible Codes have a 40 character maximum
        if (flexType === FLEX_CODE_TYPE) {
          if (typeof value === "string") {
            value = value.substring(0, FLEX_CODE_MAX_LENGTH);
          }
        } else if (flexType === FLEX_DATE_TYPE) {
          // Ensure the value is a valid date
          var origValue = value;
          value = getValidDate(value);

          if (!value) {
            console.warn("Flex date field " + index + " with value " + value +
              " colud not be coerced into a date. Skipping");
            return;
          }
        }

        item[FLEX_FIELD_ID].push({
          [flexType]: {
            attributes: { fieldId: Number(index) },
            $value: value
          }
        });
      };

      // If flex fields are valid, create array of types and values
      if (flexValid) {
        var flexFields = [
          {
            type: FLEX_CODE_TYPE,
            max: FLEX_CODE_MAX,
            fields: config.flex.code
          },
          {
            type: FLEX_NUMERIC_TYPE,
            max: FLEX_NUMERIC_MAX,
            fields: config.flex.numeric
          },
          {
            type: FLEX_DATE_TYPE,
            max: FLEX_DATE_MAX,
            fields: config.flex.date
          }
        ];

        // Iterate through the fields and attempt to add them to the line item
        _.each(flexFields, (flex) => {
          // Bail out on this iteration if we have no flex fields for this type
          if (_.isEmpty(flex.fields)) {
            return;
          }

          // This check is just to be defensive. The installer app should
          // respect the limit for each type and not provide us more.
          var flex_keys = _.keys(flex.fields);
          if (flex_keys.length > flex.max) {
            console.warn("For " + flex.type + " " + flex_keys.length +
              " fields were given. The limit is " + flex.max);
          } else {
            flex_keys = [...Array(flex.max).keys()].map(i => i + 1);
          }

          // Iterate over all the flex fields for this tpye and handle
          // collecting the value and assigning to the line item.
          _.each(flex_keys, (flex_n, i) => {

            var flexField = flex.fields[flex_n];

            if (_.isEmpty(flexField) || !flexField.field) {
              return;
            } else {
              var value;
              var attribute;
              var prop = flexField.field.split('~').pop(); // used for non-attribute entities

              switch (flexField.object) {
                case FLEX_FIELD_OBJECT_TYPES.ORDER_ATTRIBUTES:
                  attribute = _.find(order.rawOrder.attributes, (a) => {
                    return a && a.fullyQualifiedName === flexField.field;
                  });

                  value = attribute ? attribute.values[0] : undefined;

                  break;
                case FLEX_FIELD_OBJECT_TYPES.CUSTOMER_ATTRIBUTES:
                  if (!order.customer) {
                    console.warn("No customer resolved on Order. Skipping " + flex.type + " Field");
                  }

                  attribute = _.find(order.customer.attributes, (a) => {
                    return a && a.fullyQualifiedName === flexField.field;
                  });

                  value = attribute ? attribute.values[0] : undefined;

                  break;
                case FLEX_FIELD_OBJECT_TYPES.PRODUCT_ATTRIBUTES:
                  if (!product) {
                    console.warn("No product resolved on Order. Skipping Flex Field");
                    return;
                  }

                  // Product attribures (aka properties) have an inconsistent
                  // schema comapred to the other attribure types
                  attribute = _.find(product.attributes, (a) => {
                    return a && a.attributeFQN === flexField.field;
                  });

                  // Product attributes values are objects with a value (unlike
                  // customer attriburtes);
                  value = attribute ? (attribute.values[0] || {}).value : undefined;

                  break;
                case FLEX_FIELD_OBJECT_TYPES.ORDER:
                  value = order.rawOrder[prop];

                  break;
                case FLEX_FIELD_OBJECT_TYPES.BILLING:
                  // Billing info isn't passed when doing an estimation, so
                  // these fields will only be populated when doing an invoice.
                  value = (order.rawOrder.billingInfo || {})[prop];

                  break;
                case FLEX_FIELD_OBJECT_TYPES.FULFILLMENT:
                  value = (order.rawOrder.fulfillmentInfo || {})[prop];

                  // If we're doing an estimation, some of the information is
                  // directly on the order and not on a sub object. So we'll
                  // attempt to fill the data directly from the order
                  if (!value) {
                    value = order.rawOrder[prop];
                  }

                  break;
                default:
                  console.warn("FlexField with type: " + flexField.object + " could not be resolved");
                  return;
              }

              if (value !== undefined && value !== null) {
                appendFlexField(flex.type, flex_n, value);
              }
            }
          });
        });
      }

      resolve(item);
    })
    .catch(err => {
      reject(err);
    });
  });
};

const buildSoapClient = function(wsdl, vertexConfig, context) {
  return new Promise((resolve, reject) => {
    let options = {
      normalizeRegex: /\d+/g,
      returnFault: true
    };

    let builder = () => {
      soapWsdlUtils.buildSoapClient(wsdl, options)
        .then(cli => {
          // build wsdl cache and save off to kibo entity list
          let wsdlCache = soapWsdlUtils.buildWsdlReverseDependencyTree(cli.wsdl);
          saveWsdlCache(wsdl, wsdlCache, context)
            .then(_ => resolve(cli))
            .catch(err => {
              console.warn(`Unexpected Error encountered, could not save WSDL cache: ${err}`);
              resolve(cli);
            });
        })
        .catch(err => {
          console.error(`Could not build tax client: ${err}`);
          reject(err);
        });
    };

    console.info('Fetching WSDL cache.');
    getWsdlCache(vertexConfig.calculateTaxWsdl, context).then(wsdlCacheEntity => {
      soapWsdlUtils.rebuildSoapClient(wsdlCacheEntity.wsdlCache, options)
        .then(cli => resolve(cli))
        .catch(err => {
          console.warn(`Error rebuilding client: ${err}, trying manual build`, err);
          console.warn(err.stack);
          builder();
        });
    })
      .catch(err => {
        console.info(`Could not retrieve WSDL from cache: ${err}. Building manually`);
        builder();
      });
  });
};

const buildTaxSoapClient = function(context) {
  const start = new Date();
  console.info("Loading Vertex Client Tax WSDL");
  return new Promise((resolve, reject) => {
    configManager.getVertexConfig(context, context.options).then(vertexConfig => {
      if (vertexConfig.calculateTaxWsdl) {
        buildSoapClient(vertexConfig.calculateTaxWsdl, vertexConfig, context).then(cli => {
          resolve(cli);
        }).catch(err => {
          reject(`Could not build Tax Client: ${err}`);
        });
      } else {
        reject('No Tax endpoint configured');
      }
    }).catch(err => {
      reject(`Could not retrieve configuration: ${err}`);
    });
  });
};

const buildAddressSoapClient = function(context) {
  const start = new Date();
  console.info("Loading Vertex Client Address WSDL");
  return new Promise((resolve, reject) => {
    configManager.getVertexConfig(context, context.options).then(vertexConfig => {
      if (vertexConfig.addressCleansingWsdl) {
        buildSoapClient(vertexConfig.addressCleansingWsdl, vertexConfig, context).then(cli => {
          resolve(cli);
        }).catch(err => {
          reject(`Could not build Address Cleaning Client: ${err}`);
        });
      } else {
        reject('No Tax endpoint configured');
      }
    }).catch(err => {
      reject(`Could not retrieve configuration: ${err}`);
    });
  });
};
/** Combined with a function to convert case value, convert an object like */
const changeCaseOfObjectKeys = function(obj, caseFunction) {
  let newObj = {};
  for (let key of Object.keys(obj)) {
    let newKey = caseFunction.apply(key.slice(0,1))+key.slice(1);
    if (Array.isArray(obj[key]) && obj[key].length > 0) {
      newObj[newKey] = [];
      for (let i = 0; i < obj[key].length; i++) {
        if (obj[key][i] !== null) {
          if (typeof obj[key][i] === 'object') {
            newObj[newKey].push(changeCaseOfObjectKeys(obj[key][i], caseFunction));
          } else {
            newObj[newKey].push(obj[key][i]);
          }
       }
      }
    } else if (obj[key] != null && typeof obj[key] === 'object') {
      newObj[newKey] = changeCaseOfObjectKeys(obj[key], caseFunction);
    } else {
      newObj[newKey] = obj[key];
    }
  }
  return newObj;
};



module.exports.postProcessLogXml = postProcessLogXml;
module.exports.buildTaxSoapClient = buildTaxSoapClient;
module.exports.buildAddressSoapClient = buildAddressSoapClient;
module.exports.isValidDate = isValidDate;
module.exports.validDate = validDate;
module.exports.getValidDate = getValidDate;
module.exports.orderDocumentDate = orderDocumentDate;
module.exports.addFlexFields = addFlexFields;
module.exports.cleanAddress = cleanAddress;
module.exports.changeCaseOfObjectKeys = changeCaseOfObjectKeys;
