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

global.dropCustomFieldsFromSchema = function(schema){
    if(schema == undefined){
        return undefined;
    }
    for(let k in schema){
        if(k == 'apiCreationStrategy' || k == 'color' || k == 'endpoint' || k == 'type' || k == 'default' || k == 'childRefToParent'){
            delete schema[k];
        }else{
            if(schema[k] != undefined && schema[k] === Object(schema[k])){
                schema[k] = dropCustomFieldsFromSchema(schema[k]);
            }
        }
    }
    return schema;
}

global.loadConfig = function (name){
    serverConfig = require('../serverConfig.json');
    const Ajv2019 = require("ajv/dist/2019")
    ajv = new Ajv2019({strictTypes: false, allErrors: true});
    
    // Remove hardcoded schema loading - schemas will be loaded dynamically by S3BlockLoader
    // and added to AJV as they become available
}

// Function to dynamically add schemas to AJV validator
global.addSchemaToValidator = function(schemaName, schema) {
    if (ajv && schema) {
        const cleanSchema = dropCustomFieldsFromSchema(schema);
        ajv.addSchema(cleanSchema, schemaName + ".json");
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
    if(serverConfig.corsProxy != undefined){
        fullRoute+=serverConfig.corsProxy
    }
    var type = blockIn.type;
    if(schemaLibrary[type] != undefined && schemaLibrary[type].endpoint != undefined){
        //console.log("Detected an overridden endpoint mapping");
        type = schemaLibrary[type].endpoint;
    }
    fullRoute+= serverConfig.baseUrl + routePrefix + "/" + type;
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
            const valid = ajv.validate(rootBlock.type + ".json", jsonObj);
            document.getElementById('response_area').value = "";
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
                    const valid = ajv.validate(child.type + ".json", jsonObj[childIdx]);
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