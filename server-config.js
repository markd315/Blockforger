/**
 * Server Configuration
 * 
 * Server-specific configuration that doesn't get bundled with Browserify.
 * This file contains only the configuration needed by the Node.js server.
 * 
 * IMPORTANT: API Gateway selection is ENVIRONMENT-BASED via ENV vars to ensure
 * PROD/DEV separation. Never hardcode API Gateway IDs.
 */

// Determine environment from ENV var (critical for PROD/DEV separation)
const environment = process.env.ENVIRONMENT || 'dev';

// API Gateway IDs per environment - ENFORCE via ENV var
// Dev: v3zus6fe5m
// Prod: 546rhak8b5
const apiGatewayId = (environment === 'prod') 
    ? '546rhak8b5'
    : 'v3zus6fe5m'; // dev default

module.exports = {
    // API Gateway ID - determined by ENVIRONMENT env var
    API_GATEWAY_ID: apiGatewayId,
    
    // AWS Region
    AWS_REGION: 'us-east-1',
    
    // Environment (dev, staging, prod) - from ENV var
    ENVIRONMENT: environment,
    
    // Base API URL - automatically constructed from the above values
    get API_BASE_URL() {
        return `https://${this.API_GATEWAY_ID}.execute-api.${this.AWS_REGION}.amazonaws.com/${this.ENVIRONMENT}/api`;
    }
};
