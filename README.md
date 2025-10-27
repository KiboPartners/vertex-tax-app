
# Vertex Tax Estimation

This project is a Node.js application that estimates tax for orders using the Vertex API.

This project has been forked from the main Vertex integration.

## Example mozu.config.json

```json
{
  "developerAccountId": 0,
  "developerAccount": {
    "emailAddress": "YOUR_EMAIL_HERE" //REPLACE
  },
  "workingApplicationKey": "YOUR_APPLICATION_KEY",  //REPLACE
  "baseUrl": "https://www.usc1.gcp.kibocommerce.com"  // or https://home.mozu.com for AWS hosted
}
```

## To debug locally

Use Visual Studio Code, there is a launch.json file that will allow you to debug the script.
Add breakpoints to the script and run the script.
You also need to add a mozu.config.json file to the scripts directory:

```json
{
	"appKey": "YOUR_APPLICATION_KEY",  //REPLACE
	"sharedSecret": "<REDACTED>",  //REPLACE
	"tenant": 111111,  //REPLACE
	"site": 11111,  //REPLACE
        "baseUrl": "https://t{tenantId}.sb.usc1.gcp.kibocommerce.com/",  // or https://t{tenantId}.sandbox.mozu.com for AWS hosted
	"developerAccountId": 0,
	"developerAccount": {
		"emailAddress": "YOUR_EMAIL_HERE" //REPLACE
	}
}
```

```bash
cd scripts
node test-tax-estimate-before.js
```

Optionally you can provide a different payload to test different scenarios.

```bash
cd scripts
node test-tax-estimate-before.js orders/sample-order-sd.json
```

## Installation Process

The Vertex Tax Connector performs several automated setup tasks during installation via the `embedded.platform.applications.install.js` action. This ensures all necessary data structures and configurations are in place for the tax estimation functionality.

### Entity Lists Creation

The installer creates two essential entity lists in the tenant:

#### 1. Vertex Configuration Entity List (`vertexconfig@vertex_tax_connector`)
- **Purpose**: Stores the main configuration settings for the Vertex tax connector
- **Context Level**: Tenant-wide
- **Entity Type**: MZDB (Mozu Database)
- **Usage**: Entity Manager
- **Key Properties**:
  - Uses custom ID property (`id` as string)
  - Not visible in storefront
  - Not locale or shopper specific
  - Sandbox data cloning not supported

#### 2. WSDL Cache Entity List (`wsdl_cache@vertex_tax_connector`)
- **Purpose**: Caches WSDL (Web Services Description Language) files for improved performance
- **Context Level**: Tenant-wide
- **Entity Type**: MZDB
- **Usage**: Internal caching
- **Key Properties**: Same configuration as vertex config but without entity manager usage

### Default Configuration Entity

The installer creates a default configuration entity with these settings:

#### Connection Settings
- **Vertex Connection**: `vertexOSeries` (default)
- **Authentication Type**: `trustedId`
- **Company Code**: `100` (default for both Cloud and OSeries)
- **Country**: `UNITED STATES` (default)

#### Feature Flags
- **Generate Invoice**: `true` (enabled by default)
- **Address Cleansing**: `false` (disabled by default)
- **Address Cleansing Auto Accept**: `false` (disabled by default)

#### Flex Field Configuration
The system supports flexible field mapping with three categories:
- **Code Fields**: 25 configurable mappings for string values
- **Numeric Fields**: 10 configurable mappings for numeric values
- **Date Fields**: 5 configurable mappings for date values

Each flex field can map to various data sources:
- Billing Info (payment types, credit types, etc.)
- Customer Attributes (custom tenant attributes)
- Fulfillment Info (shipping methods, commercial flags, etc.)
- Order Attributes (custom order attributes)
- Order Data (built-in order properties)
- Product Attributes (product-specific data)

### Entity Editor Registration

The installer creates a custom entity editor interface that provides:

#### Administrative Interface Features
- **Form-based Configuration**: User-friendly interface for editing Vertex settings
- **Field Validation**: Built-in validation for configuration values
- **Flex Field Grid Management**: Interactive grids for managing custom field mappings
- **Real-time Updates**: Immediate saving and validation of configuration changes

#### Grid-based Flex Field Management
- **Dynamic Field Mapping**: Drag-and-drop interface for mapping source entities to Vertex fields
- **Source Entity Selection**: Dropdown menus with predefined options for each field type
- **Field Validation**: Ensures proper field naming and mapping
- **Bulk Operations**: Ability to configure multiple mappings efficiently

### Action Installation and Configuration

The final step configures the three main tax estimation actions with optimized timeout settings:

#### 1. Tax Estimation Action (`http.commerce.catalog.storefront.tax.estimateTaxes.before`)
- **Purpose**: Intercepts tax calculation requests and routes them to Vertex
- **Timeout**: 15 seconds (extended for external API calls)
- **Trigger**: Before Kibo's built-in tax estimation

#### 2. Order Processing Action (`embedded.commerce.orders.action.before`)
- **Purpose**: Handles tax calculations during order processing
- **Timeout**: 15 seconds
- **Trigger**: Before order actions (create, update, submit)

#### 3. Return Processing Action (`embedded.commerce.return.actions.before`)
- **Purpose**: Manages tax adjustments for returns and refunds
- **Timeout**: 15 seconds
- **Trigger**: Before return processing actions

### Error Handling and Recovery

The installation process includes robust error handling:

- **Existing Entity Detection**: Checks for existing configurations and skips creation if found
- **Entity List Usage Validation**: Ensures entity lists aren't deleted if they're in use
- **Graceful Degradation**: Continues installation even if some steps fail
- **Detailed Logging**: Comprehensive logging for troubleshooting installation issues

### Post-Installation Configuration

After installation, administrators should:

1. **Configure Vertex Connection Details**: Set up authentication credentials and endpoint URLs
2. **Map Flex Fields**: Configure custom field mappings based on business requirements
3. **Test Tax Calculations**: Verify tax estimation is working correctly
4. **Enable Address Cleansing** (optional): Configure address validation if needed
5. **Set Company Codes**: Update company codes to match Vertex configuration

This automated installation ensures a consistent, reliable setup process while providing the flexibility to customize the integration based on specific business needs.

