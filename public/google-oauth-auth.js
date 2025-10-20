/**
 * Google OAuth 2.0 Authentication for JSON Block Builder
 */
class GoogleOAuthAuth {
    constructor() {
        this.clientId = null;
        this.accessToken = null;
        this.userEmail = null;
        this.googleUserId = null;
        this.tenantId = null;
        this.requiresAuth = false;
        this.authInitialized = false;
        
        // Get tenant ID from URL parameters
        this.tenantId = this.getTenantIdFromUrl();
        
        // Initialize authentication
        this.initAuth();
    }

    getTenantIdFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const tenantId = urlParams.get('extension') || urlParams.get('tenant');
        console.log('Extracted tenant ID from URL:', tenantId);
        return tenantId;
    }

    async initAuth() {
        try {
            // Load Google API script
            await this.loadGoogleAPI();
            
            // Get client ID from environment or config
            await this.loadClientConfig();
            
            // Check if this tenant requires authentication
            await this.checkAuthRequirement();
            
            if (this.requiresAuth) {
                // Initialize Google Sign-In
                await this.initGoogleSignIn();
                // Attempt to use any stored token immediately
                await this.useStoredTokenIfAvailable();
            }
            
            this.authInitialized = true;
            
            // CRITICAL: Block page load if auth is required and user is not authenticated
            if (this.requiresAuth && !this.isAuthenticated()) {
                console.log('🚨 BLOCKING PAGE LOAD - Authentication required');
                this.blockPageLoad();
                this.showAuthRequired();
            } else {
                console.log('✅ Proceeding with app load - auth not required or user authenticated');
                window.authCheckInProgress = false; // Auth check complete
                // CRITICAL: Unblock requests immediately if auth not required
                window.SECURITY_BLOCK_ALL_REQUESTS = false;
                this.proceedWithAppLoad();
            }
            
        } catch (error) {
            console.error('Error initializing authentication:', error);
            // If auth initialization fails, show error and don't load app
            this.showAuthError(error.message);
        }
    }

    async useStoredTokenIfAvailable() {
        try {
            if (this.accessToken && this.userEmail && this.googleUserId) {
                const hasAccess = await this.verifyReadAccess();
                if (hasAccess) {
                    if (sessionStorage.getItem('auth_just_completed') === '1') {
                        sessionStorage.removeItem('auth_just_completed');
                    }
                }
            }
        } catch (_) {
            // ignore
        }
    }

    async loadGoogleAPI() {
        return new Promise((resolve, reject) => {
            if (window.google && window.google.accounts) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.onload = () => {
                console.log('Google Identity Services API loaded successfully');
                resolve();
            };
            script.onerror = () => reject(new Error('Failed to load Google Identity Services API'));
            document.head.appendChild(script);
        });
    }

    async loadClientConfig() {
        // Load client ID from configuration
        if (window.GOOGLE_OAUTH_CONFIG && window.GOOGLE_OAUTH_CONFIG.CLIENT_ID) {
            this.clientId = window.GOOGLE_OAUTH_CONFIG.CLIENT_ID;
            this.apiBaseUrl = window.GOOGLE_OAUTH_CONFIG.API_BASE_URL;
        } else {
            this.clientId = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
            this.apiBaseUrl = '/api'; // fallback
            console.warn('Google OAuth configuration not found. Please configure oauth-config.js');
        }
    }

    async checkAuthRequirement() {
        console.log('Checking auth requirement for tenant:', this.tenantId);
        
        if (!this.tenantId) {
            console.log('No tenant ID, auth not required');
            this.requiresAuth = false;
            return;
        }

        try {
            // Load tenant properties to check if authorized_reads is enabled
            const tenantProperties = await this.loadTenantProperties();
            this.requiresAuth = tenantProperties.authorized_reads === 'true';
            
            console.log('Tenant properties loaded:', tenantProperties);
            console.log('Auth required:', this.requiresAuth);
            
        } catch (error) {
            console.error('Error checking auth requirement:', error);
            // Default to not requiring auth if we can't check
            this.requiresAuth = false;
        }
    }

    async loadTenantProperties() {
        if (!this.tenantId) {
            console.log('No tenant ID, returning default properties');
            return { authorized_reads: 'false' };
        }

        try {
            console.log(`Loading tenant properties for: ${this.tenantId}`);
            
            // Use the server endpoint instead of direct S3 access to avoid CORS issues
            const propertiesUrl = `/tenant-properties?tenant=${encodeURIComponent(this.tenantId)}`;
            
            console.log('Attempting to fetch properties from:', propertiesUrl);
            const response = await fetch(propertiesUrl);
            
            if (!response.ok) {
                console.log(`Properties file not found (${response.status}), using defaults`);
                return { authorized_reads: 'false' };
            }
            
            const propertiesText = await response.text();
            console.log('Raw properties text:', propertiesText);
            
            // Parse properties file format (key=value)
            const properties = {};
            propertiesText.split('\n').forEach(line => {
                line = line.trim();
                if (line && !line.startsWith('#')) {
                    const [key, ...valueParts] = line.split('=');
                    if (key && valueParts.length > 0) {
                        properties[key.trim()] = valueParts.join('=').trim().replace(/"/g, '');
                    }
                }
            });
            
            console.log('Parsed properties:', properties);
            return properties;
            
        } catch (error) {
            console.error('Error loading tenant properties:', error);
            // CRITICAL: If we can't load properties, assume auth is required for security
            console.warn('SECURITY: Defaulting to requiring auth due to properties load failure');
            return { authorized_reads: 'true' };
        }
    }

    getAwsAccountId() {
        // Extract AWS account ID from the API base URL
        // Uses centralized API configuration from api-config.js
        // We'll use a placeholder for now - this should be configured
        return '123456789012'; // TODO: Configure this properly
    }

    async initGoogleSignIn() {
        if (!this.clientId || this.clientId === 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com') {
            throw new Error('Google Client ID not configured');
        }

        console.log('Initializing Google Identity Services with Client ID:', this.clientId);

        // Check if we're returning from OAuth redirect
        await this.handleOAuthRedirect();

        // Ensure Google Identity Services is available
        if (!window.google || !window.google.accounts) {
            throw new Error('Google Identity Services not loaded');
        }

        try {
            console.log('Initializing Google Identity Services...');
            
            // Initialize the Google Identity Services
            google.accounts.id.initialize({
                client_id: this.clientId,
                callback: this.handleCredentialResponse.bind(this)
            });

            // Initialize OAuth for getting access tokens
            this.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: this.clientId,
                scope: 'openid email profile',
                callback: this.handleTokenResponse.bind(this)
            });

            console.log('Google Identity Services initialized successfully');

            // Try to load token from storage
            await this.loadStoredAuthToken();
            
        } catch (error) {
            console.error('Error initializing Google Identity Services:', error);
            throw new Error(`Failed to initialize Google Identity Services: ${error.message}`);
        }
    }

    handleCredentialResponse(response) {
        console.log('Credential response received:', response);
        // This handles ID token responses (for user info)
        // We'll primarily use the OAuth flow for access tokens
    }

    handleTokenResponse(response) {
        console.log('Token response received:', response);
        if (response.access_token) {
            this.accessToken = response.access_token;
            this.storeAuthToken(this.accessToken);
            try { sessionStorage.setItem('auth_trigger_reload', '1'); } catch (_) {}
            
            // Get user info with the access token
            this.getUserInfoFromToken(this.accessToken).then(userInfo => {
                this.userEmail = userInfo.email;
                this.googleUserId = userInfo.id;
                
                // Proceed with app if this was for authentication
                if (this.requiresAuth) {
                    this.verifyReadAccess().then(hasAccess => {
                        if (hasAccess) {
                            this.proceedWithAppLoad();
                            // After unblocking, trigger schema reload if available
                            if (typeof window.loadSchemaFromServer === 'function') {
                                try { window.loadSchemaFromServer(); } catch (e) { /* noop */ }
                            }
                        } else {
                            this.showAccessDenied();
                        }
                    });
                } else {
                    // For optional login (login button), trigger page refresh after successful auth
                    console.log('Optional login successful - triggering page refresh');
                    setTimeout(() => {
                        try { window.location.reload(); } catch (_) {}
                    }, 100);
                }
            }).catch(error => {
                console.error('Error getting user info:', error);
            });
        }
    }

    async handleOAuthRedirect() {
        // Check if we have OAuth parameters in URL (from redirect)
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        
        if (code) {
            try {
                // Exchange code for access token via backend
                const tokenData = await this.exchangeCodeForToken(code);
                this.accessToken = tokenData.access_token;
                
                // Use user info from token exchange response
                if (tokenData.user_info) {
                    this.userEmail = tokenData.user_info.email;
                    this.googleUserId = tokenData.user_info.id;
                } else {
                    // Fallback: get user info directly
                    const userInfo = await this.getUserInfoFromToken(this.accessToken);
                    this.userEmail = userInfo.email;
                    this.googleUserId = userInfo.id;
                }
                
                // Store token
                this.storeAuthToken(this.accessToken);
                
                // Clean up URL
                window.history.replaceState({}, document.title, window.location.pathname + 
                    (this.tenantId ? `?extension=${this.tenantId}` : ''));
                    
            } catch (error) {
                console.error('Error handling OAuth redirect:', error);
                throw new Error('Failed to complete OAuth flow');
            }
        }
    }

    storeAuthToken(token) {
        // Store in localStorage
        try {
            const payload = {
                token: token,
                savedAt: Date.now(),
                // 1h expiry by default
                expiresAt: Date.now() + 60 * 60 * 1000
            };
            localStorage.setItem('google_access_token', JSON.stringify(payload));
        } catch (_) {
            localStorage.setItem('google_access_token', token);
        }
        
        // Store in cookie for API requests
        const expiryDate = new Date();
        expiryDate.setTime(expiryDate.getTime() + (60 * 60 * 1000)); // 1 hour
        document.cookie = `google_access_token=${token}; expires=${expiryDate.toUTCString()}; path=/; SameSite=Strict`;
    }

    async loadStoredAuthToken() {
        // Try localStorage first
        const stored = localStorage.getItem('google_access_token');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                const token = parsed.token || stored;
                if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
                    this.clearAuthToken();
                } else {
                    this.accessToken = token;
                    // Verify token is still valid
                    await this.verifyStoredToken(token);
                }
            } catch (_) {
                this.accessToken = stored;
                await this.verifyStoredToken(stored);
            }
        }
    }

    async verifyStoredToken(token) {
        try {
            const userInfo = await this.getUserInfoFromToken(token);
            this.userEmail = userInfo.email;
            this.googleUserId = userInfo.id;
        } catch (error) {
            // Token invalid, clear storage
            this.clearAuthToken();
        }
    }

    clearAuthToken() {
        localStorage.removeItem('google_access_token');
        document.cookie = 'google_access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        this.accessToken = null;
        this.userEmail = null;
        this.googleUserId = null;
    }

    async exchangeCodeForToken(code) {
        // Use backend endpoint for secure token exchange
        const response = await fetch(`${this.apiBaseUrl}/oauth_token_exchange`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: 'oauth_token_exchange',
                body: {
                    code: code,
                    redirect_uri: window.location.origin + window.location.pathname
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to exchange code for token');
        }

        return await response.json();
    }

    async getUserInfoFromToken(token) {
        const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to get user info');
        }

        return await response.json();
    }

    isAuthenticated() {
        return this.accessToken && this.userEmail;
    }

    async signIn() {
        try {
            console.log('Starting sign-in process...');
            
            if (!this.tokenClient) {
                throw new Error('Token client not initialized');
            }

            // Request access token using the new Google Identity Services
            this.tokenClient.requestAccessToken({
                prompt: 'consent'
            });
            
        } catch (error) {
            console.error('Sign-in failed:', error);
            this.showAuthError('Sign-in failed: ' + error.message);
        }
    }

    async verifyReadAccess() {
        if (!this.tenantId || !this.accessToken) {
            return !this.requiresAuth; // If no tenant specified and auth not required, allow access
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/auth`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type: 'auth',
                    body: {
                        extension: this.tenantId,
                        google_access_token: this.accessToken,
                        scope: 'all'
                    }
                })
            });

            let result = await response.json();
            // Unwrap API Gateway non-proxy responses where payload is nested in 'body'
            if (result && typeof result.body === 'string') {
                try {
                    const parsed = JSON.parse(result.body);
                    result = parsed;
                } catch (_) {
                    // leave as-is if parsing fails
                }
            }
            
            // Store user permissions for this tenant
            if (result.authenticated && result.permissions) {
                this.userPermissions = result.permissions;
                try { sessionStorage.setItem('user_permissions', JSON.stringify(this.userPermissions)); } catch (_) {}
                try { localStorage.setItem('user_permissions', JSON.stringify(this.userPermissions)); } catch (_) {}
                console.log(`User permissions for tenant ${this.tenantId}:`, this.userPermissions);
            }
            // Persist consolidated auth metadata in localStorage
            try {
                const meta = {
                    tenant: this.tenantId,
                    email: this.userEmail,
                    google_user_id: this.googleUserId,
                    permissions: this.userPermissions || { read: false, write: false, admin: false, billing: false },
                    timestamp: Date.now()
                };
                localStorage.setItem('auth_metadata', JSON.stringify(meta));
            } catch (_) {}
            
            const success = result.authenticated && (result.scope_granted || result.permissions?.read);
            if (success) {
                // Proactively unblock and load schemas
                this.proceedWithAppLoad();
                if (typeof window.loadSchemaFromServer === 'function') {
                    try { window.loadSchemaFromServer(); } catch (e) { /* noop */ }
                }
                // Hide any access denied UI
                this.hideAuthUI();
                // Reload page to fully reinitialize ONLY if this is a fresh auth (not stored token)
                const shouldReload = sessionStorage.getItem('auth_just_completed') !== '2' && !localStorage.getItem('auth_reloaded_once');
                if (shouldReload) {
                    try { sessionStorage.setItem('auth_just_completed', '2'); } catch (_) {}
                    try { localStorage.setItem('auth_reloaded_once', '1'); } catch (_) {}
                    // Single refresh with proper delay
                    setTimeout(() => { 
                        try { 
                            window.location.reload(); 
                        } catch (_) {} 
                    }, 100);
                }
            // If permissions indicate admin, show the admin link immediately
            try {
                if (this.userPermissions && this.userPermissions.admin) {
                    const link = document.getElementById('adminPanelLink');
                    if (link) link.style.display = '';
                }
            } catch (_) {}
            }
            // Emit event so schema-loader can resume
            if (success && typeof window !== 'undefined') {
                try {
                    window.dispatchEvent(new CustomEvent('auth-success', {
                        detail: {
                            tenant: this.tenantId,
                            email: this.userEmail,
                            userId: this.googleUserId
                        }
                    }));
                } catch (_) { /* noop */ }
            }
            // One-time full reload after fresh auth to reset blocked UI/state
            try {
                const trigger = sessionStorage.getItem('auth_trigger_reload');
                const reloaded = localStorage.getItem('auth_reloaded_once');
                if (success && trigger === '1' && !reloaded) {
                    localStorage.setItem('auth_reloaded_once', '1');
                    sessionStorage.removeItem('auth_trigger_reload');
                    setTimeout(() => { try { window.location.reload(); } catch (_) {} }, 50);
                }
            } catch (_) {}
            return success;
            
        } catch (error) {
            console.error('Error verifying read access:', error);
            return false;
        }
    }

    // Method to check if user has specific permission for current tenant
    hasPermission(permission) {
        if (!this.userPermissions) {
            return false;
        }
        return this.userPermissions[permission] === true;
    }

    // Method to get all permissions for current tenant
    getPermissions() {
        return this.userPermissions || { read: false, write: false, admin: false };
    }

    signOut() {
        // Revoke the access token
        if (this.accessToken && window.google && window.google.accounts) {
            google.accounts.oauth2.revoke(this.accessToken);
        }
        
        // Clear all stored tokens
        this.clearAuthToken();
        
        // Show auth required UI
        this.showAuthRequired();
    }

    blockPageLoad() {
        console.log('🚨 BLOCKING PAGE LOAD - Authentication required');
        
        // Keep page blocked flags
        window.pageBlocked = true;
        window.authCheckInProgress = false; // Auth check is done, now we're blocking
        
        // Hide ALL main content immediately
        const body = document.body;
        if (body) {
            body.style.visibility = 'hidden'; // Keep hidden
            
            // Hide everything except our auth overlay
            Array.from(body.children).forEach(child => {
                if (!child.classList.contains('auth-container') && 
                    !child.classList.contains('auth-overlay')) {
                    child.style.display = 'none';
                }
            });
        }
        
        // Block app initialization
        window.appBlocked = true;
        
        // Override common initialization functions
        if (typeof window.initializeApp === 'function') {
            window.originalAppInit = window.initializeApp;
            window.initializeApp = () => {
                console.log('🚫 App initialization blocked - authentication required');
                return false;
            };
        }
        
        // Block schema loading
        if (typeof window.loadSchema === 'function') {
            window.originalLoadSchema = window.loadSchema;
            window.loadSchema = () => {
                console.log('🚫 Schema loading blocked - authentication required');
                return false;
            };
        }
    }

    proceedWithAppLoad() {
        console.log('✅ Authentication passed - UNBLOCKING all network requests and loading main application');
        
        // CRITICAL: Unblock ALL network requests first
        window.SECURITY_BLOCK_ALL_REQUESTS = false;
        
        // Restore original fetch function
        if (window.originalFetch) {
            window.fetch = window.originalFetch;
        }
        
        // Remove all blocking flags
        window.pageBlocked = false;
        window.appBlocked = false;
        window.authCheckInProgress = false;
        
        // Remove any auth-only style overrides and ensure visibility
        try {
            const authStyle = document.getElementById('auth-style-override');
            if (authStyle && authStyle.parentNode) authStyle.parentNode.removeChild(authStyle);
        } catch (_) {}
        const styleOverride = document.createElement('style');
        styleOverride.textContent = 'body { visibility: visible !important; }';
        document.head.appendChild(styleOverride);
        
        // Restore blocked functions
        if (window.originalAppInit) {
            window.initializeApp = window.originalAppInit;
        }
        if (window.originalLoadSchema) {
            window.loadSchema = window.originalLoadSchema;
        }
        
        // Show all content
        const body = document.body;
        if (body) {
            Array.from(body.children).forEach(child => {
                if (!child.classList.contains('auth-container') && 
                    !child.classList.contains('auth-overlay')) {
                    child.style.display = '';
                }
            });
        }
        
        // Hide any auth UI
        this.hideAuthUI();
        
        // Initialize the main application
        try {
            if (typeof window.initialize === 'function') {
                window.initialize();
            } else if (typeof window.initializeApp === 'function') {
                window.initializeApp();
            } else if (window.originalAppInit) {
                window.originalAppInit();
            }
        } catch (e) {
            console.warn('Initialization call failed:', e);
        }
        
        // Show the main app content
        const mainContainer = document.querySelector('.main-container');
        if (mainContainer) {
            mainContainer.style.display = 'block';
        }
        
    }

    showAuthRequired() {
        this.hideMainApp();
        
        // Override the visibility block to show auth UI only
        const styleOverride = document.createElement('style');
        styleOverride.id = 'auth-style-override';
        styleOverride.textContent = `
            body { visibility: visible !important; }
            body > *:not(.auth-container):not(.auth-overlay) { display: none !important; }
        `;
        document.head.appendChild(styleOverride);
        
        const authContainer = this.createAuthContainer();
        authContainer.innerHTML = `
            <div class="auth-card">
                <h2>🔒 Authentication Required</h2>
                <p>This tenant requires Google authentication to access content.</p>
                <p>Tenant: <strong>${this.tenantId || 'Unknown'}</strong></p>
                <button onclick="googleAuth.signIn()" class="auth-button">
                    🔑 Sign in with Google
                </button>
                <div class="auth-status">
                    <small>Please sign in to continue...</small>
                </div>
            </div>
        `;
        
        document.body.appendChild(authContainer);
    }

    showAccessDenied() {
        const authContainer = document.querySelector('.auth-container');
        if (authContainer) {
            authContainer.innerHTML = `
                <div class="auth-card">
                    <h2>Access Denied</h2>
                    <p>You don't have permission to access this tenant.</p>
                    <p>Tenant: <strong>${this.tenantId}</strong></p>
                    <p>Your email: <strong>${this.userEmail}</strong></p>
                    <p>Please contact the tenant administrator for access.</p>
                    <button onclick="googleAuth.signOut()" class="auth-button">
                        Try Different Account
                    </button>
                </div>
            `;
        }
    }

    showAuthError(message) {
        this.hideMainApp();
        
        const authContainer = this.createAuthContainer();
        authContainer.innerHTML = `
            <div class="auth-card">
                <h2>Authentication Error</h2>
                <p>There was an error setting up authentication:</p>
                <p class="error-message">${message}</p>
                <button onclick="location.reload()" class="auth-button">
                    Retry
                </button>
            </div>
        `;
        
        document.body.appendChild(authContainer);
    }

    createAuthContainer() {
        let authContainer = document.querySelector('.auth-container');
        if (!authContainer) {
            authContainer = document.createElement('div');
            authContainer.className = 'auth-container';
        }
        return authContainer;
    }

    hideMainApp() {
        const mainContainer = document.querySelector('.main-container');
        if (mainContainer) {
            mainContainer.style.display = 'none';
        }
    }

    hideAuthUI() {
        const authContainer = document.querySelector('.auth-container');
        if (authContainer) {
            authContainer.remove();
        }
    }

    // Method to get access token for API calls
    getAccessToken() {
        return this.accessToken;
    }

    // Method to get user email
    getUserEmail() {
        return this.userEmail;
    }

    // Method to get Google user ID
    getGoogleUserId() {
        return this.googleUserId;
    }
}

// Initialize authentication when page loads
let googleAuth;

// Store original app initialization function if it exists
if (window.initialize) {
    window.originalAppInit = window.initialize;
}

// Override initialize to wait for authentication
window.initialize = function() {
    // Authentication will call originalAppInit when ready
    console.log('Initialize called, waiting for authentication...');
};

// Initialize Google OAuth when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    googleAuth = new GoogleOAuthAuth();
});
