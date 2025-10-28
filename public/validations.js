// JSON Schema Validation Module
// Handles validation for single objects, arrays, and dictionaries

// Function to format validation errors in a readable plaintext format
function formatValidationErrors(errors, pathPrefix = '') {
    if (!errors || !Array.isArray(errors)) {
        return '';
    }
    
    let formattedOutput = '';
    
    errors.forEach((error, index) => {
        if (index > 0) {
            formattedOutput += '\n';
        }
        
        formattedOutput += `Error: ${error.keyword}\n`;
        
        // Add specific parameter information based on error type
        if (error.params) {
            for (const [key, value] of Object.entries(error.params)) {
                if (Array.isArray(value)) {
                    formattedOutput += `${key}: [${value.join(', ')}]\n`;
                } else {
                    formattedOutput += `${key}: ${value}\n`;
                }
            }
        }
        
        formattedOutput += `Message: ${error.message}\n`;
        
        // Combine pathPrefix with the error's instancePath
        let fullPath = pathPrefix || '';
        if (error.instancePath) {
            fullPath += error.instancePath;
        } else if (!pathPrefix) {
            fullPath = '/';
        }
        
        formattedOutput += `Location: ${fullPath}\n`;
    });
    
    return formattedOutput;
}

// Validate a dictionary type (x_dict)
function validateDictionary(rootBlock, jsonObj, ajv) {
    document.getElementById('response_area').style['background-color'] = '#9f9';
    let expectedType = rootBlock.type.slice(0, -5); // Remove "_dict" suffix
    document.getElementById('response_area').value = "";
    
    // Validate each key-value pair in the dictionary
    if (jsonObj && typeof jsonObj === 'object' && !Array.isArray(jsonObj)) {
        for (const [key, value] of Object.entries(jsonObj)) {
            let primitives = ["number", "string", "boolean", "string_array", "boolean_array", "number_array"];
            
            // Skip validation for primitive types
            if (primitives.includes(expectedType)) {
                continue;
            }
            
            // Check if ajv is available and if the schema exists
            if (!ajv) {
                console.warn('AJV validator not available for dict validation');
                document.getElementById('response_area').value += `AJV validator not available for ${expectedType}\n\n`;
                document.getElementById('response_area').style['background-color'] = '#f70';
                continue;
            }
            
            // Check if the schema exists in AJV before attempting validation
            const schemaKey = expectedType + ".json";
            const schemaKeyAlt = expectedType;
            
            if (!ajv.getSchema(schemaKey) && !ajv.getSchema(schemaKeyAlt)) {
                console.warn(`Schema not found in AJV for dict value type: ${expectedType}`);
                document.getElementById('response_area').value += `Schema not found for type: ${expectedType}\n\n`;
                document.getElementById('response_area').style['background-color'] = '#f70';
                continue;
            }
            
            let valid = false;
            try {
                valid = ajv.validate(schemaKey, value);
            } catch (e) {
                console.warn(`Dict validation failed with ${schemaKey}:`, e);
                // Check if the schema contains Blockly properties
                if (typeof window.checkSchemaForBlocklyProps === 'function') {
                    window.checkSchemaForBlocklyProps(expectedType);
                }
                
                try {
                    valid = ajv.validate(schemaKeyAlt, value);
                } catch (e2) {
                    console.warn(`Failed to validate dict value JSON for type ${expectedType}:`, e2);
                    document.getElementById('response_area').value += `Validation failed for ${expectedType} at key "${key}": ${e2.message}\n\n`;
                    document.getElementById('response_area').style['background-color'] = '#f99';
                    continue;
                }
            }
            
            if (!valid) {
                // Use the formatting function for better error display with dict key prefix
                const formattedErrors = formatValidationErrors(ajv.errors, `/${key}`);
                document.getElementById('response_area').value += formattedErrors + "\n";
                document.getElementById('response_area').style['background-color'] = '#f99';
                
                // Show validation error button with formatted error message
                if (typeof window.showValidationError === 'function') {
                    window.showValidationError(formattedErrors);
                }
            }
        }
    } else {
        document.getElementById('response_area').value += `Invalid dictionary structure for validation\n`;
        document.getElementById('response_area').style['background-color'] = '#f70';
        
        // Show validation error button for invalid structure
        if (typeof window.showValidationError === 'function') {
            window.showValidationError('Invalid dictionary structure for validation');
        }
    }
    
    // Validation error button is now handled centrally in performValidation
}

// Validate an array type (x_array)
function validateArray(rootBlock, jsonObj, ajv) {
    document.getElementById('response_area').style['background-color'] = '#9f9';
    let expectedType = rootBlock.type.slice(0, -6); // Remove "_array" suffix
    document.getElementById('response_area').value = "";
    
    for (childIdx in rootBlock.childBlocks_) {
        let child = rootBlock.childBlocks_[childIdx];
        if (child.type != expectedType) {
            document.getElementById('response_area').value += "{\n\"array validation failed @index\": " + childIdx + ",\n\"expected_type\": \"" + expectedType + "\",\n" + "\"actual_type\": \"" + child.type + "\"\n}\n\n";
            document.getElementById('response_area').style['background-color'] = '#f70';
        }
        
        let primitives = ["number", "string", "boolean", "string_array", "boolean_array", "number_array"];
        if (!(primitives.includes(child.type))) {
            // Check if ajv is available and if the schema exists
            if (!ajv) {
                console.warn('AJV validator not available for array validation');
                document.getElementById('response_area').value += `AJV validator not available for ${child.type}\n\n`;
                document.getElementById('response_area').style['background-color'] = '#f70';
                continue;
            }
            
            // Check if the schema exists in AJV before attempting validation
            const schemaKey = child.type + ".json";
            const schemaKeyAlt = child.type;
            
            if (!ajv.getSchema(schemaKey) && !ajv.getSchema(schemaKeyAlt)) {
                console.warn(`Schema not found in AJV for array child type: ${child.type}`);
                continue;
            }
            
            let valid = false;
            try {
                valid = ajv.validate(schemaKey, jsonObj[childIdx]);
            } catch (e) {
                console.warn(`Array validation failed with ${schemaKey}:`, e);
                // Check if the schema contains Blockly properties
                if (typeof window.checkSchemaForBlocklyProps === 'function') {
                    window.checkSchemaForBlocklyProps(child.type);
                }
                
                try {
                    valid = ajv.validate(schemaKeyAlt, jsonObj[childIdx]);
                } catch (e2) {
                    console.warn(`Failed to validate array child JSON for type ${child.type}:`, e2);
                    document.getElementById('response_area').value += `Validation failed for ${child.type}: ${e2.message}\n\n`;
                    document.getElementById('response_area').style['background-color'] = '#f99';
                    continue;
                }
            }
            
            if (!valid) {
                // Use the formatting function for better error display with array index prefix
                const formattedErrors = formatValidationErrors(ajv.errors, `/${childIdx}`);
                document.getElementById('response_area').value += formattedErrors + "\n";
                document.getElementById('response_area').style['background-color'] = '#f99';
                
                // Show validation error button with formatted error message
                if (typeof window.showValidationError === 'function') {
                    window.showValidationError(formattedErrors);
                }
            }
        }
    }
    
    // Validation error button is now handled centrally in performValidation
}

// Validate a single object
function validateSingleObject(rootBlock, jsonObj, ajv) {
    var valid = false;
    
    // Check if ajv is available and if the schema exists
    if (!ajv) {
        console.warn('AJV validator not available for validation');
        document.getElementById('response_area').value = "AJV validator not available";
        document.getElementById('response_area').style['background-color'] = '#f70';
        return;
    }
    
    // Check if the schema exists in AJV before attempting validation
    const schemaKey = rootBlock.type + ".json";
    const schemaKeyAlt = rootBlock.type;
    
    // Debug: list available schemas
    if (typeof window.listSchemasInAJV === 'function') {
        window.listSchemasInAJV();
    }
    
    if (!ajv.getSchema(schemaKey) && !ajv.getSchema(schemaKeyAlt)) {
        console.warn(`Schema not found in AJV for type: ${rootBlock.type}`);
        document.getElementById('response_area').value = "";
        document.getElementById('response_area').style['background-color'] = '#9f9';
        return;
    }
    
    try {
        valid = ajv.validate(schemaKey, jsonObj);
    } catch (e) {
        console.warn(`Validation failed with ${schemaKey}:`, e);
        // Check if the schema contains Blockly properties
        if (typeof window.checkSchemaForBlocklyProps === 'function') {
            window.checkSchemaForBlocklyProps(rootBlock.type);
        }
        
        try {
            valid = ajv.validate(schemaKeyAlt, jsonObj);
        } catch (e) {
            console.warn('Failed to validate JSON with either type or type.json', jsonObj, e);
            document.getElementById('response_area').value = `Validation failed: ${e.message}`;
            document.getElementById('response_area').style['background-color'] = '#f99';
            return;
        }
    }
    
    document.getElementById('response_area').value = "";
    // console.log("Validation result: ", valid);
    if (!valid) {
        // Use the formatting function for better error display
        const formattedErrors = formatValidationErrors(ajv.errors);
        document.getElementById('response_area').value = formattedErrors;
        document.getElementById('response_area').style['background-color'] = '#f99';
        
        // Show validation error button with formatted error message
        if (typeof window.showValidationError === 'function') {
            window.showValidationError(formattedErrors);
        }
    } else {
        document.getElementById('response_area').style['background-color'] = '#9f9';
        
        // Validation error button is now handled centrally in performValidation
    }
}

// Main validation dispatcher
function performValidation(rootBlock, jsonObj, ajv) {
    // Always hide validation error button at the start of validation
    // It will be shown again if there are actual validation errors
    if (typeof window.hideValidationError === 'function') {
        window.hideValidationError();
    }
    
    // Reset response area background to neutral state
    document.getElementById('response_area').style['background-color'] = '#9f9';
    document.getElementById('response_area').value = '';
    
    if (rootBlock.type.endsWith("_dict")) {
        validateDictionary(rootBlock, jsonObj, ajv);
    } else if (rootBlock.type.endsWith("_array")) {
        validateArray(rootBlock, jsonObj, ajv);
    } else {
        // Single object validation
        const primitiveTypes = ['string', 'number', 'boolean', 'dynarray', 'dictionary'];
        const isPrimitive = primitiveTypes.includes(rootBlock.type);
        
        if (!isPrimitive && jsonObj) {
            validateSingleObject(rootBlock, jsonObj, ajv);
        }
    }
}

// Make functions available globally
if (typeof window !== 'undefined') {
    window.formatValidationErrors = formatValidationErrors;
    window.performValidation = performValidation;
    window.validateDictionary = validateDictionary;
    window.validateArray = validateArray;
    window.validateSingleObject = validateSingleObject;
}

// For Node.js environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        formatValidationErrors,
        performValidation,
        validateDictionary,
        validateArray,
        validateSingleObject
    };
}
