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
            console.log(property);
            for(var idx in sendingBlock.inputList) {
                let input = sendingBlock.inputList[idx];
                //console.log(input);
                if(input.fieldRow[0].text_ == property){ //for required fields
                    return sendingBlock.inputList[idx].connection.targetConnection.sourceBlock_;
                }
                if(input.fieldRow[1].text_ == property){ //for optional fields (-) precedes
                    return sendingBlock.inputList[idx].connection.targetConnection.sourceBlock_;
                }
            }
        }

        function childFirstBodyIdStrategy(sendingBlock, mySchema){
            console.log(sendingBlock);
            for(var propertyName in mySchema.properties){
                let property = mySchema.properties[propertyName];
                if(property.apiCreationStrategy == 'childFirstBodyId' && property['$ref'] != undefined){
                    let block = childBlockFromBlock(propertyName, sendingBlock);
                    //childFirstBodyIdStrategy(block, block.type);
                    if(schema[block.type] == undefined){ //make sure we have schema ready.
                        loadJsonForRequest(block.type);
                    }
                    let obj = Blockly.JSON.generalBlockToObj(block);
                    sendSingleRequest(JSON.stringify(obj), block.type, propertyName, "", block);
                    //This is sending a second request with the same breakdown
                }
            }
        }

        function createDirectChildren(children, childTypes, childBlocks, childRoutePrefix){
            for(var i in children){
                if(schema[childTypes[i]] == undefined){ //make sure we have schema ready.
                    loadJsonForRequest(childTypes[i]);
                }
                sendSingleRequest(JSON.stringify(children[i]), childTypes[i], "parentFirst", childRoutePrefix, childBlocks[i]);
            }
        }

        function pullUpIdsFromChildren(obj, idsFromChildren){
            var tmpJson = JSON.parse(obj);
            for(let childField in idsFromChildren){
                if(tmpJson[childField] != undefined){
                    tmpJson[childField] = idsFromChildren[childField];
                }
            }
            return JSON.stringify(tmpJson);
        }

        function removeChildrenFromParentBody(obj, type, sendingBlock, children, childTypes, childBlocks){
            var tmpJson = JSON.parse(obj);
            let mySchema = schema[type];
            var idx = 0;
            for(var property in mySchema.properties){
                let elem = mySchema.properties[property];
                if(elem.apiCreationStrategy == 'parentFirstRouteId' && elem['$ref'] != undefined){
                    children[idx] = tmpJson[property];
                    childTypes[idx] = elem['$ref'].replace(".json","");
                    childBlocks[idx] = childBlockFromBlock(property, sendingBlock);
                    tmpJson[property] = undefined;
                    idx+=1;
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
            let fullRoute = serverConfig.baseUrl + routePrefix + "/" + type;
            xhttp.onreadystatechange = function() {
                if (this.readyState == 4) {
                    if(propertyOrParent == undefined){ //root request 
                        //TODO remove server mocking on next line, use `this.responseText` for mocked
                        document.getElementById('response_area').value = "status: " + this.status + "\nresponse: " + this.responseText;
                    }
                    if(propertyOrParent == "parentFirst"){ //add the child response after.
                        //TODO remove server mocking on next line, use `this.responseText` for mocked
                        document.getElementById('response_area').value = document.getElementById('response_area').value + "status: " + this.status + "\nresponse: " + this.responseText;
                    }
                    else{
                        //TODO remove server mocking on next line, use `this.responseText` for mocked
                        idsFromChildren[propertyOrParent] = JSON.parse(this.responseText)['id'];
                        let mocked = "{\"id\": \"2f02372d-a590-4c4b-b3e2-c070025a3b8e\"}";
                        //idsFromChildren[propertyOrParent] = JSON.parse(mocked)['id'];
                        document.getElementById('response_area').value = document.getElementById('response_area').value + "status: " + this.status + "\nresponse: " + this.responseText;
                    }
                    parentIdForChildRequests = JSON.parse(this.responseText)['id'];
                    let mocked = "{\"id\": \"3302372d-a590-4c4b-b3e2-c070025a3b8e\"}";
                    //parentIdForChildRequests = JSON.parse(mocked)['id'];
                }
            };
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
