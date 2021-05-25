var serverConfig = {};
var accessToken = undefined;
var schema = {};
function loadJsonForRequest(name){
    let xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
        var tmp = JSON.parse(this.responseText);
        schema[name] = tmp;
    }
    };
    xhttp.open("GET", 'http://localhost:8080/schema/' + name + ".json", false);
    xhttp.send();
}

function loadConfig(name){
    let xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
        serverConfig = JSON.parse(this.responseText);
        getToken(serverConfig);
    }
    };
    xhttp.open("GET", 'http://localhost:8080/serverConfig.json', true);
    xhttp.send();
}

function getToken(serverConfig){
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

function childBlockFromBlock(property, sendingBlock){
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
        if(fields[0].text_ == property){ //for required fields
            return sendingBlock.inputList[idx].connection.targetConnection.sourceBlock_;
        }
        if(fields[1].text_ == property){ //for optional fields (-) precedes
            return sendingBlock.inputList[idx].connection.targetConnection.sourceBlock_;
        }
    }
}

function childFirstBodyIdStrategy(sendingBlock, mySchema){
    for(var propertyName in mySchema.properties){
        let property = mySchema.properties[propertyName];
        //Handle dict
        if(property.apiCreationStrategy == 'childFirstBodyId' && property['$ref'] != undefined && sendingBlock != undefined){
            let block = childBlockFromBlock(propertyName, sendingBlock);
            //childFirstBodyIdStrategy(block, block.type);
            if(schema[block.type] == undefined){ //make sure we have schema ready.
                loadJsonForRequest(block.type);
            }
            let obj = Blockly.JSON.generalBlockToObj(block);
            sendSingleRequest(JSON.stringify(obj), block.type, propertyName, "", block);
            //This is sending a second request with the same breakdown
        }
        if(property.apiCreationStrategy == 'childFirstBodyId' && property.type == 'array' && property.items['$ref'] != undefined){
            let arrBlock = childBlockFromBlock(propertyName, sendingBlock);
            for(let idx in arrBlock.childBlocks_){
                let block = arrBlock.childBlocks_[idx];
                //childFirstBodyIdStrategy(block, block.type);
                if(schema[block.type] == undefined){ //make sure we have schema ready.
                    loadJsonForRequest(block.type);
                }
                let obj = Blockly.JSON.generalBlockToObj(block);
                sendSingleRequest(JSON.stringify(obj), block.type, propertyName + idx + "_idx", "", block);
                //This is sending a second request with the same breakdown
            }
        }
    }
}

function createDirectChildren(children, childTypes, childBlocks, childRoutePrefix){
    //console.log(children);
    //console.log(childTypes);
    //console.log(childBlocks);
    //console.log(childRoutePrefix);
    for(var i in children){
        if(schema[childTypes[i]] == undefined){ //make sure we have schema ready.
            loadJsonForRequest(childTypes[i]);
        }
        sendSingleRequest(JSON.stringify(children[i]), childTypes[i], "parentFirst", childRoutePrefix, childBlocks[i]);
    }
}

function applyHeadersAndRoute(xhttp, serverConfig, fullRoute){
    if(serverConfig.authType == "basic"){
        xhttp.open("POST", fullRoute, false, serverConfig.user, serverConfig.pass);
        xhttp.setRequestHeader("Authorization", btoa(unescape(encodeURIComponent(serverConfig.user + ":" + serverConfig.pass))));
    }
    else if(serverConfig.authType == "client_credentials"){
        if(accessToken == undefined){
            getToken(serverConfig);
        }
        xhttp.open("POST", fullRoute, false);
        xhttp.setRequestHeader("Authorization", accessToken);
    }
    else{
        console.log("Invalid authtype configured, inferring none");
        xhttp.open("POST", fullRoute, false);
    }
    xhttp.setRequestHeader("Content-type", "application/json");
}

function pullUpIdsFromChildren(obj, idsFromChildren){
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

function removeChildrenFromParentBody(obj, type, sendingBlock, children, childTypes, childBlocks){
    var tmpJson = JSON.parse(obj);
    let mySchema = schema[type];
    var idx = 0;
    if(sendingBlock == undefined){
        return;
    }
    for(var property in mySchema.properties) {
        let elem = mySchema.properties[property];
        let childBlock = childBlockFromBlock(property, sendingBlock);
        if(childBlock != undefined && elem.apiCreationStrategy == 'parentFirstRouteId'){
            if(elem.type == 'array' && elem.items['$ref'] != undefined){
                let arrBlock = childBlock;
                for(let arrIndex in arrBlock.childBlocks_){
                    let block = arrBlock.childBlocks_[arrIndex];
                    children[idx] = tmpJson[property][arrIndex];
                    childTypes[idx] = elem.items['$ref'].replace(".json","");
                    childBlocks[idx] = block;
                    idx+=1;
                }
                tmpJson[property] = undefined;
            }
            else if(elem['$ref'] != undefined){
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

function sendSingleRequest(payload, type, propertyOrParent, routePrefix, block){ //if last param undefined, this is a parent request.
    childFirstBodyIdStrategy(block, schema[type]);
    var parentIdForChildRequests = "";
    let origType = type;
    if(schema[type] != undefined && schema[type].endpoint != undefined){
        console.log("Detected an overridden endpoint mapping");
        type = schema[type].endpoint;
    }
    let xhttp = new XMLHttpRequest();
    var fullRoute = "";
    if(serverConfig.corsProxy != undefined){
        fullRoute+=serverConfig.corsProxy
    }
    fullRoute+= serverConfig.baseUrl + routePrefix + "/" + type;
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
    applyHeadersAndRoute(xhttp, serverConfig, fullRoute);

    //Modify bodies for child/parent handling prior to sending request.

    var tmpObj = pullUpIdsFromChildren(payload, idsFromChildren);

    var children = [];
    var childTypes = [];
    var childBlocks = [];
    let finalObj = removeChildrenFromParentBody(tmpObj, origType, block, children, childTypes, childBlocks);

    xhttp.send(finalObj);

    var childRoutePrefix = "";
    if(children.length > 0){
        childRoutePrefix = routePrefix + "/" + type + "/" + parentIdForChildRequests;
    }
    createDirectChildren(children, childTypes, childBlocks, childRoutePrefix);
}

var rootBlock;
function sendRequests() {
    let payload = document.getElementById('json_area').value;
    let topBlocks = Blockly.getMainWorkspace().getTopBlocks(false);
    rootBlock = topBlocks[0].childBlocks_[0];
    if(serverConfig == {}){
        loadConfig();
    }
    var rootType = rootBlock.type;
    if(schema[rootType] == undefined){
        loadJsonForRequest(rootBlock.type);
    }
    sendSingleRequest(payload, rootType, undefined, "", rootBlock);
}

function updateJSONarea() {
    document.getElementById('json_area').value = Blockly.JSON.fromWorkspace( Blockly.getMainWorkspace() );
}

function interpretJSONarea() {
    Blockly.JSON.toWorkspace( document.getElementById('json_area').value, Blockly.getMainWorkspace() );
}
