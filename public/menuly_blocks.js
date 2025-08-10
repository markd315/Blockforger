'use strict';


Blockly.selectionArrow  = function() { return Blockly.RTL ? "←" : "→"; };
Blockly.keyValueArrow   = function() { return Blockly.RTL ? "⇐" : "⇒"; };

//==========================================================================================================

//TODO add base schema objects to this (base flag in schema file)
var selectorBlocks = ['dictionary', 'dynarray', 'number', 'string',
                          'boolean', 'number_array', 'string_array',
                          'boolean_array'];

function appendElementInput(that) {

        var lastIndex = that.length++;

        var appended_input = that.appendValueInput('element_'+lastIndex);
        appended_input.appendField(new Blockly.FieldTextbutton('–', function() { that.deleteElementInput(appended_input); }) )
          .appendSelector(selectorBlocks, Blockly.selectionArrow(), 'string');
          
        that.moveInputBefore('element_'+lastIndex);

        // Create a default string block for the new input
        that.toggleTargetBlock(appended_input, 'string');

        return appended_input;
  }

function deleteElementInput(inputToDelete, that) {

        var inputNameToDelete = inputToDelete.name;

        var substructure = that.getInputTargetBlock(inputNameToDelete);
        if(substructure) {
            substructure.dispose(true, true);
        }
        that.removeInput(inputNameToDelete);

        var inputIndexToDelete = parseInt(inputToDelete.name.match(/\d+/)[0]);

        var lastIndex = --that.length;

        for(var i=inputIndexToDelete+1; i<=lastIndex; i++) { // rename all the subsequent element-inputs
            var input  = that.getInput( 'element_'+i );

            input.name = 'element_'+(i-1);
        }
  }

//------------------------------------------------------------------------------------------------------- 

var schemadict = {}

function propertyInList(property, list){
  for(let element in list){
    if(property == list[element]){
      return true;
    }
  }
  return false;
}

function optionalFields(schema){
  var list = []
  for(var property in schema.properties){
    if(! propertyInList(property, schema.required)) {
      list.push(property);
    }
  }
  return list;
}

function subclassTypes(schema, name){
  var list = []
  list.push(name)
  //TODO use schema to decide on inheritance
  return list;
}

function addBlockFromSchema(name, schema) {
  selectorBlocks.push(name);
  Blockly.Blocks[name] = {
      length: 0,
      init: function() {
        this.setColour(schema.color);
        this.setOutput(true, ["element"]);
        this.setInputsInline(false);
        //Optionals
        this.appendDummyInput('open_bracket')
          .appendField(" " + name + " ")
          .appendOptionalFieldsSelector(schema, optionalFields(schema), Blockly.selectionArrow(), ' ');
        this.initSvg();
        this.render();

        //Requireds
        for(var requiredField in schema.required){
          let fieldName = schema.required[requiredField]
          var lastIndex = this.length++;
          // Get the field type from schema
          var fieldType = schema.properties[fieldName].type;
          if(fieldType == undefined){
            fieldType = schema.properties[fieldName]['$ref'].replace(".json", "");
          }
          if(fieldType == 'integer'){
            fieldType = 'number';
          }
          if(fieldType == 'array'){
            fieldType = schema.properties[fieldName]['items']['$ref'].replace(".json", "") + '_array';
          }
          
          // Create the input with field name and arrow
          var appended_input = this.appendValueInput('element_'+lastIndex);
          appended_input.appendField(new Blockly.FieldLabel(fieldName), 'key_field_'+lastIndex)
              .appendField(new Blockly.FieldTextbutton(fieldType, function() {}))
              .appendField( Blockly.keyValueArrow() );
          
          // Set the input type for validation
          //appended_input.setCheck(fieldType);
          
          // Create the block of the correct type and attach it
          try {
            var targetBlock = this.workspace.newBlock(fieldType);
            targetBlock.initSvg();
            targetBlock.render();
            
            // Connect the new block to the input
            var parentConnection = appended_input.connection;
            var childConnection = targetBlock.outputConnection || targetBlock.previousConnection;
            if (parentConnection && childConnection) {
              parentConnection.connect(childConnection);
              
              // Set default value if specified in schema
              if (schema.properties[fieldName].default !== undefined) {
                if (fieldType === 'string' && targetBlock.getField('string_value')) {
                  targetBlock.setFieldValue(schema.properties[fieldName].default, 'string_value');
                } else if (fieldType === 'number' && targetBlock.getField('number_value')) {
                  targetBlock.setFieldValue(schema.properties[fieldName].default, 'number_value');
                }
              }
            }
          } catch (e) {
            console.warn('Failed to create required field block for', fieldName, ':', e);
          }
          
          targetBlock.initSvg();
          targetBlock.render();
          // Move the input to the correct position
          this.moveInputBefore('element_'+lastIndex);
          targetBlock.initSvg();
          targetBlock.render();
        }
        
        // Refresh the workspace visually and update JSON area
        if (this.workspace) {
          this.workspace.render();
          if (typeof updateJSONarea === 'function') {
            updateJSONarea(this.workspace);
          }
        } else {
          // If workspace isn't available yet, defer the update
          setTimeout(() => {
            if (this.workspace && typeof updateJSONarea === 'function') {
              this.workspace.render();
              updateJSONarea(this.workspace);
            }
          }, 100);
        }
    },
    deleteKeyValuePairInput: function(inputToDelete) {

          var inputNameToDelete = inputToDelete.name;

          var substructure = this.getInputTargetBlock(inputNameToDelete);
          if(substructure) {
              substructure.dispose(true, true);
          }
          this.removeInput(inputNameToDelete);

          var inputIndexToDelete = parseInt(inputToDelete.name.match(/\d+/)[0]);

          var lastIndex = --this.length;

          for(var i=inputIndexToDelete+1; i<=lastIndex; i++) { // rename all the subsequent element-inputs
              var input       = this.getInput( 'element_'+i );
              input.name      = 'element_'+(i-1);

              var key_field   = this.getField( 'key_field_'+i );
              key_field.name  = 'key_field_'+(i-1);
          }
    }
    };
  selectorBlocks.push(name + "_array");
  Blockly.Blocks[name+ "_array"] = {
    length: 0,
    init: function() {
      this.setColour(schema.color);
      this.setOutput(true, ["element"]);
      this.setInputsInline(false);
        //Optionals
      this.appendDummyInput('open_bracket')
          .appendField(" " + name + " List ")
          .appendArraySelector(schema, subclassTypes(schema, name), Blockly.selectionArrow(), ' ')

      this.setInputsInline(false);
    },
    appendElementInput: function() {
      appendElementInput(this);
    },
    deleteElementInput: function(inputToDelete) {
      deleteElementInput(inputToDelete, this);
    }
    };
}

// Make addBlockFromSchema globally available
window.addBlockFromSchema = addBlockFromSchema;

function loadRoot(){
  let xhttp = new XMLHttpRequest();
  xhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
      const regex = /<li><a href=\"\/schema\/(.*?).json\"/gm;
      let m;
      while ((m = regex.exec(this.responseText)) !== null) {
        // This is necessary to avoid infinite loops with zero-width matches
        if (m.index === regex.lastIndex) {
          regex.lastIndex++;
        }
        // The result can be accessed through the `m`-variable.
        m.forEach((match, groupIndex) => {
          if(groupIndex == 1){
            loadJson(match);
          }
        });
      }
    }
  };
  xhttp.open("GET", '/schema/', false);
  xhttp.send();
}

function loadJson(name){
  let xhttp = new XMLHttpRequest();
  xhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
        var schema = JSON.parse(this.responseText);
        //console.log(schema);
        addBlockFromSchema(name, schema);
        passSchemaToMain(name, schema);
    }
  };
  xhttp.open("GET", '/schema/' + name + ".json", true);
  xhttp.send();
}

loadRoot();

Blockly.Blocks['start'] = {
  init: function() {
    this.setColour(250);
    this.appendDummyInput()
        .setAlign(Blockly.ALIGN_CENTRE)
        .appendField("Root");

    this.appendValueInput('json')
        .appendSelector(selectorBlocks, Blockly.selectionArrow(), 'null');

    this.setDeletable(false);
  }
};

//-------------------------------------------------------------------------------------------------------
Blockly.Blocks['dictionary'] = {
  length: 0,
  init: function() {
    this.setColour(120);
    this.setOutput(true, ["element"]);

    this.appendDummyInput('open_bracket')
        .appendField(" Dictionary ")
        .appendField(new Blockly.FieldTextbutton('+', function() { this.sourceBlock_.appendKeyValuePairInput(); }) );

    this.setInputsInline(false);
  },

  appendKeyValuePairInput: function() {

        var lastIndex = this.length++;
        var appended_input = this.appendValueInput('element_'+lastIndex);
        appended_input.appendField(new Blockly.FieldTextbutton('–', function() { this.sourceBlock_.deleteKeyValuePairInput(appended_input); }) )
            .appendField(new Blockly.FieldTextInput('key_'+lastIndex), 'key_field_'+lastIndex)
            .appendField( Blockly.keyValueArrow() )
            .appendSelector(selectorBlocks, Blockly.selectionArrow(), 'string');

        this.moveInputBefore('element_'+lastIndex);

        // Create a default string block for the new input
        this.toggleTargetBlock(appended_input, 'string');

        return appended_input;
  },

  deleteKeyValuePairInput: function(inputToDelete) {

        var inputNameToDelete = inputToDelete.name;

        var substructure = this.getInputTargetBlock(inputNameToDelete);
        if(substructure) {
            substructure.dispose(true, true);
        }
        this.removeInput(inputNameToDelete);

        var inputIndexToDelete = parseInt(inputToDelete.name.match(/\d+/)[0]);

        var lastIndex = --this.length;

        for(var i=inputIndexToDelete+1; i<=lastIndex; i++) { // rename all the subsequent element-inputs
            var input       = this.getInput( 'element_'+i );
            input.name      = 'element_'+(i-1);

            var key_field   = this.getField( 'key_field_'+i );
            key_field.name  = 'key_field_'+(i-1);
        }
  }
};

//================================================================================================================
Blockly.Blocks['boolean'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(" boolean ")
        .appendField(new Blockly.FieldDropdown([['true','true'], ['false','false']]), "boolean");
    this.setOutput(true, ["element"]);
    this.setColour(155);
  }
};

Blockly.Blocks["boolean_array"] = {
  length: 0,
  init: function() {
    this.setColour(155);
    this.setOutput(true, ["element"]);
    this.setInputsInline(false);
      //Optionals
    this.appendDummyInput('open_bracket')
        .appendField(" Boolean Array ")
        .appendArraySelector([], ["boolean"], Blockly.selectionArrow(), ' ')

    this.setInputsInline(false);
  },
  appendElementInput: function() {
    appendElementInput(this);
  },
  deleteElementInput: function(inputToDelete) {
    deleteElementInput(inputToDelete, this);
  }
};

//------------------------------------------------------------------------------------------------------- 

Blockly.Blocks['string'] = {
  init: function() {
    this.setColour(190);
    this.setOutput(true, ["element"]);

    this.appendDummyInput()
        .setAlign(Blockly.ALIGN_CENTRE)
        .appendField(" string ")
        .appendField('"')
        .appendField(new Blockly.FieldTextInput(''), 'string_value')
        .appendField('"');
  }
};

Blockly.Blocks["string_array"] = {
  length: 0,
  init: function() {
    this.setColour(190);
    this.setOutput(true, ["element"]);
    this.setInputsInline(false);
      //Optionals
    this.appendDummyInput('open_bracket')
        .appendField(" String Array ")
        .appendArraySelector([], ["string"], Blockly.selectionArrow(), ' ')

    this.setInputsInline(false);
  },
  appendElementInput: function() {
    appendElementInput(this);
  },
  deleteElementInput: function(inputToDelete) {
    deleteElementInput(inputToDelete, this);
  }
};

//------------------------------------------------------------------------------------------------------- 
Blockly.Blocks['number'] = {
  init: function() {
    this.setColour(210);
    this.setOutput(true, ["element"]);

    this.appendDummyInput()
        .setAlign(Blockly.ALIGN_CENTRE)
        .appendField("number")
        .appendField(new Blockly.FieldNumber(0), "number_value");
  }
};

Blockly.Blocks["number_array"] = {
  length: 0,
  init: function() {
    this.setColour(210);
    this.setOutput(true, ["element"]);
    this.setInputsInline(false);
      //Optionals
    this.appendDummyInput('open_bracket')
        .appendField(" Number Array ")
        .appendArraySelector([], ["number"], Blockly.selectionArrow(), ' ')

    this.setInputsInline(false);
  },
  appendElementInput: function() {
    appendElementInput(this);
  },
  deleteElementInput: function(inputToDelete) {
    deleteElementInput(inputToDelete, this);
  }
};

//---------------------------------------------------------------------------------------------------------

Blockly.Blocks['dynarray'] = {
  length: 0,
  init: function() {
    this.setColour(350);
    this.setOutput(true, ["element"]);

    this.appendDummyInput('open_bracket')
        .appendField(" Dynamic Type Array ")
        .appendField(new Blockly.FieldTextbutton('+', function() { this.sourceBlock_.appendElementInput(); }) );

    this.setInputsInline(false);
  },
  appendElementInput: function() {
    appendElementInput(this);
  },
  deleteElementInput: function(inputToDelete) {
    deleteElementInput(inputToDelete, this);
  }
};