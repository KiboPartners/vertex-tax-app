const _ = require('underscore');
const soap = require('soap');
const WSDL = soap.WSDL;

const extractWsdl = (wsdlInternal) => {
  return { uri: wsdlInternal.uri, xml: wsdlInternal.xml };
};

/*
 * Build a dependency ordered xml non-circular array of included WSDL for a
 * given root WSDL
 */
const buildWsdlReverseDependencyTree = (rootWsdl, cache, visited) => {
  cache = (cache || []);
  visited = (visited || {});

  var internalWsdls = rootWsdl._includesWsdl;
  _.each(internalWsdls, (wsdlInternal) => {
    buildWsdlReverseDependencyTree(wsdlInternal, cache, visited);
  });

  var convertedWsdl = extractWsdl(rootWsdl);
  if (!visited[convertedWsdl.uri]) {
    cache.push(convertedWsdl);
    visited[convertedWsdl.uri] = true;
  }
  return cache;
};

const rebuildWsdlFromDependecyTree = (dependencyTree, options) => {
  return new Promise((resolve, reject) => {
    if (!_.isArray(dependencyTree)) {
      reject(new TypeError("rebuildWsdlFromDependecyTree was not given an array!"));
    }

    var wsdlCache = {};
    var opt = _.assign(options || {}, { WSDL_CACHE: wsdlCache });
    var rootWsdl;

    _.each(dependencyTree, (rawWsdl) => {
      var wsdl = new WSDL(rawWsdl.xml, rawWsdl.uri, opt);
      wsdlCache[ rawWsdl.uri ] = wsdl;
      wsdl.WSDL_CACHE = wsdlCache;
      wsdl.onReady(() => {});
    });

    resolve(wsdlCache[_.last(dependencyTree).uri]);
  });
};

const rebuildSoapClient = (dependencyTree, options) => {
  const start = new Date();
  console.info("Rebuilding Client from dependency array...");
  return new Promise((resolve, reject) => {
    rebuildWsdlFromDependecyTree(dependencyTree, options).then(restoredWsdl => {
      const end = new Date();
      console.info("Rebuilding client from dependency array took " + (end - start) + "ms");
      resolve(new soap.Client(restoredWsdl, undefined, options || {}));
    }).catch(err => {
      reject(err);
    });
  });
};

const buildSoapClient = (wsdl, options) => {
  const start = new Date();
  console.info("Building Client from WSDL");
  return new Promise((resolve, reject) => {
    soap.createClientAsync(wsdl, options).then((client) => {
      const end = new Date();
      console.info("Building client took " + (end - start) + "ms");
      resolve(client);
    }).catch(err => reject(err));
  });
};

module.exports.buildWsdlReverseDependencyTree = buildWsdlReverseDependencyTree;
module.exports.rebuildWsdlFromDependecyTree = rebuildWsdlFromDependecyTree;
module.exports.rebuildSoapClient = rebuildSoapClient;
module.exports.buildSoapClient = buildSoapClient;
