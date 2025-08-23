Blockly.selectionArrow  = function() { return Blockly.RTL ? "←" : "→"; };
Blockly.keyValueArrow   = function() { return Blockly.RTL ? "⇐" : "⇒"; };

//==========================================================================================================

//TODO add base schema objects to this (base flag in schema file)
var selectorBlocks = ['dictionary', 'dynarray', 'number', 'string',
                          'boolean', 'number_array', 'string_array',
                          'boolean_array', 'string_password', 'string_email'];

// Make selectorBlocks globally accessible for tenant customization
window.selectorBlocks = selectorBlocks;

function appendElementInput(that) {

        var lastIndex = that.length++;

        var appended_input = that.appendValueInput('element_'+lastIndex);
        appended_input.appendField(new Blockly.FieldTextbutton('–', function() { that.deleteElementInput(appended_input); }) )
          .appendSelector(selectorBlocks, Blockly.selectionArrow(), 'string');
          
        // Don't move input - keep new elements at the end

        // Create a default string block for the new input
        that.toggleTargetBlock(appended_input, 'string');

        return appended_input;
  }

function deleteElementInput(inputToDelete, that) {
        try {
            var inputNameToDelete = inputToDelete.name;

            // Dispose of any connected child blocks before removing the input
            var substructure = that.getInputTargetBlock(inputNameToDelete);
            if(substructure) {
                // Use safe disposal to return focus to root
                if (typeof safeDisposeAndReturnFocus === 'function') {
                    safeDisposeAndReturnFocus(substructure, that.workspace);
                } else {
                    substructure.dispose(true, true); // Fallback
                }
            }
            
            // Remove the input
            that.removeInput(inputNameToDelete);
            
            // Decrement length
            that.length--;
            
            // Don't rename inputs - this can cause gesture conflicts
            // The workspace will handle input management automatically
        } catch (e) {
            console.warn('Error during deleteElementInput:', e);
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
  const blocklyProperties = ['color', 'apiCreationStrategy', 'endpoint', 'childRefToParent', 'stringify'];
  blocklyProperties.forEach(prop => {
    if (prop in cleanSchema) {
      delete cleanSchema[prop];
    }
  });
  
  // Clean up invalid $ref values and other schema issues
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
        // Fix invalid type values
        if (propDef.type === '$ref') {
          propDef.type = 'string';
          console.warn(`Fixed invalid type value for property ${propName}`);
        }
      }
    }
  }
  
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
          .appendField(" " + (blockSchema.title || name) + " ")
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
            // NEW: Handle the dict pattern (type: object with $ref)
            if(fieldType == 'object' && blockSchema.properties[fieldName]['$ref']){
              fieldType = blockSchema.properties[fieldName]['$ref'].replace(".json", "") + '_dict';
              console.log(`Field ${fieldName} type converted to dict:`, fieldType);
            }
          } else {
            console.warn(`Property ${fieldName} not found in blockSchema for ${name}`);
          }
          
          console.log(`Final field type for ${fieldName}:`, fieldType);
          
          // Create the input with field name and arrow
          var appended_input = this.appendValueInput('element_'+lastIndex);
          appended_input.appendField(new Blockly.FieldLabel(fieldName), 'key_field_'+lastIndex)
              .appendField( Blockly.keyValueArrow() );
          
          // Set the input type for validation
          //appended_input.setCheck(fieldType);
          
          // Move the input to the correct position
          // Keep new elements at the end
          
          // Store field info for later auto-creation
          if (!this._requiredFieldsInfo) {
            this._requiredFieldsInfo = [];
          }
          this._requiredFieldsInfo.push({
            fieldName: fieldName,
            fieldType: fieldType,
            inputName: 'element_' + lastIndex,
            defaultValue: blockSchema.properties[fieldName] ? blockSchema.properties[fieldName].default : undefined
          });
        }
        
        // Note: Workspace rendering and JSON area updates should happen
        // when the block is actually added to a workspace, not during definition
    },
    
    // Simple function to create required field blocks when block is connected
    createRequiredFieldBlocks: function() {
      if (this._defaultsCreated || !this.workspace || !this._requiredFieldsInfo) return;
      
      console.log(`Creating required field blocks for ${name}:`, this._requiredFieldsInfo);
      this._defaultsCreated = true;
      
      this._requiredFieldsInfo.forEach((fieldInfo) => {
        const input = this.getInput(fieldInfo.inputName);
        
        if (input && !input.connection.targetBlock()) {
          let fieldType = fieldInfo.fieldType;
          
          // Check if the field type exists, if not, retry after a delay
          if (!fieldType || fieldType === 'undefined' || fieldType === 'null') {
            console.warn(`Invalid field type for ${fieldInfo.fieldName}: ${fieldType}, using string as fallback`);
            fieldType = 'string';
          } else if (!Blockly.Blocks[fieldType]) {
            console.warn(`Block type ${fieldType} not found for field ${fieldInfo.fieldName}, retrying in 100ms`);
            // Retry after a delay to allow schemas to load
            setTimeout(() => {
              this.createRequiredFieldBlocks();
            }, 100);
            return;
          }
          
          try {
            console.log(`Creating default block type ${fieldType} for field ${fieldInfo.fieldName}`);
            const targetBlock = this.workspace.newBlock(fieldType);
            if (targetBlock) {
              targetBlock.initSvg();
              targetBlock.render();
              
              // Connect the new block to the input
              const parentConnection = input.connection;
              const childConnection = targetBlock.outputConnection || targetBlock.previousConnection;
              if (parentConnection && childConnection) {
                parentConnection.connect(childConnection);
                
                // Set default value if specified
                if (fieldInfo.defaultValue !== undefined) {
                  try {
                    if (fieldType === 'string' && targetBlock.getField('string_value')) {
                      targetBlock.setFieldValue(fieldInfo.defaultValue, 'string_value');
                    } else if (fieldType === 'number' && targetBlock.getField('number_value')) {
                      targetBlock.setFieldValue(fieldInfo.defaultValue, 'number_value');
                    }
                    console.log(`Set default value ${fieldInfo.defaultValue} for field ${fieldInfo.fieldName}`);
                  } catch (e) {
                    console.warn(`Failed to set default value for field ${fieldInfo.fieldName}:`, e);
                  }
                }
                
                // Recursively create required subfields for the newly created block
                if (targetBlock.createRequiredFieldBlocks && typeof targetBlock.createRequiredFieldBlocks === 'function') {
                  setTimeout(() => {
                    targetBlock.createRequiredFieldBlocks();
                  }, 10);
                }
              }
            }
          } catch (e) {
            console.warn('Failed to create default block for', fieldInfo.fieldName, ':', e);
          }
        }
      });
      
      // Update JSON area after creating blocks
      if (typeof updateJSONarea === 'function') {
        updateJSONarea(this.workspace);
      }
    },
    
    // Called when block is added to workspace
    onchange: function(event) {
      // Create required blocks when the block is first moved (added to workspace)
      if (event && event.type === Blockly.Events.BLOCK_MOVE && event.blockId === this.id && 
          event.newParentId && !this._defaultsCreated) {
        setTimeout(() => {
          this.createRequiredFieldBlocks();
        }, 50);
      }
    },
    
                 deleteKeyValuePairInput: function(inputToDelete) {
         try {
             // Find the input by its actual name, not by index
             var inputNameToDelete = inputToDelete.name;
             
             // Dispose of any connected child blocks before removing the input
             var connectedBlock = this.getInputTargetBlock(inputNameToDelete);
             if (connectedBlock) {
                 try {
                     // Use safe disposal to return focus to root
                     if (typeof safeDisposeAndReturnFocus === 'function') {
                         safeDisposeAndReturnFocus(connectedBlock, this.workspace);
                     } else {
                         connectedBlock.dispose(true, true); // Fallback
                     }
                 } catch (disposeError) {
                     console.warn('Failed to dispose connected block:', disposeError);
                     // Force disposal as fallback
                     try {
                         connectedBlock.dispose(true, true);
                     } catch (forceDisposeError) {
                         console.error('Failed to force dispose connected block:', forceDisposeError);
                     }
                 }
             }

             // Remove the input
             this.removeInput(inputNameToDelete);
             this.length--;

             // Don't rename inputs - this can cause gesture conflicts
             // The workspace will handle input management automatically
         } catch (e) {
             console.warn('Error during deleteKeyValuePairInput:', e);
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
          .appendField(" " + (blockSchema.title || name) + " List")
          .appendArraySelector(blockSchema, subclassTypes(blockSchema, name), Blockly.selectionArrow(), ' ')

      this.setInputsInline(false);
    },
    deleteElementInput: function(inputToDelete) {
      deleteElementInput(inputToDelete, this);
    }
    };

  selectorBlocks.push(name + "_dict");
  Blockly.Blocks[name+ "_dict"] = {
    init: function() {
      this.length = 0;
      
      this.setColour(blockColor);
      this.setOutput(true, ["element"]);
      this.setInputsInline(false);

      this.appendDummyInput('open_bracket')
          .appendField(" " + (blockSchema.title || name) + " Map")
          .appendField(new Blockly.FieldTextbutton('+', function() { this.sourceBlock_.appendKeyValuePairInput(); }));

      this.setInputsInline(false);
    },

    appendKeyValuePairInput: function() {
      var lastIndex = this.length++;
      var appended_input = this.appendValueInput('element_'+lastIndex);
      appended_input.appendField(new Blockly.FieldTextbutton('–', function() { this.sourceBlock_.deleteKeyValuePairInput(appended_input); }))
          .appendField(new Blockly.FieldTextInput('key_'+lastIndex), 'key_field_'+lastIndex)
          .appendField( Blockly.keyValueArrow() )
          .appendField(" " + (blockSchema.title || name));

      // Create a default block of the referenced type for the new input
      this.toggleTargetBlock(appended_input, name);

      return appended_input;
    },

    deleteKeyValuePairInput: function(inputToDelete) {
      try {
        // Find the input by its actual name, not by index
        var inputNameToDelete = inputToDelete.name;

        // Get the index of the input being deleted
        var deletedIndex = parseInt(inputNameToDelete.replace('element_', ''));

        // Dispose of any connected child blocks before removing the input
        var connectedBlock = this.getInputTargetBlock(inputNameToDelete);
        if(connectedBlock) {
          // Use safe disposal to return focus to root
          if (typeof safeDisposeAndReturnFocus === 'function') {
            safeDisposeAndReturnFocus(connectedBlock, this.workspace);
          } else {
            connectedBlock.dispose(true, true); // Fallback
          }
        }

        // Remove the input
        this.removeInput(inputNameToDelete);
        this.length--;

        // CRITICAL: Reindex all remaining inputs to maintain sequential indices
        // This ensures JSON generation works correctly
        for (let i = deletedIndex + 1; i <= this.length + 1; i++) {
          const oldInputName = `element_${i}`;
          const newInputName = `element_${i - 1}`;
          
          // Find the input with the old name
          const input = this.getInput(oldInputName);
          if (input) {
            // Rename the input
            input.name = newInputName;
            
            // Also rename the key field
            const keyField = this.getField(`key_field_${i}`);
            if (keyField) {
              keyField.name = `key_field_${i - 1}`;
            }
          }
        }

        // Don't rename inputs - this can cause gesture conflicts
        // The workspace will handle input management automatically
      } catch (e) {
        console.warn('Error during deleteKeyValuePairInput:', e);
      }
    }
  };

  // Store the clean schema for validation (without Blockly-specific properties)
  // For dict blocks, don't add to AJV - they just validate that values are of type 'name'
  if (!name.endsWith('_dict') && typeof window.passSchemaToMain === 'function') {
    window.passSchemaToMain(name, cleanSchema);
  }
  
  console.log('addBlockFromSchema function completed for:', name);
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
  },
  

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

        // Keep new elements at the end

        // Create a default string block for the new input
        this.toggleTargetBlock(appended_input, 'string');

        return appended_input;
  },

  deleteKeyValuePairInput: function(inputToDelete) {
        try {
            // Find the input by its actual name, not by index
            var inputNameToDelete = inputToDelete.name;

            // Get the index of the input being deleted
            var deletedIndex = parseInt(inputNameToDelete.replace('element_', ''));

            // Dispose of any connected child blocks before removing the input
            var substructure = this.getInputTargetBlock(inputNameToDelete);
            if(substructure) {
                // Use safe disposal to return focus to root
                if (typeof safeDisposeAndReturnFocus === 'function') {
                    safeDisposeAndReturnFocus(substructure, this.workspace);
                } else {
                    substructure.dispose(true, true); // Fallback
                }
            }
            
            // Remove the input
            this.removeInput(inputNameToDelete);
            
            // Decrement length
            this.length--;

            // CRITICAL: Reindex all remaining inputs to maintain sequential indices
            // This ensures JSON generation works correctly
            for (let i = deletedIndex + 1; i <= this.length + 1; i++) {
              const oldInputName = `element_${i}`;
              const newInputName = `element_${i - 1}`;
              
              // Find the input with the old name
              const input = this.getInput(oldInputName);
              if (input) {
                // Rename the input
                input.name = newInputName;
                
                // Also rename the key field
                const keyField = this.getField(`key_field_${i}`);
                if (keyField) {
                  keyField.name = `key_field_${i - 1}`;
                }
              }
            }

            // Don't rename inputs - this can cause gesture conflicts
            // The workspace will handle input management automatically
        } catch (e) {
            console.warn('Error during deleteKeyValuePairInput:', e);
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

// Add format-specific string blocks
Blockly.Blocks['string_password'] = {
  init: function() {
    this.setColour(190);
    this.setOutput(true, ["element"]);

    this.appendDummyInput()
        .setAlign(Blockly.ALIGN_CENTRE)
        .appendField(" password ")
        .appendField('"')
        .appendField(new Blockly.FieldTextInput('', null, {
          spellcheck: false,
          // Show asterisks in the UI but store the actual value
          validator: function(text) {
            // Update the display to show asterisks
            setTimeout(() => {
              if (this.sourceBlock_ && this.sourceBlock_.updatePasswordDisplay) {
                this.sourceBlock_.updatePasswordDisplay();
              }
            }, 10);
            return text;
          }
        }), 'string_value')
        .appendField('"');
  },
  
  // Override the field display to show asterisks on any text change
  onchange: function(event) {
    if (event && event.name === 'string_value') {
      this.updatePasswordDisplay();
    }
  },
  
  // Update password display to show asterisks
  updatePasswordDisplay: function() {
    const field = this.getField('string_value');
    if (field && field.getValue) {
      const value = field.getValue();
      if (value && value.length > 0) {
        // Show asterisks in the UI but keep the actual value
        const displayText = '*'.repeat(value.length);
        if (field.getText() !== displayText) {
          field.setText(displayText);
        }
      }
    }
  },
  
  // Override the field to show asterisks when focused/blurred
  onmouseup_: function(e) {
    this.updatePasswordDisplay();
    // Call the original method
    Blockly.Block.prototype.onmouseup_.call(this, e);
  },
  
  // Override the showEditor_ method to use a password input
  showEditor_: function(quietInput) {
    if (quietInput) {
      return;
    }
    
    // Create a password input element
    const input = document.createElement('input');
    input.type = 'password';
    input.value = this.getValue() || '';
    input.style.cssText = `
      position: absolute;
      z-index: 1000;
      background: white;
      border: 1px solid #ccc;
      padding: 4px;
      font-family: inherit;
      font-size: inherit;
      width: ${Math.max(this.size_.width, 80)}px;
    `;
    
    // Position the input over the field
    const bBox = this.getScaledBBox();
    input.style.left = bBox.x + 'px';
    input.style.top = bBox.y + 'px';
    
    // Add to DOM
    document.body.appendChild(input);
    input.focus();
    input.select();
    
    // Handle input events
    const finishEditing = (value) => {
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
      
      if (value !== null && value !== this.getValue()) {
        this.setValue(value);
        this.updatePasswordDisplay();
      }
    };
    
    input.addEventListener('blur', () => finishEditing(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        finishEditing(input.value);
      } else if (e.key === 'Escape') {
        finishEditing(null);
      }
    });
  }
};

// Add another format type for demonstration
Blockly.Blocks['string_email'] = {
  init: function() {
    this.setColour(190);
    this.setOutput(true, ["element"]);

    this.appendDummyInput()
        .setAlign(Blockly.ALIGN_CENTRE)
        .appendField(" email ")
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
        .appendArraySelector([], ["string"], Blockly.selectionArrow(), ' ');

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
        .appendArraySelector([], ["number"], Blockly.selectionArrow(), ' ');

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