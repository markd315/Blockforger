// Load Node modules
var express = require('express');
var AWS = require('aws-sdk');
var path = require('path');
var https = require('https');

// Initialise Express
var app = express();
var serveIndex = require('serve-index')

// Configure AWS SDK
AWS.config.update({
    region: process.env.AWS_REGION || 'us-east-1'
});

const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'universal-frontend-720291373173-dev';
const DYNAMODB_TABLE = 'frontend-users';
const BILLING_TABLE = 'billing-admins';
// Import API configuration
const API_CONFIG = require('./server-config.js');
const LAMBDA_API_URL = process.env.LAMBDA_API_URL || process.env.API_GATEWAY_URL || API_CONFIG.API_BASE_URL;
const PAYMENT_ENABLED = (process.env.PAYMENT_ENABLED || 'false').toLowerCase() !== 'false'; // Default to false for demo, set to 'true' to enable
console.log(`🔍 ENV DEBUG: process.env.PAYMENT_ENABLED="${process.env.PAYMENT_ENABLED}"`);
console.log(`🔍 ENV DEBUG: (process.env.PAYMENT_ENABLED || 'false')="${process.env.PAYMENT_ENABLED || 'false'}"`);
console.log(`🔍 ENV DEBUG: .toLowerCase()="${(process.env.PAYMENT_ENABLED || 'false').toLowerCase()}"`);
console.log(`🔍 ENV DEBUG: !== 'false' = ${(process.env.PAYMENT_ENABLED || 'false').toLowerCase() !== 'false'}`);
console.log(`Payment feature toggle: PAYMENT_ENABLED=${process.env.PAYMENT_ENABLED}, resolved to: ${PAYMENT_ENABLED}`);

// Middleware to parse JSON bodies
app.use(express.json());

// Middleware to extract tenant ID from query parameters
app.use((req, res, next) => {
    // Use 'tenant' parameter only, fallback to 'default'
    req.tenantId = req.query.tenant || 'default';
    next();
});

// Authentication middleware for protected endpoints
async function requireAuthentication(req, res, next) {
    const tenantId = req.tenantId;
    const authHeader = req.headers.authorization;
    
    console.log(`🚨 === AUTHENTICATION MIDDLEWARE CALLED ===`);
    console.log(`🚨 Request URL: ${req.url}`);
    console.log(`🚨 Request path: ${req.path}`);
    console.log(`🚨 Tenant: ${tenantId}`);
    console.log(`🚨 Auth header: ${authHeader ? 'Present' : 'Missing'}`);
    
    // First check if this tenant requires authentication
    try {
        const authRequired = await checkIfAuthRequired(tenantId);
        console.log(`🚨 Auth required for tenant ${tenantId}: ${authRequired}`);
        
        if (!authRequired) {
            console.log('Auth not required, proceeding');
            return next();
        }
        
        // Auth is required, check for valid token
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.log('Missing or invalid Authorization header');
            return res.status(401).json({
                error: 'Authentication required',
                message: 'This tenant requires Google OAuth authentication'
            });
        }
        
        const accessToken = authHeader.replace('Bearer ', '');
        
        // Verify the Google access token and check scopes
        const authResult = await verifyGoogleTokenAndScopes(accessToken, tenantId, 'read');
        
        if (!authResult.valid) {
            console.log('Token validation failed:', authResult.error);
            return res.status(401).json({
                error: 'Authentication failed',
                message: authResult.error
            });
        }
        
        // Check if user has any permission for this tenant
        // Default: All authenticated users get READ access
        // Additional: WRITE/ADMIN must be explicitly granted in DynamoDB
        const hasReadAccess = authResult.scopes.includes('read') || 
                             authResult.scopes.includes('write') || 
                             authResult.scopes.includes('admin') ||
                             authResult.scopes.length === 0; // Default READ for authenticated users
        
        if (!hasReadAccess) {
            console.log('No access to tenant:', tenantId, 'User scopes:', authResult.scopes);
            return res.status(403).json({
                error: 'Insufficient permissions',
                message: `No access to tenant: ${tenantId}`
            });
        }
        
        console.log('Authentication successful');
        req.user = {
            googleUserId: authResult.google_user_id,
            email: authResult.user_email,
            scopes: authResult.scopes
        };
        
        next();
        
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json({
            error: 'Authentication service error',
            message: 'Unable to verify authentication'
        });
    }
}

// Helper function to check if tenant requires authentication
async function checkIfAuthRequired(tenantId) {
    try {
        if (!tenantId || tenantId === 'default') {
            return false;
        }
        
        const s3Key = `schemas/${tenantId}/tenant.properties`;
        
        const s3Object = await s3.getObject({
            Bucket: BUCKET_NAME,
            Key: s3Key
        }).promise();
        
        const propertiesContent = s3Object.Body.toString('utf8');
        
        // Parse properties to check authorized_reads
        const lines = propertiesContent.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('authorized_reads=')) {
                const value = trimmed.split('=')[1].replace(/"/g, '').trim();
                return value === 'true';
            }
        }
        
        return false; // Default to not requiring auth
        
    } catch (error) {
        console.log(`Error checking auth requirement for ${tenantId}:`, error.message);
        return false; // Default to not requiring auth if we can't check
    }
}

// Helper function to verify Google token and scopes
async function verifyGoogleTokenAndScopes(accessToken, tenantId, scopeRequired) {
    try {
        // First verify the token with Google
        const userInfoResponse = await new Promise((resolve, reject) => {
            const options = {
                hostname: 'www.googleapis.com',
                path: '/oauth2/v2/userinfo',
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            };
            
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve(JSON.parse(data));
                    } else {
                        reject(new Error(`Google API error: ${res.statusCode}`));
                    }
                });
            });
            
            req.on('error', reject);
            req.end();
        });
        
        const googleUserId = userInfoResponse.id;
        const userEmail = userInfoResponse.email;
        
        if (!googleUserId) {
            return { valid: false, error: 'Unable to get Google user ID' };
        }
        
        // Check user scopes for this tenant via DynamoDB GSI by user email
        const userScopes = await getUserScopesByEmail(tenantId, userEmail);
        
        return {
            valid: true,
            google_user_id: googleUserId,
            user_email: userEmail,
            scopes: userScopes,
            error: null
        };
        
    } catch (error) {
        console.error('Error verifying Google token:', error);
        return { valid: false, error: error.message };
    }
}

// Helper function to get user scopes from DynamoDB for a specific tenant using email GSI
async function getUserScopesByEmail(tenantId, userEmail) {
    try {
        console.log(`Checking scopes for user email ${userEmail} in tenant ${tenantId}`);
        const queryParams = {
            TableName: DYNAMODB_TABLE,
            IndexName: 'UserEmailIndex',
            KeyConditionExpression: '#tenantId = :tenantId AND #user_email = :user_email',
            ExpressionAttributeNames: {
                '#tenantId': 'tenantId',
                '#user_email': 'user_email'
            },
            ExpressionAttributeValues: {
                ':tenantId': tenantId,
                ':user_email': userEmail
            }
        };
        const result = await dynamodb.query(queryParams).promise();
        const item = result.Items && result.Items[0];
        if (item && item.scopes) {
            console.log(`Found explicit scopes for ${userEmail} in tenant ${tenantId}:`, item.scopes);
            return item.scopes;
        }
        console.log(`No explicit scopes found for ${userEmail} in tenant ${tenantId}`);
        return [];
        
    } catch (error) {
        console.error('Error getting user scopes from DynamoDB:', error);
        return [];
    }
}

// Helper function to debit pageload tokens via Stripe meter events
async function debitPageloadTokens(tenantId, schemasCount, dataSizeMB) {
    try {
        console.log(`🔍 DEBIT DEBUG: tenantId=${tenantId}, schemasCount=${schemasCount}, dataSizeMB=${dataSizeMB}, PAYMENT_ENABLED=${PAYMENT_ENABLED}`);
        
        // If payment is disabled, always return true (no token debiting)
        if (!PAYMENT_ENABLED) {
            console.log(`✅ Payment disabled - skipping token debit for tenant ${tenantId}`);
            return true;
        }
        
        // Calculate tokens to debit
        // Minimum 1 token, plus 1 for every 30 schemas, plus 1 for every 1MB
        const tokensToDebit = 1 + Math.floor(schemasCount / 30) + dataSizeMB;
        console.log(`🔍 Calculated tokens to debit: ${tokensToDebit}`);
        
        // Get customer ID for tenant from DynamoDB
        const customerId = await getStripeCustomerId(tenantId);
        console.log(`🔍 Customer ID for tenant ${tenantId}: ${customerId || 'NOT FOUND'}`);
        
        if (!customerId) {
            console.log(`✅ No billing account found for tenant ${tenantId} - allowing request to proceed (demo mode)`);
            return true; // Allow requests to proceed even without billing account
        }
        
        // Send meter event directly to Stripe
        const success = await sendStripeMeterEvent(customerId, tokensToDebit);
        
        if (success) {
            console.log(`Successfully debited ${tokensToDebit} tokens for tenant ${tenantId}`);
            return true;
        } else {
            console.log(`Failed to debit tokens for tenant ${tenantId}`);
            return false;
        }
        
    } catch (error) {
        console.error(`Error debiting pageload tokens for ${tenantId}:`, error);
        return false;
    }
}

// Helper function to get Stripe customer ID for a tenant
async function getStripeCustomerId(tenantId) {
    try {
        // First, find the billing administrator who manages this tenant
        const billingParams = {
            TableName: BILLING_TABLE,
            FilterExpression: 'contains(managed_tenants, :tenantId)',
            ExpressionAttributeValues: {
                ':tenantId': tenantId
            }
        };
        
        const billingResult = await dynamodb.scan(billingParams).promise();
        
        if (billingResult.Items && billingResult.Items.length > 0) {
            const billingAdmin = billingResult.Items[0];
            return billingAdmin.stripe_customer_id || null;
        }
        
        // Fallback: check old structure in frontend-users table
        const params = {
            TableName: DYNAMODB_TABLE,
            Key: {
                tenantId: tenantId,
                type: 'user'
            }
        };
        
        const result = await dynamodb.get(params).promise();
        return result.Item?.stripe_customer_id || null;
        
    } catch (error) {
        console.error(`Error getting Stripe customer ID for tenant ${tenantId}:`, error);
        return null;
    }
}

// Helper function to send Stripe meter event
async function sendStripeMeterEvent(customerId, value) {
    try {
        const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
        if (!stripeSecretKey) {
            console.error('Missing STRIPE_SECRET_KEY environment variable');
            return false;
        }
        
        const url = 'https://api.stripe.com/v1/billing/meter_events';
        const headers = {
            'Authorization': `Bearer ${stripeSecretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        
        const data = new URLSearchParams({
            'event_name': 'pageload_tokens',
            'timestamp': Math.floor(Date.now() / 1000).toString(),
            'payload[stripe_customer_id]': customerId,
            'payload[value]': value.toString()
        });
        
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: data
        });
        
        if (response.ok) {
            console.log(`Successfully sent meter event: ${value} tokens for customer ${customerId}`);
            return true;
        } else {
            const errorText = await response.text();
            console.log(`Failed to send meter event: ${response.status} - ${errorText}`);
            return false;
        }
        
    } catch (error) {
        console.error(`Error sending Stripe meter event: ${error.message}`);
        return false;
    }
}

// Test route to verify server is working
app.get('/test', (req, res) => {
    res.json({ 
        message: 'Server is working!', 
        timestamp: new Date().toISOString(),
        PAYMENT_ENABLED: PAYMENT_ENABLED,
        env_PAYMENT_ENABLED: process.env.PAYMENT_ENABLED
    });
});

// Endpoint to serve tenant properties (public access - no auth required)
app.get('/tenant-properties', async (req, res) => {
    const tenantId = req.query.tenant;
    
    if (!tenantId) {
        return res.status(400).json({ error: 'tenant parameter required' });
    }
    
    try {
        const bucketName = BUCKET_NAME;
        const key = `schemas/${tenantId}/tenant.properties`;
        
        console.log(`Fetching tenant properties: s3://${bucketName}/${key}`);
        
        const s3Params = {
            Bucket: bucketName,
            Key: key
        };
        
        const s3Object = await s3.getObject(s3Params).promise();
        const propertiesContent = s3Object.Body.toString('utf-8');
        
        console.log(`Successfully loaded tenant properties for ${tenantId}`);
        res.set('Content-Type', 'text/plain');
        res.send(propertiesContent);
        
    } catch (error) {
        if (error.code === 'NoSuchKey') {
            console.log(`Tenant properties not found for ${tenantId}, returning defaults`);
            res.set('Content-Type', 'text/plain');
            res.send('authorized_reads=false\n');
        } else {
            console.error('Error fetching tenant properties:', error);
            res.status(500).json({ error: 'Failed to load tenant properties' });
        }
    }
});

// REMOVED: Duplicate check-permissions endpoint - now properly proxied to Lambda via /api/check-permissions

// API proxy endpoint for Lambda functions
function proxyToLambda(req, res, pathSuffix = '') {
    console.log('🔗 PROXY DEBUG: Called with pathSuffix:', pathSuffix);
    console.log('🔗 PROXY DEBUG: LAMBDA_API_URL:', LAMBDA_API_URL);
    if (!LAMBDA_API_URL) {
        console.error('Missing LAMBDA_API_URL environment variable');
        return res.status(500).json({ error: 'Server not configured: LAMBDA_API_URL missing' });
    }
    try {
        const requestData = JSON.stringify(req.body || {});
        const base = new URL(LAMBDA_API_URL);
        // Derive API root ending in /api, then append suffix
        let apiRoot;
        if (base.pathname && base.pathname !== '/') {
            const idx = base.pathname.indexOf('/api');
            if (idx >= 0) {
                apiRoot = base.pathname.substring(0, idx + 4); // include '/api'
            } else {
                apiRoot = base.pathname; // best effort
            }
        } else {
            apiRoot = process.env.API_GATEWAY_STAGE_PATH || '/dev/api';
        }
        const fullPath = `${apiRoot}${pathSuffix || ''}`;

        // Forward essential headers (e.g., Authorization) to API Gateway
        const forwardHeaders = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(requestData)
        };
        if (req.headers && req.headers['authorization']) {
            forwardHeaders['Authorization'] = req.headers['authorization'];
        }

        const options = {
            hostname: base.hostname,
            port: 443,
            path: fullPath,
            method: req.method || 'POST',
            headers: forwardHeaders
        };
        console.log('🔗 Proxying to API Gateway:', `${base.origin}${fullPath}`);

        const proxyReq = https.request(options, (proxyRes) => {
            let responseData = '';
            proxyRes.on('data', (chunk) => { responseData += chunk; });
            proxyRes.on('end', () => {
                res.status(proxyRes.statusCode || 500);
                if (proxyRes.headers['content-type']) {
                    res.set('Content-Type', proxyRes.headers['content-type']);
                }
                if (proxyRes.headers['access-control-allow-origin']) {
                    res.set('Access-Control-Allow-Origin', proxyRes.headers['access-control-allow-origin']);
                }
                res.send(responseData);
            });
        });

        proxyReq.on('error', (error) => {
            console.error('Proxy request error:', error);
            res.status(500).json({ error: 'Failed to connect to Lambda API', details: error.message });
        });

        proxyReq.write(requestData);
        proxyReq.end();
    } catch (error) {
        console.error('API proxy error:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
}

app.all('/api', async (req, res) => {
    console.log('=== API ROUTE HIT ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    console.log('Headers:', req.headers);
    proxyToLambda(req, res, '');
});

// Explicit subpath proxies for reliability
app.all('/api/auth', async (req, res) => {
    console.log('=== API SUBPATH ROUTE HIT === /api/auth');
    proxyToLambda(req, res, '/auth');
});

app.all('/api/manage_oauth_scopes', async (req, res) => {
    console.log('=== API SUBPATH ROUTE HIT === /api/manage_oauth_scopes');
    proxyToLambda(req, res, '/manage_oauth_scopes');
});

app.all('/api/create_account_link', async (req, res) => {
    console.log('=== API SUBPATH ROUTE HIT === /api/create_account_link');
    proxyToLambda(req, res, '/create_account_link');
});

app.all('/api/check_account_status', async (req, res) => {
    console.log('=== API SUBPATH ROUTE HIT === /api/check_account_status');
    proxyToLambda(req, res, '/check_account_status');
});

// REMOVED: billing-urls endpoint - URLs are now hardcoded in billing.html

// REMOVED: billing-config endpoint - now using direct Stripe customer portal redirects

// REMOVED: check-permissions endpoint - billing permission now handled in /auth endpoint

// Proxy subpaths like /api/auth, /api/manage_oauth_scopes, etc.
app.all('/api/*', async (req, res) => {
    const suffix = req.params[0] || '';
    console.log('=== API SUBPATH ROUTE HIT ===', suffix);
    proxyToLambda(req, res, `/${suffix}`);
});

// Render static files
app.use(express.static('public'));

// DUPLICATE ENDPOINT REMOVED - using the one at line 228

// Dynamic schema endpoint that loads from S3 based on tenant (PROTECTED)
app.get('/schema/*', requireAuthentication, async (req, res) => {
    try {
        const schemaPath = req.params[0];
        const tenantId = req.tenantId;
        const s3Key = `schemas/${tenantId}/${schemaPath}`;

        console.log(`🔒 PROTECTED SCHEMA REQUEST: ${schemaPath} for tenant: ${tenantId}`);
        console.log(`🔒 User authenticated: ${req.user ? req.user.email : 'NO USER'}`);
        console.log(`S3 Key: ${s3Key}`);
        console.log(`Bucket: ${BUCKET_NAME}`);

        const s3Object = await s3.getObject({
            Bucket: BUCKET_NAME,
            Key: s3Key
        }).promise();

        // Calculate data size for token debiting
        const dataSizeBytes = s3Object.Body.length;
        const dataSizeMB = Math.ceil(dataSizeBytes / (1024 * 1024)); // Round up to MB
        
        // Debit pageload tokens (1 token minimum, plus 1 for every 1MB)
        const tokensDebited = await debitPageloadTokens(tenantId, 1, dataSizeMB);
        
        // TEMPORARY FIX: Always allow schema loading for now - remove 402 check entirely
        console.log(`✅ TEMPORARY FIX: Allowing schema loading regardless of payment status`);
        
        // TODO: Re-enable this check once we debug the issue
        // if (!tokensDebited && PAYMENT_ENABLED) {
        //     return res.status(402).json({
        //         error: 'Insufficient pageload tokens',
        //         message: 'Please upgrade your plan to continue using the service'
        //     });
        // }

        const fileExtension = path.extname(schemaPath).toLowerCase();

        if (fileExtension === '.json') {
            const schemaData = JSON.parse(s3Object.Body.toString());
            res.set('Content-Type', 'application/json');
            res.json(schemaData);
        } else if (fileExtension === '.properties') {
            res.set('Content-Type', 'text/plain');
            res.send(s3Object.Body.toString()); // 👈 Send raw text
        } else {
            res.set('Content-Type', s3Object.ContentType || 'application/octet-stream');
            res.send(s3Object.Body);
        }

    } catch (error) {
        console.error(`Error loading schema ${req.params[0]} for tenant ${req.tenantId}:`, error);

        if (error.code === 'NoSuchKey') {
            res.status(404).json({
                error: 'Schema not found',
                schema: req.params[0],
                tenant: req.tenantId,
                s3Key: `schemas/${req.tenantId}/${req.params[0]}`
            });
        } else {
            res.status(500).json({
                error: 'Internal server error',
                details: error.message,
                schema: req.params[0],
                tenant: req.tenantId
            });
        }
    }
});

// List schemas for a tenant (PROTECTED)
app.get('/schemas', requireAuthentication, async (req, res) => {
    try {
        const tenantId = req.tenantId;
        console.log(`Listing schemas for tenant: ${tenantId}`);
        console.log(`Using bucket: ${BUCKET_NAME}`);
        console.log(`AWS Region: ${process.env.AWS_REGION || 'us-east-1'}`);
        
        const s3Objects = await s3.listObjectsV2({
            Bucket: BUCKET_NAME,
            Prefix: `schemas/${tenantId}/`,
            Delimiter: '/'
        }).promise();
        
        console.log(`S3 response:`, JSON.stringify(s3Objects, null, 2));
        
        const schemas = s3Objects.Contents
            ?.filter(obj => obj.Key.endsWith('.json'))
            ?.map(obj => path.basename(obj.Key)) || [];
        
        console.log(`Found schemas:`, schemas);
        
        // Calculate data size for token debiting
        const schemasCount = schemas.length;
        const dataSizeBytes = JSON.stringify(schemas).length;
        const dataSizeMB = Math.ceil(dataSizeBytes / (1024 * 1024)); // Round up to MB
        
        // Debit pageload tokens (1 token minimum, plus 1 for every 30 schemas, plus 1 for every 1MB)
        const tokensDebited = await debitPageloadTokens(tenantId, schemasCount, dataSizeMB);
        
        console.log(`🔍 SCHEMAS DEBUG: tokensDebited=${tokensDebited}, PAYMENT_ENABLED=${PAYMENT_ENABLED}`);
        console.log(`🔍 SCHEMAS DEBUG: typeof PAYMENT_ENABLED=${typeof PAYMENT_ENABLED}`);
        console.log(`🔍 SCHEMAS DEBUG: PAYMENT_ENABLED === true: ${PAYMENT_ENABLED === true}`);
        console.log(`🔍 SCHEMAS DEBUG: PAYMENT_ENABLED === false: ${PAYMENT_ENABLED === false}`);
        
        // TEMPORARY FIX: Always allow schemas for now - remove 402 check entirely
        console.log(`✅ TEMPORARY FIX: Allowing schemas request regardless of payment status`);
        
        // TODO: Re-enable this check once we debug the issue
        // if (!tokensDebited && PAYMENT_ENABLED) {
        //     console.log(`🚨 Returning 402: tokensDebited=${tokensDebited}, PAYMENT_ENABLED=${PAYMENT_ENABLED}`);
        //     return res.status(402).json({
        //         error: 'Insufficient pageload tokens',
        //         message: 'Please upgrade your plan to continue using the service'
        //     });
        // }
        
        res.json(schemas);
        
    } catch (error) {
        console.error(`Error listing schemas for tenant ${req.tenantId}:`, error);
        console.error(`Error details:`, {
            message: error.message,
            code: error.code,
            statusCode: error.statusCode,
            requestId: error.requestId
        });
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message,
            tenant: req.tenantId,
            bucket: BUCKET_NAME
        });
    }
});

app.use('/serverConfig.json', express.static('serverConfig.json'));
app.use('/msg', express.static('msg'));
app.use('/media', express.static('media'));

// REMOVED: Duplicate billing endpoints - moved above catch-all route

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        tenant: req.tenantId,
        timestamp: new Date().toISOString()
    });
});

// Port website will run on
app.listen(8080, () => {
    console.log('JSON Block Builder server running on port 8080');
    console.log(`S3 Bucket: ${BUCKET_NAME}`);
    console.log(`AWS Region: ${process.env.AWS_REGION || 'us-east-1'}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('Available endpoints:');
    console.log('  GET /health - Health check');
    console.log('  GET /schemas - List schemas for tenant');
    console.log('  GET /schema/* - Load specific schema');
    console.log('  GET / - Static files');
});