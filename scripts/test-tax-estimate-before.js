const path = require('path');
const fs = require('fs');
const jest = require('jest');

// // Mock configManager before requiring the action file
// const vertexConfig = require('./config/vertex-config.json');
// require.cache[require.resolve('../assets/src/util/configurationManager')] = {
//     exports: {
//         getVertexConfig: async () => vertexConfig.vertexConfig
//     }
// };

// // Mock entityResourceFactory
// require.cache[require.resolve('mozu-node-sdk/clients/platform/entitylists/entity')] = {
//     exports: () => ({
//         getEntity: async (params) => {
//             const { entityListFullName, id } = params;
//             console.log('Mock getEntity called', { entityListFullName, id });
//             if (entityListFullName == "wsdl_cache@Vertex") {
//                 return Promise.resolve(JSON.parse(fs.readFileSync('./config/wsdl-cache.json')))
//             }
//             throw new Error('Could not retrieve WSDL cache');
//         },
//         updateEntity: async (params) => {
//             const { entityListFullName, id, entity } = params;
//             console.log('Mock updateEntity called', { entityListFullName, id, entity });
//             return Promise.resolve(true);
//         }
//     })
// };

const taxEstimateBefore = require('../assets/src/domains/commerce.catalog.storefront.tax/http.commerce.catalog.storefront.tax.estimateTaxes.before.js');

// Helper to load JSON config
const loadConfig = (filePath) => {
    const fullPath = path.join(__dirname, filePath);
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
};

// Get command line arguments
const orderFile = process.argv[2] || 'orders/sample-order.json';

// Load configurations
const contextConfig = loadConfig('config/context.json');
const orderData = loadConfig(`config/${orderFile}`);

// Create mock context
const mockContext = {
    apiContext: contextConfig.apiContext,
    exec: {
       
    },
    request: {
        body: orderData
    },
    response: {
        body: null,
        end: () => {}
    }
};

// Add better error handling and logging
const callback = (error) => {
    if (error) {
        console.error('Error occurred:', error);
        if (error.stack) {
            console.error('Stack trace:', error.stack);
        }
        process.exit(1);
    } else {
        console.log('Action completed successfully');
        process.exit(0);
    }
};

// Run the action
const main = async () => {
    console.log(`Starting estimate taxes for ${orderFile}...`);
    await new Promise(resolve => {
        taxEstimateBefore(mockContext, (error) => {
            console.log('callback invoked:', error);
            callback(error);
            resolve();
        });
    });
};

main(); 