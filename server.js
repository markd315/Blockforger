// Load Node modules
var express = require('express');
var AWS = require('aws-sdk');
var path = require('path');

// Initialise Express
var app = express();
var serveIndex = require('serve-index')

// Configure AWS SDK
AWS.config.update({
    region: process.env.AWS_REGION || 'us-east-1'
});

const s3 = new AWS.S3();
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'universal-frontend-720291373173-dev';

// Middleware to extract tenant ID from query parameters
app.use((req, res, next) => {
    // Use query parameter for tenant, fallback to 'default'
    req.tenantId = req.query.tenant || 'default';
    next();
});

// Render static files
app.use(express.static('public'));

// Simple endpoint for tenant.properties - hardcoded filename
app.get('/tenant-properties', async (req, res) => {
    try {
        const tenantId = req.query.tenant;
        console.log(`=== TENANT PROPERTIES REQUEST ===`);
        console.log(`Tenant ID: ${tenantId}`);
        console.log(`Tenant ID type: ${typeof tenantId}`);
        
        if (!tenantId || tenantId === 'default') {
            console.log('Default tenant - no properties to load');
            res.status(404).send('No tenant properties for default tenant');
            return;
        }

        const s3Key = `schemas/${tenantId}/tenant.properties`;
        console.log(`S3 Key: ${s3Key}`);
        console.log(`Bucket: ${BUCKET_NAME}`);
        console.log(`Region: ${process.env.AWS_REGION || 'us-east-1'}`);

        // First check if the object exists
        try {
            await s3.headObject({
                Bucket: BUCKET_NAME,
                Key: s3Key
            }).promise();
            console.log(`✅ S3 object exists: ${s3Key}`);
        } catch (headError) {
            if (headError.code === 'NoSuchKey') {
                console.error(`❌ S3 object does not exist: ${s3Key}`);
                console.error(`Available objects in schemas/${tenantId}/:`);
                
                // List what's actually in that directory
                try {
                    const listResult = await s3.listObjectsV2({
                        Bucket: BUCKET_NAME,
                        Prefix: `schemas/${tenantId}/`,
                        MaxKeys: 10
                    }).promise();
                    
                    if (listResult.Contents && listResult.Contents.length > 0) {
                        console.log('Found objects:');
                        listResult.Contents.forEach(obj => {
                            console.log(`  - ${obj.Key}`);
                        });
                    } else {
                        console.log('No objects found in directory');
                    }
                } catch (listError) {
                    console.error('Failed to list objects:', listError);
                }
                
                res.status(404).send(`Tenant properties not found: ${s3Key}`);
                return;
            } else {
                console.error(`Head object check failed: ${headError.code}`);
                throw headError;
            }
        }

        const s3Object = await s3.getObject({
            Bucket: BUCKET_NAME,
            Key: s3Key
        }).promise();

        const propertiesContent = s3Object.Body.toString('utf8');
        console.log(`Properties file content length: ${propertiesContent.length}`);
        console.log(`Properties preview: ${propertiesContent.substring(0, 200)}`);
        
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.send(propertiesContent);

    } catch (error) {
        console.error(`=== TENANT PROPERTIES ERROR ===`);
        console.error(`Error:`, error);
        console.error(`Error code: ${error.code}`);
        console.error(`Error message: ${error.message}`);
        
        if (error.code === 'NoSuchKey') {
            res.status(404).send('Tenant properties not found');
        } else {
            res.status(500).send(`Internal server error: ${error.message}`);
        }
    }
});

// Dynamic schema endpoint that loads from S3 based on tenant
app.get('/schema/*', async (req, res) => {
    try {
        const schemaPath = req.params[0];
        const tenantId = req.query.tenant;
        const s3Key = `schemas/${tenantId}/${schemaPath}`;

        console.log(`Loading schema: ${schemaPath} for tenant: ${tenantId}`);
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
        console.error(`Error loading schema ${req.params[0]} for tenant ${req.query.tenant}:`, error);

        if (error.code === 'NoSuchKey') {
            res.status(404).json({
                error: 'Schema not found',
                schema: req.params[0],
                tenant: req.query.tenant,
                s3Key: `schemas/${req.query.tenant}/${req.params[0]}`
            });
        } else {
            res.status(500).json({
                error: 'Internal server error',
                details: error.message,
                schema: req.params[0],
                tenant: req.query.tenant
            });
        }
    }
});

// List schemas for a tenant
app.get('/schemas', async (req, res) => {
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