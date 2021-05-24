'use strict';

Blockly.JSON.toWorkspace = function(json_text, workspace) {
    var json_structure  = JSON.parse(json_text);
    workspace.clear();
    var startBlock = Blockly.Block.obtain(workspace, 'start');
    startBlock.initSvg();
    startBlock.render();
    Blockly.JSON.buildAndConnect(json_structure, startBlock.getInput('json').connection);
};

Blockly.JSON.buildAndConnect = function(json_structure, parentConnection) {
    if(json_structure === null) {
        return;
    } else {
        var json_keys = Object.keys(json_structure);
        var type  = typeof(json_structure);
        var json_values = Object.values(json_structure);
        if(type == 'boolean') {
            type = "true_false";
        } 
        else if(type == 'object') {

            if (json_keys[0] == "if"){
                type = "if_logic";
            }else if(json_keys[0] == "var"){
                type = "var";
            }else if(json_keys[0] == "!=" || json_keys[0] == "===" || json_keys[0] == "==" 
                    || json_keys[0] == "!=="){
                type = "logical";
            }else if(json_keys[0] == "!" || json_keys[0] == "!!"){
                type = "not";
            }else if(json_keys[0] == "and" || json_keys[0] == "or"){
                type = "boolean";
            }else if(json_keys[0] == "min" || json_keys[0] == "max"){
                type = "minmax";
            }else if(json_keys[0] == "*" || json_keys[0] == "/" || json_keys[0] == "+" 
                    || json_keys[0] == "-" || json_keys[0] == "%"){
                type = "arithmatic";
            }else if(json_keys[0] == "map" || json_keys[0] == "reduce" || json_keys[0] == "filter" 
                    || json_keys[0] == "all" || json_keys[0] == "none" || json_keys[0] == "some"){
                type = "map_filter";
            }else if(json_keys[0] == "merge"){
                type = "merge";
            }else if (json_keys[0] == ">" || json_keys[0] == ">=" || json_keys[0] == "<" 
                    || json_keys[0] == "<="){
                var json_values = Object.values(json_structure);
                if (json_values[0].length == 3){
                    type = "between";
                }else{ 
                    type = "comparison";
                }
            }else if (json_keys[0] == "in"){
                var json_values = Object.values(json_structure);
                type = (json_values[0][1] instanceof Array) ? "InMiss" : "inString";
            }
            else if(json_keys[0] == "missing" || json_keys[0] == "missing_some"){
                type = "InMiss";
            }else if(json_keys[0] == "cat"){
                type = "catString";
            }else if(json_keys[0] == "substr"){
                type = "subStr";
            }else {
                type = (json_structure instanceof Array) ? 'array' : 'dictionary';
            }
        }

        var targetBlock = Blockly.Block.obtain(parentConnection.sourceBlock_.workspace, type);
        targetBlock.initSvg();
        targetBlock.render();

        var childConnection = targetBlock.outputConnection;
        parentConnection.connect(childConnection);

        switch(type) {

            case 'string':
                targetBlock.setFieldValue( String(json_structure), 'string_value' );
                break;
            case 'number':
                targetBlock.setFieldValue( String(json_structure), 'number_value' );
                break;
            case 'true_false':
                targetBlock.setFieldValue(String(Boolean(json_structure)), 'bool');
                break;
            case 'var':
                var i=0;
                for(var key in json_structure) {
                    var elementConnection = targetBlock.getInput('json'+i).connection;
                    Blockly.JSON.buildAndConnect(json_structure[key], elementConnection);
                    i++;
                }
                break;
            case 'dictionary':
                var i=0;
                for(var key in json_structure) {
                    targetBlock.appendKeyValuePairInput();
                    targetBlock.setFieldValue( key, 'key_field_'+i );
                    var elementConnection = targetBlock.getInput('element_'+i).connection;
                    Blockly.JSON.buildAndConnect(json_structure[key], elementConnection);
                    i++;
                }
                break;
            case 'array':
                for(var i in json_structure) {
                    targetBlock.appendElementInput();
                    var elementConnection = targetBlock.getInput('element_'+i).connection;
                    Blockly.JSON.buildAndConnect(json_structure[i], elementConnection);
                }
                break;
            case 'if_logic':
                var key = json_keys[0];
                for(var i in json_structure[key]) {
                    targetBlock.appendElementInput();
                    var elementConnection = targetBlock.getInput('element_'+i).connection;
                    Blockly.JSON.buildAndConnect(json_structure[key][i], elementConnection);
                }
                break;
            case 'logical':
                var key = json_keys[0]; 
                for(var i in json_structure[key]) {
                    targetBlock.setFieldValue( key, 'operator');
                    var elementConnection = targetBlock.getInput('json'+i).connection;
                    Blockly.JSON.buildAndConnect(json_structure[key][i], elementConnection);
                }
                break;
            case 'not':
                var key = json_keys[0]; 
                for(var i in json_structure[key]) {
                    targetBlock.setFieldValue( key, 'operator');
                    var elementConnection = targetBlock.getInput('json'+i).connection;
                    Blockly.JSON.buildAndConnect(json_structure[key][i], elementConnection);
                }
                break;
            case 'boolean':
                var key=json_keys[0];
                for(var i in json_structure[key]) {
                    targetBlock.appendElementInput();
                    targetBlock.setFieldValue( key, 'operator');
                    var elementConnection = targetBlock.getInput('element_'+i).connection;
                    Blockly.JSON.buildAndConnect(json_structure[key][i], elementConnection);
                }
                break;
            case 'comparison':
                var key = json_keys[0]; 
                for(var i in json_structure[key]) {
                    targetBlock.setFieldValue( key, 'operator');
                    var elementConnection = targetBlock.getInput('json'+i).connection;
                    Blockly.JSON.buildAndConnect(json_structure[key][i], elementConnection);
                }
                break;
            case 'minmax':
                var key=json_keys[0];
                for(var i in json_structure[key]) {
                    targetBlock.appendElementInput();
                    targetBlock.setFieldValue( key, 'operator');
                    var elementConnection = targetBlock.getInput('element_'+i).connection;
                    Blockly.JSON.buildAndConnect(json_structure[key][i], elementConnection);
                }
                break;
            case 'between':
                var key = json_keys[0]; 
                for(var i in json_structure[key]) {
                    targetBlock.setFieldValue( key, 'operator');
                    var elementConnection = targetBlock.getInput('json'+i).connection;
                    Blockly.JSON.buildAndConnect(json_structure[key][i], elementConnection);
                }
                break;
            case 'arithmatic':
                var key=json_keys[0];
                for(var i in json_structure[key]) {
                    targetBlock.appendElementInput();
                    targetBlock.setFieldValue( key, 'operator');
                    var elementConnection = targetBlock.getInput('element_'+i).connection;
                    Blockly.JSON.buildAndConnect(json_structure[key][i], elementConnection);
                }
                break;
            case 'map_filter':
                var key=json_keys[0];
                for(var i in json_structure[key]) {
                    targetBlock.appendElementInput();
                    targetBlock.setFieldValue( key, 'operator');
                    var elementConnection = targetBlock.getInput('element_'+i).connection;
                    Blockly.JSON.buildAndConnect(json_structure[key][i], elementConnection);
                }
                break;
            case 'merge':
                var key = json_keys[0];
                for(var i in json_structure[key]) {
                    targetBlock.appendElementInput();
                    var elementConnection = targetBlock.getInput('element_'+i).connection;
                    Blockly.JSON.buildAndConnect(json_structure[key][i], elementConnection);
                }
                break;
            case 'InMiss':
                var key=json_keys[0];
                for(var i in json_structure[key]) {
                    targetBlock.appendElementInput();
                    targetBlock.setFieldValue( key, 'operator');
                    var elementConnection = targetBlock.getInput('element_'+i).connection;
                    Blockly.JSON.buildAndConnect(json_structure[key][i], elementConnection);
                }
                break;
            case 'inString':
                var key=json_keys[0];
                for(var i in json_structure[key]) {
                    var elementConnection = targetBlock.getInput('json'+i).connection;
                    Blockly.JSON.buildAndConnect(json_structure[key][i], elementConnection);
                }
                break;
            case 'catString':
                var key = json_keys[0];
                for(var i in json_structure[key]) {
                    targetBlock.appendElementInput();
                    var elementConnection = targetBlock.getInput('element_'+i).connection;
                    Blockly.JSON.buildAndConnect(json_structure[key][i], elementConnection);
                }
                break;
            case 'subStr':
                var key = json_keys[0];
                for(var i in json_structure[key]) {
                    targetBlock.appendElementInput();
                    var elementConnection = targetBlock.getInput('element_'+i).connection;
                    Blockly.JSON.buildAndConnect(json_structure[key][i], elementConnection);
                }
                break;
        }
    }
};
