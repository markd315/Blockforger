// Load Node modules
var express = require('express');
// Initialise Express
var app = express();
var serveIndex = require('serve-index')
// Render static files
app.use(express.static('public'));
app.use('/schema', express.static('schema'), serveIndex('schema', {'icons': false}));
app.use('/serverConfig.json', express.static('serverConfig.json'));
app.use('/msg', express.static('msg'));
app.use('/media', express.static('media'));
// Port website will run on
app.listen(8080);