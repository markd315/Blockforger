'use strict';


    // Disable blocks lying around the workspace unconnected to our main start block.
    // (original idea stolen from OpenRoberta and optimized)

var original_onMouseUp_ = Blockly.Block.prototype.onMouseUp_;

Blockly.Block.prototype.onMouseUp_ = function(e) {
    original_onMouseUp_.call(this, e);

    if (Blockly.getSelected && Blockly.getSelected()) {
        var rootBlock = Blockly.getSelected().getRootBlock();

        var isDisabled = (rootBlock.type != 'start');

        var descendants = Blockly.getSelected().getDescendants(false);
        for(var i in descendants) {
            descendants[i].setEnabled(!isDisabled);
            console.log(descendants[i]);
        }
    }
};


Blockly.Input.prototype.appendChild = function(allowedBlock, presenceLabel, absenceLabel, isOptionalField) {

    var presenceLabel   = presenceLabel || this.name;
    var absenceLabel    = absenceLabel  || 'no '+this.name;
    var ddl_name        = 'ddl_'+this.name;

    var dd_list = [
        [ absenceLabel, allowedBlock, absenceLabel]
    ];
    dd_list.push( [presenceLabel+': ', allowedBlock, presenceLabel ] );

    var this_input = this;
    this
        .setAlign( this.type == Blockly.INPUT_VALUE ? Blockly.ALIGN_RIGHT : Blockly.ALIGN_LEFT)
        .appendField(new Blockly.FieldTextbutton(allowedBlock, function() {
                    return this.sourceBlock_.toggleTargetBlock(this_input, allowedBlock);
                }
        ), ddl_name);
    return this;
};

Blockly.Input.prototype.appendArraySelector = function(schema, allowedBlocks, presenceLabel, absenceLabel) {
    if(allowedBlocks.length < 1){
        return;
    }
    var presenceLabel   = presenceLabel || this.name;
    var absenceLabel    = absenceLabel  || 'no '+this.name;
    var ddl_name        = 'ddl_'+this.name;

    var dd_list = [];
    for(var i = 0; i < allowedBlocks.length; i++) {
        dd_list.push( [allowedBlocks[i], allowedBlocks[i], presenceLabel ] );
    }
    let appendKeyValuePairInput = function(rootInput, name) {
        var lastIndex = rootInput.length++;
        var appended_input = rootInput.appendValueInput('element_'+lastIndex);
        appended_input.appendField(new Blockly.FieldTextbutton('–', function() { 
            this.sourceBlock_.deleteElementInput(appended_input);
            updateJSONarea(this.sourceBlock_.workspace);
        }) )
            .appendField(new Blockly.FieldLabel(name), 'key_field_'+lastIndex)
            .appendField( Blockly.keyValueArrow() );

        rootInput.moveInputBefore('element_'+lastIndex);

        return appended_input;
    }
    var this_input = this;
    if(allowedBlocks.length == 1){
        this
        .setAlign( this.type == Blockly.INPUT_VALUE ? Blockly.ALIGN_RIGHT : Blockly.ALIGN_LEFT)
        .appendField(new Blockly.FieldTextbutton('+', function() {
                    //Need to spawn the new connector first, then attach this.
                    let tmp = appendKeyValuePairInput(this_input.sourceBlock, allowedBlocks[0]);
                    // For typed arrays, create the specific type; for generic arrays, default to string
                    const defaultType = allowedBlocks[0];
                    this_input.sourceBlock.toggleTargetBlock(tmp, defaultType);
                    
                    // Select the new child block, not the parent
                    setTimeout(() => {
                        if (window.getKeyboardManager) {
                            const keyboardManager = window.getKeyboardManager();
                            if (keyboardManager) {
                                // Find the newly created child block
                                const newChild = tmp.connection ? tmp.connection.targetBlock() : null;
                                if (newChild) {
                                    keyboardManager.forceSelectBlock(newChild);
                                }
                            }
                        }
                    }, 10);
                    
                    return tmp;
                }
        ), ddl_name);
    }
    else{
        this
        .setAlign( this.type == Blockly.INPUT_VALUE ? Blockly.ALIGN_RIGHT : Blockly.ALIGN_LEFT)
        .appendField(new Blockly.FieldDropdown( dd_list, function(property) {
                    // This is a type selection dropdown - just change the type, don't create new inputs
                    return this.sourceBlock_.toggleTargetBlock(this_input, property);
                }
        ), ddl_name);
    }
   

    return this;
};

Blockly.Input.prototype.appendOptionalFieldsSelector = function(schema, allowedBlocks, presenceLabel, absenceLabel) {
    if(allowedBlocks.length < 1){
        return;
    }
    var presenceLabel   = presenceLabel || this.name;
    var absenceLabel    = absenceLabel  || 'no '+this.name;
    var ddl_name        = 'ddl_'+this.name;

    var dd_list = [];
    for(var i = 0; i < allowedBlocks.length; i++) {
        dd_list.push( [allowedBlocks[i], allowedBlocks[i], presenceLabel ] );
    }
    let appendKeyValuePairInput = function(rootInput, name) {
        for(const idx in rootInput.inputList){
            let input = rootInput.inputList[idx];
            if(input.fieldRow.length == 4){ //Optional field, because of the destructor
                if(input.fieldRow[1].getText && input.fieldRow[1].getText() == name){
                    return null; //break out if adding a duplicate field
                }
            }
        }
        var lastIndex = rootInput.length++;
        var appended_input = rootInput.appendValueInput('element_'+lastIndex);
        appended_input.appendField(new Blockly.FieldTextbutton('–', function() { 
            this.sourceBlock_.deleteKeyValuePairInput(appended_input);
            updateJSONarea(this.sourceBlock_.workspace);
        }) )
            .appendField(new Blockly.FieldLabel(name), 'key_field_'+lastIndex)
            .appendField( Blockly.keyValueArrow() );

        rootInput.moveInputBefore('element_'+lastIndex);

        return appended_input;
    }
    var this_input = this;
    this
        .setAlign( this.type == Blockly.INPUT_VALUE ? Blockly.ALIGN_RIGHT : Blockly.ALIGN_LEFT)
        .appendField(new Blockly.FieldDropdown( dd_list, function(property) {
                    var targetType = schema.properties[property].type;
                    if(targetType == undefined){
                        targetType = schema.properties[property]['$ref'].replace(".json", "");
                    }
                    if(targetType == 'integer'){
                        targetType = 'number';
                    }
                    if(targetType == 'array'){
                        let prop = schema.properties[property];
                        var items = prop.items.type;
                        if(items == undefined){
                            items = prop.items['$ref'].replace(".json","");
                        }
                        targetType = items + '_array';
                    }
                    // This is a type selection dropdown - just change the type, don't create new inputs
                    return this.sourceBlock_.toggleTargetBlock(this_input, targetType);
                }
        ), ddl_name);
    return this;
};


Blockly.Input.prototype.appendSelector = function(allowedBlocks, presenceLabel, absenceLabel) {
    var presenceLabel   = presenceLabel || this.name;
    var absenceLabel    = absenceLabel  || 'no '+this.name;
    var ddl_name        = 'ddl_'+this.name;

    var dd_list = [];
    if(allowedBlocks.length == 1) {
        dd_list.push( [presenceLabel+': ', allowedBlocks[0], presenceLabel ] );
    } else {
        for(var i = 0; i < allowedBlocks.length; i++) {
            dd_list.push( [allowedBlocks[i], allowedBlocks[i], presenceLabel ] );
        }
    }

    var this_input = this;
    this//.setCheck(allowedBlocks)  // FIXME: we'll need to re-establish the connection rules somehow!
        .setAlign( this.type == Blockly.INPUT_VALUE ? Blockly.ALIGN_RIGHT : Blockly.ALIGN_LEFT)
        .appendField(new Blockly.FieldDropdown( dd_list, function(targetType) {
                    // Prevent recursive calls from updateLinkedDDL
                    if (this_input._updatingDDL) {
                        return;
                    }
                    return this.sourceBlock_.toggleTargetBlock(this_input, targetType);
                }
        ), ddl_name);
        //.appendField(new Blockly.FieldDropdown(dd_list), ddl_name);
        //TODO that one above is working

    return this;
};

Blockly.Block.prototype.toggleTargetBlockCustom = function(input, targetType, workspace, render) {     // universal version: can create any type of targetBlocks
    var existingBlock = input ? this.getInputTargetBlock(input.name) : this.getNextBlock();
    
    // If there's already a block, dispose of it first
    if (existingBlock) {
        existingBlock.dispose(true, true);
    }
    
    // Create new block
    var targetBlock = workspace.newBlock(targetType);
    
    // Always initialize and render the block
    targetBlock.initSvg();
    targetBlock.render();
    
    // Connect first, then render parent
    var parentConnection = input ? this.getInput(input.name).connection : this.nextConnection;     // named input or next
    var childConnection = targetBlock.outputConnection || targetBlock.previousConnection;  // vertical or horizontal
    parentConnection.connect(childConnection);
    
    // Also render the parent block after connection
    if (input && input.sourceBlock) {
        input.sourceBlock.initSvg();
        input.sourceBlock.render();
    }
    
    // Force workspace render to ensure visibility
    workspace.render();
    const reqFields = input.sourceBlock.inputList;
    const schemaName = input.sourceBlock.type;
    const propertyName = input.fieldRow[0].getText ? input.fieldRow[0].getText() : input.fieldRow[0].text_;
    var property = "tmp"
    const lib = getSchemaLibrary()
    if(schemaName in lib){
        const schema_def = lib[schemaName]
        property = schema_def.properties[propertyName];
    }else{
        property = "-"
    }
    const arr = targetBlock.inputList[0].fieldRow;
    if(property != undefined && property.default != undefined){
        for(const idx in arr){
            if(arr[idx].name != undefined){
                arr[idx].setText(property.default); //TODO set default like this.
            }
        }
    }
};


Blockly.Block.prototype.toggleTargetBlock = function(input, targetType) {     // universal version: can create any type of targetBlocks
    var targetBlock = input ? this.getInputTargetBlock(input.name) : this.getNextBlock();              // named input or next
    if( targetType==':NULL' ) {
        if(targetBlock) {
            targetBlock.dispose(true, true); 
        }
    } else {
        if(targetBlock) {   
            // If there's already a block and it's a different type, dispose of it and create a new one
            if(targetBlock.type !== targetType) {
                targetBlock.dispose(true, true);  // Dispose recursively (including grandchildren)
                targetBlock = null;
            } else {
                // Same type, no change needed
                return targetBlock.type;
            }
        }
        
        if(!targetBlock) {  // Create new block (either no block existed, or we disposed of the old one)
            // If targetType is still a dropdown default, create actual block
            var actualType = targetType;
            if (targetType === 'string' && !targetBlock) {
                actualType = 'string';  // Create actual string block
            }
            
            targetBlock = this.workspace.newBlock(actualType);
            targetBlock.initSvg();
            targetBlock.render();

            var parentConnection = input ? this.getInput(input.name).connection : this.nextConnection;     // named input or next
            var childConnection = targetBlock.outputConnection || targetBlock.previousConnection;          // vertical or horizontal
            parentConnection.connect(childConnection);
            
            // Set selection on the new block after a short delay to ensure it's fully rendered
            setTimeout(() => {
                if (window.getKeyboardManager) {
                    const keyboardManager = window.getKeyboardManager();
                    if (keyboardManager && targetBlock && typeof targetBlock.addSelect === 'function') {
                        keyboardManager.forceSelectBlock(targetBlock);
                    }
                }
            }, 10);
        }
    }
};


    // A very useful mapping from connection back to input
Blockly.Connection.prototype.getInput = function() {
    var inputList = this.getSourceBlock().inputList;

    for(var i in inputList) {
        var connection = inputList[i].connection;
        if(connection == this) {
            return inputList[i];
        }
    }
};


    // If there is a ddl linked with the input, update its label to the type of the block plugged in:
Blockly.Input.prototype.updateLinkedDDL = function() {

    var ddl_name    = 'ddl_'+this.name;
    var ddl_field   = this.sourceBlock.getField(ddl_name);
    if(ddl_field) {
        var targetBlock = this.connection.targetBlock();
        var type = targetBlock ? targetBlock.type : 'string';
        
        // Set flag to prevent recursive calls
        this._updatingDDL = true;
        ddl_field.setValue(type);
        this._updatingDDL = false;
    }
}


    // Update the DDL on connect() :
var original_connect = Blockly.Connection.prototype.connect;

Blockly.Connection.prototype.connect = function(otherConnection) {

    try{
        original_connect.call(this, otherConnection);
        var parentConnection = this.isSuperior() ? this : otherConnection;  // since connect() is symmetrical we never know which way it is called
        
        // Check if parentConnection exists and has a valid input before updating DDL
        if (parentConnection && parentConnection.getInput) {
            var input = parentConnection.getInput();
            if (input && input.updateLinkedDDL) {
                input.updateLinkedDDL();
            }
        }
    }catch(e){
        let disconnectedBlock = otherConnection.getSourceBlock();
        if(disconnectedBlock.getParent() == null){
            disconnectedBlock.dispose(true, true);
        }
    }
};


    // Update the DDL on disconnect() :
var original_disconnect = Blockly.Connection.prototype.disconnect;

Blockly.Connection.prototype.disconnect = function() {

    var parentConnection = this.isSuperior() ? this : this.targetConnection;  // since disconnect() is symmetrical we never know which way it is called

    original_disconnect.call(this);

    // Check if parentConnection exists and has a valid input before updating DDL
    if (parentConnection && parentConnection.getInput) {
        var input = parentConnection.getInput();
        if (input && input.updateLinkedDDL) {
            input.updateLinkedDDL();
        }
    }
};
