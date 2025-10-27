const path = require('path');
const fs = require('fs');

const orderActionAfter = require('../assets/src/domains/commerce.orders/embedded.commerce.orders.action.after.js');

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
        setItemAllocation: async (allocationId, expiration, productCode, itemId) => {
            console.log('Mock setItemAllocation called:', { allocationId, expiration, productCode, itemId });
            return {};
        },
        setAttribute: async (fqn, values) => {
            console.log('Mock setAttribute called:', { fqn, values });
            return {};
        },
        removeAttribute: async (fqn) => {
            console.log('Mock removeAttribute called:', { fqn });
            return {};
        },
        setData: async (key, value) => {
            console.log('Mock setData called:', { key, value });
            return {};
        },
        removeData: async (key) => {
            console.log('Mock removeData called:', { key });
            return {};
        },
        setItemData: async (key, value, itemId) => {
            console.log('Mock setItemData called:', { key, value, itemId });
            return {};
        },
        removeItemData: async (key, itemId) => {
            console.log('Mock removeItemData called:', { key, itemId });
            return {};
        },
        setDutyAmount: async (dutyAmount) => {
            console.log('Mock setDutyAmount called:', { dutyAmount });
            return {};
        }
    },
    get: {
        order: () => {
            console.log('Returning mock order data');
            return orderData;
        }
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
    console.log(`Starting test with order from ${orderFile}...`);
    await new Promise(resolve => {
        orderActionAfter(mockContext, (error) => {
            callback(error);
            resolve();
        });
    });
};

main();