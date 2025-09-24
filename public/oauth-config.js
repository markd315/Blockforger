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

window.GOOGLE_OAUTH_CONFIG = {
    // Replace this with your actual Google OAuth Client ID
    CLIENT_ID: '455268002946-ha6rmffbk6m9orbe7utljm69sj54akqv.apps.googleusercontent.com',
    
    // OAuth scopes to request
    SCOPES: 'openid email profile',
    
    // Discovery document URL for Google's OAuth 2.0 service
    DISCOVERY_DOC: 'https://accounts.google.com/.well-known/openid_configuration',
    
    // API base URL for your Lambda function
    API_BASE_URL: 'https://jcbr6205t2.execute-api.us-east-1.amazonaws.com/dev/api',
    
    // Force HTTPS for better OAuth compatibility
    FORCE_HTTPS: true
};
