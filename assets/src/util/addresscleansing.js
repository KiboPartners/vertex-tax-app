const _ = require('lodash');
const isoCodes = require('iso-countries');

const common = require('./common');
const configManager = require('./configurationManager');


const transformToVertexAddress = function(kiboSourceAddress, context) {
  let kiboAddress = _.mapKeys(kiboSourceAddress.Address, (v, k) => _.camelCase(k));
  return common.cleanAddress(kiboAddress);
};

const transformToKiboAddress = function(vertexAddress, context) {
  let kiboAddress = {};
  let countryCode = isoCodes.findCountryByCode(vertexAddress.Country);

  kiboAddress.address1        = vertexAddress.StreetAddress1;
  kiboAddress.address2        = vertexAddress.StreetAddress2;
  kiboAddress.cityOrTown      = vertexAddress.City;
  kiboAddress.stateOrProvince = vertexAddress.MainDivision;
  kiboAddress.postalOrZipCode = vertexAddress.PostalCode;
  kiboAddress.countryCode     = countryCode ? countryCode.alpha2 : 'US';
  kiboAddress.isValidated     = true; // We default any address from Vertex as being validated

  return kiboAddress;
};

  /*
   "TaxAreaRequest": {
      "TaxAreaLookup": {
        "-asOfDate": "2017-11-08",
        "PostalAddress": {
          "StreetAddress1": "1041 Old Cassett Rd",
          "City": "Berwyn",
          "MainDivision": "PA",
          "PostalCode": "19312",
          "Country": "USA"
        }
      }
    }
    */

const cleanseAddress = function(kiboSourceAddress, context) {
  return new Promise((resolve, reject) => {
    configManager.getVertexConfig(context, context.options).then(config => {
      common.buildAddressSoapClient(context).then(cli => {
        let areaLookup = {};
        _.assign(areaLookup, config.generateAuthWrapper());
        areaLookup.TaxAreaRequest = {
          TaxAreaLookup: {
            attributes: {
              asOfDate: common.getValidDate() // defaults to today's date
            },
            PostalAddress: transformToVertexAddress(kiboSourceAddress, context)
          }
        };

        const cleanP = cli.LookupTaxAreas_Async(areaLookup, {
          postProcess: common.postProcessLogXml
        });

        cleanP.then(res => {
          const rawSoapRes = res[0];
          const rawBody = res[1];
          const area = rawSoapRes.TaxAreaResponse;
          common.postProcessLogXml(rawBody);

          const resultMessage = area.TaxAreaResult.AddressCleansingResultMessage;
          if (resultMessage && resultMessage.attributes && resultMessage.attributes.type === "FAULT") {
            reject("No valid Addresses found");
          }

          var addresses = area.TaxAreaResult.PostalAddress;
          const addressCandidates = _.map(addresses.constructor === Array ? addresses : [addresses], (address) => {
            return transformToKiboAddress(address, context);
          });

          // TODO should we add back the original unvalidated address?
          resolve({
            addressCandidates: addressCandidates
          });
        }).catch(err => {
          reject(`Error response returned from Vertex Address client: ${err}`);
        });
      }).catch(err => {
        reject(`Could not create Address Soap client: ${err}`);
      });
    }).catch(err => {
      reject(`Could not retrieve configuration: ${err}, assumming address cleansing is disabled`);
    });
  });
};

module.exports.cleanseAddress = cleanseAddress;
