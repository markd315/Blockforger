/**
 * Server Configuration
 * 
 * Server-specific configuration that doesn't get bundled with Browserify.
 * This file contains only the configuration needed by the Node.js server.
 */

module.exports = {
    // API Gateway ID - Change this when deploying to a new API Gateway
    API_GATEWAY_ID: 'v3zus6fe5m',
    
    // AWS Region
    AWS_REGION: 'us-east-1',
    
    // Environment (dev, staging, prod)
    ENVIRONMENT: 'dev',
    
    // Base API URL - automatically constructed from the above values
    get API_BASE_URL() {
        return `https://${this.API_GATEWAY_ID}.execute-api.${this.AWS_REGION}.amazonaws.com/${this.ENVIRONMENT}/api`;
    }
};
