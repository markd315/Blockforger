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

// Dynamic schema endpoint that loads from S3 based on tenant
app.get('/schema/*', async (req, res) => {
    try {
        const schemaPath = req.params[0];
        const tenantId = req.tenantId;
        const s3Key = `schemas/${tenantId}/${schemaPath}`;
        
        console.log(`Loading schema: ${schemaPath} for tenant: ${tenantId}`);
        console.log(`S3 Key: ${s3Key}`);
        console.log(`Bucket: ${BUCKET_NAME}`);
        
        const s3Object = await s3.getObject({
            Bucket: BUCKET_NAME,
            Key: s3Key
        }).promise();
        
        console.log(`Successfully loaded schema: ${schemaPath}`);
        
        res.set('Content-Type', 'application/json');
        res.send(s3Object.Body);
        
    } catch (error) {
        console.error(`Error loading schema ${req.params[0]} for tenant ${req.tenantId}:`, error);
        console.error(`Error details:`, {
            message: error.message,
            code: error.code,
            statusCode: error.statusCode,
            requestId: error.requestId
        });
        
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


// Serve other static files
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