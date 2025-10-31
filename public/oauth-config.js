/**
 * Google OAuth Configuration
 * 
 * To set up Google OAuth:
 * 1. Go to Google Cloud Console (https://console.cloud.google.com/)
 * 2. Create or select a project
 * 3. Enable the Google+ API
 * 4. Create OAuth 2.0 credentials (Web application)
 * 5. Add your domain to authorized JavaScript origins
 * 6. Add your redirect URIs to authorized redirect URIs
 * 7. Replace the CLIENT_ID below with your actual client ID
 */

// Determine environment dynamically at access time
(function() {
    function detectEnvironment() {
        try {
            if (window.API_CONFIG && window.API_CONFIG.ENVIRONMENT) {
                return window.API_CONFIG.ENVIRONMENT;
            }
            if (typeof window !== 'undefined' && window.location) {
                var host = window.location.hostname || '';
                var href = window.location.href || '';
                if (host.endsWith('blockforger.net') || href.indexOf('/prod/') !== -1) {
                    return 'prod';
                }
            }
            if (window.API_CONFIG && window.API_CONFIG.API_BASE_URL && window.API_CONFIG.API_BASE_URL.indexOf('/prod/') !== -1) {
                return 'prod';
            }
        } catch (e) {}
        return 'dev';
    }

    window.GOOGLE_OAUTH_CONFIG = {
        // OAuth scopes to request
        SCOPES: 'openid email profile',
        
        // Discovery document URL for Google's OAuth 2.0 service
        DISCOVERY_DOC: 'https://accounts.google.com/.well-known/openid_configuration',
        
        // Google OAuth Client ID - prefer explicit value from API_CONFIG
        get CLIENT_ID() {
            if (window.API_CONFIG && window.API_CONFIG.GOOGLE_CLIENT_ID) {
                return window.API_CONFIG.GOOGLE_CLIENT_ID;
            }
            var env = detectEnvironment();
            return env === 'prod' 
                ? '455268002946-jm1k7gqjevn52v2bpr440bbr9jr9sgfh.apps.googleusercontent.com'
                : '455268002946-ha6rmffbk6m9orbe7utljm69sj54akqv.apps.googleusercontent.com';
        },
        
        // API base URL for your Lambda function - environment-specific
        // ALWAYS use API_CONFIG if available to ensure proper PROD/DEV separation
        get API_BASE_URL() {
            // Priority 1: Use API_CONFIG (which detects environment from hostname)
            if (window.API_CONFIG && window.API_CONFIG.API_BASE_URL) {
                return window.API_CONFIG.API_BASE_URL;
            }
            // Fallback: Detect environment and use appropriate API Gateway
            // This should rarely be hit since api-config.js loads before this
            var env = detectEnvironment();
            if (env === 'prod') {
                return 'https://546rhak8b5.execute-api.us-east-1.amazonaws.com/prod/api';
            }
            return 'https://v3zus6fe5m.execute-api.us-east-1.amazonaws.com/dev/api';
        },
        
        // Force HTTPS for better OAuth compatibility
        FORCE_HTTPS: true
    };
})();
