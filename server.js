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
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'universal-frontend-123456789-dev';

// Middleware to extract tenant ID from hostname
app.use((req, res, next) => {
    const hostname = req.hostname;
    const tenantMatch = hostname.match(/^([^.]+)\.frontend2\.zanzalaz\.com$/);
    
    if (tenantMatch) {
        req.tenantId = tenantMatch[1];
    } else {
        // Fallback for local development
        req.tenantId = req.query.tenant || 'default';
    }
    
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
        
        const s3Object = await s3.getObject({
            Bucket: BUCKET_NAME,
            Key: s3Key
        }).promise();
        
        res.set('Content-Type', 'application/json');
        res.send(s3Object.Body);
        
    } catch (error) {
        console.error(`Error loading schema ${req.params[0]} for tenant ${req.tenantId}:`, error);
        
        if (error.code === 'NoSuchKey') {
            res.status(404).json({ error: 'Schema not found' });
        } else {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

// List schemas for a tenant
app.get('/schemas', async (req, res) => {
    try {
        const tenantId = req.tenantId;
        
        const s3Objects = await s3.listObjectsV2({
            Bucket: BUCKET_NAME,
            Prefix: `schemas/${tenantId}/`,
            Delimiter: '/'
        }).promise();
        
        const schemas = s3Objects.Contents
            ?.filter(obj => obj.Key.endsWith('.json'))
            ?.map(obj => path.basename(obj.Key)) || [];
        
        res.json(schemas);
        
    } catch (error) {
        console.error(`Error listing schemas for tenant ${req.tenantId}:`, error);
        res.status(500).json({ error: 'Internal server error' });
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
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});