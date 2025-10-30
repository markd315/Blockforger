// Load Node modules
var express = require('express');
var AWS = require('aws-sdk');
var path = require('path');
var https = require('https');
var crypto = require('crypto');
var zlib = require('zlib');

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
const DYNAMODB_TABLE = process.env.FRONTEND_USERS_TABLE_NAME || 'frontend-users';
const BILLING_TABLE = process.env.BILLING_TABLE_NAME || 'billing-admins';
const BILLING_USER_FROM_TENANT_TABLE = process.env.BILLING_USER_FROM_TENANT_TABLE_NAME || 'billinguser-from-tenant-dev';
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

async function checkUserPermissions(tenantId, userEmail) {
    const params = {
        TableName: DYNAMODB_TABLE,
        Key: {
            tenantId: tenantId,
            user_email: userEmail
        }
    };

    try {
        console.log(`🔍 PERMISSION DEBUG (server.js): Looking up permissions for user ${userEmail} in tenant ${tenantId}`);
        const data = await dynamodb.get(params).promise();
        console.log(`🔍 PERMISSION DEBUG (server.js): DynamoDB response:`, JSON.stringify(data, null, 2));
        
        if (data.Item && data.Item.permissions) {
            console.log(`🔍 PERMISSION DEBUG (server.js): Found permissions:`, data.Item.permissions);
            return data.Item.permissions;
        }
        
        console.log(`🔍 PERMISSION DEBUG (server.js): No permissions found`);
        return null;
    } catch (error) {
        console.error(`❌ Error querying DynamoDB for tenant ${tenantId}, user ${userEmail}:`, error);
        console.error(`❌ Error details:`, error.message, error.code);
        return null;
    }
}

async function requireAuthentication(req, res, next) {
    const tenantId = req.tenantId;
    const authHeader = req.headers.authorization;
    
    console.log(`🚨 === AUTHENTICATION MIDDLEWARE CALLED ===`);
    console.log(`🚨 Request URL: ${req.url}`);
    console.log(`🚨 Request path: ${req.path}`);
    console.log(`🚨 Tenant: ${tenantId}`);
    console.log(`🚨 Auth header: ${authHeader ? 'Present' : 'Missing'}`);
    
    try {
        const authRequired = await checkIfAuthRequired(tenantId);
        console.log(`🚨 Auth required for tenant ${tenantId}: ${authRequired}`);
        
        if (authRequired == 'false') {
            console.log('Auth not required, proceeding');
            return next();
        }
       
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.log('Missing or invalid Authorization header');
            return res.status(401).json({
                error: 'Authentication required',
                message: 'This tenant requires Google OAuth authentication'
            });
        }

        const accessToken = authHeader.replace('Bearer ', '');
        const authResult = await verifyGoogleToken(accessToken);
        const email = authResult.user_email;

        if (!email) {
            console.log('Missing email detection for user identification');
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Email address is required'
            });
        }

        const userPermissions = await checkUserPermissions(tenantId, email);
        if (!userPermissions || !userPermissions.read) {
            console.log(`No read access for tenant: ${tenantId}, user: ${email}`);
            return res.status(403).json({
                error: 'Insufficient permissions',
                message: `No read access to tenant: ${tenantId}`
            });
        }

        if (!authResult.valid) {
            console.log('Token validation failed:', authResult.error);
            return res.status(401).json({
                error: 'Authentication failed',
                message: authResult.error
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
        console.error('Error during authentication:', {
            message: error.message,
            stack: error.stack,
            url: req.url,
            tenant: tenantId
        });
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
            return 'false';
        }
        
        const s3Key = `schemas/${tenantId}/tenant.properties`;
        
        const s3Object = await s3.getObject({
            Bucket: BUCKET_NAME,
            Key: s3Key
        }).promise();
        
        const propertiesContent = s3Object.Body.toString('utf8');
        
        // Parse properties to check authorized_reads
        const lines = propertiesContent.split('\n');
        var authenticated_reads = false;
        for (const line of lines) {
            const trimmed = line.trim();
            const value = trimmed.split('=')[1].replace(/"/g, '').trim();
            if (trimmed.startsWith('authorized_reads=')) {
                if (value === 'true') {
                    return 'authorized';
                }
            }
            if (trimmed.startsWith('authenticated_reads=')) {
                if (value === 'true') {
                    authenticated_reads = true;
                }
            }
        }
        if (authenticated_reads) {
            return 'authenticated';
        }
        return 'false';
        
    } catch (error) {
        console.log(`Error checking auth requirement for ${tenantId}:`, error.message);
        return 'false'; // Default to not requiring auth if we can't check
    }
}

// Helper function to verify Google token
async function verifyGoogleToken(accessToken) {
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
        
        return {
            valid: true,
            google_user_id: googleUserId,
            user_email: userEmail,
            error: null
        };
        
    } catch (error) {
        console.error('Error verifying Google token:', error);
        return { valid: false, error: error.message };
    }
}

// Helper function to debit pageload tokens via Lambda API (non-blocking)
async function debitPageloadTokens(tenantId, dataSizeMB) {
    try {
        // Calculate tokens to debit
        // Minimum 1 token, plus 1 for every 1MB
        const tokensToDebit = 1 + dataSizeMB;
        
        // Make non-blocking call to Lambda debit endpoint
        callDebitTokensAPI(tenantId, tokensToDebit, 'pageload')
            .then(success => {
                if (success) {
                    console.log(`Successfully debited ${tokensToDebit} tokens for tenant ${tenantId}`);
                } else {
                    console.log(`Failed to debit tokens for tenant ${tenantId}`);
                }
            })
            .catch(error => {
                console.error(`Error in non-blocking debit call for ${tenantId}:`, error);
            });
        
        // Always return true since this is non-blocking
        return true;
        
    } catch (error) {
        console.error(`Error setting up pageload token debit for ${tenantId}:`, error);
        return true; // Don't block functionality on debit errors
    }
}

// Helper function to call the Lambda debit tokens API
async function callDebitTokensAPI(tenantId, tokens, operationType) {
    try {
        const requestBody = {
            extension: tenantId,
            tokens: tokens,
            operation_type: operationType
        };
        
        const response = await fetch(`${LAMBDA_API_URL}/debit_tokens`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: 'debit_tokens',
                body: requestBody
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log(`Debit API response:`, result);
            return true;
        } else {
            const errorText = await response.text();
            console.log(`Debit API failed: ${response.status} - ${errorText}`);
            return false;
        }
        
    } catch (error) {
        console.error(`Error calling debit tokens API: ${error.message}`);
        return false;
    }
}

// Helper function to calculate hash of schema metadata
function calculateSchemaHash(schemaMetadata) {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(schemaMetadata));
    return hash.digest('hex');
}

// Helper function to get cache key for tenant schemas
function getCacheKey(tenantId, hash) {
    return `cache/schemas/${tenantId}/cache_${hash}.gz`;
}

// Helper function to clean up old cache files for a tenant
async function cleanupOldCacheFiles(tenantId, currentHash) {
    try {
        const cachePrefix = `cache/schemas/${tenantId}/cache_`;
        const listParams = {
            Bucket: BUCKET_NAME,
            Prefix: cachePrefix
        };
        
        const result = await s3.listObjectsV2(listParams).promise();
        
        if (result.Contents) {
            const deletePromises = result.Contents
                .filter(obj => {
                    // Delete files that don't match current hash
                    const fileName = path.basename(obj.Key);
                    return fileName.startsWith('cache_') && 
                           fileName.endsWith('.gz') && 
                           !fileName.includes(currentHash);
                })
                .map(obj => s3.deleteObject({
                    Bucket: BUCKET_NAME,
                    Key: obj.Key
                }).promise());
            
            if (deletePromises.length > 0) {
                await Promise.all(deletePromises);
                console.log(`Cleaned up ${deletePromises.length} old cache files for tenant ${tenantId}`);
            }
        }
    } catch (error) {
        console.error(`Error cleaning up old cache files for tenant ${tenantId}:`, error);
    }
}

// Helper function to create and store compressed schema cache
async function createSchemaCache(tenantId, schemas, properties, looseEndpoints, schemaMetadata) {
    try {
        const hash = calculateSchemaHash(schemaMetadata);
        const cacheKey = getCacheKey(tenantId, hash);
        
        // Create BSON-like structure with all schemas
        const cacheData = {
            tenantId: tenantId,
            timestamp: new Date().toISOString(),
            schemas: schemas,
            properties: properties,
            looseEndpoints: looseEndpoints
        };
        
        // Compress the data
        const jsonData = JSON.stringify(cacheData);
        const compressedData = zlib.gzipSync(jsonData);
        
        // Store in S3
        await s3.putObject({
            Bucket: BUCKET_NAME,
            Key: cacheKey,
            Body: compressedData,
            ContentType: 'application/gzip',
            ContentEncoding: 'gzip'
        }).promise();
        
        console.log(`Created schema cache for tenant ${tenantId} with hash ${hash}`);
        
        // Clean up old cache files
        await cleanupOldCacheFiles(tenantId, hash);
        
        return { hash, cacheKey, compressedData };
    } catch (error) {
        console.error(`Error creating schema cache for tenant ${tenantId}:`, error);
        throw error;
    }
}

// Helper function to get schema cache if it exists
async function getSchemaCache(tenantId, schemaMetadata) {
    try {
        const hash = calculateSchemaHash(schemaMetadata);
        const cacheKey = getCacheKey(tenantId, hash);
        
        const result = await s3.getObject({
            Bucket: BUCKET_NAME,
            Key: cacheKey
        }).promise();
        
        console.log(`Found schema cache for tenant ${tenantId} with hash ${hash}`);
        return result.Body;
    } catch (error) {
        if (error.code === 'NoSuchKey') {
            console.log(`No cache found for tenant ${tenantId}`);
            return null;
        }
        console.error(`Error getting schema cache for tenant ${tenantId}:`, error);
        throw error;
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

app.all('/api/debit_tokens', async (req, res) => {
    console.log('=== API SUBPATH ROUTE HIT === /api/debit_tokens');
    proxyToLambda(req, res, '/debit_tokens');
});

app.all('/api/register', async (req, res) => {
    console.log('=== API SUBPATH ROUTE HIT === /api/register');
    proxyToLambda(req, res, '/register');
});

// Proxy to API gateway the lambda subpaths like /api/auth, /api/manage_oauth_scopes, etc.
app.all('/api/*', async (req, res) => {
    const suffix = req.params[0] || '';
    console.log('=== API SUBPATH ROUTE HIT ===', suffix);
    proxyToLambda(req, res, `/${suffix}`);
});

// Render static files
app.use(express.static('public'));

// DUPLICATE ENDPOINT REMOVED - using the one at line 228

// REMOVED: /schema/* endpoint - now included in /schemas cache

// List schemas for a tenant (PROTECTED) - now returns compressed cache
app.get('/schemas', requireAuthentication, async (req, res) => {
    try {
        const tenantId = req.tenantId;
        console.log(`Listing schemas for tenant: ${tenantId}`);
        console.log(`Using bucket: ${BUCKET_NAME}`);
        console.log(`AWS Region: ${process.env.AWS_REGION || 'us-east-1'}`);
        
        // Get all schema files and their metadata
        const s3Objects = await s3.listObjectsV2({
            Bucket: BUCKET_NAME,
            Prefix: `schemas/${tenantId}/`,
            Delimiter: '/'
        }).promise();
        
        console.log(`S3 response:`, JSON.stringify(s3Objects, null, 2));
        
        // Filter for .json and .properties files and create metadata
        const schemaFiles = s3Objects.Contents
            ?.filter(obj => obj.Key.endsWith('.json') || obj.Key.endsWith('.properties'))
            ?.map(obj => ({
                key: obj.Key,
                name: path.basename(obj.Key),
                lastModified: obj.LastModified,
                size: obj.Size
            })) || [];
        
        const schemaMetadata = {
            files: schemaFiles,
            lastModified: new Date().toISOString()
        };
        
        console.log(`Found schema files:`, schemaFiles.map(f => f.name));

        // Try to get cached version first
        const cachedData = await getSchemaCache(tenantId, schemaMetadata);

        if (cachedData) {
            console.log(`Returning cached schemas for tenant ${tenantId}`);
            res.set('Content-Type', 'application/gzip');
            res.set('Content-Encoding', 'gzip');
            res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
            res.send(cachedData);
            return;
        }

        // Cache miss - load all schemas and create cache
        console.log(`Cache miss for tenant ${tenantId}, loading schemas...`);

        const schemas = {};
        const properties = {};
        const looseEndpoints = [];

        // Load all schema files
        for (const file of schemaFiles) {
            try {
                const s3Object = await s3.getObject({
                    Bucket: BUCKET_NAME,
                    Key: file.key
                }).promise();

                if (file.name.endsWith('.json')) {
                    const schemaName = path.basename(file.name, '.json');
                    schemas[schemaName] = JSON.parse(s3Object.Body.toString());
                } else if (file.name.endsWith('.properties')) {
                    const propName = path.basename(file.name, '.properties');
                    const propertiesText = s3Object.Body.toString();

                    if (propName === 'endpoints') {
                        // Handle endpoints.properties specially - store as array of strings
                        const endpoints = propertiesText.split('\n')
                            .map(line => line.trim())
                            .filter(line => line && !line.startsWith('#'));
                        looseEndpoints.push(...endpoints);
                    } else {
                        // Parse other properties from text format to object
                        const parsedProperties = {};
                        const lines = propertiesText.split('\n');
                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (trimmed && !trimmed.startsWith('#')) {
                                const equalIndex = trimmed.indexOf('=');
                                if (equalIndex > 0) {
                                    const key = trimmed.substring(0, equalIndex).trim();
                                    const value = trimmed.substring(equalIndex + 1).trim().replace(/^['"]|['"]$/g, '');
                                    parsedProperties[key] = value;
                                }
                            }
                        }
                        properties[propName] = parsedProperties;
                    }
                }
            } catch (error) {
                console.error(`Error loading schema file ${file.key}:`, error);
            }
        }

        // Create cache
        const cacheResult = await createSchemaCache(tenantId, schemas, properties, looseEndpoints, schemaMetadata);

        // Calculate data size for token debiting
        const dataSizeBytes = cacheResult.compressedData.length;
        const dataSizeMB = Math.floor(dataSizeBytes / (1024 * 1024)); // Round up to MB

        // Debit pageload tokens (1 token minimum, plus 1 for every 30 schemas, plus 1 for every 1MB)
        const tokensDebited = await debitPageloadTokens(tenantId, dataSizeMB);

        console.log(`🔍 SCHEMAS DEBUG: tokensDebited=${tokensDebited}, PAYMENT_ENABLED=${PAYMENT_ENABLED}`);
        console.log(`🔍 SCHEMAS DEBUG: typeof PAYMENT_ENABLED=${typeof PAYMENT_ENABLED}`);
        console.log(`🔍 SCHEMAS DEBUG: PAYMENT_ENABLED === true: ${PAYMENT_ENABLED === true}`);
        console.log(`🔍 SCHEMAS DEBUG: PAYMENT_ENABLED === false: ${PAYMENT_ENABLED === false}`);

        // TEMPORARY FIX: Always allow schemas for now - remove 402 check entirely
        console.log(`✅ TEMPORARY FIX: Allowing schemas request regardless of payment status`);

        // Return compressed cache
        res.set('Content-Type', 'application/gzip');
        res.set('Content-Encoding', 'gzip');
        res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
        res.send(cacheResult.compressedData);

    } catch (error) {
        console.error(`Error listing schemas for tenant ${req.tenantId}:`, error);
        console.error(`Error details:`, {
            message: error.message,
            code: error.code,
            stack: error.stack,
            url: req.url,
            tenant: req.tenantId
        });
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message
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