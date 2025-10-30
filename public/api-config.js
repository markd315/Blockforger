/**
 * API Configuration
 * 
 * Centralized configuration for all API endpoints and settings.
 * This file serves as the single point of truth for API Gateway URLs
 * and other API-related configuration.
 * 
 * To update the API Gateway ID, change the API_GATEWAY_ID value below.
 */

// Browser environment - only set window.API_CONFIG if window exists
if (typeof window !== 'undefined') {
    // Defaults
    var apiGatewayId = 'v3zus6fe5m'; // dev default
    var environment = 'dev';

    // Heuristics to detect prod on the client without server injection
    try {
        var host = window.location && window.location.hostname || '';
        var href = window.location && window.location.href || '';

        // If hosted on the prod domain or URL contains '/prod/', force prod config
        if (host.endsWith('blockforger.net') || href.indexOf('/prod/') !== -1) {
            environment = 'prod';
            apiGatewayId = '546rhak8b5';
        }
    } catch (e) {
        // ignore
    }
    
    window.API_CONFIG = {
        API_GATEWAY_ID: apiGatewayId,
        
        // AWS Region
        AWS_REGION: 'us-east-1',
        
        // Google OAuth Client ID (overridden at deploy time if provided)
        GOOGLE_CLIENT_ID: '455268002946-ha6rmffbk6m9orbe7utljm69sj54akqv.apps.googleusercontent.com',
        
        // Environment (dev, staging, prod) - auto-detected from API Gateway ID
        ENVIRONMENT: environment,
        
        // Base API URL - automatically constructed from the above values
        get API_BASE_URL() {
            return `https://${this.API_GATEWAY_ID}.execute-api.${this.AWS_REGION}.amazonaws.com/${this.ENVIRONMENT}/api`;
        },
        
        // Specific API endpoints
        get AUTH_URL() {
            return `${this.API_BASE_URL}/auth`;
        },
        
        get CREATE_ACCOUNT_LINK_URL() {
            return `${this.API_BASE_URL}/create_account_link`;
        },
        
        get CHECK_ACCOUNT_STATUS_URL() {
            return `${this.API_BASE_URL}/check_account_status`;
        },
        
        get LLM_URL() {
            return `${this.API_BASE_URL}/llm`;
        },
        
        get LLM_PRELOAD_URL() {
            return `${this.API_BASE_URL}/llm-preload`;
        },
        
        get JSON_URL() {
            return `${this.API_BASE_URL}/json`;
        },
        
        get REGISTER_URL() {
            return `${this.API_BASE_URL}/register`;
        },
        
        // Utility function to check if a URL is an API request
        isApiRequest(url) {
            return url.includes(this.API_BASE_URL) || 
                   url.includes('accounts.google.com') || 
                   url.includes('googleapis.com/oauth2') ||
                   url.includes('www.googleapis.com/oauth2');
        }
    };
}

// For Node.js environments (like server.js)
if (typeof module !== 'undefined' && module.exports) {
    var apiGatewayId = 'v3zus6fe5m'; // dev default
    var environment = 'dev'; // default
    if (apiGatewayId === '546rhak8b5') {
        environment = 'prod';
    }
    
    module.exports = {
        API_GATEWAY_ID: apiGatewayId,
        AWS_REGION: 'us-east-1',
        ENVIRONMENT: environment,
        get API_BASE_URL() {
            return `https://${this.API_GATEWAY_ID}.execute-api.${this.AWS_REGION}.amazonaws.com/${this.ENVIRONMENT}/api`;
        }
    };
}
