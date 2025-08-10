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
            
            if (input) {
                input.name = 'element_'+(i-1);
            }
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
  // Work with a copy to avoid modifying the original schema
  const required = schema.required || [];
  
  if (!Array.isArray(required)) {
    console.warn(`Schema required property is not an array:`, required);
    return list;
  }
  
  for(var property in schema.properties){
    if(! propertyInList(property, required)) {
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

// Helper function for deep cloning schemas to preserve all properties
function deepCloneSchema(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepCloneSchema(item));
  }
  
  const cloned = {};
  for (const [key, value] of Object.entries(obj)) {
    // Skip undefined values but preserve null, false, 0, empty strings
    if (value !== undefined) {
      cloned[key] = deepCloneSchema(value);
    }
  }
  
  return cloned;
}

function addBlockFromSchema(name, schema) {
  console.log(`addBlockFromSchema called with name: ${name}, schema:`, schema);
  
  // Create a clean schema copy for validation (without Blockly-specific properties)
  let cleanSchema;
  try {
    if (typeof structuredClone === 'function') {
      cleanSchema = structuredClone(schema);
    } else {
      cleanSchema = deepCloneSchema(schema);
    }
  } catch (e) {
    console.warn(`Failed to deep clone schema for ${name}, using shallow copy:`, e);
    cleanSchema = { ...schema };
    // Manually copy nested properties to ensure no data loss
    if (schema.properties) {
      cleanSchema.properties = {};
      for (const [key, value] of Object.entries(schema.properties)) {
        cleanSchema.properties[key] = { ...value };
      }
    }
    if (schema.required) {
      cleanSchema.required = [...schema.required];
    }
  }
  
  // Remove Blockly-specific properties from the clean schema for validation
  // Note: 'title' and 'description' are valid JSON Schema properties, so we keep those
  const blocklyProperties = ['color', 'apiCreationStrategy', 'endpoint', 'childRefToParent'];
  blocklyProperties.forEach(prop => {
    if (prop in cleanSchema) {
      delete cleanSchema[prop];
    }
  });
  
  // Create a deep copy of the schema for Blockly block creation to avoid modifying the original
  let blockSchema;
  try {
    if (typeof structuredClone === 'function') {
      blockSchema = structuredClone(schema);
    } else {
      blockSchema = deepCloneSchema(schema);
    }
  } catch (e) {
    console.warn(`Failed to deep clone schema for ${name}, using shallow copy:`, e);
    blockSchema = { ...schema };
    // Manually copy nested properties to ensure no data loss
    if (schema.properties) {
      blockSchema.properties = {};
      for (const [key, value] of Object.entries(schema.properties)) {
        blockSchema.properties[key] = { ...value };
      }
    }
    if (schema.required) {
      blockSchema.required = [...schema.required];
    }
  }
  
  console.log(`Schema copy created for ${name}:`, blockSchema);
  console.log(`Original schema properties:`, schema.properties);
  console.log(`Copied schema properties:`, blockSchema.properties);
  
  // Verify that all properties are preserved
  if (schema.properties && blockSchema.properties) {
    for (const [key, originalProp] of Object.entries(schema.properties)) {
      const copiedProp = blockSchema.properties[key];
      if (originalProp.type !== copiedProp?.type) {
        console.warn(`Property ${key} type mismatch: original=${originalProp.type}, copied=${copiedProp?.type}`);
      }
      if (originalProp.default !== copiedProp?.default) {
        console.warn(`Property ${key} default mismatch: original=${originalProp.default}, copied=${copiedProp?.default}`);
      }
    }
  }
  
  // Generate a color for the block (separate from schema validation)
  let blockColor;
  if (schema.color) {
    blockColor = schema.color;
  } else {
    const title = schema.title || name;
    let hash = 0;
    for (let i = 0; i < title.length; i++) {
      hash = title.charCodeAt(i) + ((hash << 5) - hash);
    }
    blockColor = Math.abs(hash) % 360;
    console.log(`Generated color for ${name}: ${blockColor}`);
  }
  
  selectorBlocks.push(name);
  Blockly.Blocks[name] = {
      init: function() {
        // Initialize length property for this instance
        this.length = 0;
        
        try {
          this.setColour(blockColor);
        } catch (e) {
          console.error(`Failed to set color for block ${name}:`, e);
          // Fallback to a default color
          this.setColour(120);
        }
        this.setOutput(true, ["element"]);
        this.setInputsInline(false);
        
        //Optionals
        console.log(`Processing optional fields for ${name}:`, optionalFields(blockSchema));
        this.appendDummyInput('open_bracket')
          .appendField(" " + name + " ")
          .appendOptionalFieldsSelector(blockSchema, optionalFields(blockSchema), Blockly.selectionArrow(), ' ');

        //Requireds
        console.log(`Processing required fields for ${name}:`, blockSchema.required);
        console.log(`BlockSchema properties before processing:`, blockSchema.properties);
        
        // Ensure blockSchema.properties exists
        if (!blockSchema.properties) {
          console.warn(`Schema ${name} missing properties:`, blockSchema);
          blockSchema.properties = {};
        }
        
        // Ensure blockSchema.required exists and is an array
        if (!blockSchema.required || !Array.isArray(blockSchema.required)) {
          console.warn(`Schema ${name} missing or invalid required field:`, blockSchema.required);
          blockSchema.required = [];
        }
        
        for(var requiredField in blockSchema.required){
          let fieldName = blockSchema.required[requiredField]
          var lastIndex = this.length++;
          // Get the field type from blockSchema
          var fieldType = 'string'; // default fallback
          if (blockSchema.properties[fieldName]) {
            fieldType = blockSchema.properties[fieldName].type;
            console.log(`Field ${fieldName} type from schema:`, fieldType);
            
            if(fieldType == undefined && blockSchema.properties[fieldName]['$ref']){
              fieldType = blockSchema.properties[fieldName]['$ref'].replace(".json", "");
              console.log(`Field ${fieldName} type from $ref:`, fieldType);
            }
            if(fieldType == 'integer'){
              fieldType = 'number';
              console.log(`Field ${fieldName} type converted from integer to number`);
            }
            if(fieldType == 'array' && blockSchema.properties[fieldName]['items'] && blockSchema.properties[fieldName]['items']['$ref']){
              fieldType = blockSchema.properties[fieldName]['items']['$ref'].replace(".json", "") + '_array';
              console.log(`Field ${fieldName} type converted to array:`, fieldType);
            }
          } else {
            console.warn(`Property ${fieldName} not found in blockSchema for ${name}`);
          }
          
          console.log(`Final field type for ${fieldName}:`, fieldType);
          
          // Create the input with field name and arrow
          var appended_input = this.appendValueInput('element_'+lastIndex);
          appended_input.appendField(new Blockly.FieldLabel(fieldName), 'key_field_'+lastIndex)
              .appendField(new Blockly.FieldTextbutton(fieldType, function() {}))
              .appendField( Blockly.keyValueArrow() );
          
          // Set the input type for validation
          //appended_input.setCheck(fieldType);
          
          // Create the block of the correct type and attach it
          try {
            // Ensure fieldType is valid
            if (!fieldType || fieldType === 'undefined' || fieldType === 'null') {
              console.warn(`Invalid field type for ${fieldName}: ${fieldType}, using string as fallback`);
              fieldType = 'string';
            }
            
            // Check if the block type exists
            if (!Blockly.Blocks[fieldType]) {
              console.warn(`Block type ${fieldType} not found, using string as fallback`);
              fieldType = 'string';
            }
            
            // Ensure we have a valid workspace
            if (!this.workspace) {
              console.warn(`No workspace available for creating block ${fieldType}`);
              return;
            }
            
            var targetBlock = this.workspace.newBlock(fieldType);
            
            // Ensure the block was created successfully
            if (!targetBlock) {
              console.warn(`Failed to create block of type ${fieldType} for field ${fieldName}`);
              return;
            }
            
            // Connect the new block to the input
            var parentConnection = appended_input.connection;
            var childConnection = targetBlock.outputConnection || targetBlock.previousConnection;
            if (parentConnection && childConnection) {
              parentConnection.connect(childConnection);
              
              // Set default value if specified in blockSchema
              if (blockSchema.properties[fieldName].default !== undefined) {
                try {
                  if (fieldType === 'string' && targetBlock.getField('string_value')) {
                    const defaultValue = blockSchema.properties[fieldName].default;
                    if (defaultValue !== undefined && defaultValue !== null) {
                      targetBlock.setFieldValue(defaultValue, 'string_value');
                    }
                  } else if (fieldType === 'number' && targetBlock.getField('number_value')) {
                    const defaultValue = blockSchema.properties[fieldName].default;
                    if (defaultValue !== undefined && defaultValue !== null) {
                      targetBlock.setFieldValue(defaultValue, 'number_value');
                    }
                  }
                } catch (e) {
                  console.warn(`Failed to set default value for field ${fieldName}:`, e);
                }
              }
            }
          } catch (e) {
            console.warn('Failed to create required field block for', fieldName, ':', e);
          }
          
          // Move the input to the correct position
          this.moveInputBefore('element_'+lastIndex);
        }
        
        // Note: Workspace rendering and JSON area updates should happen
        // when the block is actually added to a workspace, not during definition
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
              if (input) {
                  input.name      = 'element_'+(i-1);
              }

              var key_field   = this.getField( 'key_field_'+i );
              if (key_field) {
                  key_field.name  = 'key_field_'+(i-1);
              }
          }
    }
    };
  selectorBlocks.push(name + "_array");
  Blockly.Blocks[name+ "_array"] = {
    init: function() {
      // Initialize length property for this instance
      this.length = 0;
      
      this.setColour(blockColor);
      this.setOutput(true, ["element"]);
      this.setInputsInline(false);
        //Optionals
      this.appendDummyInput('open_bracket')
          .appendField(" " + name + " List ")
          .appendArraySelector(blockSchema, subclassTypes(blockSchema, name), Blockly.selectionArrow(), ' ')

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

  // Store the clean schema for validation (without Blockly-specific properties)
  if (typeof window.passSchemaToMain === 'function') {
    window.passSchemaToMain(name, cleanSchema);
  }
  
  // Make addBlockFromSchema globally available
  window.addBlockFromSchema = addBlockFromSchema;
  console.log('addBlockFromSchema function set on window:', typeof window.addBlockFromSchema);

// Remove old schema loading code - now handled by S3BlockLoader
// The loadRoot() and loadJson() functions are no longer needed

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
  init: function() {
    this.length = 0;
    
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
            if (input) {
                input.name      = 'element_'+(i-1);
            }

            var key_field   = this.getField( 'key_field_'+i );
            if (key_field) {
                key_field.name  = 'key_field_'+(i-1);
            }
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
  init: function() {
    // Initialize length property for this instance
    this.length = 0;
    
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
  init: function() {
    // Initialize length property for this instance
    this.length = 0;
    
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
  init: function() {
    // Initialize length property for this instance
    this.length = 0;
    
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
  init: function() {
    // Initialize length property for this instance
    this.length = 0;
    
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