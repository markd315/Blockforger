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
        // Get the source block from the input
        var sourceBlock = rootInput.sourceBlock_;
        if (!sourceBlock) {
            console.warn('No source block found for input:', rootInput);
            return null;
        }
        
        var lastIndex = sourceBlock.length++;
        var appended_input = sourceBlock.appendValueInput('element_'+lastIndex);
        appended_input.appendField(new Blockly.FieldTextbutton('–', function() { 
            // Use the correct sourceBlock reference
            if (this.sourceBlock) {
                this.sourceBlock.deleteElementInput(appended_input);
                if (typeof updateJSONarea === 'function') {
                    updateJSONarea(this.sourceBlock.workspace);
                }
            }
        }) )
            .appendField(new Blockly.FieldLabel(name), 'key_field_'+lastIndex)
            .appendField( Blockly.keyValueArrow() );

        sourceBlock.moveInputBefore('element_'+lastIndex);

        return appended_input;
    }
    var this_input = this;
    if(allowedBlocks.length == 1){
        this
        .setAlign( this.type == Blockly.INPUT_VALUE ? Blockly.ALIGN_RIGHT : Blockly.ALIGN_LEFT)
        .appendField(new Blockly.FieldTextbutton('+', function() {
                    //Need to spawn the new connector first, then attach this.
                    let tmp = appendKeyValuePairInput(this_input.sourceBlock, allowedBlocks[0]);
                    if (!tmp) {
                        console.warn('Failed to create key-value pair input');
                        return;
                    }
                    
                    // For typed arrays, create the specific type; for generic arrays, default to string
                    const defaultType = allowedBlocks[0];
                    
                    // Ensure the input is properly initialized before calling toggleTargetBlock
                    try {
                        // Wait for the next tick to ensure the input is fully initialized
                        setTimeout(() => {
                            if (tmp && tmp.name && this_input.sourceBlock) {
                                this_input.sourceBlock.toggleTargetBlock(tmp, defaultType);
                                
                                // Select the new child block, not the parent
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
                            }
                        }, 0);
                    } catch (e) {
                        console.error('Failed to toggle target block:', e);
                    }
                    
                    return tmp;
                }
        ), ddl_name);
    }
    else{
        this
        .setAlign( this.type == Blockly.INPUT_VALUE ? Blockly.ALIGN_RIGHT : Blockly.ALIGN_LEFT)
        .appendField(new Blockly.FieldDropdown( dd_list, function(property) {
                    // This is a type selection dropdown - just change the type, don't create new inputs
                    // Ensure we have a valid sourceBlock before calling toggleTargetBlock
                    if (this_input.sourceBlock) {
                        return this_input.sourceBlock.toggleTargetBlock(this_input, property);
                    } else {
                        console.warn('Source block not available for array selector dropdown callback');
                        return null;
                    }
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
        // Get the source block from the input
        var sourceBlock = rootInput.sourceBlock_;
        if (!sourceBlock) {
            console.warn('No source block found for input:', rootInput);
            return null;
        }
        
        for(const idx in sourceBlock.inputList){
            let input = sourceBlock.inputList[idx];
            if(input.fieldRow.length == 4){ //Optional field, because of the destructor
                if(input.fieldRow[1].getText && input.fieldRow[1].getText() == name){
                    return null; //break out if adding a duplicate field
                }
            }
        }
        var lastIndex = sourceBlock.length++;
        var appended_input = sourceBlock.appendValueInput('element_'+lastIndex);
        appended_input.appendField(new Blockly.FieldTextbutton('–', function() { 
            // Use the correct sourceBlock reference
            if (this.sourceBlock_) {
                this.sourceBlock_.deleteKeyValuePairInput(appended_input);
                if (typeof updateJSONarea === 'function') {
                    updateJSONarea(this.sourceBlock_.workspace);
                }
            }
        }) )
            .appendField(new Blockly.FieldLabel(name), 'key_field_'+lastIndex)
            .appendField( Blockly.keyValueArrow() );

        // Move the new input to the correct position (after the dropdown)
        sourceBlock.moveInputBefore('element_'+lastIndex);

        return appended_input;
    }
    
    var this_input = this;
    this
        .setAlign( this.type == Blockly.INPUT_VALUE ? Blockly.ALIGN_RIGHT : Blockly.ALIGN_LEFT)
        .appendField(new Blockly.FieldDropdown( dd_list, function(property) {
                    //Check and bail if this property is already attached to the block anywhere in the inputList
                    for(const idx in this_input.sourceBlock.inputList){
                        if(idx == 0){ //Skip the type of the block, go to the next row to see fields.
                            continue;
                        }
                        let input = this_input.sourceBlock.inputList[idx];
                        if(input.fieldRow[1].value_ == property){ // first fieldrow of optional fields is the delete button, second is field name
                            return;
                        }
                    }


                    // Create the new input connection first

                    var newInput = appendKeyValuePairInput(this_input.sourceBlock, property);
                    if (!newInput) {
                        return; // Field already exists
                    }
                    
                    // Now create and attach the appropriate block type
                    var targetType = 'string'; // default fallback
                    if (schema.properties && schema.properties[property]) {
                        targetType = schema.properties[property].type;
                        if(targetType == undefined && schema.properties[property]['$ref']){
                            targetType = schema.properties[property]['$ref'].replace(".json", "");
                        }
                        if(targetType == 'integer'){
                            targetType = 'number';
                        }
                        if(targetType == 'array' && schema.properties[property].items){
                            let prop = schema.properties[property];
                            var items = prop.items.type;
                            if(items == undefined && prop.items['$ref']){
                                items = prop.items['$ref'].replace(".json","");
                            }
                            if (items) {
                                targetType = items + '_array';
                            }
                        }
                    } else {
                        console.warn(`Property ${property} not found in schema for optional field`);
                    }
                    
                    // Create the block and connect it to the new input
                    try {
                        // Check if the block type exists
                        if (!Blockly.Blocks[targetType]) {
                            console.warn(`Block type ${targetType} not found, using string as fallback`);
                            targetType = 'string';
                        }
                        var targetBlock = this_input.sourceBlock.workspace.newBlock(targetType);
                    } catch (e) {
                        console.error(`Failed to create block ${targetType} for optional field ${property}:`, e);
                        return;
                    }
                    
                    // Connect the new block to the newly created input
                    var parentConnection = newInput.connection;
                    var childConnection = targetBlock.outputConnection || targetBlock.previousConnection;
                    if (parentConnection && childConnection) {
                        try {
                            parentConnection.connect(childConnection);
                        } catch (e) {
                            console.warn(`Failed to connect block ${targetType} for optional field ${property}:`, e);
                        }
                        
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
                    
                    // Update the JSON area
                    if (typeof updateJSONarea === 'function') {
                        updateJSONarea(this_input.sourceBlock.workspace);
                    }
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
                    console.log('=== DROPDOWN CALLBACK ===');
                    console.log('targetType received:', targetType);
                    console.log('targetType type:', typeof targetType);
                    console.log('dd_list:', dd_list);
                    console.log('this_input:', this_input);
                    
                    // Prevent recursive calls from updateLinkedDDL
                    if (this_input._updatingDDL) {
                        console.log('Recursive call prevented');
                        return;
                    }
                    // Ensure we have a valid sourceBlock before calling toggleTargetBlock
                    if (this_input.sourceBlock) {
                        console.log('Calling toggleTargetBlock with:', targetType);
                        return this_input.sourceBlock.toggleTargetBlock(this_input, targetType);
                    } else {
                        console.warn('Source block not available for dropdown callback');
                        return null;
                    }
                }
        ), ddl_name);

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
    logger.log("Initializing and rendering block ", targetType);
    logger.log("targetBlock", targetBlock);
    if (targetBlock.workspace) {
        try {
            targetBlock.initSvg();
            targetBlock.render();
        } catch (e) {
            console.warn(`Failed to initialize SVG for custom block ${targetType}:`, e);
        }
    }
    
    // Connect first, then render parent
    var parentConnection = input ? this.getInput(input.name).connection : this.nextConnection;     // named input or next
    var childConnection = targetBlock.outputConnection || targetBlock.previousConnection;  // vertical or horizontal
    parentConnection.connect(childConnection);
    
    // Also render the parent block after connection
    if (input && input.sourceBlock && input.sourceBlock.workspace) {
        try {
            input.sourceBlock.initSvg();
            input.sourceBlock.render();
        } catch (e) {
            console.warn(`Failed to render parent block:`, e);
        }
    }
    
    // Force workspace render to ensure visibility
    if (workspace && workspace.workspace) {
        try {
            workspace.render();
        } catch (e) {
            console.warn(`Failed to render workspace:`, e);
        }
    }
    // Safely access fieldRow and property information
    if (input && input.sourceBlock && input.sourceBlock.inputList && input.sourceBlock.inputList.length > 0) {
        const reqFields = input.sourceBlock.inputList;
        const schemaName = input.sourceBlock.type;
        
        // Safely get property name from fieldRow
        let propertyName = null;
        if (input.fieldRow && input.fieldRow.length > 0 && input.fieldRow[0]) {
            propertyName = input.fieldRow[0].getText ? input.fieldRow[0].getText() : input.fieldRow[0].text_;
        }
        
        var property = "tmp";
        if (propertyName) {
            const lib = getSchemaLibrary();
            if (schemaName && schemaName in lib) {
                const schema_def = lib[schemaName];
                if (schema_def && schema_def.properties && schema_def.properties[propertyName]) {
                    property = schema_def.properties[propertyName];
                }
            }
        }
        
        // Safely set default value if available
        if (property && property !== "tmp" && property.default !== undefined && targetBlock && targetBlock.inputList && targetBlock.inputList.length > 0) {
            const arr = targetBlock.inputList[0].fieldRow;
            if (arr && arr.length > 0) {
                for (const idx in arr) {
                    if (arr[idx] && arr[idx].name !== undefined && typeof arr[idx].setText === 'function') {
                        try {
                            arr[idx].setText(property.default);
                        } catch (e) {
                            console.warn(`Failed to set default text for field ${arr[idx].name}:`, e);
                        }
                    }
                }
            }
        }
    }
};


Blockly.Block.prototype.toggleTargetBlock = function(input, targetType) {     // universal version: can create any type of targetBlocks
    // Ensure input is valid before accessing its properties
    if (input && !input.name) {
        console.warn('toggleTargetBlock called with invalid input:', input);
        return;
    }
    
    console.log('=== toggleTargetBlock ENTRY ===');
    console.log('input:', input);
    console.log('targetType:', targetType);
    console.log('targetType type:', typeof targetType);
    console.log('this:', this);
    
    var targetBlock = input ? this.getInputTargetBlock(input.name) : this.getNextBlock();              // named input or next
    console.log('existing targetBlock:', targetBlock);
    
    if( targetType==':NULL' ) {
        if(targetBlock) {
            targetBlock.dispose(true, true); 
        }
    } else if (!targetType || targetType === 'undefined') {
        console.warn('targetType is undefined or "undefined", cannot create block');
        return;
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
            
            console.log('=== BLOCK CREATION DEBUG ===');
            console.log('targetType:', targetType);
            console.log('actualType:', actualType);
            console.log('this.workspace:', this.workspace);
            console.log('this.type:', this.type);
            console.log('input:', input);
            if (input) {
                console.log('input.name:', input.name);
                console.log('input.fieldRow:', input.fieldRow);
                console.log('input.sourceBlock:', input.sourceBlock);
            }
            
            // Ensure we have a valid workspace before creating the block
            if (!this.workspace) {
                console.warn('Cannot create block: no workspace available');
                return;
            }
            
            try {
                console.log('About to create block with type:', actualType);
                targetBlock = this.workspace.newBlock(actualType);
                console.log('Created targetBlock:', targetBlock);
                console.log('targetBlock.type:', targetBlock ? targetBlock.type : 'undefined');
                console.log('targetBlock.workspace:', targetBlock ? targetBlock.workspace : 'undefined');
                console.log('targetBlock.inputList:', targetBlock ? targetBlock.inputList : 'undefined');
                
                // Only initialize SVG if the block has a workspace
                if (targetBlock && targetBlock.workspace) {
                    console.log('About to initialize SVG for block:', actualType);
                    try {
                        targetBlock.initSvg();
                        console.log('SVG initialized successfully');
                        console.log('About to render block:', actualType);
                        targetBlock.render();
                        console.log('Block rendered successfully');
                    } catch (e) {
                        console.warn(`Failed to initialize SVG for block ${actualType}:`, e);
                        console.log('Error details:', e.stack);
                    }
                } else {
                    console.warn('Target block or workspace not available for SVG initialization');
                }
            } catch (e) {
                console.error(`Failed to create block ${actualType}:`, e);
                console.log('Error details:', e.stack);
                return;
            }

            var parentConnection = null;
            if (input && input.name) {
                const inputObj = this.getInput(input.name);
                if (inputObj && inputObj.connection) {
                    parentConnection = inputObj.connection;
                }
            }
            if (!parentConnection) {
                parentConnection = this.nextConnection;
            }
            
            // Ensure we have valid connections before attempting to connect
            if (parentConnection && targetBlock) {
                var childConnection = targetBlock.outputConnection || targetBlock.previousConnection;
                if (childConnection) {
                    try {
                        parentConnection.connect(childConnection);
                    } catch (e) {
                        console.warn(`Failed to connect blocks:`, e);
                    }
                } else {
                    console.warn(`No valid connection found on target block ${targetBlock.type}`);
                }
            } else {
                console.warn(`Cannot connect blocks: parentConnection=${!!parentConnection}, targetBlock=${!!targetBlock}`);
            }
            
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
