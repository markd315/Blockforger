'use strict';


    // Disable blocks lying around the workspace unconnected to our main start block.
    // (original idea stolen from OpenRoberta and optimized)

var original_onMouseUp_ = Blockly.Block.prototype.onMouseUp_;

Blockly.Block.prototype.onMouseUp_ = function(e) {
    original_onMouseUp_.call(this, e);

    if (Blockly.selected) {
        var rootBlock = Blockly.selected.getRootBlock();

        var isDisabled = (rootBlock.type != 'start');

        var descendants = Blockly.selected.getDescendants();
        for(var i in descendants) {
            descendants[i].setDisabled(isDisabled);
        }
    }
};


Blockly.FieldDropdown.prototype.setValue = function(newValue) {      // Allow the label on the closed menu to differ from values of the open menu
  this.value_ = newValue;
  // Look up and display the human-readable text.
  var options = this.getOptions_();
  for(var x = 0; x < options.length; x++) {
    // Options are tuples of human-readable text and language-neutral values.
    if (options[x][1] == newValue) {
      var shortValue = options[x][2] || options[x][0];
      this.setText(shortValue);
      return;
    }
  }
};

Blockly.Input.prototype.appendChild = function(allowedBlock, presenceLabel, absenceLabel) {

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
    //console.log(this);
    //console.log(this_input);
    this_input.sourceBlock_.toggleTargetBlockCustom(this_input, allowedBlock, this.sourceBlock_.workspace);
    return this;
};

Blockly.Input.prototype.appendArraySelector = function(schema, allowedBlocks, presenceLabel, absenceLabel) {
    if(allowedBlocks.length < 1){
        return;
    }
    var presenceLabel   = presenceLabel || this.name;
    var absenceLabel    = absenceLabel  || 'no '+this.name;
    var ddl_name        = 'ddl_'+this.name;

    var dd_list = [
        [ absenceLabel, ':REMOVE', absenceLabel]
    ];
    for(var i = 0; i < allowedBlocks.length; i++) {
        dd_list.push( [allowedBlocks[i], allowedBlocks[i], presenceLabel ] );
    }
    let appendKeyValuePairInput = function(rootInput, name) {
        var lastIndex = rootInput.length++;
        var appended_input = rootInput.appendValueInput('element_'+lastIndex);
        appended_input.appendField(new Blockly.FieldTextbutton('–', function() { this.sourceBlock_.deleteElementInput(appended_input); }) )
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
                    let tmp = appendKeyValuePairInput(this_input.sourceBlock_, allowedBlocks[0]);
                    return tmp.appendChild(allowedBlocks[0], Blockly.selectionArrow(), 'null');
                }
        ), ddl_name);
    }
    else{
        this
        .setAlign( this.type == Blockly.INPUT_VALUE ? Blockly.ALIGN_RIGHT : Blockly.ALIGN_LEFT)
        .appendField(new Blockly.FieldDropdown( dd_list, function(property) {
                    //Need to spawn the new connector first, then attach this.
                    let tmp = appendKeyValuePairInput(this_input.sourceBlock_, property);
                    return tmp.appendChild(property, Blockly.selectionArrow(), 'null');
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

    var dd_list = [
        [ absenceLabel, ':REMOVE', absenceLabel]
    ];
    for(var i = 0; i < allowedBlocks.length; i++) {
        dd_list.push( [allowedBlocks[i], allowedBlocks[i], presenceLabel ] );
    }
    let appendKeyValuePairInput = function(rootInput, name) {
        var lastIndex = rootInput.length++;
        var appended_input = rootInput.appendValueInput('element_'+lastIndex);
        appended_input.appendField(new Blockly.FieldTextbutton('–', function() { this.sourceBlock_.deleteKeyValuePairInput(appended_input); }) )
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
                    //Need to spawn the new connector first, then attach this.
                    let tmp = appendKeyValuePairInput(this_input.sourceBlock_, property);
                    return tmp.appendChild(targetType, Blockly.selectionArrow(), 'null');
                }
        ), ddl_name);

    return this;
};


Blockly.Input.prototype.appendSelector = function(allowedBlocks, presenceLabel, absenceLabel) {

    var presenceLabel   = presenceLabel || this.name;
    var absenceLabel    = absenceLabel  || 'no '+this.name;
    var ddl_name        = 'ddl_'+this.name;

    var dd_list = [
        [ absenceLabel, ':REMOVE', absenceLabel]
    ];
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

                    return this.sourceBlock_.toggleTargetBlock(this_input, targetType);
                }
        ), ddl_name);

    return this;
};

Blockly.Block.prototype.toggleTargetBlockCustom = function(input, targetType, workspace) {     // universal version: can create any type of targetBlocks
    var targetBlock = input ? this.getInputTargetBlock(input.name) : this.getNextBlock();      // named input or next  // add a new kind of block:
    targetBlock = Blockly.Block.obtain(workspace, targetType);
    targetBlock.initSvg();
    targetBlock.render();
    input.sourceBlock_.initSvg();
    input.sourceBlock_.render();

    var parentConnection = input ? this.getInput(input.name).connection : this.nextConnection;     // named input or next
    var childConnection = targetBlock.outputConnection || targetBlock.previousConnection;  // vertical or horizontal
    parentConnection.connect(childConnection);
};


Blockly.Block.prototype.toggleTargetBlock = function(input, targetType) {     // universal version: can create any type of targetBlocks
    var targetBlock = input ? this.getInputTargetBlock(input.name) : this.getNextBlock();              // named input or next
    if( targetType==':REMOVE' ) {
        if(targetBlock) {
            targetBlock.dispose(true, true);    // or targetBlock.unplug(...)
        }
    } else {
        if(targetBlock) {   // Don't remove it, but return the "override" value to make sure the DDL is up to date:
            return targetBlock.type;
        } else {            // add a new kind of block:
            targetBlock = Blockly.Block.obtain(Blockly.getMainWorkspace(), targetType);
            targetBlock.initSvg();
            targetBlock.render();

            var parentConnection = input ? this.getInput(input.name).connection : this.nextConnection;     // named input or next
            var childConnection = targetBlock.outputConnection || targetBlock.previousConnection;          // vertical or horizontal
            parentConnection.connect(childConnection);
        }
    }
};


    // A very useful mapping from connection back to input
Blockly.Connection.prototype.getInput = function() {
    var inputList = this.sourceBlock_.inputList;

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
    var ddl_field   = this.sourceBlock_.getField_(ddl_name);
    if(ddl_field) {
        var targetBlock = this.connection.targetBlock();
        var type = targetBlock ? targetBlock.type : ':REMOVE';
        ddl_field.setValue(type);
    }
}


    // Update the DDL on connect() :
var original_connect = Blockly.Connection.prototype.connect;

Blockly.Connection.prototype.connect = function(otherConnection) {

    try{
        original_connect.call(this, otherConnection);
        var parentConnection = this.isSuperior() ? this : otherConnection;  // since connect() is symmetrical we never know which way it is called
        parentConnection.getInput().updateLinkedDDL();
    }catch(e){
        let disconnectedBlock = otherConnection.sourceBlock_;
        if(disconnectedBlock.parentBlock_ == null){
            disconnectedBlock.dispose(true, true);
        }
    }
};


    // Update the DDL on disconnect() :
var original_disconnect = Blockly.Connection.prototype.disconnect;

Blockly.Connection.prototype.disconnect = function() {

    var parentConnection = this.isSuperior() ? this : this.targetConnection;  // since disconnect() is symmetrical we never know which way it is called

    original_disconnect.call(this);

    parentConnection.getInput().updateLinkedDDL();
};

