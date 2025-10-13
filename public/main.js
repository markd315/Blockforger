var serverConfig = {};
var accessToken = undefined;
var schemaLibrary = {};

global.getSchemaLibrary = function(){
    return schemaLibrary;
}

var ajv = undefined;

global.passSchemaToMain = function(name, schema){
    schemaLibrary[name] = schema;
}

// REMOVED: This function was incorrectly stripping essential schema fields like 'type' and 'default'
// global.dropCustomFieldsFromSchema = function(schema){
//     if(schema == undefined){
//         return undefined;
//     }
//     
//     console.log(`Dropping custom fields from schema:`, schema);
//     
//     for(let k in schema){
//         if(k == 'apiCreationStrategy' || k == 'color' || k == 'endpoint' || k == 'type' || k == 'default' || k == 'childRefToParent'){
//             console.log(`Removing custom field: ${k}`);
//             delete schema[k];
//         }else{
//             if(schema[k] != undefined && schema[k] === Object(schema[k])){
//                 schema[k] = dropCustomFieldsFromSchema(schema[k]);
//             }
//         }
//     }
//     
//     console.log(`Schema after dropping custom fields:`, schema);
//     return schema;
// }

global.loadConfig = function (name){
    serverConfig = require('../serverConfig.json');
    const Ajv2019 = require("ajv/dist/2019")
    const addFormats = require("ajv-formats")
    //These are both illegal in the browser but when built into bundle.js it works.
    ajv = new Ajv2019({strictTypes: false, allErrors: true});
    addFormats(ajv);
}

// Global function to access tenant properties - these are PRIMARY configuration values
global.getTenantProperties = function() {
    if (window.tenantProperties && Object.keys(window.tenantProperties).length > 0) {
        return window.tenantProperties;
    } else {
        console.warn('getTenantProperties: No tenant properties found, returning null');
        return null;
    }
}

// Global function to get tenant ID
global.getCurrentTenantId = function() {
    return window.currentTenantId || 'default';
}

// Debug function to show tenant properties state
global.debugTenantProperties = function() {
    console.log('=== TENANT PROPERTIES DEBUG ===');
    console.log('window.tenantProperties:', window.tenantProperties);
    console.log('window.currentTenantId:', window.currentTenantId);
    console.log('window.currentS3BlockLoader:', window.currentS3BlockLoader);
    if (window.currentS3BlockLoader) {
        console.log('currentS3BlockLoader.tenantProperties:', window.currentS3BlockLoader.tenantProperties);
    }
    console.log('getTenantProperties():', this.getTenantProperties());
    console.log('getCurrentTenantId():', this.getCurrentTenantId());
    console.log('=== END TENANT PROPERTIES DEBUG ===');
}

global.listSchemasInAJV = function() {
    if (!ajv) {
        console.log('AJV not initialized');
        return [];
    }
    
    const schemas = [];
    for (const key in ajv.schemas) {
        schemas.push(key);
    }
    //console.log('Available schemas in AJV:', schemas);
    return schemas;
}

// Function to check the current state of schema loading
global.debugSchemaState = function() {

    if (ajv) {
        this.listSchemasInAJV();
    }
    
    if (typeof window.getSchemaLibrary === 'function') {
        const schemaLib = window.getSchemaLibrary();
        console.log('Schema Library:', schemaLib);
    }
    
    console.log('=== End Schema State Debug ===');
}

// Function to check if a schema contains Blockly properties
global.checkSchemaForBlocklyProps = function(schemaName) {
    if (!ajv) {
        console.log('AJV not initialized');
        return;
    }
    
    const schemaKey = schemaName + ".json";
    const schemaKeyAlt = schemaName;
    
    let schema = ajv.getSchema(schemaKey) || ajv.getSchema(schemaKeyAlt);
    if (schema) {
        const blocklyProperties = ['color', 'apiCreationStrategy', 'endpoint', 'childRefToParent', 'format', 'uri', 'routeSuffix', 'endpoints'];
        const foundProps = blocklyProperties.filter(prop => prop in schema);
        if (foundProps.length > 0) {
            console.warn(`WARNING: Schema ${schemaName} in AJV contains Blockly properties:`, foundProps);
            console.log('Schema:', schema);
        } else {
            console.log(`Schema ${schemaName} in AJV is clean (no Blockly properties)`);
        }
    } else {
        console.log(`Schema ${schemaName} not found in AJV`);
    }
}

// Function to check if schemas are ready for validation
global.areSchemasReady = function() {
    return ajv && Object.keys(ajv.schemas || {}).length > 0;
}

// formatValidationErrors is now handled by validations.js module

global.retryValidation = function(workspace) {
    if (this.areSchemasReady()) {
        console.log('Schemas are now ready, retrying validation');
        this.updateJSONarea(workspace);
    } else {
        // Wait a bit and try again
        setTimeout(() => this.retryValidation(workspace), 100);
    }
}

function convertCustomTypesToJsonSchema(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    
    if (Array.isArray(obj)) {
        return obj.map(item => convertCustomTypesToJsonSchema(item));
    }
    
    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
        if (key === 'type') {
            if (value === 'dictionary') {
                // Convert custom 'dictionary' type to standard 'object' for AJV
                converted[key] = 'object';
            } else if (value === '$ref') {
                // Convert invalid $ref type to string as fallback
                converted[key] = 'string';
                console.warn('Converted invalid $ref type to string');
            } else {
                converted[key] = value;
            }
        } else if (key === '$ref' && value === '$ref') {
            // Skip invalid $ref values
            continue;
        } else if (typeof value === 'object') {
            converted[key] = convertCustomTypesToJsonSchema(value);
        } else {
            converted[key] = value;
        }
    }
    
    return converted;
}

global.addSchemaToValidator = function(schemaName, schema) {
    if (!schema) {
        console.warn(`Cannot add schema ${schemaName}: schema is undefined`);
        return;
    }
    
    // Initialize AJV if it hasn't been initialized yet
    if (!ajv) {
        try {
            console.log('Initializing AJV for first schema');
            console.log('Global Ajv available:', typeof Ajv !== 'undefined');
            console.log('Global Ajv value:', Ajv);
            
            // Use the global Ajv if available (from CDN), otherwise skip
            if (typeof Ajv !== 'undefined') {
                console.log('Creating new Ajv instance with options: {strictTypes: false, allErrors: true, strict: false}');
                ajv = new Ajv({
                    strictTypes: false, 
                    allErrors: true, 
                    strict: false,
                    validateFormats: true,  // Enable format validation
                    unknownFormats: 'ignore'  // Ignore unknown formats like "uri"
                });
                
                // ajv-formats is already added in loadConfig when using bundled version
                
                console.log('AJV initialized successfully:', ajv);
                console.log('AJV instance type:', typeof ajv);
                console.log('AJV has addSchema method:', typeof ajv.addSchema === 'function');
            } else {
                console.warn('Ajv not available globally - validation will be skipped');
                return;
            }
        } catch (e) {
            console.error('Failed to initialize AJV:', e);
            console.error('Error stack:', e.stack);
            return;
        }
    }
    
    if (ajv) {
        // Create a deep copy and clean the schema for AJV
        let cleanSchema;
        try {
            cleanSchema = JSON.parse(JSON.stringify(schema));
        } catch (e) {
            console.warn(`Failed to deep copy schema for ${schemaName}:`, e);
            cleanSchema = { ...schema };
        }
        
        // Remove Blockly-specific properties and invalid JSON Schema keywords
        const blocklyProperties = ['color', 'apiCreationStrategy', 'endpoint', 'childRefToParent', 'stringify', 'format', 'uri', 'routeSuffix', 'endpoints'];
        blocklyProperties.forEach(prop => {
            if (prop in cleanSchema) {
                delete cleanSchema[prop];
            }
        });
        
        // Clean up invalid $ref values that aren't valid JSON Schema
        if (cleanSchema.properties) {
            for (const [propName, propDef] of Object.entries(cleanSchema.properties)) {
                if (propDef && typeof propDef === 'object') {
                    // Fix invalid $ref values
                    if (propDef.$ref && propDef.$ref === '$ref') {
                        delete propDef.$ref;
                        console.warn(`Removed invalid $ref value from property ${propName}`);
                    }
                    // Remove Blockly-specific properties from nested properties
                    if (propDef.stringify !== undefined) {
                        delete propDef.stringify;
                    }
                    if (propDef.routeSuffix !== undefined) {
                        delete propDef.routeSuffix;
                    }
                }
            }
        }
        
        // Convert custom types to JSON Schema compatible types
        cleanSchema = convertCustomTypesToJsonSchema(cleanSchema);
        
        const schemaKey = schemaName + ".json";
        console.log(`Adding clean schema to AJV: ${schemaKey}`, cleanSchema);
        
        try {
            ajv.addSchema(cleanSchema, schemaKey);
            console.log(`Schema ${schemaKey} added to AJV without errors`);
        } catch (e) {
            console.error(`Error adding schema ${schemaKey} to AJV:`, e);
            return;
        }
        
        // Verify the schema was added
        const addedSchema = ajv.getSchema(schemaKey);
        if (addedSchema) {
            console.log(`Schema ${schemaKey} successfully added to AJV`);
        }
    }
}

global.getToken = function (serverConfig){
    let xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
        accessToken = JSON.parse(this.responseText)['access_token'];
    }
    };
    xhttp.open("POST", serverConfig.authorizationServer, true);
    xhttp.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
    xhttp.send("grant_type=client_credentials&client_id=" + serverConfig.client_id + "&client_secret=" + serverConfig.client_secret);
    return accessToken;
}

loadConfig();


var idsFromChildren = {};

global.childBlockFromBlock = function (property, sendingBlock){
    if(sendingBlock == undefined){
        return undefined;
    }
    for(var idx in sendingBlock.inputList) {
        let input = sendingBlock.inputList[idx];
        //console.log(input);
        let fields = input.fieldRow;
        if(fields == undefined || fields.length < 2){
            return undefined;
        }
        // Check if connection exists and has targetConnection before accessing it
        if(input.connection && input.connection.targetConnection){
            if(fields[0].getText && fields[0].getText() == property){ //for required fields
                return input.connection.targetConnection.getSourceBlock();
            }
            if(fields[1].getText && fields[1].getText() == property){ //for optional fields (-) precedes
                return input.connection.targetConnection.getSourceBlock();
            }
        }
    }
}
global.childFirstBodyIdStrategy = function (sendingBlock, mySchema){
    if(mySchema == undefined){
        return;
    }
    for(var propertyName in mySchema.properties){
        let property = mySchema.properties[propertyName];
        //Handle dict
        if(property.apiCreationStrategy == 'childFirstBodyId' && property['$ref'] != undefined && sendingBlock != undefined){
            let block = childBlockFromBlock(propertyName, sendingBlock);
            //childFirstBodyIdStrategy(block, block.type);
            let obj = Blockly.JSON.generalBlockToObj(block);
            sendSingleRequest("POST", JSON.stringify(obj), block.type, propertyName, "", block);
            //This is sending a second request with the same breakdown
        }
        if(property.apiCreationStrategy == 'childFirstBodyId' && property.type == 'array' && property.items['$ref'] != undefined){
            let arrBlock = childBlockFromBlock(propertyName, sendingBlock);
            for(let idx in arrBlock.childBlocks_){
                let block = arrBlock.childBlocks_[idx];
                //childFirstBodyIdStrategy(block, block.type);
                let obj = Blockly.JSON.generalBlockToObj(block);
                sendSingleRequest("POST", JSON.stringify(obj), block.type, propertyName + idx + "_idx", "", block);
                //This is sending a second request with the same breakdown
            }
        }
    }
}

global.createDirectChildren = function (children, childTypes, childBlocks, strategies, childRoutePrefix, parentId){
    //console.log(children);
    //console.log(childTypes);
    //console.log(childBlocks);
    //console.log(childRoutePrefix);
    for(var i in children){
        if(strategies[i] == "parentFirstRouteId"){
            console.log(childBlocks[i]);
            sendSingleRequest("POST", JSON.stringify(children[i]), childTypes[i], "parentFirst", childRoutePrefix, childBlocks[i]);
        }else{
            let fieldToReplace = strategies[i];
            children[i][fieldToReplace] = parentId;
            console.log(childBlocks[i]);
            sendSingleRequest("POST", JSON.stringify(children[i]), childTypes[i], "parentFirst", '', childBlocks[i]);
        }
    }
}

global.applyHeadersAndRoute = function (xhttp, requestType, serverConfig, fullRoute){
    // Add query parameters to the route
    const queryParams = getQueryParams();
    let finalRoute = fullRoute;
    
    if (Object.keys(queryParams).length > 0) {
        const urlParams = new URLSearchParams();
        Object.entries(queryParams).forEach(([key, value]) => {
            if (key && value) {
                urlParams.append(key, value);
            }
        });
        
        const queryString = urlParams.toString();
        if (queryString) {
            finalRoute += (fullRoute.includes('?') ? '&' : '?') + queryString;
        }
    }
    
    console.log(`Final route with query params: ${finalRoute}`);
    
    if(serverConfig.authType == "basic"){
        xhttp.open(requestType, finalRoute, false, serverConfig.user, serverConfig.pass);
        xhttp.setRequestHeader("Authorization", btoa(unescape(encodeURIComponent(serverConfig.user + ":" + serverConfig.pass))));
    }
    else if(serverConfig.authType == "client_credentials"){
        if(accessToken == undefined){
            getToken(serverConfig);
        }
        xhttp.open(requestType, finalRoute, false);
        xhttp.setRequestHeader("Authorization", accessToken);
    }
    else{
        console.log("Invalid authtype configured, inferring none");
        xhttp.open(requestType, finalRoute, false);
    }
    
    // Set default content type
    xhttp.setRequestHeader("Content-type", "application/json");
    
    // Add custom headers
    const customHeaders = getHeaders();
    Object.entries(customHeaders).forEach(([key, value]) => {
        if (key && value) {
            console.log(`Setting custom header: ${key} = ${value}`);
            xhttp.setRequestHeader(key, value);
        }
    });
}

global.pullUpIdsFromChildren = function (obj, idsFromChildren){
    var tmpJson = JSON.parse(obj);

    var tmpArrays = {};
        for(let childField in idsFromChildren){
            const regex = /(.*?)(\d*)(_idx)/gm;
            let m;
            while ((m = regex.exec(childField)) !== null) { // To handle arrays
                if (m.index === regex.lastIndex) {
                    regex.lastIndex++; // This is necessary to avoid infinite loops with zero-width matches
                }
                let arrayName = m[1];
                let idx = m[2];
                if(tmpArrays[arrayName] == undefined){
                    tmpArrays[arrayName] = [];
                }
                tmpArrays[arrayName][idx] = idsFromChildren[childField];
            }
            if(tmpJson[childField] != undefined) { //To handle non-arrays
                tmpJson[childField] = idsFromChildren[childField];
            }
        }
        for(let array in tmpArrays){
            tmpJson[array] = tmpArrays[array];
        }
        return JSON.stringify(tmpJson);
    }

global.assignApiCreationFieldOrStrategy = function(strategies, idx, elem){
    strategies[idx] = elem.apiCreationStrategy;
    if(elem.apiCreationStrategy == 'parentFirstBodyId'){
        strategies[idx] = elem.childRefToParent;
    }
}

global.removeChildrenFromParentBody = function(obj, type, sendingBlock, children, childTypes, childBlocks, strategies){
    var tmpJson = JSON.parse(obj);
    let mySchema = schemaLibrary[type];
    var idx = 0;
    for(var property in mySchema.properties) {
        let elem = mySchema.properties[property];
        let childBlock = childBlockFromBlock(property, sendingBlock);
        if(childBlock != undefined && (elem.apiCreationStrategy == 'parentFirstRouteId' || elem.apiCreationStrategy == 'parentFirstBodyId') ){
            if(elem.type == 'array' && elem.items['$ref'] != undefined){
                let arrBlock = childBlock;
                for(let arrIndex in arrBlock.childBlocks_){
                    let block = arrBlock.childBlocks_[arrIndex];
                    assignApiCreationFieldOrStrategy(strategies, idx, elem);
                    children[idx] = tmpJson[property][arrIndex];
                    childTypes[idx] = elem.items['$ref'].replace(".json","");
                    childBlocks[idx] = block;
                    idx+=1;
                }
                tmpJson[property] = undefined;
            }
            else if(elem['$ref'] != undefined){
                assignApiCreationFieldOrStrategy(strategies, idx, elem);
                children[idx] = tmpJson[property];
                childTypes[idx] = elem['$ref'].replace(".json","");
                childBlocks[idx] = childBlockFromBlock(property, sendingBlock);
                tmpJson[property] = undefined;
                idx+=1;
            }
        }
    }
    return JSON.stringify(tmpJson);
}

// Relax Static Typing: Convert all objects to dictionaries and arrays to dynarrays
global.relaxStaticTyping = function() {
    const workspace = Blockly.getMainWorkspace();
    
    if (!workspace) {
        console.warn('No workspace available');
        return;
    }
    
    // First, trigger the automatic update to updateJsonArea to overwrite it
    if (typeof updateJSONarea === 'function') {
        updateJSONarea(workspace);
    }
    
    // Clear the root schema textbox to ensure we don't use custom schema
    const textbox = document.getElementById('root_schema_type');
    if (textbox) {
        textbox.value = '';
    }
    
    // Then literally call Rebuild from JSON (which will use dictionary/dynarray)
    loadFromJson();
}

// Purge all blocks not attached to root/start block
global.purgeOrphanedBlocks = function(workspace) {
    if (!workspace) return;
    
    console.log('=== PURGING ORPHANED BLOCKS ===');
    
    const allBlocks = workspace.getAllBlocks();
    const startBlocks = allBlocks.filter(block => block.type === 'start');
    
    // Get all blocks that are connected to start blocks
    const connectedBlocks = new Set();
    
    startBlocks.forEach(startBlock => {
        // Add the start block itself
        connectedBlocks.add(startBlock);
        
        // Recursively add all connected blocks
        const addConnectedBlocks = (block) => {
            if (block.inputList) {
                block.inputList.forEach(input => {
                    if (input.connection && input.connection.targetBlock()) {
                        const targetBlock = input.connection.targetBlock();
                        if (!connectedBlocks.has(targetBlock)) {
                            connectedBlocks.add(targetBlock);
                            addConnectedBlocks(targetBlock);
                        }
                    }
                });
            }
        };
        
        addConnectedBlocks(startBlock);
    });
    
    // Dispose of all blocks that are not connected to start blocks
    let purgedCount = 0;
    allBlocks.forEach(block => {
        if (!connectedBlocks.has(block)) {
            console.log(`Purging orphaned block: ${block.type}`);
            block.dispose(true, true);
            purgedCount++;
        }
    });
    
    console.log(`Purged ${purgedCount} orphaned blocks`);
};

// Rebuild from JSON: Parse JSON and build workspace
global.loadFromJson = function() {
    const program = document.getElementById('json_area').value;
    const rootSchemaType = document.getElementById('root_schema_type').value.trim().toLowerCase();
    
    if (!program || program.trim() === '') {
        console.warn('No JSON data in textarea');
        return;
    }
    
    // Check if we should reload with custom root schema
    if (rootSchemaType && rootSchemaType !== 'dictionary' && rootSchemaType !== '') {
        console.log('Reloading page with custom root schema:', rootSchemaType);
        
        // Parse the JSON to ensure it's valid and potentially modify it for array/dict types
        let jsonData;
        try {
            jsonData = JSON.parse(program);
        } catch (e) {
            console.error('Invalid JSON in textarea:', e);
            alert('Invalid JSON: ' + e.message);
            return;
        }
        
        // Handle array and dict types by wrapping the data appropriately
        let processedData = jsonData;
        if (rootSchemaType.endsWith('_array')) {
            // For array types, ensure the data is wrapped in an array
            if (!Array.isArray(jsonData)) {
                processedData = [jsonData];
            }
        } else if (rootSchemaType.endsWith('_dict')) {
            // For dict types, ensure the data is an object
            if (Array.isArray(jsonData)) {
                // If it's an array, wrap it in an object
                processedData = { data: jsonData };
            } else if (typeof jsonData !== 'object' || jsonData === null) {
                // If it's a primitive, wrap it in an object
                processedData = { value: jsonData };
            }
        }
        // For all other types, use the data as-is
        
        // Convert back to JSON string
        const jsonString = JSON.stringify(processedData);
        
        // Get current URL parameters to preserve tenant and other params
        const urlParams = new URLSearchParams(window.location.search);
        
        // Serialize current headers, query params, and variables to URL
        const headers = getHeaders();
        const queryParams = getQueryParams();
        const variables = getVariables();
        
        if (Object.keys(headers).length > 0) {
            urlParams.set('headers', encodeURIComponent(JSON.stringify(headers)));
        }
        
        if (Object.keys(queryParams).length > 0) {
            urlParams.set('queryParams', encodeURIComponent(JSON.stringify(queryParams)));
        }
        
        if (Object.keys(variables).length > 0) {
            urlParams.set('variables', encodeURIComponent(JSON.stringify(variables)));
        }
        
        // Set the new parameters with proper encoding
        urlParams.set('initial', jsonString);
        urlParams.set('rootSchema', rootSchemaType);
        
        // Reload the page with all parameters preserved (including tenant)
        const newUrl = window.location.pathname + '?' + urlParams.toString();
        window.location.href = newUrl;
        return;
    }
    
    try {
        const workspace = Blockly.getMainWorkspace();
        
        // Check if Blockly.JSON.toWorkspace is available
        if (typeof Blockly.JSON.toWorkspace !== 'function') {
            console.error('Blockly.JSON.toWorkspace is not available. Make sure json-workspace-converter.js is loaded.');
            return;
        }
        
        // Save current serialization in jsonarea (as requested)
        const currentJson = document.getElementById('json_area').value;
        
        // Completely clear the workspace to prevent orphaned blocks
        workspace.clear();
        
        // Force a render update to ensure clearing is complete
        workspace.render();
        
        // Use the existing toWorkspace function which converts objects to dictionaries and arrays to dynarrays
        // This allows pasting in schemaless JSON for easy import
        Blockly.JSON.toWorkspace(program, workspace);
        
        // Purge all blocks not attached to root/start block
        purgeOrphanedBlocks(workspace);
        
        // Update JSON area after rebuilding
        if (typeof updateJSONarea === 'function') {
            updateJSONarea(workspace);
        }
    } catch (error) {
        console.error('Error parsing JSON or rebuilding workspace:', error);
        alert('Error parsing JSON: ' + error.message);
    }
}

global.sendSingleRequest = function (requestType, payload, type, propertyOrParent, routePrefix, block){ //if last param undefined, this is a parent request.
    childFirstBodyIdStrategy(block, schemaLibrary[type]);
    var parentIdForChildRequests = "";
    let origType = type;
    console.log(block);
    if(schemaLibrary[type] != undefined && schemaLibrary[type].endpoint != undefined){
        //console.log("Detected an overridden endpoint mapping");
        type = schemaLibrary[type].endpoint;
    }
    let xhttp = new XMLHttpRequest();
    // Use the route that's already constructed in the UI instead of reconstructing it
    var fullRoute = document.getElementById('full_route').value;
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4) {
            if(propertyOrParent == undefined){ //root request, just clear textbox and save nothing.
                document.getElementById('response_area').value = "status: " + this.status + "\nresponse: " + this.responseText;
            }
            if(propertyOrParent == "parentFirst"){ //add the child response after using the returned id.
                document.getElementById('response_area').value += "status: " + this.status + "\nresponse: " + this.responseText;
            }
            else{ //This is a child and the id must be saved for the parent's body.
                if(serverConfig.mockResponses){
                    let mocked = "{\"id\": \"2f02372d-a590-4c4b-b3e2-c070025a3b8e\", \"fakeRequest\": true}";
                    idsFromChildren[propertyOrParent] = JSON.parse(mocked)['id'];
                    document.getElementById('response_area').value += "status: 200\nresponse: " + mocked;
                }else{
                    idsFromChildren[propertyOrParent] = JSON.parse(this.responseText)['id'];
                    document.getElementById('response_area').value +="status: " + this.status + "\nresponse: " + this.responseText;
                }
            }
            if(serverConfig.mockResponses){ //Save the parent id no matter what, it may be needed regardless.
                let mocked = "{\"id\": \"3302372d-a590-4c4b-b3e2-c070025a3b8e\", \"fakeRequest\": true}";
                parentIdForChildRequests = JSON.parse(mocked)['id'];
            }else{
                parentIdForChildRequests = JSON.parse(this.responseText)['id'];
            }
        }
    };
    applyHeadersAndRoute(xhttp, requestType, serverConfig, fullRoute);

    //Modify bodies for child/parent handling prior to sending request.

    var tmpObj = pullUpIdsFromChildren(payload, idsFromChildren);

    var children = [];
    var childTypes = [];
    var childBlocks = [];
    var strategies = [];
    let finalObj = removeChildrenFromParentBody(tmpObj, origType, block, children, childTypes, childBlocks, strategies);
    if(requestType == 'POST' || requestType == 'PUT' || requestType == 'PATCH'){
        xhttp.send(finalObj);
    }
    else{
        xhttp.send();
    }
    var childRoutePrefix = "";
    if(children.length > 0){
        childRoutePrefix = routePrefix + "/" + type + "/" + parentIdForChildRequests;
    }
    createDirectChildren(children, childTypes, childBlocks, strategies, childRoutePrefix, parentIdForChildRequests);
}

var rootBlock;
global.sendRequests = function (requestType) {
    let payload = document.getElementById('json_area').value;
    
    // Handle GET requests differently - no need for complex block traversal
    if (requestType === 'GET') {
        let xhttp = new XMLHttpRequest();
        let fullRoute = document.getElementById('full_route').value;
        
        xhttp.onreadystatechange = function() {
            if (this.readyState == 4) {
                if (this.status === 200) {
                    try {
                        const responseData = JSON.parse(this.responseText);
                        
                        // Extract the resource type from the URL by comparing with tenant route
                        let resourceType = 'object';
                        const tenantProps = window.tenantProperties || {};
                        const tenantRoute = tenantProps.route || '';
                        
                        if (tenantRoute && fullRoute.startsWith(tenantRoute)) {
                            // Remove the tenant route from the full route to get the remaining path
                            const remainingPath = fullRoute.substring(tenantRoute.length);
                            const pathParts = remainingPath.split('/').filter(part => part.length > 0);
                            
                            // The first part after the tenant route is the resource type
                            if (pathParts.length > 0) {
                                resourceType = pathParts[0];
                            }
                        } else {
                            // Fallback: try to extract from URL path segments
                            const urlParts = fullRoute.split('/');
                            for (let i = urlParts.length - 1; i >= 0; i--) {
                                if (urlParts[i] && urlParts[i] !== '' && !urlParts[i].match(/^\d+$/)) {
                                    resourceType = urlParts[i];
                                    break;
                                }
                            }
                        }
                        
                        // Determine if this is a list or single object based on ACTUAL response data
                        const isListResponse = Array.isArray(responseData);
                        
                        // Set the root schema type based on actual response structure
                        const rootSchemaType = isListResponse ? `${resourceType}_array` : resourceType;
                        document.getElementById('root_schema_type').value = rootSchemaType;
                        
                        // Populate the JSON area with the response
                        document.getElementById('json_area').value = JSON.stringify(responseData, null, 2);
                        
                        // Show success in response area
                        document.getElementById('response_area').value = `GET successful - ${isListResponse ? 'List' : 'Single'} ${resourceType} retrieved`;
                        document.getElementById('response_area').style['background-color'] = '#9f9';
                        
                    } catch (e) {
                        document.getElementById('response_area').value = `Error parsing response: ${e.message}`;
                        document.getElementById('response_area').style['background-color'] = '#f99';
                    }
                } else {
                    document.getElementById('response_area').value = `GET failed - Status: ${this.status}\nResponse: ${this.responseText}`;
                    document.getElementById('response_area').style['background-color'] = '#f99';
                }
            }
        };
        
        applyHeadersAndRoute(xhttp, requestType, serverConfig, fullRoute);
        xhttp.send();
        return;
    }
    
    // For other request types, use the complex block traversal logic
    let topBlocks = Blockly.getMainWorkspace().getTopBlocks(false);
    
    console.log('sendRequests: Found', topBlocks.length, 'top blocks');
    console.log('sendRequests: Top blocks:', topBlocks.map(b => ({ type: b.type, hasChildren: b.getChildren ? b.getChildren().length : 0, hasChildBlocks_: b.childBlocks_ ? b.childBlocks_.length : 0 })));
    
    // Safely get the root block - look for the first block that has children
    rootBlock = null;
    for (let i = 0; i < topBlocks.length; i++) {
        const block = topBlocks[i];
        console.log(`sendRequests: Checking block ${i}:`, { type: block.type, hasGetChildren: !!block.getChildren, hasChildBlocks_: !!block.childBlocks_ });
        
        if (block && block.getChildren && block.getChildren().length > 0) {
            rootBlock = block.getChildren()[0];
            console.log('sendRequests: Found root block via getChildren():', rootBlock.type);
            break;
        }
        // Fallback: check childBlocks_ property
        if (block && block.childBlocks_ && block.childBlocks_.length > 0) {
            rootBlock = block.childBlocks_[0];
            console.log('sendRequests: Found root block via childBlocks_:', rootBlock.type);
            break;
        }
    }
    
    if (!rootBlock) {
        console.error('No root block found in workspace');
        document.getElementById('response_area').value = "Error: No root block found in workspace";
        return;
    }
    
    if(serverConfig == {}){
        loadConfig();
    }
    var rootType = rootBlock.type;
    console.log('sendRequests: Using root type:', rootType);
    sendSingleRequest(requestType, payload, rootType, undefined, "", rootBlock);
}



global.constructFullRoute = function(routePrefix, blockIn) {
    var fullRoute = "";
    var corsProxy = null;
    var baseUrl = serverConfig.baseUrl;
    var tenantProps = null;
    
    // Get tenant properties if available
    if (window.tenantProperties && Object.keys(window.tenantProperties).length > 0) {
        tenantProps = window.tenantProperties;
        
        if (tenantProps.corsProxy !== undefined && tenantProps.corsProxy !== null && tenantProps.corsProxy !== '') {
            corsProxy = tenantProps.corsProxy;
        }
        if (tenantProps.route !== undefined && tenantProps.route !== null && tenantProps.route !== '') {
            baseUrl = tenantProps.route;
        }
    }
    
    // Fallback to serverConfig ONLY if tenant values not available
    if (corsProxy === null && serverConfig.corsProxy !== undefined) {
        corsProxy = serverConfig.corsProxy;
        console.log('constructFullRoute: Using serverConfig corsProxy fallback:', corsProxy);
    }
    
    // Add corsProxy if available
    if (corsProxy !== null && corsProxy !== '') {
        fullRoute = corsProxy;
        
        // Strip protocol from baseUrl if it already has one (to prevent double protocols)
        let cleanBaseUrl = baseUrl;
        if (baseUrl.startsWith('http://') || baseUrl.startsWith('https://')) {
            cleanBaseUrl = baseUrl.replace(/^https?:\/\//, '');
        }
        
        // Check tenant config for whether to append block type to route
        if (tenantProps && tenantProps.change_route_suffix_for_block === "true") {
            var type = blockIn.type;
            if(schemaLibrary[type] != undefined && schemaLibrary[type].endpoint != undefined){
                type = schemaLibrary[type].endpoint;
            }
            // Append block type to route
            fullRoute += cleanBaseUrl + routePrefix + "/" + type;
            console.log('constructFullRoute: Appending block type to route (tenant config enabled)');
        } else {
            // Don't append block type - just use base URL
            fullRoute += cleanBaseUrl + routePrefix;
            console.log('constructFullRoute: NOT appending block type to route (tenant config disabled or not set)');
        }
    } else {
        // No corsProxy, use baseUrl as-is (with protocol if it has one)
        // Check tenant config for whether to append block type to route
        if (tenantProps && tenantProps.change_route_suffix_for_block === "true") {
            var type = blockIn.type;
            if(schemaLibrary[type] != undefined && schemaLibrary[type].endpoint != undefined){
                type = schemaLibrary[type].endpoint;
            }
            // Append block type to route
            fullRoute += baseUrl + routePrefix + "/" + type;
            console.log('constructFullRoute: Appending block type to route (tenant config enabled)');
        } else {
            // Don't append block type - just use base URL
            fullRoute += baseUrl + routePrefix;
            console.log('constructFullRoute: NOT appending block type to route (tenant config disabled or not set)');
        }
    }
    
    // Append routeSuffix if available on the schema
    const blockType = blockIn.type;
    if (schemaLibrary[blockType] && schemaLibrary[blockType].routeSuffix !== undefined && schemaLibrary[blockType].routeSuffix !== null && schemaLibrary[blockType].routeSuffix !== '') {
        fullRoute += schemaLibrary[blockType].routeSuffix;
        console.log('constructFullRoute: Appending routeSuffix from schema:', schemaLibrary[blockType].routeSuffix);
    }
    
    console.log('constructFullRoute: Final route constructed:', fullRoute);
    
    if(document.getElementById('path_id').value != ''){
        fullRoute += '/' + document.getElementById('path_id').value;
        document.getElementById('post').style['background-color'] = '#000';
        document.getElementById('post').disabled = true;
        document.getElementById('put').style['background-color'] = '#22e';
        document.getElementById('put').disabled = false;
        document.getElementById('patch').style['background-color'] = '#888';
        document.getElementById('patch').disabled = false;
        document.getElementById('delete').style['background-color'] = '#e22';
        document.getElementById('delete').disabled = false;
    }else{
        document.getElementById('post').style['background-color'] = '#ee2';
        document.getElementById('post').disabled = false;
        document.getElementById('put').style['background-color'] = '#000';
        document.getElementById('put').disabled = true;
        document.getElementById('patch').style['background-color'] = '#000';
        document.getElementById('patch').disabled = true;
        document.getElementById('delete').style['background-color'] = '#000';
        document.getElementById('delete').disabled = true;
    }
    return fullRoute;
}


// Function to update endpoint dropdown based on current root block
global.updateEndpointDropdown = function(rootBlock) {
    const endpointSelector = document.getElementById('endpoint_selector');
    if (!endpointSelector) {
        console.warn('Endpoint selector not found');
        return;
    }
    
    // Clear existing options except the default
    endpointSelector.innerHTML = '<option value="">Select Endpoint</option>';
    
    // Check if root block has no child (childless)
    const hasChild = rootBlock && rootBlock.getChildren && rootBlock.getChildren().length > 0;
    
    if (!rootBlock || !rootBlock.type || !hasChild) {
        console.log('Root block is empty or childless, showing ALL endpoints from all schemas');
        
        // Collect all endpoints from all schemas
        const allEndpoints = [];
        
        // Get endpoints from schemaLibrary
        if (schemaLibrary) {
            Object.values(schemaLibrary).forEach(schema => {
                if (schema && schema.endpoints && Array.isArray(schema.endpoints)) {
                    allEndpoints.push(...schema.endpoints);
                }
            });
        }
        
        // Get endpoints from S3BlockLoader if available
        if (window.currentS3BlockLoader && window.currentS3BlockLoader.schemaLibrary) {
            Object.values(window.currentS3BlockLoader.schemaLibrary).forEach(schema => {
                if (schema && schema.endpoints && Array.isArray(schema.endpoints)) {
                    allEndpoints.push(...schema.endpoints);
                }
            });
        }
        
        // Remove duplicates and sort
        const uniqueEndpoints = [...new Set(allEndpoints)].sort();
        
        console.log(`Found ${uniqueEndpoints.length} total endpoints from all schemas:`, uniqueEndpoints);
        
        // Add all endpoints to dropdown
        uniqueEndpoints.forEach(endpoint => {
            const option = document.createElement('option');
            option.value = endpoint;
            option.textContent = endpoint;
            endpointSelector.appendChild(option);
        });
        
        // Always show the dropdown
        endpointSelector.style.display = 'block';
        return;
    }
    
    // Get the schema for this block type
    const blockType = rootBlock.type;
    
    // Determine base schema name (remove _array, _dict suffixes)
    let baseSchemaName = blockType;
    if (blockType.endsWith('_array') || blockType.endsWith('_dict')) {
        baseSchemaName = blockType.replace(/_array$|_dict$/, '');
    }
    
    // Get the base schema (the actual schema with endpoints)
    let schema = null;
    
    // Try to get schema from schemaLibrary
    if (schemaLibrary && schemaLibrary[baseSchemaName]) {
        schema = schemaLibrary[baseSchemaName];
    }
    
    // If no schema found, try from S3BlockLoader
    if (!schema && window.currentS3BlockLoader && window.currentS3BlockLoader.schemaLibrary) {
        schema = window.currentS3BlockLoader.schemaLibrary[baseSchemaName];
    }
    
    if (schema && schema.endpoints && Array.isArray(schema.endpoints) && schema.endpoints.length > 0) {
        console.log(`Found ${schema.endpoints.length} endpoints for block type ${blockType} (base schema: ${baseSchemaName}):`, schema.endpoints);
        
        // Add each endpoint as an option
        schema.endpoints.forEach(endpoint => {
            const option = document.createElement('option');
            option.value = endpoint;
            option.textContent = endpoint;
            endpointSelector.appendChild(option);
        });
        
        // Show the dropdown
        endpointSelector.style.display = 'block';
    } else {
        console.log(`No endpoints found for base schema ${baseSchemaName}, showing all endpoints as fallback`);
        // Fallback to showing all endpoints instead of hiding
        updateEndpointDropdown(null); // Recursive call with null to show all endpoints
    }
}

// Function to handle path ID changes
global.handlePathIdChange = function() {
    const endpointSelector = document.getElementById('endpoint_selector');
    const fullRouteTextarea = document.getElementById('full_route');
    const pathIdInput = document.getElementById('path_id');
    
    // Only update route if an endpoint is actually selected
    if (endpointSelector && endpointSelector.value && endpointSelector.value.trim() !== '') {
        console.log('ID changed, updating route for selected endpoint:', endpointSelector.value);
        
        // Parse the selected endpoint to get the path
        const selectedEndpoint = endpointSelector.value;
        const [method, path] = selectedEndpoint.split(': ', 2);
        
        if (method && path) {
            // Get the base route
            const baseRoute = getBaseRoute();
            
            // Handle path parameter replacement - always start from the original endpoint path
            let finalPath = path;
            const pathId = pathIdInput ? pathIdInput.value : '';
            
            if (pathId && pathId.trim() !== '') {
                // Replace ALL path parameters with the actual ID
                // This works because we always start from the original endpoint path template
                finalPath = path.replace(/\{[^}]+\}/g, pathId.trim());
                console.log(`ID updated: ${path} -> ${finalPath}`);
            } else {
                // If no ID is provided, keep the original template path
                finalPath = path;
                console.log(`No ID provided, keeping template: ${path}`);
            }
            
            // Construct the final route directly
            const newRoute = baseRoute + finalPath;
            fullRouteTextarea.value = newRoute;
            
            console.log(`ID change updated route to: ${newRoute}`);
        }
    } else {
        console.log('ID changed but no endpoint selected, keeping current route');
        // Don't change the route if no endpoint is selected
    }
}

// Function to get the proper base route from tenant properties
global.getBaseRoute = function() {
    const tenantProps = window.tenantProperties || {};
    let baseRoute = '';
    
    // Use tenant route if available
    if (tenantProps.route && tenantProps.route.trim() !== '') {
        baseRoute = tenantProps.route.trim();
        console.log('Using tenant route as base:', baseRoute);
    } else {
        // Fallback to a default
        baseRoute = 'https://api.example.com';
        console.log('Using fallback base route:', baseRoute);
    }
    
    // Fix any double protocol issues
    if (baseRoute.startsWith('https://https://') || baseRoute.startsWith('http://https://')) {
        baseRoute = baseRoute.replace(/^https?:\/\//, '');
        console.log('Fixed double protocol, now:', baseRoute);
    }
    if (baseRoute.startsWith('https://http://') || baseRoute.startsWith('http://http://')) {
        baseRoute = baseRoute.replace(/^https?:\/\//, '');
        console.log('Fixed double protocol, now:', baseRoute);
    }
    
    // Ensure no trailing slash
    if (baseRoute.endsWith('/')) {
        baseRoute = baseRoute.slice(0, -1);
    }
    
    console.log('Final base route:', baseRoute);
    return baseRoute;
}

// Function to handle endpoint dropdown changes
global.handleEndpointChange = function() {
    const endpointSelector = document.getElementById('endpoint_selector');
    const fullRouteTextarea = document.getElementById('full_route');
    
    if (!endpointSelector || !fullRouteTextarea) {
        console.warn('Endpoint selector or full route textarea not found');
        return;
    }
    
    const selectedEndpoint = endpointSelector.value;
    if (!selectedEndpoint) {
        console.log('No endpoint selected, resetting to base route');
        // Reset to base route without endpoint suffix
        const baseRoute = getBaseRoute();
        fullRouteTextarea.value = baseRoute;
        // Reset method buttons to default state
        resetMethodButtons();
        return;
    }
    
    // Check if root block is childless and auto-set its dropdown
    const workspace = Blockly.getMainWorkspace && Blockly.getMainWorkspace();
    if (workspace) {
        const topBlocks = workspace.getTopBlocks(false);
        const startBlock = topBlocks.find(block => block.type === 'start');
        
        if (startBlock) {
            const hasChild = startBlock.getChildren && startBlock.getChildren().length > 0;
            
            if (!hasChild) {
                console.log('Root block is childless, attempting to auto-set schema type from endpoint:', selectedEndpoint);
                
                // Try to determine schema type from endpoint
                let schemaType = null;
                
                // Parse the endpoint (format: "METHOD: /path")
                const [method, path] = selectedEndpoint.split(': ', 2);
                if (path) {
                    // First priority: Find schema with matching endpoint that has input schema ref
                    const allSchemas = {...schemaLibrary};
                    if (window.currentS3BlockLoader && window.currentS3BlockLoader.schemaLibrary) {
                        Object.assign(allSchemas, window.currentS3BlockLoader.schemaLibrary);
                    }
                    
                    for (const [schemaName, schema] of Object.entries(allSchemas)) {
                        if (schema && schema.endpoints && schema.endpoints.includes(selectedEndpoint)) {
                            // Check if this schema has input schema ref or similar
                            if (schema.inputSchema || schema.requestBody || schema.input) {
                                schemaType = schemaName;
                                console.log(`Found schema with input ref: ${schemaType}`);
                                break;
                            }
                        }
                    }
                    
                    // Second priority: Extract from route path (first /x/ segment)
                    if (!schemaType) {
                        const pathSegments = path.split('/').filter(segment => segment && !segment.startsWith('{'));
                        if (pathSegments.length > 0) {
                            const firstSegment = pathSegments[0];
                            // Check if this matches a schema name exactly
                            if (allSchemas[firstSegment]) {
                                schemaType = firstSegment;
                                console.log(`Found schema from path segment: ${schemaType}`);
                            }
                        }
                    }
                    
                    // If we found a schema type, set it in the root block dropdown
                    if (schemaType) {
                        const rootInput = startBlock.getInput('json');
                        if (rootInput) {
                            const dropdown = startBlock.getField('root_type_selector');
                            if (dropdown) {
                                console.log(`Setting root block dropdown to: ${schemaType}`);
                                dropdown.setValue(schemaType);
                                
                                // Trigger the block creation
                                setTimeout(() => {
                                    startBlock.toggleTargetBlock(rootInput, schemaType);
                                }, 10);
                            }
                        }
                    }
                }
            }
        }
    }
    
    console.log('Selected endpoint:', selectedEndpoint);
    
    // Parse the endpoint (format: "METHOD: /path")
    const [method, path] = selectedEndpoint.split(': ', 2);
    if (!method || !path) {
        console.warn('Invalid endpoint format:', selectedEndpoint);
        return;
    }
    
    // Get the base route (protocol://host:port/basePath)
    const baseRoute = getBaseRoute();
    
    // Handle path parameter replacement with ID templates
    let finalPath = path;
    const pathId = document.getElementById('path_id').value;
    
    if (pathId && pathId.trim() !== '') {
        // Replace ALL path parameters with the actual ID
        finalPath = path.replace(/\{[^}]+\}/g, pathId.trim());
        console.log(`Replaced path parameters: ${path} -> ${finalPath}`);
    } else if (path.includes('{')) {
        // If path has parameters but no ID is set, keep the template as-is
        console.log(`Path has parameters but no ID set, keeping template: ${path}`);
    } else if (pathId && pathId.trim() !== '' && !path.includes('{')) {
        // If there's an ID but no path parameters, append ID to the end
        finalPath = path + '/' + pathId.trim();
        console.log(`Appended ID to path without parameters: ${path} -> ${finalPath}`);
    }
    
    // Construct the final route: baseRoute + finalPath
    const newRoute = baseRoute + finalPath;
    fullRouteTextarea.value = newRoute;
    
    console.log(`Constructed route: ${baseRoute} + ${finalPath} = ${newRoute}`);
    
    // Update method button states based on the selected method
    updateMethodButtons(method.toUpperCase(), path.includes('{') || (pathId && pathId.trim() !== ''));
}

// Function to reset method buttons to default state
global.resetMethodButtons = function() {
    const buttons = {
        post: document.getElementById('post'),
        put: document.getElementById('put'),
        patch: document.getElementById('patch'),
        get: document.getElementById('get'),
        delete: document.getElementById('delete')
    };
    
    // Default state: POST enabled, others disabled unless path_id is set
    const pathId = document.getElementById('path_id').value;
    const hasPathId = pathId && pathId.trim() !== '';
    
    if (buttons.post) {
        buttons.post.style['background-color'] = hasPathId ? '#000' : '#ee2';
        buttons.post.disabled = hasPathId;
    }
    if (buttons.put) {
        buttons.put.style['background-color'] = hasPathId ? '#22e' : '#000';
        buttons.put.disabled = !hasPathId;
    }
    if (buttons.patch) {
        buttons.patch.style['background-color'] = hasPathId ? '#888' : '#000';
        buttons.patch.disabled = !hasPathId;
    }
    if (buttons.get) {
        buttons.get.style['background-color'] = '#0e639c';
        buttons.get.disabled = false;
    }
    if (buttons.delete) {
        buttons.delete.style['background-color'] = hasPathId ? '#e22' : '#000';
        buttons.delete.disabled = !hasPathId;
    }
}

// Function to update method button states based on selected endpoint
global.updateMethodButtons = function(method, hasPathParams) {
    const buttons = {
        post: document.getElementById('post'),
        put: document.getElementById('put'),
        patch: document.getElementById('patch'),
        get: document.getElementById('get'),
        delete: document.getElementById('delete')
    };
    
    // Reset all buttons to disabled/grey first
    Object.values(buttons).forEach(button => {
        if (button) {
            button.style['background-color'] = '#555';
            button.disabled = true;
        }
    });
    
    // Enable the method that matches the selected endpoint
    const methodButton = buttons[method.toLowerCase()];
    if (methodButton) {
        // Set appropriate color for the active method
        const methodColors = {
            'POST': '#ee2',
            'PUT': '#22e', 
            'PATCH': '#888',
            'GET': '#0e639c',
            'DELETE': '#e22'
        };
        
        methodButton.style['background-color'] = methodColors[method] || '#0e639c';
        methodButton.disabled = false;
        console.log(`Enabled ${method} button for selected endpoint`);
    }
    
    // Also enable GET as it's generally always available
    if (buttons.get && method !== 'GET') {
        buttons.get.style['background-color'] = '#0e639c';
        buttons.get.disabled = false;
    }
}

global.updateJSONarea = function (workspace) {
    //TODO none of the AJV schema validations currently work for deeply nested objects, may need to apply recursive techniques to add that.
    if (!workspace) {
        // Try to get the main workspace if not provided (for backward compatibility)
        workspace = Blockly.getMainWorkspace && Blockly.getMainWorkspace();
        if (!workspace) {
            console.warn('No workspace available for updateJSONarea');
            return;
        }
    }

    let topBlocks = workspace.getTopBlocks(false);
    
    // Check if there are any top blocks and if the first one has children
    let rootBlock = null;
    if (topBlocks && topBlocks.length > 0 && topBlocks[0]) {
        const children = topBlocks[0].getChildren();
        if (children && children.length > 0) {
            rootBlock = children[0];
        }
    }
    
    // Step 1: Generate raw object (without stringify) for validation
    let rawObj = null;
    if (jsonGenerator && jsonGenerator.getRawObject) {
        rawObj = jsonGenerator.getRawObject(workspace);
    }
    
    // Step 2: Use raw object for AJV validation
    if(rootBlock != undefined && rawObj !== null){
        // Update endpoint dropdown when root block changes
        updateEndpointDropdown(rootBlock);
        
        // Use the validation module with the raw object (no stringify applied)
        if (typeof window.performValidation === 'function') {
            window.performValidation(rootBlock, rawObj, ajv);
        } else {
            console.error('Validation module not loaded');
            document.getElementById('response_area').value = "Validation module not loaded";
            document.getElementById('response_area').style['background-color'] = '#f70';
        }
    } else {
        // Clear dropdown if no root block
        updateEndpointDropdown(null);
    }
    
    // Step 3: Generate object with stringify applied for JSON display
    let stringifiedObj = null;
    if (jsonGenerator && jsonGenerator.getStringifiedObject) {
        stringifiedObj = jsonGenerator.getStringifiedObject(workspace);
    }
    
    // Step 4: Update JSON area with stringified version
    const json = stringifiedObj ? JSON.stringify(stringifiedObj, null, 4) : 'null';
    document.getElementById('json_area').value = json;
    
    if(json.length > 15){
        localStorage.setItem("json-frontend-savedstate", json);
    }
}

// Collapsible section management
global.toggleCollapsible = function(sectionId) {
    const content = document.getElementById(sectionId + '-content');
    const toggle = document.getElementById(sectionId + '-toggle');
    
    if (!content || !toggle) return;
    
    const isExpanded = content.classList.contains('expanded');
    
    if (isExpanded) {
        content.classList.remove('expanded');
        toggle.classList.remove('expanded');
        toggle.textContent = '▶';
    } else {
        content.classList.add('expanded');
        toggle.classList.add('expanded');
        toggle.textContent = '▼';
    }
}

// Query parameters management
let queryParamCounter = 0;

global.addQueryParam = function() {
    addKvPair('query-params', 'Key', 'Value');
}

global.removeQueryParam = function(pairId) {
    removeKvPair('query-params', pairId);
}

global.getQueryParams = function() {
    const container = document.getElementById('query-params-list');
    if (!container) return {};
    
    const params = {};
    const pairs = container.querySelectorAll('.kv-pair');
    
    pairs.forEach(pair => {
        const keyInput = pair.querySelector('.kv-key');
        const valueInput = pair.querySelector('.kv-value');
        
        if (keyInput && valueInput && keyInput.value.trim()) {
            params[keyInput.value.trim()] = valueInput.value.trim();
        }
    });
    
    return params;
}

// Headers management
let headerCounter = 0;

global.addHeader = function() {
    addKvPair('headers', 'Header Name', 'Header Value');
}

global.removeHeader = function(pairId) {
    removeKvPair('headers', pairId);
}

global.getHeaders = function() {
    const container = document.getElementById('headers-list');
    if (!container) return {};
    
    const headers = {};
    const pairs = container.querySelectorAll('.kv-pair');
    
    pairs.forEach(pair => {
        const keyInput = pair.querySelector('.kv-key');
        const valueInput = pair.querySelector('.kv-value');
        
        if (keyInput && valueInput && keyInput.value.trim()) {
            headers[keyInput.value.trim()] = valueInput.value.trim();
        }
    });
    
    return headers;
}

// Variables management
let variableCounter = 0;
let currentVariables = {}; // Store current variables

global.addVariable = function() {
    addKvPair('variables', 'Variable Name', 'Variable Value');
}

global.removeVariable = function(pairId) {
    removeKvPair('variables', pairId);
}

global.getVariables = function() {
    const container = document.getElementById('variables-list');
    if (!container) return {};
    
    const variables = {};
    const pairs = container.querySelectorAll('.kv-pair');
    
    pairs.forEach(pair => {
        const keyInput = pair.querySelector('.kv-key');
        const valueInput = pair.querySelector('.kv-value');
        
        if (keyInput && valueInput && keyInput.value.trim()) {
            let value = valueInput.value.trim();
            
            // Try to parse the value as JSON to handle numbers, booleans, etc.
            try {
                // Check if it's a number
                if (!isNaN(value) && !isNaN(parseFloat(value)) && value !== '') {
                    value = parseFloat(value);
                }
                // Check if it's a boolean
                else if (value.toLowerCase() === 'true') {
                    value = true;
                } else if (value.toLowerCase() === 'false') {
                    value = false;
                }
                // Check if it's a JSON object or array
                else if ((value.startsWith('{') && value.endsWith('}')) || 
                         (value.startsWith('[') && value.endsWith(']'))) {
                    value = JSON.parse(value);
                }
                // Otherwise keep as string
            } catch (e) {
                // If parsing fails, keep as string
                console.log(`Variable value parsing failed for ${keyInput.value.trim()}: ${value}, keeping as string`);
            }
            
            variables[keyInput.value.trim()] = value;
        }
    });
    
    return variables;
}

// Function to update variables and notify all variable blocks
global.updateVariables = function() {
    currentVariables = getVariables();
    console.log('Variables updated:', currentVariables);
    
    // Update all variable blocks with the new variable list
    if (window.updateAllVariableBlocks) {
        window.updateAllVariableBlocks(currentVariables);
    }
    
    // Update JSON area to reflect changes
    if (typeof updateJSONarea === 'function' && window.currentWorkspace) {
        updateJSONarea(window.currentWorkspace);
    }
    
    // Schedule URL serialization
    scheduleUrlSerialization();
}

// Make getVariables available globally for the variable blocks
window.getVariables = getVariables;

// URL serialization and deserialization functions
global.serializeToUrl = function() {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Serialize headers, query params, and variables
    const headers = getHeaders();
    const queryParams = getQueryParams();
    const variables = getVariables();
    
    if (Object.keys(headers).length > 0) {
        urlParams.set('headers', encodeURIComponent(JSON.stringify(headers)));
    } else {
        urlParams.delete('headers');
    }
    
    if (Object.keys(queryParams).length > 0) {
        urlParams.set('queryParams', encodeURIComponent(JSON.stringify(queryParams)));
    } else {
        urlParams.delete('queryParams');
    }
    
    if (Object.keys(variables).length > 0) {
        urlParams.set('variables', encodeURIComponent(JSON.stringify(variables)));
    } else {
        urlParams.delete('variables');
    }
    
    // Update URL without reloading
    const newUrl = window.location.pathname + '?' + urlParams.toString();
    window.history.replaceState({}, '', newUrl);
};

global.deserializeFromUrl = function() {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Deserialize and populate headers
    const headersParam = urlParams.get('headers');
    if (headersParam) {
        try {
            const headers = JSON.parse(decodeURIComponent(headersParam));
            populateHeaders(headers);
        } catch (e) {
            console.warn('Failed to parse headers from URL:', e);
        }
    }
    
    // Deserialize and populate query parameters
    const queryParamsParam = urlParams.get('queryParams');
    if (queryParamsParam) {
        try {
            const queryParams = JSON.parse(decodeURIComponent(queryParamsParam));
            populateQueryParams(queryParams);
        } catch (e) {
            console.warn('Failed to parse query parameters from URL:', e);
        }
    }
    
    // Deserialize and populate variables
    const variablesParam = urlParams.get('variables');
    if (variablesParam) {
        try {
            const variables = JSON.parse(decodeURIComponent(variablesParam));
            populateVariables(variables);
        } catch (e) {
            console.warn('Failed to parse variables from URL:', e);
        }
    }
};

// Generic function to populate a section with key-value pairs
function populateSection(sectionKey, data, keyPlaceholder = 'Key', valuePlaceholder = 'Value') {
    const section = kvSections[sectionKey];
    if (!section) return;
    
    const container = document.getElementById(section.listId);
    if (!container) return;
    
    // Clear existing items
    container.innerHTML = '';
    section.counter = 0;
    
    // Add each item
    Object.entries(data).forEach(([key, value]) => {
        section.counter++;
        const kvPair = document.createElement('div');
        kvPair.className = 'kv-pair';
        kvPair.id = `${sectionKey}-${section.counter}`;
        
        // Create inputs with values
        const keyInput = document.createElement('input');
        keyInput.type = 'text';
        keyInput.placeholder = keyPlaceholder;
        keyInput.className = 'kv-key';
        keyInput.value = key;
        
        const valueInput = document.createElement('input');
        valueInput.type = 'text';
        valueInput.placeholder = valuePlaceholder;
        valueInput.className = 'kv-value';
        valueInput.value = typeof value === 'object' ? JSON.stringify(value) : String(value);
        
        const removeButton = document.createElement('button');
        removeButton.textContent = '×';
        removeButton.onclick = () => removeKvPair(sectionKey, kvPair.id);
        
        // Add event listeners for real-time updates
        const updateHandler = () => {
            section.onUpdate();
            updateSectionCount(sectionKey);
        };
        
        keyInput.addEventListener('input', updateHandler);
        valueInput.addEventListener('input', updateHandler);
        
        kvPair.appendChild(keyInput);
        kvPair.appendChild(valueInput);
        kvPair.appendChild(removeButton);
        
        container.appendChild(kvPair);
    });
    
    updateSectionCount(sectionKey);
}

// Helper functions to populate UI elements
function populateHeaders(headers) {
    populateSection('headers', headers, 'Header Name', 'Header Value');
}

function populateQueryParams(queryParams) {
    populateSection('query-params', queryParams, 'Key', 'Value');
}

function populateVariables(variables) {
    populateSection('variables', variables, 'Variable Name', 'Variable Value');
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Auto-serialize to URL when values change (with debouncing)
let serializeTimeout;
function scheduleUrlSerialization() {
    clearTimeout(serializeTimeout);
    serializeTimeout = setTimeout(() => {
        serializeToUrl();
    }, 1000); // Wait 1 second after last change
}

// Generic key-value section management
const kvSections = {
    'query-params': {
        listId: 'query-params-list',
        countId: 'query-params-count',
        counter: 0,
        onUpdate: () => scheduleUrlSerialization()
    },
    'headers': {
        listId: 'headers-list', 
        countId: 'headers-count',
        counter: 0,
        onUpdate: () => scheduleUrlSerialization()
    },
    'variables': {
        listId: 'variables-list',
        countId: 'variables-count', 
        counter: 0,
        onUpdate: () => {
            updateVariables();
            scheduleUrlSerialization();
        }
    }
};

// Generic function to update count and color for any section
function updateSectionCount(sectionKey) {
    const section = kvSections[sectionKey];
    if (!section) return;
    
    const container = document.getElementById(section.listId);
    const countElement = document.getElementById(section.countId);
    if (!container || !countElement) return;
    
    const pairs = container.querySelectorAll('.kv-pair');
    const count = pairs.length;
    
    // Check if all pairs have both key and value
    let allComplete = true;
    pairs.forEach(pair => {
        const keyInput = pair.querySelector('.kv-key');
        const valueInput = pair.querySelector('.kv-value');
        if (!keyInput || !valueInput || !keyInput.value.trim() || !valueInput.value.trim()) {
            allComplete = false;
        }
    });
    
    countElement.textContent = count.toString();
    countElement.className = 'count-indicator';
    if (count > 0) {
        countElement.classList.add(allComplete ? 'complete' : 'incomplete');
    }
}

// Generic function to add a key-value pair to any section
function addKvPair(sectionKey, keyPlaceholder = 'Key', valuePlaceholder = 'Value') {
    const section = kvSections[sectionKey];
    if (!section) return;
    
    const container = document.getElementById(section.listId);
    if (!container) return;
    
    section.counter++;
    const kvPair = document.createElement('div');
    kvPair.className = 'kv-pair';
    kvPair.id = `${sectionKey}-${section.counter}`;
    
    // Create inputs
    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.placeholder = keyPlaceholder;
    keyInput.className = 'kv-key';
    
    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.placeholder = valuePlaceholder;
    valueInput.className = 'kv-value';
    
    const removeButton = document.createElement('button');
    removeButton.textContent = '×';
    removeButton.onclick = () => removeKvPair(sectionKey, kvPair.id);
    
    // Add event listeners for real-time updates
    const updateHandler = () => {
        section.onUpdate();
        updateSectionCount(sectionKey);
    };
    
    keyInput.addEventListener('input', updateHandler);
    valueInput.addEventListener('input', updateHandler);
    
    kvPair.appendChild(keyInput);
    kvPair.appendChild(valueInput);
    kvPair.appendChild(removeButton);
    
    container.appendChild(kvPair);
    section.onUpdate();
    updateSectionCount(sectionKey);
}

// Generic function to remove a key-value pair from any section
function removeKvPair(sectionKey, pairId) {
    const section = kvSections[sectionKey];
    if (!section) return;
    
    const element = document.getElementById(pairId);
    if (element) {
        element.remove();
        section.onUpdate();
        updateSectionCount(sectionKey);
    }
}

// Convenience functions for backward compatibility
function updateQueryParamsCount() { updateSectionCount('query-params'); }
function updateHeadersCount() { updateSectionCount('headers'); }
function updateVariablesCount() { updateSectionCount('variables'); }