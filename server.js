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
        
        // Check user scopes for this tenant (call Lambda function)
        const userScopes = await getUserScopesFromLambda(googleUserId, tenantId);
        
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

// Helper function to get user scopes from DynamoDB for a specific tenant
async function getUserScopesFromLambda(googleUserId, tenantId) {
    try {
        console.log(`Checking scopes for user ${googleUserId} in tenant ${tenantId}`);
        
        const result = await dynamodb.get({
            TableName: DYNAMODB_TABLE,
            Key: {
                tenantId: tenantId,  // Partition key
                google_user_id: googleUserId  // Sort key
            }
        }).promise();
        
        if (result.Item && result.Item.scopes) {
            console.log(`Found explicit scopes for user ${googleUserId} in tenant ${tenantId}:`, result.Item.scopes);
            return result.Item.scopes;
        } else {
            console.log(`No explicit scopes found for user ${googleUserId} in tenant ${tenantId}`);
            // Return empty array - default READ access will be granted by authentication logic
            // Only explicit WRITE/ADMIN permissions are stored in DynamoDB
            return [];
        }
        
    } catch (error) {
        console.error('Error getting user scopes from DynamoDB:', error);
        return [];
    }
}

// Test route to verify server is working
app.get('/test', (req, res) => {
    res.json({ message: 'Server is working!', timestamp: new Date().toISOString() });
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

// Endpoint to check user permissions for a specific tenant
app.get('/check-permissions', async (req, res) => {
    const tenantId = req.query.tenant;
    const authHeader = req.headers.authorization;
    
    if (!tenantId) {
        return res.status(400).json({ error: 'tenant parameter required' });
    }
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
            error: 'Authentication required',
            permissions: { read: false, write: false, admin: false }
        });
    }
    
    try {
        const accessToken = authHeader.replace('Bearer ', '');
        const authResult = await verifyGoogleTokenAndScopes(accessToken, tenantId, 'read');
        
        if (!authResult.valid) {
            return res.status(401).json({ 
                error: 'Authentication failed',
                permissions: { read: false, write: false, admin: false }
            });
        }
        
        // Determine user permissions for this tenant
        const permissions = {
            read: true, // All authenticated users get READ by default
            write: authResult.scopes.includes('write') || authResult.scopes.includes('admin'),
            admin: authResult.scopes.includes('admin')
        };
        
        res.json({
            user: {
                googleUserId: authResult.google_user_id,
                email: authResult.user_email
            },
            tenant: tenantId,
            permissions: permissions,
            explicitScopes: authResult.scopes
        });
        
    } catch (error) {
        console.error('Error checking permissions:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            permissions: { read: false, write: false, admin: false }
        });
    }
});

// API proxy endpoint for Lambda functions
app.post('/api', async (req, res) => {
    console.log('=== API ROUTE HIT ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    console.log('Headers:', req.headers);
    
    try {
        console.log('=== API PROXY REQUEST ===');
        console.log('Request body:', JSON.stringify(req.body, null, 2));
        
        const requestData = JSON.stringify(req.body);
        const url = new URL(LAMBDA_API_URL);
        
        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestData)
            }
        };
        
        console.log('Proxying to Lambda API:', LAMBDA_API_URL);
        console.log('Request options:', options);
        
        const proxyReq = https.request(options, (proxyRes) => {
            console.log('Lambda API response status:', proxyRes.statusCode);
            console.log('Lambda API response headers:', proxyRes.headers);
            
            let responseData = '';
            
            proxyRes.on('data', (chunk) => {
                responseData += chunk;
            });
            
            proxyRes.on('end', () => {
                console.log('Lambda API response body:', responseData);
                
                // Forward the response status and headers
                res.status(proxyRes.statusCode);
                
                // Copy relevant headers
                if (proxyRes.headers['content-type']) {
                    res.set('Content-Type', proxyRes.headers['content-type']);
                }
                if (proxyRes.headers['access-control-allow-origin']) {
                    res.set('Access-Control-Allow-Origin', proxyRes.headers['access-control-allow-origin']);
                }
                
                // Send the response body
                res.send(responseData);
            });
        });
        
        proxyReq.on('error', (error) => {
            console.error('Proxy request error:', error);
            res.status(500).json({
                error: 'Failed to connect to Lambda API',
                details: error.message
            });
        });
        
        // Send the request data
        proxyReq.write(requestData);
        proxyReq.end();
        
    } catch (error) {
        console.error('API proxy error:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
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