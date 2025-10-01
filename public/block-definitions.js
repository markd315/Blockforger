Blockly.selectionArrow  = function() { return Blockly.RTL ? "←" : "→"; };
Blockly.keyValueArrow   = function() { return Blockly.RTL ? "⇐" : "⇒"; };

//==========================================================================================================

//TODO add base schema objects to this (base flag in schema file)
var selectorBlocks = ['dictionary', 'dynarray', 'number', 'string',
                          'boolean', 'number_array', 'string_array',
                          'boolean_array', 'string_password', 'string_email', 'string_enum'];

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
        
        // Check if this string block should be converted to an enum block
        setTimeout(() => {
            const stringBlock = that.getInputTargetBlock(appended_input.name);
            if (stringBlock && stringBlock.type === 'string' && typeof checkAndConvertToEnum === 'function') {
                checkAndConvertToEnum(stringBlock, that, appended_input);
            }
        }, 100);

        return appended_input;
  }

function deleteElementInput(inputToDelete, that) {
        try {
            var inputNameToDelete = inputToDelete.name;

            // Get the index of the input being deleted
            var deletedIndex = parseInt(inputNameToDelete.replace('element_', ''));

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

            // CRITICAL: Reindex all remaining inputs to maintain sequential indices
            // This ensures JSON generation works correctly
            for (let i = deletedIndex + 1; i <= that.length + 1; i++) {
              const oldInputName = `element_${i}`;
              const newInputName = `element_${i - 1}`;
              
              // Find the input with the old name
              const input = that.getInput(oldInputName);
              if (input) {
                // Rename the input
                input.name = newInputName;
                
                // Also rename any associated fields (like key fields for arrays)
                const keyField = that.getField(`key_field_${i}`);
                if (keyField) {
                  keyField.name = `key_field_${i - 1}`;
                }
              }
            }
            
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
  const blocklyProperties = ['color', 'apiCreationStrategy', 'endpoint', 'childRefToParent', 'stringify', 'format', 'uri'];
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
        
        // Check current theme and apply appropriate color
        const savedTheme = localStorage.getItem('blockly-theme') || 'dark';
        const isAccessibilityTheme = ['colorblind-wong', 'colorblind-tol'].includes(savedTheme);
        
        if (isAccessibilityTheme) {
          // Apply accessibility color based on block type
          let accessibilityColor = '#888888'; // default gray
          if (savedTheme === 'colorblind-wong') {
            // Wong palette
            if (this.type === 'start') {
              accessibilityColor = '#000000'; // Black
            } else if (['string', 'string_password', 'string_email', 'string_enum', 'string_array'].includes(this.type)) {
              accessibilityColor = '#e69f00'; // Orange
            } else if (['number', 'number_array'].includes(this.type)) {
              accessibilityColor = '#56b4e9'; // Sky blue
            } else if (['boolean', 'boolean_array'].includes(this.type)) {
              accessibilityColor = '#009e73'; // Blue green
            } else if (!this.type.endsWith('_array') && !this.type.endsWith('_dict') && 
                     !['start', 'dictionary', 'dynarray', 'boolean', 'boolean_array', 'string', 'string_password', 'string_email', 'string_enum', 'string_array', 'number', 'number_array'].includes(this.type)) {
              accessibilityColor = '#f0e442'; // Yellow
            } else if (this.type.endsWith('_array')) {
              accessibilityColor = '#0072b2'; // Blue
            } else if (this.type.endsWith('_dict')) {
              accessibilityColor = '#d55e00'; // Vermillion
            } else if (['dictionary', 'dynarray'].includes(this.type)) {
              accessibilityColor = '#cc79a7'; // Pale violet
            }
          } else if (savedTheme === 'colorblind-tol') {
            // Tol palette
            if (this.type === 'start') {
              accessibilityColor = '#CC6677'; // Red
            } else if (['string', 'string_password', 'string_email', 'string_enum', 'string_array'].includes(this.type)) {
              accessibilityColor = '#332288'; // Purple
            } else if (['number', 'number_array'].includes(this.type)) {
              accessibilityColor = '#DDCC77'; // Yellow
            } else if (['boolean', 'boolean_array'].includes(this.type)) {
              accessibilityColor = '#117733'; // Green
            } else if (!this.type.endsWith('_array') && !this.type.endsWith('_dict') && 
                     !['start', 'dictionary', 'dynarray', 'boolean', 'boolean_array', 'string', 'string_password', 'string_email', 'string_enum', 'string_array', 'number', 'number_array'].includes(this.type)) {
              accessibilityColor = '#88CCEE'; // Light blue
            } else if (this.type.endsWith('_array')) {
              accessibilityColor = '#882255'; // Magenta
            } else if (this.type.endsWith('_dict')) {
              accessibilityColor = '#44AA99'; // Teal
            } else if (['dictionary', 'dynarray'].includes(this.type)) {
              accessibilityColor = '#AA4499'; // Pink
            }
          }
          this.setColour(accessibilityColor);
        } else {
          // For normal themes, use schema color
          this.setColour(blockColor);
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
            if(fieldType == 'array' && blockSchema.properties[fieldName]['items']){
              if(blockSchema.properties[fieldName]['items']['$ref']){
                fieldType = blockSchema.properties[fieldName]['items']['$ref'].replace(".json", "") + '_array';
                console.log(`Field ${fieldName} type converted to $ref array:`, fieldType);
              } else if(blockSchema.properties[fieldName]['items']['type']){
                // Handle primitive array types like string, number, boolean
                const itemType = blockSchema.properties[fieldName]['items']['type'];
                if(itemType === 'string'){
                  fieldType = 'string_array';
                } else if(itemType === 'number' || itemType === 'integer'){
                  fieldType = 'number_array';
                } else if(itemType === 'boolean'){
                  fieldType = 'boolean_array';
                } else {
                  console.warn(`Unknown primitive array item type: ${itemType}, using dynarray`);
                  fieldType = 'dynarray';
                }
                console.log(`Field ${fieldName} type converted to primitive array:`, fieldType);
              } else {
                console.warn(`Array field ${fieldName} has no items.type or items.$ref, using dynarray`);
                fieldType = 'dynarray';
              }
            }
            // NEW: Handle the dict pattern (type: object with $ref)
            if(fieldType == 'object' && blockSchema.properties[fieldName]['$ref']){
              fieldType = blockSchema.properties[fieldName]['$ref'].replace(".json", "") + '_dict';
              console.log(`Field ${fieldName} type converted to dict:`, fieldType);
            }
            // NEW: Handle enum fields - use string_enum instead of string
            if(fieldType == 'string' && blockSchema.properties[fieldName]['enum']){
              fieldType = 'string_enum';
              console.log(`Field ${fieldName} type converted to string_enum due to enum values:`, blockSchema.properties[fieldName]['enum']);
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
                
                // Handle string_enum blocks - set enum options
                if (fieldType === 'string_enum' && targetBlock.updateEnumOptions) {
                  const fieldSchema = blockSchema.properties[fieldInfo.fieldName];
                  if (fieldSchema && fieldSchema.enum) {
                    targetBlock.updateEnumOptions(fieldSchema.enum);
                    console.log(`Set enum options for field ${fieldInfo.fieldName}:`, fieldSchema.enum);
                  }
                }

                // Set default value if specified
                if (fieldInfo.defaultValue !== undefined) {
                  try {
                    if (fieldType === 'string' && targetBlock.getField('string_value')) {
                      targetBlock.setFieldValue(fieldInfo.defaultValue, 'string_value');
                    } else if (fieldType === 'number' && targetBlock.getField('number_value')) {
                      targetBlock.setFieldValue(fieldInfo.defaultValue, 'number_value');
                    } else if (fieldType === 'string_enum' && targetBlock.getField('enum_value')) {
                      targetBlock.setFieldValue(fieldInfo.defaultValue, 'enum_value');
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
                    
                    // After creating required field blocks, check for enum conversion
                    setTimeout(() => {
                      if (typeof window.scanAndConvertStringBlocksToEnums === 'function') {
                        window.scanAndConvertStringBlocksToEnums(targetBlock.workspace);
                      }
                    }, 50);
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
      
      // Check current theme and apply appropriate color
      const savedTheme = localStorage.getItem('blockly-theme') || 'dark';
      const isAccessibilityTheme = ['colorblind-wong', 'colorblind-tol'].includes(savedTheme);
      
      if (isAccessibilityTheme) {
        // Apply accessibility color for arrays
        if (savedTheme === 'colorblind-wong') {
          this.setColour('#0072b2'); // Blue for Wong
        } else if (savedTheme === 'colorblind-tol') {
          this.setColour('#882255'); // Magenta for Tol
        }
      } else {
        // For normal themes, use schema color
        this.setColour(blockColor);
      }
      
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
      
      // Check current theme and apply appropriate color
      const savedTheme = localStorage.getItem('blockly-theme') || 'dark';
      const isAccessibilityTheme = ['colorblind-wong', 'colorblind-tol'].includes(savedTheme);
      
      if (isAccessibilityTheme) {
        // Apply accessibility color for maps
        if (savedTheme === 'colorblind-wong') {
          this.setColour('#d55e00'); // Vermillion for Wong
        } else if (savedTheme === 'colorblind-tol') {
          this.setColour('#44AA99'); // Teal for Tol
        }
      } else {
        // For normal themes, use schema color
        this.setColour(blockColor);
      }
      
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

// Function to check if a string block should be converted to an enum block
function checkAndConvertToEnum(stringBlock, parentBlock, input) {
    if (!stringBlock || stringBlock.type !== 'string') {
        return false;
    }
    
    try {
        // Get the field name from the input's field row
        let fieldName = null;
        if (input && input.fieldRow) {
            // Look for a label field that contains the field name
            for (let i = 0; i < input.fieldRow.length; i++) {
                const field = input.fieldRow[i];
                if (field && field.getText && typeof field.getText === 'function') {
                    const text = field.getText();
                    // Skip arrow fields and button fields
                    if (text && text !== '→' && text !== '⇒' && text !== '←' && text !== '⇐' && text !== '+' && text !== '–') {
                        fieldName = text;
                        break;
                    }
                }
            }
        }
        
        // Debug logging - reduced
        if (!fieldName) {
            return false;
        }
        
        // Get the parent block's schema to check for enum values
        let parentSchema = null;
        
        // Try multiple ways to find the schema
        if (parentBlock && parentBlock._blockSchema) {
            parentSchema = parentBlock._blockSchema;
        } else if (parentBlock && parentBlock._schema) {
            parentSchema = parentBlock._schema;
        } else {
            // Try to find the schema from the block type using schemaLibrary
            const blockType = parentBlock ? parentBlock.type : null;
            const schemaLibrary = window.getSchemaLibrary ? window.getSchemaLibrary() : {};
            
            if (blockType && schemaLibrary[blockType]) {
                parentSchema = schemaLibrary[blockType];
            } else {
                // Try to find the base schema (remove _dict suffix)
                const baseType = blockType ? blockType.replace('_dict', '') : null;
                if (baseType && schemaLibrary[baseType]) {
                    parentSchema = schemaLibrary[baseType];
                }
            }
        }
        
        if (!parentSchema || !parentSchema.properties || !parentSchema.properties[fieldName]) {
            return false;
        }
        
        const fieldSchema = parentSchema.properties[fieldName];
        
        // Check if this field has enum values
        if (fieldSchema.enum && Array.isArray(fieldSchema.enum) && fieldSchema.enum.length > 0) {
            
            // Get the current value from the string block
            const currentValue = stringBlock.getFieldValue('string_value') || '';
            
            // Create a new string_enum block
            const enumBlock = stringBlock.workspace.newBlock('string_enum');
            if (enumBlock) {
                enumBlock.initSvg();
                enumBlock.render();
                
                // Set the enum options
                if (enumBlock.updateEnumOptions) {
                    enumBlock.updateEnumOptions(fieldSchema.enum);
                }
                
                // Set the current value if it's valid
                if (currentValue && fieldSchema.enum.includes(currentValue)) {
                    enumBlock.setFieldValue(currentValue, 'enum_value');
                } else if (fieldSchema.enum.length > 0) {
                    // Set to first enum value as default
                    enumBlock.setFieldValue(fieldSchema.enum[0], 'enum_value');
                }
                
                // Replace the string block with the enum block
                const parentConnection = stringBlock.outputConnection.targetConnection;
                if (parentConnection) {
                    // Disconnect the string block
                    stringBlock.outputConnection.disconnect();
                    
                    // Connect the enum block
                    parentConnection.connect(enumBlock.outputConnection);
                    
                    // Dispose of the old string block
                    stringBlock.dispose(true, true);
                    
                    // Update JSON area
                    if (typeof updateJSONarea === 'function') {
                        updateJSONarea(enumBlock.workspace);
                    }
                    
                    return true;
                }
            }
        }
    } catch (e) {
        console.warn('Error checking/converting to enum:', e);
    }
    
    return false;
}

// Make the function globally available
window.checkAndConvertToEnum = checkAndConvertToEnum;

// Function to scan all string blocks in the workspace and convert them to enum blocks if needed
function scanAndConvertStringBlocksToEnums(workspace) {
    if (!workspace) {
        return;
    }
    
    const allBlocks = workspace.getAllBlocks();
    let convertedCount = 0;
    
    for (let i = 0; i < allBlocks.length; i++) {
        const block = allBlocks[i];
        if (block && block.type === 'string') {
            // Find the parent block and input for this string block
            const parentConnection = block.outputConnection.targetConnection;
            if (parentConnection) {
                const parentBlock = parentConnection.getSourceBlock();
                const input = parentConnection.getInput();
                
                if (parentBlock && input) {
                    const wasConverted = checkAndConvertToEnum(block, parentBlock, input);
                    if (wasConverted) {
                        convertedCount++;
                    }
                }
            }
        }
    }
    
    // Update JSON area after conversions
    if (typeof updateJSONarea === 'function') {
        updateJSONarea(workspace);
    }
}

// Make the function globally available
window.scanAndConvertStringBlocksToEnums = scanAndConvertStringBlocksToEnums;

// Function to trigger enum conversion for a specific block (useful for manual triggers)
function triggerEnumConversionForBlock(block) {
    if (!block || block.type !== 'string') {
        return false;
    }
    
    const parentConnection = block.outputConnection.targetConnection;
    if (parentConnection) {
        const parentBlock = parentConnection.getSourceBlock();
        const input = parentConnection.getInput();
        
        if (parentBlock && input) {
            console.log(`Manually triggering enum conversion for string block in ${parentBlock.type}`);
            return checkAndConvertToEnum(block, parentBlock, input);
        }
    }
    
    return false;
}

// Make the function globally available
window.triggerEnumConversionForBlock = triggerEnumConversionForBlock;

// Remove old schema loading code - now handled by S3BlockLoader
// The loadRoot() and loadJson() functions are no longer needed

Blockly.Blocks['start'] = {
  init: function() {
    // Check current theme and apply appropriate color
    const savedTheme = localStorage.getItem('blockly-theme') || 'dark';
    const isAccessibilityTheme = ['colorblind-wong', 'colorblind-tol'].includes(savedTheme);
    
    if (isAccessibilityTheme) {
      if (savedTheme === 'colorblind-wong') {
        this.setColour('#000000'); // Black for Wong
      } else if (savedTheme === 'colorblind-tol') {
        this.setColour('#CC6677'); // Red for Tol
      }
    } else {
      this.setColour(250); // Original color for normal themes
    }
    
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
    
    // Check current theme and apply appropriate color
    const savedTheme = localStorage.getItem('blockly-theme') || 'dark';
    const isAccessibilityTheme = ['colorblind-wong', 'colorblind-tol'].includes(savedTheme);
    
    if (isAccessibilityTheme) {
      if (savedTheme === 'colorblind-wong') {
        this.setColour('#cc79a7'); // Pale violet for Wong
      } else if (savedTheme === 'colorblind-tol') {
        this.setColour('#AA4499'); // Pink for Tol
      }
    } else {
      this.setColour(120); // Original color for normal themes
    }
    
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
        
        // Check if this string block should be converted to an enum block
        setTimeout(() => {
            const stringBlock = this.getInputTargetBlock(appended_input.name);
            if (stringBlock && stringBlock.type === 'string' && typeof checkAndConvertToEnum === 'function') {
                checkAndConvertToEnum(stringBlock, this, appended_input);
            }
        }, 100);

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
    // Check current theme and apply appropriate color
    const savedTheme = localStorage.getItem('blockly-theme') || 'dark';
    const isAccessibilityTheme = ['colorblind-wong', 'colorblind-tol'].includes(savedTheme);
    
    if (isAccessibilityTheme) {
      if (savedTheme === 'colorblind-wong') {
        this.setColour('#009e73'); // Blue green for Wong
      } else if (savedTheme === 'colorblind-tol') {
        this.setColour('#117733'); // Green for Tol
      }
    } else {
      this.setColour(155); // Original color for normal themes
    }
    
    this.appendDummyInput()
        .appendField(" boolean ")
        .appendField(new Blockly.FieldDropdown([['true','true'], ['false','false']]), "boolean");
    this.setOutput(true, ["element"]);
  }
};

Blockly.Blocks["boolean_array"] = {
  init: function() {
    // Initialize length property for this instance
    this.length = 0;
    
    // Check current theme and apply appropriate color
    const savedTheme = localStorage.getItem('blockly-theme') || 'dark';
    const isAccessibilityTheme = ['colorblind-wong', 'colorblind-tol'].includes(savedTheme);
    
    if (isAccessibilityTheme) {
      if (savedTheme === 'colorblind-wong') {
        this.setColour('#009e73'); // Blue green for Wong
      } else if (savedTheme === 'colorblind-tol') {
        this.setColour('#117733'); // Green for Tol
      }
    } else {
      this.setColour(155); // Original color for normal themes
    }
    
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
    // Check current theme and apply appropriate color
    const savedTheme = localStorage.getItem('blockly-theme') || 'dark';
    const isAccessibilityTheme = ['colorblind-wong', 'colorblind-tol'].includes(savedTheme);
    
    if (isAccessibilityTheme) {
      if (savedTheme === 'colorblind-wong') {
        this.setColour('#e69f00'); // Orange for Wong
      } else if (savedTheme === 'colorblind-tol') {
        this.setColour('#332288'); // Purple for Tol
      }
    } else {
      this.setColour(190); // Original color for normal themes
    }
    
    this.setOutput(true, ["element"]);

    this.appendDummyInput()
        .setAlign(Blockly.ALIGN_CENTRE)
        .appendField(" string ")
        .appendField('"')
        .appendField(new Blockly.FieldTextInput(''), 'string_value')
        .appendField('"');
  }
};

// Memory-only password storage using block IDs as keys
window.passwordStorage = new Map();

// Global cleanup function to remove passwords from deleted blocks
window.cleanupPasswordStorage = function(workspace) {
  if (!workspace || !window.passwordStorage) return;
  
  // Get all current block IDs in the workspace
  const currentBlockIds = new Set();
  const allBlocks = workspace.getAllBlocks();
  allBlocks.forEach(block => {
    if (block.id) {
      currentBlockIds.add(block.id);
    }
  });
  
  // Remove passwords for blocks that no longer exist
  for (const [blockId, password] of window.passwordStorage.entries()) {
    if (!currentBlockIds.has(blockId)) {
      window.passwordStorage.delete(blockId);
      console.log(`Cleaned up password for deleted block ${blockId}`);
    }
  }
};

// Debug function to inspect password storage (for testing)
window.debugPasswordStorage = function() {
  console.log('=== PASSWORD STORAGE DEBUG ===');
  console.log('Total passwords stored:', window.passwordStorage.size);
  for (const [blockId, password] of window.passwordStorage.entries()) {
    console.log(`Block ${blockId}: "${password}" (${password.length} chars)`);
  }
  console.log('=== END DEBUG ===');
};

// Add format-specific string blocks
Blockly.Blocks['string_password'] = {
  init: function() {
    // Check current theme and apply appropriate color
    const savedTheme = localStorage.getItem('blockly-theme') || 'dark';
    const isAccessibilityTheme = ['colorblind-wong', 'colorblind-tol'].includes(savedTheme);
    
    if (isAccessibilityTheme) {
      if (savedTheme === 'colorblind-wong') {
        this.setColour('#e69f00'); // Orange for Wong
      } else if (savedTheme === 'colorblind-tol') {
        this.setColour('#332288'); // Purple for Tol
      }
    } else {
      this.setColour(190); // Original color for normal themes
    }
    
    this.setOutput(true, ["element"]);

    // Create a custom field that prevents normal text entry
    const passwordField = new Blockly.FieldTextInput('', null, {
      spellcheck: false,
      // HARD OVERRIDE: Prevent any text input and force password behavior
      validator: function(text) {
        // This validator is called but we'll override the entire input mechanism
        return text;
      }
    });

    // Override the field's setValue method to store in memory map
    const originalSetValue = passwordField.setValue;
    passwordField.setValue = function(value) {
      if (this.sourceBlock_ && this.sourceBlock_.id) {
        // Store actual value in memory map
        if (value && value.length > 0) {
          window.passwordStorage.set(this.sourceBlock_.id, value);
        } else {
          window.passwordStorage.delete(this.sourceBlock_.id);
        }
        
        // Always show asterisks in the field
        const displayValue = value ? '*'.repeat(value.length) : '';
        originalSetValue.call(this, displayValue);
      } else {
        originalSetValue.call(this, value);
      }
    };

    // Override the field's getValue method to return actual password
    const originalGetValue = passwordField.getValue;
    passwordField.getValue = function() {
      if (this.sourceBlock_ && this.sourceBlock_.id) {
        // Return actual password from memory map
        return window.passwordStorage.get(this.sourceBlock_.id) || '';
      }
      return originalGetValue.call(this);
    };

    // Override the field's getText method to always show asterisks
    const originalGetText = passwordField.getText;
    passwordField.getText = function() {
      if (this.sourceBlock_ && this.sourceBlock_.id) {
        const actualValue = window.passwordStorage.get(this.sourceBlock_.id) || '';
        return actualValue ? '*'.repeat(actualValue.length) : '';
      }
      return originalGetText.call(this);
    };

    this.appendDummyInput()
        .setAlign(Blockly.ALIGN_CENTRE)
        .appendField(" password ")
        .appendField('"')
        .appendField(passwordField, 'string_value')
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
      const actualValue = window.passwordStorage.get(this.id) || '';
      if (actualValue && actualValue.length > 0) {
        // Show asterisks in the UI
        const displayText = '*'.repeat(actualValue.length);
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
  
  // HARD OVERRIDE: Completely replace the showEditor_ method
  showEditor_: function(quietInput) {
    if (quietInput) {
      return;
    }
    
    // Get current password value from memory
    const currentPassword = window.passwordStorage.get(this.id) || '';
    
    // Create a password input element
    const input = document.createElement('input');
    input.type = 'password';
    input.value = currentPassword;
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
      
      if (value !== null) {
        // Store the actual password value in memory map
        if (value.length > 0) {
          window.passwordStorage.set(this.id, value);
        } else {
          window.passwordStorage.delete(this.id);
        }
        
        // Update the field display to show asterisks
        this.updatePasswordDisplay();
        
        // Trigger change event to update JSON
        if (typeof updateJSONarea === 'function') {
          updateJSONarea(this.workspace);
        }
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
  },
  
  // Override getValue to return actual password from memory
  getValue: function() {
    return window.passwordStorage.get(this.id) || '';
  },
  
  // Override dispose to clean up password from memory
  dispose: function(healStack, animate) {
    // Remove password from memory storage when block is disposed
    if (window.passwordStorage && this.id) {
      window.passwordStorage.delete(this.id);
    }
    
    // Call the original dispose method
    return Blockly.Block.prototype.dispose.call(this, healStack, animate);
  }
};

// Add another format type for demonstration
Blockly.Blocks['string_email'] = {
  init: function() {
    // Check current theme and apply appropriate color
    const savedTheme = localStorage.getItem('blockly-theme') || 'dark';
    const isAccessibilityTheme = ['colorblind-wong', 'colorblind-tol'].includes(savedTheme);
    
    if (isAccessibilityTheme) {
      if (savedTheme === 'colorblind-wong') {
        this.setColour('#e69f00'); // Orange for Wong
      } else if (savedTheme === 'colorblind-tol') {
        this.setColour('#332288'); // Purple for Tol
      }
    } else {
      this.setColour(190); // Original color for normal themes
    }
    
    this.setOutput(true, ["element"]);

    this.appendDummyInput()
        .setAlign(Blockly.ALIGN_CENTRE)
        .appendField(" email ")
        .appendField('"')
        .appendField(new Blockly.FieldTextInput(''), 'string_value')
        .appendField('"');
  }
};

Blockly.Blocks['string_enum'] = {
  init: function() {
    // Check current theme and apply appropriate color
    const savedTheme = localStorage.getItem('blockly-theme') || 'dark';
    const isAccessibilityTheme = ['colorblind-wong', 'colorblind-tol'].includes(savedTheme);
    
    if (isAccessibilityTheme) {
      if (savedTheme === 'colorblind-wong') {
        this.setColour('#e69f00'); // Orange for Wong
      } else if (savedTheme === 'colorblind-tol') {
        this.setColour('#332288'); // Purple for Tol
      }
    } else {
      this.setColour(190); // Original color for normal themes
    }
    
    this.setOutput(true, ["element"]);

    // Default dropdown options - will be updated when enum values are provided
    this.appendDummyInput()
        .setAlign(Blockly.ALIGN_CENTRE)
        .appendField(" enum ")
        .appendField(new Blockly.FieldDropdown([['value1','value1'], ['value2','value2']]), "enum_value");
  },
  
  // Method to update the dropdown options with enum values
  updateEnumOptions: function(enumValues) {
    if (!enumValues || !Array.isArray(enumValues)) {
      console.warn('Invalid enum values provided:', enumValues);
      return;
    }
    
    // Convert enum values to dropdown format [['display', 'value'], ...]
    const dropdownOptions = enumValues.map(value => [value, value]);
    
    // Update the dropdown field
    const dropdownField = this.getField('enum_value');
    if (dropdownField) {
      dropdownField.menuGenerator_ = function() {
        return dropdownOptions;
      };
      // Set the first value as default if no value is currently set
      if (!this.getValue()) {
        this.setValue(enumValues[0]);
      }
    }
  },
  
  // Override getValue to return the selected enum value
  getValue: function() {
    const field = this.getField('enum_value');
    return field ? field.getValue() : '';
  },
  
  // Override setValue to set the dropdown selection
  setValue: function(value) {
    const field = this.getField('enum_value');
    if (field) {
      field.setValue(value);
    }
  },
  
  // Toggle to next enum value (cycling back to 0 if needed)
  toggleEnumValue: function() {
    const field = this.getField('enum_value');
    if (!field || !field.menuGenerator_) return;
    
    // Get the current options from the menu generator
    const options = field.menuGenerator_();
    if (!options || options.length === 0) return;
    
    // Get current value
    const currentValue = field.getValue();
    
    // Find current index
    let currentIndex = -1;
    for (let i = 0; i < options.length; i++) {
      if (options[i][1] === currentValue) { // options[i][1] is the value, options[i][0] is the display
        currentIndex = i;
        break;
      }
    }
    
    // If current value not found, default to first option
    if (currentIndex === -1) {
      currentIndex = 0;
    } else {
      // Move to next index, wrapping to 0 if needed
      currentIndex = (currentIndex + 1) % options.length;
    }
    
    // Set the new value
    const newValue = options[currentIndex][1];
    field.setValue(newValue);
    
    console.log(`Toggled enum from ${currentValue} to ${newValue} (index ${currentIndex})`);
  }
};

Blockly.Blocks["string_array"] = {
  init: function() {
    // Initialize length property for this instance
    this.length = 0;
    
    // Check current theme and apply appropriate color
    const savedTheme = localStorage.getItem('blockly-theme') || 'dark';
    const isAccessibilityTheme = ['colorblind-wong', 'colorblind-tol'].includes(savedTheme);
    
    if (isAccessibilityTheme) {
      if (savedTheme === 'colorblind-wong') {
        this.setColour('#e69f00'); // Orange for Wong
      } else if (savedTheme === 'colorblind-tol') {
        this.setColour('#332288'); // Purple for Tol
      }
    } else {
      this.setColour(190); // Original color for normal themes
    }
    
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
    // Check current theme and apply appropriate color
    const savedTheme = localStorage.getItem('blockly-theme') || 'dark';
    const isAccessibilityTheme = ['colorblind-wong', 'colorblind-tol'].includes(savedTheme);
    
    if (isAccessibilityTheme) {
      if (savedTheme === 'colorblind-wong') {
        this.setColour('#56b4e9'); // Sky blue for Wong
      } else if (savedTheme === 'colorblind-tol') {
        this.setColour('#DDCC77'); // Yellow for Tol
      }
    } else {
      this.setColour(210); // Original color for normal themes
    }
    
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
    
    // Check current theme and apply appropriate color
    const savedTheme = localStorage.getItem('blockly-theme') || 'dark';
    const isAccessibilityTheme = ['colorblind-wong', 'colorblind-tol'].includes(savedTheme);
    
    if (isAccessibilityTheme) {
      if (savedTheme === 'colorblind-wong') {
        this.setColour('#56b4e9'); // Sky blue for Wong
      } else if (savedTheme === 'colorblind-tol') {
        this.setColour('#DDCC77'); // Yellow for Tol
      }
    } else {
      this.setColour(210); // Original color for normal themes
    }
    
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
    
    // Check current theme and apply appropriate color
    const savedTheme = localStorage.getItem('blockly-theme') || 'dark';
    const isAccessibilityTheme = ['colorblind-wong', 'colorblind-tol'].includes(savedTheme);
    
    if (isAccessibilityTheme) {
      if (savedTheme === 'colorblind-wong') {
        this.setColour('#cc79a7'); // Pale violet for Wong
      } else if (savedTheme === 'colorblind-tol') {
        this.setColour('#AA4499'); // Pink for Tol
      }
    } else {
      this.setColour(120); // Original color for normal themes
    }
    
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