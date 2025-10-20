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
    window.API_CONFIG = {
        // API Gateway ID - Change this when deploying to a new API Gateway
        API_GATEWAY_ID: 'v3zus6fe5m',
        
        // AWS Region
        AWS_REGION: 'us-east-1',
        
        // Environment (dev, staging, prod)
        ENVIRONMENT: 'dev',
        
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
    module.exports = {
        API_GATEWAY_ID: 'v3zus6fe5m',
        AWS_REGION: 'us-east-1',
        ENVIRONMENT: 'dev',
        get API_BASE_URL() {
            return `https://${this.API_GATEWAY_ID}.execute-api.${this.AWS_REGION}.amazonaws.com/${this.ENVIRONMENT}/api`;
        }
    };
}
