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
    //These are both illegal in the browser but when built into bundle.js it works.
    ajv = new Ajv2019({strictTypes: false, allErrors: true});
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
    console.log('Available schemas in AJV:', schemas);
    return schemas;
}

// Function to check the current state of schema loading
global.debugSchemaState = function() {
    console.log('=== Schema State Debug ===');
    console.log('AJV initialized:', !!ajv);
    
    if (ajv) {
        console.log('AJV instance:', ajv);
        console.log('AJV schemas:', ajv.schemas);
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
        const blocklyProperties = ['color', 'apiCreationStrategy', 'endpoint', 'childRefToParent', 'format', 'uri'];
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

// Function to retry validation when schemas become available
global.retryValidation = function(workspace) {
    if (this.areSchemasReady()) {
        console.log('Schemas are now ready, retrying validation');
        this.updateJSONarea(workspace);
    } else {
        // Wait a bit and try again
        setTimeout(() => this.retryValidation(workspace), 100);
    }
}

// Helper function to convert custom types to JSON Schema types
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

// Function to dynamically add schemas to AJV validator
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
                    validateFormats: false,  // TODO: Implement missing format validators (date-time, etc.) but suppress warnings for now
                    unknownFormats: 'ignore'  // Ignore unknown formats like "uri"
                });
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
        const blocklyProperties = ['color', 'apiCreationStrategy', 'endpoint', 'childRefToParent', 'stringify', 'format', 'uri'];
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
                    // Remove stringify from nested properties
                    if (propDef.stringify !== undefined) {
                        delete propDef.stringify;
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

// addBlockFromSchema is now handled directly by menuly_blocks.js
// No need for a wrapper function here

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
        if(fields[0].getText && fields[0].getText() == property){ //for required fields
            return sendingBlock.inputList[idx].connection.targetConnection.getSourceBlock();
        }
        if(fields[1].getText && fields[1].getText() == property){ //for optional fields (-) precedes
            return sendingBlock.inputList[idx].connection.targetConnection.getSourceBlock();
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
    if(serverConfig.authType == "basic"){
        xhttp.open(requestType, fullRoute, false, serverConfig.user, serverConfig.pass);
        xhttp.setRequestHeader("Authorization", btoa(unescape(encodeURIComponent(serverConfig.user + ":" + serverConfig.pass))));
    }
    else if(serverConfig.authType == "client_credentials"){
        if(accessToken == undefined){
            getToken(serverConfig);
        }
        xhttp.open(requestType, fullRoute, false);
        xhttp.setRequestHeader("Authorization", accessToken);
    }
    else{
        console.log("Invalid authtype configured, inferring none");
        xhttp.open(requestType, fullRoute, false);
    }
    xhttp.setRequestHeader("Content-type", "application/json");
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

global.loadFromStorage = function() {
    let program = localStorage.getItem("json-frontend-savedstate");
    console.log(JSON.parse(program));
    const workspace = Blockly.getMainWorkspace();
    Blockly.JSON.toWorkspace(program, workspace);
}

global.loadFromJson = function() {
    let program = document.getElementById('json_area').value
    console.log(JSON.parse(program));
    const workspace = Blockly.getMainWorkspace();
    Blockly.JSON.toWorkspace(program, workspace);
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
    var fullRoute = constructFullRoute(routePrefix, block);
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
    let topBlocks = Blockly.getMainWorkspace().getTopBlocks(false);
    rootBlock = topBlocks[0].childBlocks_[0];
    if(serverConfig == {}){
        loadConfig();
    }
    var rootType = rootBlock.type;
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
    }
    
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

    let json = Blockly.JSON.fromWorkspace( workspace );
    let topBlocks = workspace.getTopBlocks(false);
    
    // Check if there are any top blocks and if the first one has children
    let rootBlock = null;
    if (topBlocks && topBlocks.length > 0 && topBlocks[0]) {
        const children = topBlocks[0].getChildren();
        if (children && children.length > 0) {
            rootBlock = children[0];
        }
    }
    document.getElementById('json_area').value = json;
    
    // Only try to parse JSON if it's not null or empty
    let jsonObj = null;
    try {
        if (json && json.trim() !== 'null' && json.trim() !== '') {
            jsonObj = JSON.parse(json);
        }
    } catch (e) {
        console.warn('Failed to parse JSON:', json, e);
    }
    if(rootBlock != undefined){
        document.getElementById('full_route').value = constructFullRoute("", rootBlock);
        // Only validate custom schema blocks, not primitives
        const primitiveTypes = ['string', 'number', 'boolean', 'dynarray', 'dictionary'];
        const isPrimitive = primitiveTypes.includes(rootBlock.type) || rootBlock.type.endsWith("_array");
        
        console.log('Root block type:', rootBlock.type, 'isPrimitive:', isPrimitive);
        
        if(!isPrimitive && jsonObj){
            var valid = false;
            
            // Check if ajv is available and if the schema exists
            if (!ajv) {
                console.warn('AJV validator not available for validation');
                document.getElementById('response_area').value = "AJV validator not available";
                document.getElementById('response_area').style['background-color'] = '#f70';
                return;
            }
            
            // Check if the schema exists in AJV before attempting validation
            const schemaKey = rootBlock.type + ".json";
            const schemaKeyAlt = rootBlock.type;
            
            // Debug: list available schemas
            if (typeof window.listSchemasInAJV === 'function') {
                window.listSchemasInAJV();
            }
            
            if (!ajv.getSchema(schemaKey) && !ajv.getSchema(schemaKeyAlt)) {
                console.warn(`Schema not found in AJV for type: ${rootBlock.type}`);
                console.warn(`Looking for schema keys: ${schemaKey} or ${schemaKeyAlt}`);
                
                // Debug the current schema state
                if (typeof window.debugSchemaState === 'function') {
                    console.log('Schema state when validation failed:');
                    window.debugSchemaState();
                }
                
                document.getElementById('response_area').value = `Schema not found for type: ${rootBlock.type}. Please ensure the schema is loaded.`;
                document.getElementById('response_area').style['background-color'] = '#f70';
                return;
            }
            
            try{
                valid = ajv.validate(schemaKey, jsonObj);
            }
            catch(e){
                console.warn(`Validation failed with ${schemaKey}:`, e);
                // Check if the schema contains Blockly properties
                if (typeof window.checkSchemaForBlocklyProps === 'function') {
                    window.checkSchemaForBlocklyProps(rootBlock.type);
                }
                
                try{
                    valid = ajv.validate(schemaKeyAlt, jsonObj);
                }
                catch(e){
                    console.warn('Failed to validate JSON with either type or type.json', jsonObj, e);
                    document.getElementById('response_area').value = `Validation failed: ${e.message}`;
                    document.getElementById('response_area').style['background-color'] = '#f99';
                    return;
                }
            }
            document.getElementById('response_area').value = "";
            console.log("Validation result: ", valid);
            if (!valid) {
                for(let thing in ajv.errors){
                    document.getElementById('response_area').value += JSON.stringify(ajv.errors[thing]) + "\n\n";
                    document.getElementById('response_area').style['background-color'] = '#f99'
                }
            }
            else{
                document.getElementById('response_area').style['background-color'] = '#9f9';
            }
        }
        else if(rootBlock.type.endsWith("_array")){
            //Clear invalid status at start
            document.getElementById('response_area').style['background-color'] = '#9f9';
            let expectedType = rootBlock.type.slice(0,-6);
            document.getElementById('response_area').value = "";
            for (childIdx in rootBlock.childBlocks_){
                let child = rootBlock.childBlocks_[childIdx];
                if(child.type != expectedType){
                    document.getElementById('response_area').value += "{\n\"array validation failed @index\": " + childIdx + ",\n\"expected_type\": \"" + expectedType + "\",\n" + "\"actual_type\": \"" + child.type + "\"\n}\n\n";
                    document.getElementById('response_area').style['background-color'] = '#f70';
                }
                let primitives = ["number", "string", "boolean", "string_array", "boolean_array", "number_array"]
                if(!(primitives.includes(child.type))){
                    // Check if ajv is available and if the schema exists
                    if (!ajv) {
                        console.warn('AJV validator not available for array validation');
                        document.getElementById('response_area').value += `AJV validator not available for ${child.type}\n\n`;
                        document.getElementById('response_area').style['background-color'] = '#f70';
                        continue;
                    }
                    
                    // Check if the schema exists in AJV before attempting validation
                    const schemaKey = child.type + ".json";
                    const schemaKeyAlt = child.type;
                    
                    // Debug: list available schemas
                    if (typeof window.listSchemasInAJV === 'function') {
                        window.listSchemasInAJV();
                    }
                    
                    if (!ajv.getSchema(schemaKey) && !ajv.getSchema(schemaKeyAlt)) {
                        console.warn(`Schema not found in AJV for array child type: ${child.type}`);
                        console.warn(`Looking for schema keys: ${schemaKey} or ${schemaKeyAlt}`);
                        
                        // Debug the current schema state
                        if (typeof window.debugSchemaState === 'function') {
                            console.log('Schema state when array validation failed:');
                            window.debugSchemaState();
                        }
                        
                        document.getElementById('response_area').value += `Schema not found for array child type: ${child.type}\n\n`;
                        document.getElementById('response_area').style['background-color'] = '#f70';
                        continue;
                    }
                    
                    let valid = false;
                    try {
                        valid = ajv.validate(schemaKey, jsonObj[childIdx]);
                    } catch (e) {
                        console.warn(`Array validation failed with ${schemaKey}:`, e);
                        // Check if the schema contains Blockly properties
                        if (typeof window.checkSchemaForBlocklyProps === 'function') {
                            window.checkSchemaForBlocklyProps(child.type);
                        }
                        
                        try {
                            valid = ajv.validate(schemaKeyAlt, jsonObj[childIdx]);
                        } catch (e2) {
                            console.warn(`Failed to validate array child JSON for type ${child.type}:`, e2);
                            document.getElementById('response_area').value += `Validation failed for ${child.type}: ${e2.message}\n\n`;
                            document.getElementById('response_area').style['background-color'] = '#f99';
                            continue;
                        }
                    }
                    
                    if (!valid) {
                        for(let thing in ajv.errors){
                            document.getElementById('response_area').value += JSON.stringify(ajv.errors[thing]) + "\n\n";
                            document.getElementById('response_area').style['background-color'] = '#f99'
                        }
                    }
                }
            }
        }
        if(json.length > 15){
            localStorage.setItem("json-frontend-savedstate", json);
            document.getElementById('load_disk').innerText = "Relax Static Typing";
        }
    }
}