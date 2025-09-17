const jsonGenerator = new Blockly.Generator('JSON');

jsonGenerator.scrub_ = function(block, code, thisOnly) {
    return code;
};

jsonGenerator.generalBlockToObj = function(block) {
    if (block) {
        const fn = this.forBlock[block.type];
        if (fn) {
            return fn.call(this, block);
        } else {
            console.warn(`No generator for block type '${block.type}'`);
        }
    }
    return null;
};

// Core block generators (defined upfront)
jsonGenerator.forBlock['start'] = function(block) {
    return this.generalBlockToObj(block.getInputTargetBlock('json')) || {};
};

jsonGenerator.forBlock['boolean'] = function(block) {
    return block.getFieldValue('boolean') === 'true';
};

jsonGenerator.forBlock['string'] = function(block) {
    return block.getFieldValue('string_value');
};

jsonGenerator.forBlock['number'] = function(block) {
    return Number(block.getFieldValue('number_value'));
};

jsonGenerator.forBlock['dictionary'] = function(block) {
    const obj = {};
    for (let i = 0; i < block.length; i++) {
        const key = block.getFieldValue(`key_field_${i}`);
        const val = this.generalBlockToObj(block.getInputTargetBlock(`element_${i}`));
        obj[key] = val;
    }
    return obj;
};

jsonGenerator.forBlock['dynarray'] = function(block) {
    const arr = [];
    for (let i = 0; i < block.length; i++) {
        arr[i] = this.generalBlockToObj(block.getInputTargetBlock(`element_${i}`));
    }
    return arr;
};

// Array generators for primitive types
['string_array', 'number_array', 'boolean_array'].forEach(type => {
    jsonGenerator.forBlock[type] = function(block) {
        const arr = [];
        for (let i = 0; i < block.length; i++) {
            arr[i] = this.generalBlockToObj(block.getInputTargetBlock(`element_${i}`));
        }
        return arr;
    };
});

// Add generators for format-specific string blocks
jsonGenerator.forBlock['string_password'] = function(block) {
    // Return actual password value from memory storage, not the asterisk display
    return window.passwordStorage ? window.passwordStorage.get(block.id) || '' : '';
};

jsonGenerator.forBlock['string_email'] = function(block) {
    return block.getFieldValue('string_value');
};

jsonGenerator.forBlock['string_enum'] = function(block) {
    return block.getFieldValue('enum_value');
};

// Make generator globally available, but preserve existing functions
if (typeof Blockly.JSON === 'undefined') {
    Blockly.JSON = {};
}

// Preserve existing functions from json-workspace-converter.js
const existingFunctions = ['toWorkspace', 'buildAndConnect', 'populateBlockFromJson', 'addOptionalFieldToBlock', 'createBlockFromSchemaAndValue'];
existingFunctions.forEach(funcName => {
    if (typeof Blockly.JSON[funcName] === 'function') {
        jsonGenerator[funcName] = Blockly.JSON[funcName];
    }
});

// Store the original fromWorkspace if it exists
const originalFromWorkspace = Blockly.JSON.fromWorkspace;

// Utility functions for workspace operations
jsonGenerator.fromWorkspace = function(workspace) {
    return workspace.getTopBlocks(false)
        .filter(b => b.type === 'start')
        .map(b => this.generalBlockToObj(b))
        .map(obj => JSON.stringify(obj, null, 4))
        .join('\n\n');
};

// Now set the generator as the main Blockly.JSON object
Object.assign(Blockly.JSON, jsonGenerator);

// Restore fromWorkspace if it was overridden
if (originalFromWorkspace) {
    Blockly.JSON.fromWorkspace = originalFromWorkspace;
} else {
    // If no original fromWorkspace exists, use our jsonGenerator version
    Blockly.JSON.fromWorkspace = jsonGenerator.fromWorkspace;
}

jsonGenerator.fromWorkspaceStructure = jsonGenerator.fromWorkspace;


// Check if a block should be converted to dictionary
jsonGenerator.shouldConvertToDictionary = function(block) {
    // Convert custom object blocks (not primitive types) to dictionaries
    const customObjectTypes = ['string', 'number', 'boolean', 'dictionary', 'dynarray', 'start', 'string_password', 'string_email', 'string_enum'];
    return block.type && 
           !customObjectTypes.includes(block.type) && 
           !block.type.endsWith('_array') && 
           !block.type.endsWith('_dict') &&
           block.type !== 'dictionary' &&
           block.type !== 'dynarray';
};

// Check if a block should be converted to dynarray
jsonGenerator.shouldConvertToDynarray = function(block) {
    // Convert array blocks to dynarrays
    return block.type && block.type.endsWith('_array') && block.type !== 'dynarray';
};

// Convert a block to dictionary
jsonGenerator.convertToDictionary = function(block) {
    if (!block || !block.workspace) return;
    
    console.log(`Converting ${block.type} to dictionary`);
    
    // Get the parent connection
    const parentConnection = block.outputConnection.targetConnection;
    if (!parentConnection) return;
    
    // Create new dictionary block
    const workspace = block.workspace;
    const dictBlock = workspace.newBlock('dictionary');
    dictBlock.initSvg();
    dictBlock.render();
    
    // Connect to parent
    parentConnection.connect(dictBlock.outputConnection);
    
    // Move to same position (only if block has no parent)
    if (!block.getParent()) {
    dictBlock.moveBy(block.getRelativeToSurfaceXY().x, block.getRelativeToSurfaceXY().y);
    }
    
    // If the original block has properties, try to convert them
    if (block.inputList) {
        for (let i = 0; i < block.inputList.length; i++) {
            const input = block.inputList[i];
            if (input.connection && input.connection.targetBlock()) {
                const childBlock = input.connection.targetBlock();
                const fieldName = this.getFieldNameFromInput(input, i);
                
                // Add key-value pair to dictionary
                dictBlock.appendKeyValuePairInput();
                dictBlock.setFieldValue(fieldName, `key_field_${i}`);
                
                // Connect the child block
                const elementConnection = dictBlock.getInput(`element_${i}`).connection;
                elementConnection.connect(childBlock.outputConnection);
            }
        }
    }
    
    // Dispose of the original block
    block.dispose(true, true);
};

// Convert a block to dynarray
jsonGenerator.convertToDynarray = function(block) {
    if (!block || !block.workspace) return;
    
    console.log(`Converting ${block.type} to dynarray`);
    
    // Get the parent connection
    const parentConnection = block.outputConnection.targetConnection;
    if (!parentConnection) return;
    
    // Create new dynarray block
    const workspace = block.workspace;
    const arrayBlock = workspace.newBlock('dynarray');
    arrayBlock.initSvg();
    arrayBlock.render();
    
    // Connect to parent
    parentConnection.connect(arrayBlock.outputConnection);
    
    // Move to same position (only if block has no parent)
    if (!block.getParent()) {
    arrayBlock.moveBy(block.getRelativeToSurfaceXY().x, block.getRelativeToSurfaceXY().y);
    }
    
    // If the original block has elements, convert them
    if (block.inputList) {
        for (let i = 0; i < block.inputList.length; i++) {
            const input = block.inputList[i];
            if (input.connection && input.connection.targetBlock()) {
                const childBlock = input.connection.targetBlock();
                
                // Add element to dynarray
                arrayBlock.appendElementInput();
                
                // Connect the child block
                const elementConnection = arrayBlock.getInput(`element_${i}`).connection;
                elementConnection.connect(childBlock.outputConnection);
            }
        }
    }
    
    // Dispose of the original block
    block.dispose(true, true);
};

// Helper function to get field name from input
jsonGenerator.getFieldNameFromInput = function(input, index) {
    // Look for a field that might contain the field name
    for (const field of input.fieldRow) {
        if (field.name && field.name.startsWith('key_field_')) {
            return field.getValue() || `field_${index}`;
        }
        if (field.getText && field.getText() && 
            field.getText() !== '→' && field.getText() !== '⇒' && 
            field.getText() !== '←' && field.getText() !== '⇐' && 
            field.getText() !== '+' && field.getText() !== '–') {
            return field.getText();
        }
    }
    return `field_${index}`;
};

//---------------------------------- S3 Block Loader --------------------------------------//

class S3BlockLoader {
    constructor() {
        this.queryParams = this.getQueryParams();
        this.tenantId = this.queryParams.tenant;
        this.rootSchema = this.queryParams.rootSchema;
        this.initialJson = this.queryParams.initial;
        this.schemas = [];
        this.tenantProperties = {};
        this.schemaLibrary = {}; // Local storage for schemas
        this.retryCount = 0;
        this.maxRetries = 10;
    }

//---------------------------------- Blockly Generator Setup --------------------------------------//

const jsonGenerator = new Blockly.Generator('JSON');

jsonGenerator.scrub_ = function(block, code, thisOnly) {
    return code;
};

jsonGenerator.generalBlockToObj = function(block) {
    if (block) {
        const fn = this.forBlock[block.type];
        if (fn) {
            return fn.call(this, block);
        } else {
            console.warn(`No generator for block type '${block.type}'`);
        }
    }
    return null;
};

// Core block generators (defined upfront)
jsonGenerator.forBlock['start'] = function(block) {
    return this.generalBlockToObj(block.getInputTargetBlock('json')) || {};
};

jsonGenerator.forBlock['boolean'] = function(block) {
    return block.getFieldValue('boolean') === 'true';
};

jsonGenerator.forBlock['string'] = function(block) {
    return block.getFieldValue('string_value');
};

jsonGenerator.forBlock['number'] = function(block) {
    return Number(block.getFieldValue('number_value'));
};

jsonGenerator.forBlock['dictionary'] = function(block) {
    const obj = {};
    for (let i = 0; i < block.length; i++) {
        const key = block.getFieldValue(`key_field_${i}`);
        const val = this.generalBlockToObj(block.getInputTargetBlock(`element_${i}`));
        obj[key] = val;
    }
    return obj;
};

jsonGenerator.forBlock['dynarray'] = function(block) {
    const arr = [];
    for (let i = 0; i < block.length; i++) {
        arr[i] = this.generalBlockToObj(block.getInputTargetBlock(`element_${i}`));
    }
    return arr;
};

// Array generators for primitive types
['string_array', 'number_array', 'boolean_array'].forEach(type => {
    jsonGenerator.forBlock[type] = function(block) {
        const arr = [];
        for (let i = 0; i < block.length; i++) {
            arr[i] = this.generalBlockToObj(block.getInputTargetBlock(`element_${i}`));
        }
        return arr;
    };
});

// Make generator globally available
Blockly.JSON = jsonGenerator;

// Utility functions for workspace operations
jsonGenerator.fromWorkspace = function(workspace) {
    return workspace.getTopBlocks(false)
        .filter(b => b.type === 'start')
        .map(b => this.generalBlockToObj(b))
        .map(obj => JSON.stringify(obj, null, 4))
        .join('\n\n');
};

jsonGenerator.fromWorkspaceStructure = jsonGenerator.fromWorkspace;

//---------------------------------- S3 Block Loader --------------------------------------//

class S3BlockLoader {
    constructor() {
        this.tenantId = this.getTenantId();
        this.schemas = [];
    }

    getTenantId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('tenant') || 'default';
    }

    getQueryParams() {
        const urlParams = new URLSearchParams(window.location.search);
        return {
            tenant: urlParams.get('tenant') || 'default',
            rootSchema: urlParams.get('rootSchema'),
            initial: urlParams.get('initial')
        };
    }

    // Wait for AJV and required functions to be available
    waitForDependencies() {
        return new Promise((resolve, reject) => {
            const checkDependencies = () => {
                // Log current dependency status
                console.log('=== Dependency Check ===');
                console.log('AJV global:', typeof Ajv !== 'undefined');
                console.log('addSchemaToValidator:', typeof window.addSchemaToValidator);
                console.log('passSchemaToMain:', typeof window.passSchemaToMain);
                console.log('addBlockFromSchema:', typeof window.addBlockFromSchema);
                console.log('Retry count:', this.retryCount);
                console.log('======================');

                // Check if required functions are available
                if (typeof window.addSchemaToValidator !== 'function' ||
                    typeof window.passSchemaToMain !== 'function' ||
                    typeof window.addBlockFromSchema !== 'function') {
                    console.log('Waiting for required functions to be available...');
                    console.log('Available window functions:', Object.keys(window).filter(key => 
                        typeof window[key] === 'function' && 
                        (key.includes('Schema') || key.includes('Block') || key.includes('Ajv'))
                    ));
                    this.retryCount++;
                    if (this.retryCount >= this.maxRetries) {
                        reject(new Error('Required functions failed to load after maximum retries'));
                        return;
                    }
                    setTimeout(checkDependencies, 100);
                    return;
                }

                // Note: We don't check AJV availability here because it's lazy-loaded
                // AJV will be initialized when the first schema is processed
                console.log('All required functions are now available');
                console.log('AJV will be initialized when first schema is loaded');
                
                // Log what we found for debugging
                console.log('Found functions:');
                console.log('- addSchemaToValidator:', typeof window.addSchemaToValidator);
                console.log('- passSchemaToMain:', typeof window.passSchemaToMain);
                console.log('- addBlockFromSchema:', typeof window.addBlockFromSchema);
                
                resolve();
            };

            checkDependencies();
        });
    }

    async loadTenantProperties() {
        try {
            console.log('=== LOADING TENANT PROPERTIES ===');
            console.log('Tenant ID:', this.tenantId);
            console.log('Tenant ID type:', typeof this.tenantId);
            
            if (this.tenantId === 'default') {
                console.log('Default tenant - no custom properties to load');
                return true;
            }
            
            console.log(`Loading tenant properties for tenant: ${this.tenantId}`);
            const propertiesUrl = `/tenant-properties?tenant=${encodeURIComponent(this.tenantId)}`;
            console.log(`Tenant properties URL: ${propertiesUrl}`);

            const response = await fetch(propertiesUrl);

            if (response.ok) {
                const propertiesText = await response.text();
                console.log('Properties response text length:', propertiesText.length);
                console.log('Properties response text preview:', propertiesText.substring(0, 200));
                
                this.tenantProperties = this.parsePropertiesFile(propertiesText);
                
                // CRITICAL: Make tenant properties globally accessible and NEVER lose them
                window.tenantProperties = this.tenantProperties;
                window.currentTenantId = this.tenantId;
                
                console.log('Final tenant properties object:', this.tenantProperties);
                console.log('Tenant properties keys:', Object.keys(this.tenantProperties));
                console.log('Global tenant properties set:', window.tenantProperties);
                console.log('Global tenant ID set:', window.currentTenantId);
                
                // Route will be applied later in applyTenantCustomizations after DOM is ready
                
                return true;
            } else {
                console.warn(`No tenant properties found for ${this.tenantId} (${response.status})`);
                console.warn(`Response status: ${response.status}`);
                console.warn(`Response status text: ${response.statusText}`);
                console.warn(`Response headers:`, response.headers);
                
                let errorText = '';
                try {
                    errorText = await response.text();
                    console.warn('Error response body:', errorText);
                } catch (textError) {
                    console.warn('Could not read error response body:', textError);
                }
                
                // Log additional debugging info
                console.warn(`Tenant properties request failed:`, {
                    tenantId: this.tenantId,
                    url: propertiesUrl,
                    status: response.status,
                    statusText: response.statusText,
                    errorBody: errorText
                });
                
                return true;
            }
        } catch (error) {
            console.error('=== TENANT PROPERTIES LOADING ERROR ===');
            console.error('Error:', error);
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
            console.error('Error name:', error.name);
            console.error('Error constructor:', error.constructor.name);
            
            if (error.cause) {
                console.error('Error cause:', error.cause);
            }
            
            console.error('=== END ERROR ===');
            return true; // Not a critical error
        }
    }
    
    parsePropertiesFile(propertiesText) {
        const properties = {};
        const lines = propertiesText.split('\n');
        
        console.log('=== PARSING TENANT PROPERTIES FILE ===');
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            console.log(`Processing line: "${trimmedLine}"`);
            
            if (trimmedLine && !trimmedLine.startsWith('#')) {
                const equalIndex = trimmedLine.indexOf('=');
                if (equalIndex > 0) {
                    const key = trimmedLine.substring(0, equalIndex).trim();
                    const value = trimmedLine.substring(equalIndex + 1).trim();
                    properties[key] = value;
                }
            }
        }
        
        console.log('Final parsed properties object:', properties);
        console.log('Properties keys:', Object.keys(properties));
        console.log('=== END PARSING ===');
        
        return properties;
    }

    async loadSchemas() {
        try {
            console.log(`Fetching schemas from /schemas endpoint for tenant: ${this.tenantId}`);
            
            // Build the URL with tenant parameter if not default
            let schemasUrl = '/schemas';
            if (this.tenantId && this.tenantId !== 'default') {
                schemasUrl += `?tenant=${encodeURIComponent(this.tenantId)}`;
            }
            
            console.log(`Schemas URL: ${schemasUrl}`);
            const response = await fetch(schemasUrl);
            console.log('Schema response status:', response.status);
            console.log('Schema response headers:', response.headers);
            
            if (response.ok) {
                this.schemas = await response.json();
                console.log('Loaded schemas list:', this.schemas);
                return true;
            } else {
                console.error('Failed to load schemas:', response.status);
                const errorText = await response.text();
                console.error('Error response body:', errorText);
                return false;
            }
        } catch (error) {
            console.error('Error loading schemas:', error);
            console.error('Error stack:', error.stack);
            return false;
        }
    }

    getBlockName(schema) {
        console.log(`getBlockName called with schema:`, {
            title: schema.title,
            $id: schema.$id,
            properties: schema.properties ? Object.keys(schema.properties) : 'none'
        });
        
        // Use $id instead of title since lambda function generates filenames based on $id
        let name = schema.$id || schema.title || 'custom';
        // Remove .json extension if present and sanitize
        if (name.endsWith('.json')) {
            name = name.slice(0, -5);
        }
        const result = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        
        // Store the original title for display purposes - REMOVED to fix AJV validation errors
        
        console.log(`getBlockName result: ${result}`);
        return result;
    }
    
    getColorFromSchema(schema) {
        console.log(`getColorFromSchema called with schema:`, {
            title: schema.title,
            $id: schema.$id,
            properties: schema.properties ? Object.keys(schema.properties) : 'none'
        });
        
        // Use $id instead of title for consistency
        const identifier = schema.$id || schema.title || 'custom';
        let hash = 0;
        for (let i = 0; i < identifier.length; i++) {
            hash = identifier.charCodeAt(i) + ((hash << 5) - hash);
        }
        const color = Math.abs(hash) % 360;
        
        console.log(`getColorFromSchema result: ${color}`);
        return color;
    }

    // Register dynamic mappers for schema-based blocks
    registerDynamicMappers(schemaDetails) {
        schemaDetails.filter(Boolean).forEach(({ filename, schema }) => {
            const name = this.getBlockName(schema);
            
            // Skip if mapper already exists to prevent duplicate registration
            if (jsonGenerator.forBlock[name]) {
                console.log(`Mapper for ${name} already exists, skipping registration`);
                return;
            }
            
            // Register object mapper
            jsonGenerator.forBlock[name] = function (block) {
                const dict = {};
                for (let i = 0; i < block.length; i++) {
                    const key = block.getFieldValue(`key_field_${i}`);
                    const value = this.generalBlockToObj(block.getInputTargetBlock(`element_${i}`));
                    
                    // ONLY stringify if explicitly specified in schema
                    if (schema.properties && schema.properties[key] && schema.properties[key].stringify === true) {
                        console.log(`Stringifying field ${key} as requested by schema`);
                        
                        // Handle arrays specially - stringify each element individually
                        if (Array.isArray(value)) {
                            dict[key] = value.map(item => JSON.stringify(item));
                        } else {
                            dict[key] = JSON.stringify(value);
                        }
                    } else {
                        dict[key] = value;
                    }
                }
                return dict;
            };

            // Register array mapper
            if (!jsonGenerator.forBlock[`${name}_array`]) {
                jsonGenerator.forBlock[`${name}_array`] = function (block) {
                const arr = [];
                for (let i = 0; i < block.length; i++) {
                    arr[i] = this.generalBlockToObj(block.getInputTargetBlock(`element_${i}`));
                }
                return arr;
                };
            }
            
            // NEW: Register dict mapper for any schema
            if (!jsonGenerator.forBlock[`${name}_dict`]) {
                jsonGenerator.forBlock[`${name}_dict`] = function (block) {
                const obj = {};
                // Only log for tenantproperties blocks
                if (name === 'tenantproperties') {
                    console.log(`Generating JSON for ${name}_dict block with length: ${block.length}`);
                }
                
                for (let i = 0; i < block.length; i++) {
                    const key = block.getFieldValue(`key_field_${i}`);
                    const val = this.generalBlockToObj(block.getInputTargetBlock(`element_${i}`));
                    // Only log for tenantproperties blocks
                    if (name === 'tenantproperties') {
                        console.log(`  Processing element_${i}: key="${key}", value=`, val);
                    }
                    
                    if (key && val !== null) {
                        obj[key] = val;
                    }
                }
                
                console.log(`Final JSON object:`, obj);
                return obj;
                };
            }
        
            // Note: Dict blocks use the same validation as the base schema
            // No need to register separate _dict schemas since they validate against the base schema
        });
    }
    
    updateToolbox(schemaDetails) {
        const toolbox = document.getElementById('toolbox');
        const custom = toolbox?.querySelector('#custom-objects');
        const customArrays = toolbox?.querySelector('#custom-arrays');
        const customDicts = toolbox?.querySelector('#custom-dicts');
    
        if (!custom || !customArrays || !customDicts) {
            console.error('Toolbox structure missing.');
            return;
        }
    
        custom.innerHTML = '';
        customArrays.innerHTML = '';
    
        schemaDetails.filter(Boolean).forEach(({ schema }) => {
            const blockName = this.getBlockName(schema);
    
            const blockEl = document.createElement('block');
            blockEl.setAttribute('type', blockName);
            custom.appendChild(blockEl);
    
            const arrayBlock = document.createElement('block');
            arrayBlock.setAttribute('type', `${blockName}_array`);
            customArrays.appendChild(arrayBlock);
            
            const dictBlock = document.createElement('block');
            dictBlock.setAttribute('type', `${blockName}_dict`);
            customDicts.appendChild(dictBlock);
        });
    }

    initializeBlockly() {
        // Get the saved theme or default to dark
        const savedTheme = localStorage.getItem('blockly-theme') || 'dark';
        
        // Get the custom theme from the global themes object
        let themeToUse = Blockly.Themes.Dark; // fallback
        if (window.themes && window.themes[savedTheme]) {
            themeToUse = window.themes[savedTheme];
        }
        
        const workspace = Blockly.inject(document.getElementById('blocklyDiv'), {
            toolbox: document.getElementById('toolbox'),
            media: 'media/',
            sounds: false,
            collapse: true,
            comments: true,
            disable: false,
            scrollbars: true,
            trashcan: true,
            theme: themeToUse,
        });

        const startBlock = workspace.newBlock('start');
        startBlock.initSvg();
        startBlock.render();
        startBlock.moveBy(20, 20);

        // Don't set up change listeners here - wait until after tenant customizations
        // to avoid triggering updates before tenant properties are ready

        if (window.getKeyboardManager) {
            const kb = window.getKeyboardManager();
            if (kb) kb.setWorkspace(workspace);
        }
    }
    
    applyTenantCustomizations(workspace, startBlock) {
        console.log('=== APPLYING TENANT CUSTOMIZATIONS ===');
        console.log('Query params:', this.queryParams);
        
        // Determine which root schema to use
        let rootSchemaType = null;
        
        // Priority 1: rootSchema query parameter
        if (this.rootSchema) {
            rootSchemaType = this.rootSchema.toLowerCase();
            console.log(`Using rootSchema from query parameter: ${rootSchemaType}`);
        }
        // Priority 2: topic property from tenant properties
        else if (this.tenantProperties && this.tenantProperties.topic && this.tenantProperties.topic.trim()) {
            rootSchemaType = this.tenantProperties.topic.toLowerCase();
            console.log(`Using topic from tenant properties: ${rootSchemaType}`);
        }
        
        if (rootSchemaType) {
            try {
                console.log(`Setting root block child to: "${rootSchemaType}"`);
                
                // Get the json input from the start block
                const jsonInput = startBlock.getInput('json');
                console.log('JSON input found:', jsonInput);
                
                if (jsonInput) {
                    // Create a new block of the specified type
                    console.log(`Creating new block of type: ${rootSchemaType}`);
                    const rootBlock = workspace.newBlock(rootSchemaType);
                    console.log('Root block created:', rootBlock);
                    
                    if (rootBlock) {
                        // Initialize and render the root block
                        rootBlock.initSvg();
                        rootBlock.render();
                        console.log('Root block initialized and rendered');
                        
                        // Connect it to the json input
                        const connection = jsonInput.connection;
                        console.log('JSON input connection:', connection);
                        console.log('Root block output connection:', rootBlock.outputConnection);
                        
                        if (connection && rootBlock.outputConnection) {
                            connection.connect(rootBlock.outputConnection);
                            console.log(`Successfully connected ${rootSchemaType} block to root`);
                            
                            // Create required field children for the root block
                            if (rootBlock.createRequiredFieldBlocks && typeof rootBlock.createRequiredFieldBlocks === 'function') {
                                console.log('Creating required field blocks for root block');
                                setTimeout(() => {
                                    rootBlock.createRequiredFieldBlocks();
                                }, 100);
                            }
                            
                            // Handle initial JSON data if provided
                            if (this.initialJson) {
                                console.log('Processing initial JSON data:', this.initialJson);
                                // Delay initial JSON handling to ensure blocks are ready
                                setTimeout(() => {
                                    this.handleInitialJson(rootBlock, this.initialJson, rootSchemaType);
                                }, 300);
                            }
                        } else {
                            console.warn('Connection failed - missing connection or output connection');
                        }
                    } else {
                        console.warn(`Failed to create block of type: ${rootSchemaType}`);
                    }
                } else {
                    console.warn('JSON input not found on start block');
                }
            } catch (e) {
                console.error('Failed to set root block:', e);
                console.error('Error stack:', e.stack);
            }
        } else {
            console.log('No root schema specified, using default behavior');
        }
        
        // Note: We don't set the route directly here anymore
        // Instead, we'll trigger a workspace update to ensure constructFullRoute uses tenant properties
        if (this.tenantProperties.route) {
            console.log(`Tenant route configured: "${this.tenantProperties.route}"`);
        } else {
            console.log('No route property found');
        }
        
        // Apply feature toggles
        console.log('Calling applyFeatureToggles...');
        this.applyFeatureToggles(workspace);
        
        // Trigger a workspace update to ensure constructFullRoute uses tenant properties
        // Delay this longer if we have initial JSON to populate
        if (typeof window.updateJSONarea === 'function') {
            const delay = this.initialJson ? 600 : 100; // Longer delay if initial JSON needs to be populated
            console.log(`Triggering workspace update to refresh route with tenant properties (delay: ${delay}ms)`);
            setTimeout(() => {
                window.updateJSONarea(workspace);
            }, delay);
        }
        
        // NOW set up change listeners after tenant properties are ready
        console.log('Setting up workspace change listeners after tenant customizations');
        workspace.addChangeListener((event) => {
            updateJSONarea(workspace);
            
            // Clean up password storage for deleted blocks
            if (event && event.type === Blockly.Events.BLOCK_DELETE) {
                if (typeof window.cleanupPasswordStorage === 'function') {
                    window.cleanupPasswordStorage(workspace);
                }
            }
            
            // Check for enum conversion when blocks are added or changed
            if (event && (event.type === Blockly.Events.BLOCK_CREATE || event.type === Blockly.Events.BLOCK_CHANGE)) {
                setTimeout(() => {
                    if (typeof window.scanAndConvertStringBlocksToEnums === 'function') {
                        window.scanAndConvertStringBlocksToEnums(workspace);
                    }
                }, 100);
            }
        });
        document.getElementById('path_id')?.addEventListener('input', () => updateJSONarea(workspace));
        
        console.log('=== END TENANT CUSTOMIZATIONS ===');
        
        // Add global function to manually trigger enum conversion
        window.convertStringBlocksToEnums = () => {
            if (typeof window.scanAndConvertStringBlocksToEnums === 'function') {
                window.scanAndConvertStringBlocksToEnums(workspace);
            } else {
                console.warn('scanAndConvertStringBlocksToEnums function not available');
            }
        };
    }

    handleInitialJson(rootBlock, initialJsonString, rootSchemaType) {
        try {
            // URL decode the initial JSON
            const decodedJson = decodeURIComponent(initialJsonString);
            console.log('Decoded initial JSON:', decodedJson);
            
            // Parse the JSON
            const initialData = JSON.parse(decodedJson);
            console.log('Parsed initial data:', initialData);
            
            // Get the schema for the root type - try multiple sources
            let schema = null;
            let baseSchemaType = rootSchemaType;
            
            // Handle array and dict types by extracting the base type
            if (rootSchemaType.endsWith('_array')) {
                baseSchemaType = rootSchemaType.replace('_array', '');
                console.log(`Array type detected, using base schema: ${baseSchemaType}`);
            } else if (rootSchemaType.endsWith('_dict')) {
                baseSchemaType = rootSchemaType.replace('_dict', '');
                console.log(`Dict type detected, using base schema: ${baseSchemaType}`);
            }
            
            // Try to get from global schema library
            if (window.getSchemaLibrary && typeof window.getSchemaLibrary === 'function') {
                const schemaLib = window.getSchemaLibrary();
                schema = schemaLib && schemaLib[baseSchemaType];
                console.log(`Schema from getSchemaLibrary for ${baseSchemaType}:`, schema);
            }
            
            // If not found, try to get from the local schema library
            if (!schema && this.schemaLibrary && this.schemaLibrary[baseSchemaType]) {
                schema = this.schemaLibrary[baseSchemaType];
                console.log(`Schema from local schemaLibrary for ${baseSchemaType}:`, schema);
            }
            
            if (schema) {
                console.log('Found schema for root type:', schema);
                
                // Handle different root schema types
                if (rootSchemaType.endsWith('_array')) {
                    // For array types, populate each element
                    this.populateArrayRootBlock(rootBlock, initialData, schema);
                } else if (rootSchemaType.endsWith('_dict')) {
                    // For dict types, populate as key-value pairs
                    this.populateDictRootBlock(rootBlock, initialData, schema);
                } else {
                    // For regular types, populate directly
                this.populateRootBlockWithData(rootBlock, initialData, schema);
                }
                
                console.log('Successfully populated root block with initial data');
            } else {
                console.warn(`No schema found for root type: ${rootSchemaType}`);
                console.log('Available schemas:', Object.keys(window.getSchemaLibrary ? window.getSchemaLibrary() : {}));
            }
        } catch (error) {
            console.error('Failed to handle initial JSON:', error);
        }
    }

    // Unified method to create input and connect block using block-extensions.js patterns
    createAndConnectBlock(rootBlock, key, value, targetType, isArray = false, schema = null) {
        const lastIndex = rootBlock.length++;
        const appendedInput = rootBlock.appendValueInput('element_' + lastIndex);
        
        // Add delete button
        appendedInput.appendField(new Blockly.FieldTextbutton('–', function() { 
            if (this.sourceBlock_) {
                const deleteMethod = isArray ? 'deleteElementInput' : 'deleteKeyValuePairInput';
                this.sourceBlock_[deleteMethod](appendedInput);
                if (typeof updateJSONarea === 'function') {
                    updateJSONarea(this.sourceBlock_.workspace);
                }
            }
        }));
        
        // Add key field (for arrays, use 'item', for dicts use the actual key)
        const keyLabel = isArray ? 'item' : key;
        appendedInput.appendField(new Blockly.FieldLabel(keyLabel), 'key_field_' + lastIndex)
            .appendField(Blockly.keyValueArrow());
        
        // Create and connect the target block using toggleTargetBlock
        setTimeout(() => {
            if (rootBlock.toggleTargetBlock) {
                rootBlock.toggleTargetBlock(appendedInput, targetType);
                
                // Get the created block and populate it with data
                const createdBlock = appendedInput.connection ? appendedInput.connection.targetBlock() : null;
                if (createdBlock) {
                    // Create required field blocks first
                    if (createdBlock.createRequiredFieldBlocks && typeof createdBlock.createRequiredFieldBlocks === 'function') {
                        createdBlock.createRequiredFieldBlocks();
                    }
                    
                    // Wait for required fields to be created, then populate with data
                    setTimeout(() => {
                        this.populateBlockWithData(createdBlock, value, schema);
                    }, 50);
                }
            }
        }, 10);
    }

    // Determine target block type based on value and schema
    determineTargetType(value, schema, isArray = false) {
        // Handle array items
        if (isArray && schema && schema.$ref) {
            // Remove .json extension if present
            return schema.$ref.replace('.json', '');
        }
        
        // Handle array items with type
        if (isArray && schema && schema.type) {
            let result = schema.type;
            if (result === 'integer') {
                result = 'number';
            }
            return result;
        }
        
        // CRITICAL FIX: Handle $ref ONLY when there's no type (direct reference)
        // This handles cases like tenant.json where properties has ONLY $ref=tenantproperties.json
        if (schema && schema.$ref && !schema.type) {
            // This is a direct $ref - use the schema name directly
            return schema.$ref.replace('.json', '');
        }
        
        // Handle schema-based type determination
        if (schema && schema.type) {
            if (schema.type === 'array' && schema.items && schema.items.type) {
                // This is an array of a specific type
                const itemType = schema.items.type;
                if (itemType === 'string') {
                    return 'string_array';
                } else if (itemType === 'number') {
                    return 'number_array';
                } else if (itemType === 'boolean') {
                    return 'boolean_array';
                } else if (itemType === 'integer') {
                    return 'number_array';
                } else if (itemType === 'object' && schema.items.$ref) {
                    // Array of objects with $ref
                    const refName = schema.items.$ref.replace('.json', '');
                    return refName + '_array';
                }
                // Fallback to dynarray for unknown array types
                return 'dynarray';
            } else if (schema.type === 'object' && schema.$ref) {
                // This is an object with a $ref - it should be a _dict block
                const refName = schema.$ref.replace('.json', '');
                return refName + '_dict';
            } else if (schema.type === 'string') {
                return 'string';
            } else if (schema.type === 'number' || schema.type === 'integer') {
                return 'number';
            } else if (schema.type === 'boolean') {
                return 'boolean';
            }
        }
        
        // Handle primitive types based on value
        if (typeof value === 'number') {
            return 'number';
        } else if (typeof value === 'boolean') {
            return 'boolean';
        } else if (typeof value === 'string') {
            return 'string';
        } else if (Array.isArray(value)) {
            return 'dynarray';
        } else if (typeof value === 'object' && value !== null) {
            return 'dictionary';
        }
        
        return 'string'; // default
    }

    populateArrayRootBlock(rootBlock, data, schema) {
        if (!rootBlock || !Array.isArray(data) || !schema) {
            console.warn('Invalid data or schema for array root block');
            return;
        }
        
        console.log('Populating array root block with data:', data);
        
        data.forEach((item, index) => {
            const targetType = this.determineTargetType(item, schema, true);
            this.createAndConnectBlock(rootBlock, 'item', item, targetType, true, schema);
        });
    }
    
    populateDictRootBlock(rootBlock, data, schema) {
        if (!rootBlock || !data || typeof data !== 'object' || !schema) {
            console.warn('Invalid data or schema for dict root block');
            return;
        }
        
        console.log('Populating dict root block with data:', data);
        
        Object.entries(data).forEach(([key, value], index) => {
            const targetType = this.determineTargetType(value, schema, false);
            this.createAndConnectBlock(rootBlock, key, value, targetType, false, schema);
        });
    }

    // Unified method to populate any block with data
    populateBlockWithData(block, data, schema) {
        if (!block || data === undefined || data === null) {
            console.log(`populateBlockWithData: Early return - block=${!!block}, data=${data}`);
            return;
        }
        
        console.log('populateBlockWithData: Populating block with data:', data, 'block type:', block.type);
        
        // Handle primitive types
        if (block.type === 'string' && block.setFieldValue) {
            block.setFieldValue(String(data), 'string_value');
        } else if (block.type === 'number' && block.setFieldValue) {
            block.setFieldValue(String(data), 'number_value');
        } else if (block.type === 'boolean' && block.setFieldValue) {
            block.setFieldValue(String(Boolean(data)), 'boolean');
        } else if (block.type === 'string_enum' && block.setFieldValue) {
            block.setFieldValue(String(data), 'enum_value');
        } else if (block.type === 'dynarray' && Array.isArray(data)) {
            // Handle dynamic arrays
            data.forEach((item, index) => {
                const targetType = this.determineTargetType(item, null, false);
                this.createAndConnectBlock(block, `item_${index}`, item, targetType, true, null);
            });
        } else if (block.type === 'dictionary' && typeof data === 'object' && !Array.isArray(data)) {
            // Handle dictionaries
            Object.entries(data).forEach(([key, value]) => {
                const targetType = this.determineTargetType(value, null, false);
                this.createAndConnectBlock(block, key, value, targetType, false, null);
            });
        } else if (schema && schema.properties) {
            // Handle complex objects with schema
            this.populateRootBlockWithData(block, data, schema);
        }
    }

    populateRootBlockWithData(rootBlock, data, schema) {
        if (!rootBlock || !data || !schema || !schema.properties) {
            return;
        }
        
        console.log('Populating root block with data:', data);
        console.log('Schema properties:', schema.properties);
        console.log('Schema required:', schema.required);
        console.log('Root block type:', rootBlock.type);
        console.log('Schema title:', schema.title);
        
        // Process each field in the data
        for (const [key, value] of Object.entries(data)) {
            if (schema.properties[key]) {
                const propertySchema = schema.properties[key];
                console.log(`Processing field ${key} with value:`, value);
                console.log(`Property schema for ${key}:`, propertySchema);
                
                // Special logging for properties field
                if (key === 'properties') {
                    console.log(`🔍🔍🔍 PROCESSING PROPERTIES FIELD IN populateRootBlockWithData 🔍🔍🔍`);
                    console.log(`🔍 Property schema:`, propertySchema);
                    console.log(`🔍 Has $ref:`, !!propertySchema.$ref);
                    console.log(`🔍 $ref value:`, propertySchema.$ref);
                }
                
                // Handle $ref properties - resolve the reference
                if (propertySchema.$ref) {
                    if (key === 'properties') {
                        console.log(`🔍🔍🔍 FOUND $REF FOR PROPERTIES FIELD 🔍🔍🔍`);
                        console.log(`🔍 Property schema:`, propertySchema);
                    }
                    const refSchema = this.resolveSchemaReference(propertySchema.$ref);
                    if (refSchema) {
                        if (key === 'properties') {
                            console.log(`🔍🔍🔍 RESOLVED $REF FOR PROPERTIES TO SCHEMA 🔍🔍🔍`);
                            console.log(`🔍 Resolved schema:`, refSchema);
                        }
                        // Use the resolved schema for further processing
                        this.processFieldWithResolvedSchema(rootBlock, key, value, refSchema, schema);
                    } else {
                        console.warn(`Could not resolve $ref for ${key}: ${propertySchema.$ref}`);
                    }
                } else {
                // Check if this is a required field
                const isRequired = schema.required && schema.required.includes(key);
                console.log(`Field ${key} is required:`, isRequired);
                
                if (isRequired) {
                    // Find the existing required field and set its value
                    this.setRequiredFieldValue(rootBlock, key, value, propertySchema);
                } else {
                    // This is an optional field - add it via dropdown
                    this.addOptionalFieldWithValue(rootBlock, key, value, propertySchema, schema);
                    }
                }
            }
        }
    }

    setRequiredFieldValue(rootBlock, fieldName, fieldValue, fieldSchema) {
        console.log(`Setting required field ${fieldName} to value:`, fieldValue);
        
        // Find the input for this field by looking for the field name in the fieldRow
        const input = rootBlock.inputList.find(input => {
            return input.fieldRow.some(field => {
                // Check if this field contains the field name
                if (field.getText && field.getText() === fieldName) {
                    return true;
                }
                // Also check if it's a label field with the field name
                if (field.name && field.name.startsWith('key_field_') && field.getText && field.getText() === fieldName) {
                    return true;
                }
                return false;
            });
        });
        
        if (input && input.connection && input.connection.targetBlock()) {
            const targetBlock = input.connection.targetBlock();
            console.log(`Found target block for required field ${fieldName}:`, targetBlock.type);
            
            // Set the value based on the field type
            this.setBlockValue(targetBlock, fieldValue, fieldSchema);
        } else {
            console.warn(`No target block found for required field ${fieldName}`);
        }
    }

    setBlockValue(block, value, schema) {
        if (!block || value === undefined || value === null) {
            console.log(`setBlockValue: Early return - block=${!!block}, value=${value}`);
            return;
        }
        
        console.log(`setBlockValue: Setting block type ${block.type} with value:`, value);
        
        // Handle different block types
        if (block.type === 'string' && block.setFieldValue) {
            console.log(`Setting string field value: ${value}`);
            block.setFieldValue(String(value), 'string_value');
        } else if (block.type === 'number' && block.setFieldValue) {
            console.log(`Setting number field value: ${value}`);
            block.setFieldValue(String(value), 'number_value');
        } else if (block.type === 'boolean' && block.setFieldValue) {
            console.log(`Setting boolean field value: ${value}`);
            block.setFieldValue(String(Boolean(value)), 'boolean');
        } else if (block.type === 'string_enum' && block.setFieldValue) {
            console.log(`Setting enum field value: ${value}`);
            block.setFieldValue(String(value), 'enum_value');
        } else if (block.type === 'string_array' && Array.isArray(value)) {
            // Handle string arrays by creating child blocks
            value.forEach((item, index) => {
                this.createChildBlockForArrayItem(block, item, schema, index);
            });
        } else if (block.type === 'number_array' && Array.isArray(value)) {
            // Handle number arrays by creating child blocks
            value.forEach((item, index) => {
                this.createChildBlockForArrayItem(block, item, schema, index);
            });
        } else if (block.type === 'boolean_array' && Array.isArray(value)) {
            // Handle boolean arrays by creating child blocks
            value.forEach((item, index) => {
                this.createChildBlockForArrayItem(block, item, schema, index);
            });
        } else if (block.type.endsWith('_dict') && typeof value === 'object' && !Array.isArray(value)) {
            // Handle any _dict blocks - populate with key-value pairs
            console.log(`Populating ${block.type} with data:`, value);
            const baseType = block.type.replace('_dict', '');
            Object.entries(value).forEach(([key, fieldDef]) => {
                // For _dict blocks, we need to resolve the schema for the base type
                // and use that to populate the child block with the field definition data
                const resolvedSchema = this.resolveSchemaReference(baseType + '.json');
                this.createAndConnectBlock(block, key, fieldDef, baseType, false, resolvedSchema);
            });
        } else if (typeof value === 'object' && !Array.isArray(value)) {
            // Handle nested objects - populate the existing child block
            console.log(`🔄 setBlockValue: Handling nested object for block type ${block.type}`);
            console.log(`🔄 Nested object data:`, value);
            console.log(`🔄 Schema for nested object:`, schema);
            
            // For nested objects, we need to ensure the block has required fields first
            if (block.createRequiredFieldBlocks && typeof block.createRequiredFieldBlocks === 'function') {
                console.log(`🔄 Creating required fields for nested object block ${block.type}`);
                block.createRequiredFieldBlocks();
            }
            
            // Then populate with the nested data (including optional fields)
            setTimeout(() => {
                console.log(`🔄 Populating nested object block ${block.type} with data`);
                this.populateExistingBlock(block, value, schema, 0);
            }, 100); // Give time for required fields to be created
        } else if (Array.isArray(value)) {
            // Handle arrays of objects
            value.forEach((item, index) => {
                if (typeof item === 'object' && !Array.isArray(item)) {
                    // This is an array of objects - we need to create child blocks
                    this.createChildBlockForArrayItem(block, item, schema, index);
                }
            });
        }
    }

    populateExistingBlock(block, data, schema, depth = 0) {
        console.log(`🌊🌊 POPULATE EXISTING BLOCK (depth ${depth}): ${block ? block.type : 'unknown'} 🌊🌊`);
        console.log(`🌊 Data:`, data);
        console.log(`🌊 Data type: ${typeof data}, is array: ${Array.isArray(data)}`);
        console.log(`🌊 Schema:`, schema ? schema.$id || schema.title || 'unnamed' : 'null');
        
        // TERMINATING CONDITION: Prevent infinite recursion
        if (depth > 10) {
            console.warn(`🚨🚨🚨 MAXIMUM RECURSION DEPTH REACHED (${depth}) - STOPPING TO PREVENT INFINITE LOOP 🚨🚨🚨`);
            return;
        }
        
        // TERMINATING CONDITION: Check for primitive values
        if (data === null || data === undefined || typeof data !== 'object') {
            console.log(`🎭 TERMINATING: Primitive value "${data}" (type: ${typeof data}) for block ${block ? block.type : 'unknown'}`);
            // For primitive values, we should set the block value directly
            if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
                console.log(`🎭 Setting primitive value in block ${block ? block.type : 'unknown'}`);
                this.setBlockValue(block, data, schema);
            }
            return;
        }
        
        // TERMINATING CONDITION: Check for empty objects - but allow them for blocks with required fields
        if (Object.keys(data).length === 0) {
            // If this block has required fields in its schema, we should still create those fields
            if (schema && schema.required && schema.required.length > 0) {
                console.log(`🎭 Empty object but has required fields - creating required fields only for block ${block ? block.type : 'unknown'}`);
                // Create required field blocks but don't populate with data
                if (block && block.createRequiredFieldBlocks && typeof block.createRequiredFieldBlocks === 'function') {
                    block.createRequiredFieldBlocks();
                }
                return;
            } else {
                console.log(`🎭 TERMINATING: Empty object with no required fields for block ${block ? block.type : 'unknown'}`);
                return;
            }
        }
        
        console.log(`🌊 CONTINUING: Non-empty object with ${Object.keys(data).length} keys for block ${block ? block.type : 'unknown'}`);
        console.log(`🌊 Object keys:`, Object.keys(data));
        console.log(`🌊 Schema has required fields:`, schema && schema.required ? schema.required : 'none');
        console.log(`🌊 Schema has properties:`, schema && schema.properties ? Object.keys(schema.properties) : 'none');
        
        // Only log prominently for tenantproperties blocks
        if (block.type === 'tenantproperties') {
            console.log(`🎭🎭🎭 POPULATING EXISTING BLOCK ${block.type.toUpperCase()} (depth: ${depth}) 🎭🎭🎭`);
            console.log(`🎭 Data to populate:`, data);
            console.log(`🎭 Schema to use:`, schema);
        }
        
        if (!block || !data || !schema || !schema.properties) {
            if (block.type === 'tenantproperties') {
                console.log(`❌❌❌ EARLY RETURN: block=${!!block}, data=${!!data}, schema=${!!schema}, schema.properties=${!!(schema && schema.properties)} ❌❌❌`);
            }
            return;
        }
        
        // Ensure the block has all required fields before populating
        if (block.createRequiredFieldBlocks && typeof block.createRequiredFieldBlocks === 'function') {
            block.createRequiredFieldBlocks();
        }
        
        // Process each field in the data
        for (const [key, value] of Object.entries(data)) {
            console.log(`🌊🌊 PROCESSING FIELD: ${key} = `, value);
            console.log(`🌊🌊 Schema has property ${key}:`, !!(schema.properties && schema.properties[key]));
            
            if (schema.properties && schema.properties[key]) {
                const propertySchema = schema.properties[key];
                console.log(`🌊🌊 Property schema for ${key}:`, propertySchema);
                
                // Check if this is a required field
                const isRequired = schema.required && schema.required.includes(key);
                console.log(`🌊🌊 Field ${key} is required:`, isRequired);
                
                // Find the input for this field by looking for the field name in the fieldRow
                const input = block.inputList.find(input => {
                    return input.fieldRow.some(field => {
                        // Check if this field contains the key name
                        if (field.getText && field.getText() === key) {
                            return true;
                        }
                        // Also check if it's a label field with the key
                        if (field.name && field.name.startsWith('key_field_') && field.getText && field.getText() === key) {
                            return true;
                        }
                        return false;
                    });
                });
                
                if (!input) {
                    if (block.type === 'tenantproperties') {
                        console.error(`❌❌❌ NO INPUT FOUND FOR FIELD ${key.toUpperCase()} - THIS IS THE PROBLEM! ❌❌❌`);
                        console.log(`Available inputs:`, block.inputList.map(input => ({
                            name: input.name,
                            fieldRow: input.fieldRow.map(field => ({
                                name: field.name,
                                text: field.getText ? field.getText() : 'no getText'
                            }))
                        })));
                    }
                } else if (block.type === 'tenantproperties') {
                    console.log(`✅✅✅ FOUND INPUT FOR FIELD ${key.toUpperCase()} ✅✅✅`);
                }
                
                if (input && input.connection && input.connection.targetBlock()) {
                    const targetBlock = input.connection.targetBlock();
                    
                    // Handle $ref properties - resolve the reference
                    if (propertySchema.$ref) {
                        const refSchema = this.resolveSchemaReference(propertySchema.$ref);
                        if (refSchema) {
                            // Recursively populate the child block with increased depth
                            this.populateExistingBlock(targetBlock, value, refSchema, depth + 1);
                        } else {
                            console.warn(`Could not resolve $ref for ${key}: ${propertySchema.$ref}`);
                        }
                    } else {
                        // Set the value based on the field type
                        this.setBlockValue(targetBlock, value, propertySchema);
                    }
                } else if (isRequired) {
                    console.warn(`No target block found for required field ${key} - this should not happen`);
                } else {
                    // This is an optional field that needs to be added
                    console.log(`🔥🔥🔥 ADDING OPTIONAL FIELD ${key.toUpperCase()} USING DROPDOWN CALLBACK PATTERN 🔥🔥🔥`);
                    console.log(`🔥 Field value:`, value);
                    console.log(`🔥 Property schema:`, propertySchema);
                    
                    // Use the same pattern as the dropdown callback in block-extensions.js
                    this.addOptionalFieldUsingDropdownPattern(block, key, value, propertySchema, schema, depth);
                }
            } else {
                console.log(`🌊🌊 FIELD ${key} NOT FOUND IN SCHEMA - SKIPPING`);
                console.log(`🌊🌊 Available schema properties:`, schema.properties ? Object.keys(schema.properties) : 'none');
            }
        }
    }

    addOptionalFieldUsingDropdownPattern(block, fieldName, fieldValue, fieldSchema, parentSchema, depth) {
        console.log(`🔥💫 USING DROPDOWN PATTERN FOR ${fieldName} 💫🔥`);
        
        // Find the optional fields dropdown input (similar to block-extensions.js pattern)
        const optionalFieldsInput = block.inputList.find(input => 
            input.fieldRow && input.fieldRow.some(field => 
                field.name && field.name.includes('ddl_open_bracket')
            )
        );
        
        if (!optionalFieldsInput) {
            console.warn(`🔥 No optional fields dropdown found for block ${block.type}`);
            return;
        }
        
        // Check if this property is already attached to the block (duplicate check from block-extensions.js)
        for (const idx in block.inputList) {
            if (idx == 0) { // Skip the type of the block, go to the next row to see fields.
                continue;
            }
            let input = block.inputList[idx];
            if (input.fieldRow && input.fieldRow[1] && input.fieldRow[1].value_ == fieldName) { 
                console.log(`🔥 Field ${fieldName} already exists, skipping`);
                return; // Field already exists
            }
        }
        
        // Create the new input connection first (using the appendKeyValuePairInput pattern)
        const lastIndex = block.length++;
        const newInput = block.appendValueInput('element_' + lastIndex);
        newInput.appendField(new Blockly.FieldTextbutton('–', function() { 
            if (this.sourceBlock_) {
                this.sourceBlock_.deleteKeyValuePairInput(newInput);
                if (typeof updateJSONarea === 'function') {
                    updateJSONarea(this.sourceBlock_.workspace);
                }
            }
        }))
        .appendField(new Blockly.FieldLabel(fieldName), 'key_field_' + lastIndex)
        .appendField(Blockly.keyValueArrow());
        
        console.log(`🔥 Created input for optional field ${fieldName}`);
        
        // Determine target type (same logic as block-extensions.js)
        let targetType = 'string'; // default fallback
        if (parentSchema.properties && parentSchema.properties[fieldName]) {
            targetType = parentSchema.properties[fieldName].type;
            if (targetType == undefined && parentSchema.properties[fieldName]['$ref']) {
                targetType = parentSchema.properties[fieldName]['$ref'].replace(".json", "");
            }
            if (targetType == 'integer') {
                targetType = 'number';
            }
            if (targetType == 'array' && parentSchema.properties[fieldName].items) {
                let prop = parentSchema.properties[fieldName];
                var items = prop.items.type;
                if (items == undefined && prop.items['$ref']) {
                    items = prop.items['$ref'].replace(".json", "");
                }
                if (items) {
                    targetType = items + '_array';
                }
            }
            // Handle the dict pattern (type: object with $ref)
            if (targetType == 'object' && parentSchema.properties[fieldName]['$ref']) {
                targetType = parentSchema.properties[fieldName]['$ref'].replace(".json", "") + '_dict';
                console.log(`🔥 Detected dict pattern for property ${fieldName}, using block type: ${targetType}`);
            }
        } else {
            console.warn(`🔥 Property ${fieldName} not found in schema for optional field`);
        }
        
        console.log(`🔥 Target type for ${fieldName}: ${targetType}`);
        
        // Create the block and connect it (same pattern as block-extensions.js)
        try {
            // Check if the block type exists
            if (!Blockly.Blocks[targetType]) {
                console.warn(`🔥 Block type ${targetType} not found, using string as fallback`);
                targetType = 'string';
            }
            
            const targetBlock = block.workspace.newBlock(targetType);
            
            // Initialize the block's SVG and render it
            if (targetBlock && targetBlock.workspace) {
                targetBlock.initSvg();
                targetBlock.render();
            }
            
            // Connect the new block to the newly created input
            const parentConnection = newInput.connection;
            const childConnection = targetBlock.outputConnection || targetBlock.previousConnection;
            
            if (parentConnection && childConnection) {
                parentConnection.connect(childConnection);
                console.log(`🔥 Connected ${targetType} block for optional field ${fieldName}`);
                
                // Create required subfields for the newly created block
                if (targetBlock.createRequiredFieldBlocks && typeof targetBlock.createRequiredFieldBlocks === 'function') {
                    targetBlock.createRequiredFieldBlocks();
                }
                
                // Now populate the connected block with the field value
                console.log(`🔥 About to populate ${targetType} block with value:`, fieldValue);
                
                if (targetType.endsWith('_dict')) {
                    // For dict blocks, use the dict population method
                    // CRITICAL FIX: If the fieldSchema has a $ref, we need to resolve it to get the actual schema
                    let schemaToUse = fieldSchema;
                    if (fieldSchema && fieldSchema.$ref) {
                        console.log(`🔥 Dict field schema has $ref: ${fieldSchema.$ref}, resolving...`);
                        const resolvedSchema = this.resolveSchemaReference(fieldSchema.$ref);
                        if (resolvedSchema) {
                            schemaToUse = resolvedSchema;
                            console.log(`🔥 Resolved schema for dict population:`, schemaToUse);
                        } else {
                            console.warn(`🔥 Failed to resolve $ref for dict: ${fieldSchema.$ref}`);
                        }
                    }
                    this.populateDictBlock(targetBlock, fieldValue, schemaToUse);
                } else if (typeof fieldValue === 'object' && fieldValue !== null && !Array.isArray(fieldValue)) {
                    // For complex objects, recurse deeper
                    console.log(`🔥 Recursing into ${targetType} block with depth ${depth + 1}`);
                    
                    // CRITICAL FIX: If the fieldSchema has a $ref, we need to resolve it to get the actual schema
                    let schemaToUse = fieldSchema;
                    if (fieldSchema && fieldSchema.$ref) {
                        console.log(`🔥 Field schema has $ref: ${fieldSchema.$ref}, resolving...`);
                        const resolvedSchema = this.resolveSchemaReference(fieldSchema.$ref);
                        if (resolvedSchema) {
                            schemaToUse = resolvedSchema;
                            console.log(`🔥 Resolved schema for recursion:`, schemaToUse);
                            console.log(`🔥 Resolved schema has properties:`, schemaToUse.properties ? Object.keys(schemaToUse.properties) : 'none');
                        } else {
                            console.warn(`🔥 Failed to resolve $ref: ${fieldSchema.$ref}`);
                        }
                    }
                    
                    this.populateExistingBlock(targetBlock, fieldValue, schemaToUse, depth + 1);
                } else {
                    // For primitive values, set the block value directly
                    console.log(`🔥 Setting primitive value in ${targetType} block`);
                    this.setBlockValue(targetBlock, fieldValue, fieldSchema);
                }
                
            } else {
                console.warn(`🔥 Failed to connect block for optional field ${fieldName}`);
                targetBlock.dispose(true, true);
            }
            
        } catch (e) {
            console.error(`🔥 Failed to create block ${targetType} for optional field ${fieldName}:`, e);
        }
        
        // Update the JSON area
        if (typeof updateJSONarea === 'function') {
            updateJSONarea(block.workspace);
        }
    }

    addOptionalFieldWithValue(block, fieldName, fieldValue, fieldSchema, parentSchema) {
        
        // Check if the block has an optional fields selector
        if (block.appendOptionalFieldsSelector && typeof block.appendOptionalFieldsSelector === 'function') {
            
            // Get the optional fields dropdown
            const optionalFieldsInput = block.inputList.find(input => 
                input.fieldRow && input.fieldRow.some(field => 
                    field.name && field.name.includes('optional_fields_selector')
                )
            );
            
            if (optionalFieldsInput) {
                // Find the dropdown field
                const dropdownField = optionalFieldsInput.fieldRow.find(field => 
                    field.name && field.name.includes('optional_fields_selector')
                );
                
                if (dropdownField && dropdownField.setValue) {
                    dropdownField.setValue(fieldName);
                    
                    // Wait for the field to be created, then populate it
                    setTimeout(() => {
                        const newInput = block.inputList.find(input => {
                            const field = input.fieldRow.find(field => field.name && field.name.startsWith('key_field_'));
                            return field && field.getValue() === fieldName;
                        });
                        
                        if (newInput && newInput.connection) {
                            // Create a block for this field
                            const targetType = this.determineTargetType(fieldValue, fieldSchema);
                            
                            if (block.toggleTargetBlock && typeof block.toggleTargetBlock === 'function') {
                                block.toggleTargetBlock(newInput, targetType);
                                
                                // Get the created block and populate it
                                const createdBlock = newInput.connection ? newInput.connection.targetBlock() : null;
                                if (createdBlock) {
                                    // Handle $ref properties
                                    if (fieldSchema.$ref) {
                                        const refSchema = this.resolveSchemaReference(fieldSchema.$ref);
                                        if (refSchema) {
                                            this.populateExistingBlock(createdBlock, fieldValue, refSchema, 0);
                                        } else {
                                            this.setBlockValue(createdBlock, fieldValue, fieldSchema);
                                        }
                                    } else {
                                        this.setBlockValue(createdBlock, fieldValue, fieldSchema);
                                    }
                                }
                            }
                        }
                    }, 100);
                }
            } else {
                console.warn(`Could not find optional fields input`);
            }
        } else {
            console.warn(`Block ${block.type} does not have appendOptionalFieldsSelector method`);
        }
        
        console.log(`=== addOptionalFieldWithValue END ===\n`);
    }

    createChildBlockForArrayItem(parentBlock, itemData, schema, index) {
        // Determine the block type for this array item using the unified method
        const itemType = this.determineTargetType(itemData, schema ? schema.items : null, true);
        
        // Use the existing block-extensions.js pattern for creating array elements
        // This mimics what the dropdown callback in appendArraySelector would do
        const lastIndex = parentBlock.length || 0;
        parentBlock.length = lastIndex + 1;
        
        // Create the input using the same pattern as appendArraySelector
        const newInput = parentBlock.appendValueInput('element_' + lastIndex);
        newInput.appendField(new Blockly.FieldTextbutton('–', function() { 
            // Delete button callback
            if (this.sourceBlock_) {
                this.sourceBlock_.deleteElementInput(newInput);
                if (typeof updateJSONarea === 'function') {
                    updateJSONarea(this.sourceBlock_.workspace);
                }
            }
        }))
        .appendField(new Blockly.FieldLabel(itemType), 'key_field_' + lastIndex) // Use the block type as label
        .appendField(Blockly.keyValueArrow());
        
        // Use the existing toggleTargetBlock method to create and connect the block
        if (parentBlock.toggleTargetBlock && typeof parentBlock.toggleTargetBlock === 'function') {
            parentBlock.toggleTargetBlock(newInput, itemType);
            
            // Get the created block and populate it
            const createdBlock = newInput.connection ? newInput.connection.targetBlock() : null;
            if (createdBlock) {
                // Get the resolved schema for proper population
                let resolvedSchema = schema.items || {};
                if (schema.items && schema.items.$ref) {
                    const refSchema = this.resolveSchemaReference(schema.items.$ref);
                    if (refSchema) {
                        resolvedSchema = refSchema;
                    }
                }
                
                this.setBlockValue(createdBlock, itemData, resolvedSchema);
            }
        }
    }

    resolveSchemaReference(ref) {
        console.log(`🔍 Resolving schema reference: ${ref}`);
        
        // Convert from file reference (e.g., "tenant.json") to runtime schema name (e.g., "tenant")
        let schemaName = ref.toLowerCase();
        
        // Remove .json extension to get runtime schema name
        schemaName = schemaName.replace('.json', '');
        
        console.log(`🔍 Looking for schema: ${schemaName}`);
        
        // Try to get from schema library
        if (window.getSchemaLibrary && typeof window.getSchemaLibrary === 'function') {
            const schemaLib = window.getSchemaLibrary();
            console.log(`🔍 Available schemas in getSchemaLibrary:`, Object.keys(schemaLib || {}));
            if (schemaLib && schemaLib[schemaName]) {
                console.log(`✅ Found schema ${schemaName} in getSchemaLibrary:`, schemaLib[schemaName]);
                return schemaLib[schemaName];
            }
        }
        
        // Try to get from local schema library
        if (this.schemaLibrary && this.schemaLibrary[schemaName]) {
            console.log(`✅ Found schema ${schemaName} in local schemaLibrary:`, this.schemaLibrary[schemaName]);
            return this.schemaLibrary[schemaName];
        }
        
        console.warn(`❌ Schema ${schemaName} not found in any library`);
        console.log(`🔍 Available schemas in local library:`, Object.keys(this.schemaLibrary || {}));
        return null;
    }

    processFieldWithResolvedSchema(rootBlock, fieldName, fieldValue, resolvedSchema, parentSchema) {
        console.log(`🎯🎯🎯 PROCESSING FIELD ${fieldName.toUpperCase()} WITH RESOLVED SCHEMA 🎯🎯🎯`);
        console.log(`🎯 Field value:`, fieldValue);
        console.log(`🎯 Resolved schema:`, resolvedSchema);
        console.log(`🎯 Parent schema:`, parentSchema);
        console.log(`🎯 Root block type:`, rootBlock.type);
        
        // Check if this is a required field
        const isRequired = parentSchema.required && parentSchema.required.includes(fieldName);
        
        console.log(`🎯 Field ${fieldName} is required: ${isRequired}`);
        console.log(`🎯 Parent schema required fields:`, parentSchema.required);
        
        if (isRequired) {
            // Find the existing required field and set its value
            console.log(`🎯🎯🎯 CALLING setRequiredFieldValueWithSchema FOR ${fieldName.toUpperCase()} 🎯🎯🎯`);
            this.setRequiredFieldValueWithSchema(rootBlock, fieldName, fieldValue, resolvedSchema);
        } else {
            // This is an optional field - add it via dropdown
            console.log(`🎯🎯🎯 CALLING addOptionalFieldWithResolvedSchema FOR ${fieldName.toUpperCase()} 🎯🎯🎯`);
            this.addOptionalFieldWithResolvedSchema(rootBlock, fieldName, fieldValue, resolvedSchema, parentSchema);
        }
    }

    setRequiredFieldValueWithSchema(rootBlock, fieldName, fieldValue, fieldSchema) {
        console.log(`Setting required field ${fieldName} with resolved schema to value:`, fieldValue);
        
        // Find the input for this field
        const input = rootBlock.inputList.find(input => {
            const field = input.fieldRow.find(field => field.name && field.name.startsWith('key_field_'));
            return field && field.getValue() === fieldName;
        });
        
        if (input && input.connection && input.connection.targetBlock()) {
            const targetBlock = input.connection.targetBlock();
            console.log(`Found target block for required field ${fieldName}:`, targetBlock.type);
            console.log(`Target block inputList length:`, targetBlock.inputList ? targetBlock.inputList.length : 'undefined');
            
            // Set the value using the resolved schema
            this.setBlockValueWithSchema(targetBlock, fieldValue, fieldSchema);
        } else {
            console.warn(`No target block found for required field ${fieldName}`);
            console.log(`Input exists:`, !!input);
            console.log(`Input has connection:`, !!(input && input.connection));
            console.log(`Input has target block:`, !!(input && input.connection && input.connection.targetBlock()));
        }
    }

    setBlockValueWithSchema(block, value, schema) {
        if (!block || value === undefined || value === null) {
            return;
        }
        
        console.log(`Setting value ${value} in block type ${block.type} with schema:`, schema);
        
        // Handle arrays with schema information
        if (Array.isArray(value) && schema && schema.type === 'array' && schema.items) {
            console.log(`Handling array with schema:`, schema);
            // Create child blocks for each array item
            value.forEach((item, index) => {
                this.createChildBlockForArrayItem(block, item, schema, index);
            });
        } else if (typeof value === 'object' && !Array.isArray(value) && schema.properties) {
            // If this is a complex object, populate the existing block
            this.populateExistingBlock(block, value, schema, 0);
        } else {
            // Use the original setBlockValue for primitive types
            this.setBlockValue(block, value, schema);
        }
    }

    addOptionalFieldWithResolvedSchema(targetBlock, fieldName, fieldValue, resolvedSchema, parentSchema) {
        // Only log prominently for the properties field (tenantproperties)
        if (fieldName === 'properties') {
            console.log(`🚀🚀🚀 ADDING OPTIONAL FIELD WITH RESOLVED SCHEMA 🚀🚀🚀`);
            console.log(`🎯 Field name: ${fieldName}`);
            console.log(`🎯 Target block type: ${targetBlock.type}`);
            console.log(`🎯 Field value:`, fieldValue);
            console.log(`🎯 Resolved schema:`, resolvedSchema);
        }
        
        // For $ref fields, we need to create the specific block type and populate it
        if (resolvedSchema && resolvedSchema.$id) {
            // Extract the base block type from the resolved schema's $id
            const baseBlockType = resolvedSchema.$id.replace('.json', '');
            
            // CRITICAL: Check if the original field schema has type=object + $ref
            // This determines whether we create a _dict block or a direct reference block
            let blockType;
            if (parentSchema && parentSchema.properties && parentSchema.properties[fieldName]) {
                const originalFieldSchema = parentSchema.properties[fieldName];
                if (originalFieldSchema.type === 'object' && originalFieldSchema.$ref) {
                    // This is type=object + $ref -> create _dict block
                    blockType = baseBlockType + '_dict';
                    console.log(`🔥 Field ${fieldName} has type=object + $ref -> creating ${blockType} block`);
                } else if (originalFieldSchema.$ref && !originalFieldSchema.type) {
                    // This is $ref only -> create direct reference block
                    blockType = baseBlockType;
                    console.log(`🔥 Field ${fieldName} has $ref only -> creating ${blockType} block`);
                } else {
                    // Fallback to direct reference
                    blockType = baseBlockType;
                    console.log(`🔥 Field ${fieldName} fallback -> creating ${blockType} block`);
                }
            } else {
                // Fallback to direct reference
                blockType = baseBlockType;
                console.log(`🔥 Field ${fieldName} no parent schema info -> creating ${blockType} block`);
            }
            
            console.log(`🔥🔥🔥 CREATING ${blockType.toUpperCase()} BLOCK FOR FIELD ${fieldName.toUpperCase()} 🔥🔥🔥`);
            
            // Get the current length for the new input index
            const lastIndex = targetBlock.length || 0;
            targetBlock.length = lastIndex + 1;
            
            // Create the input for this field
            const newInput = targetBlock.appendValueInput('element_' + lastIndex);
            newInput.appendField(new Blockly.FieldTextbutton('–', function() { 
                // Delete button callback
                if (this.sourceBlock_) {
                    this.sourceBlock_.deleteKeyValuePairInput(newInput);
                    if (typeof updateJSONarea === 'function') {
                        updateJSONarea(this.sourceBlock_.workspace);
                    }
                }
            }))
            .appendField(new Blockly.FieldLabel(fieldName), 'key_field_' + lastIndex)
            .appendField(Blockly.keyValueArrow());
            
            // Create the specific block type for this field
            const fieldBlock = targetBlock.workspace.newBlock(blockType);
            if (fieldBlock) {
                fieldBlock.initSvg();
                fieldBlock.render();
                
                // Connect the field block to the input
                const parentConnection = newInput.connection;
                const childConnection = fieldBlock.outputConnection || fieldBlock.previousConnection;
                
                if (parentConnection && childConnection) {
                    parentConnection.connect(childConnection);
                    
                    if (fieldName === 'properties') {
                        console.log(`✅✅✅ CONNECTED ${blockType.toUpperCase()} BLOCK TO INPUT FOR FIELD ${fieldName.toUpperCase()} ✅✅✅`);
                    }
                    
                    // Create required field blocks first
                    if (fieldBlock.createRequiredFieldBlocks && typeof fieldBlock.createRequiredFieldBlocks === 'function') {
                        fieldBlock.createRequiredFieldBlocks();
                    }
                    
                    // Wait for required fields to be created, then populate with data
                    setTimeout(() => {
                        if (fieldName === 'properties') {
                            console.log(`🎨🎨🎨 POPULATING ${blockType.toUpperCase()} BLOCK WITH DATA 🎨🎨🎨`);
                            console.log(`🎨 Data to populate:`, fieldValue);
                        }
                        
                        // Handle _dict blocks differently from direct reference blocks
                        if (blockType.endsWith('_dict')) {
                            console.log(`🎨 This is a _dict block, populating as key-value pairs`);
                            this.populateDictBlock(fieldBlock, fieldValue, resolvedSchema);
                        } else {
                            console.log(`🎨 This is a direct reference block, populating as structured object`);
                            console.log(`🎨 fieldBlock type:`, fieldBlock.type);
                            console.log(`🎨 fieldValue:`, fieldValue);
                            console.log(`🎨 resolvedSchema:`, resolvedSchema);
                            this.populateExistingBlock(fieldBlock, fieldValue, resolvedSchema, 0);
                        }
                    }, 50);
                    
                    // Update the JSON area to reflect the changes
                    if (typeof updateJSONarea === 'function') {
                        updateJSONarea(targetBlock.workspace);
                    }
                    
                    if (fieldName === 'properties') {
                        console.log(`🎉🎉🎉 SUCCESSFULLY ADDED OPTIONAL FIELD ${fieldName.toUpperCase()} WITH ${blockType.toUpperCase()} BLOCK 🎉🎉🎉`);
                    }
                } else {
                    if (fieldName === 'properties') {
                        console.error(`❌❌❌ FAILED TO CONNECT ${blockType.toUpperCase()} BLOCK FOR ${fieldName.toUpperCase()} ❌❌❌`);
                    }
                    fieldBlock.dispose(true, true);
                }
            } else {
                if (fieldName === 'properties') {
                    console.error(`❌❌❌ FAILED TO CREATE ${blockType.toUpperCase()} BLOCK FOR ${fieldName.toUpperCase()} ❌❌❌`);
                }
            }
        } else {
            // Fallback to the original method for non-$ref fields
            this.addOptionalFieldWithValue(targetBlock, fieldName, fieldValue, resolvedSchema, parentSchema);
        }
    }

    populateDictBlock(dictBlock, data, schema) {
        console.log(`🔧🔧🔧 POPULATING DICT BLOCK ${dictBlock.type.toUpperCase()} USING REAL BLOCK METHODS 🔧🔧🔧`);
        console.log(`🔧 Data to populate:`, data);
        console.log(`🔧 Schema:`, schema);
        console.log(`🔧 Dict block has appendKeyValuePairInput:`, typeof dictBlock.appendKeyValuePairInput);
        
        if (!dictBlock || !data || typeof data !== 'object' || Array.isArray(data)) {
            console.warn(`🔧 Invalid data for dict block population`);
            return;
        }
        
        // Use the REAL _dict block methods from block-definitions.js
        // These blocks have appendKeyValuePairInput method that creates proper inputs with textboxes
        
        Object.entries(data).forEach(([key, value]) => {
            console.log(`🔧 Processing key-value pair: ${key} = `, value);
            
            // Use the real appendKeyValuePairInput method from block-definitions.js
            if (dictBlock.appendKeyValuePairInput && typeof dictBlock.appendKeyValuePairInput === 'function') {
                const newInput = dictBlock.appendKeyValuePairInput();
                console.log(`🔧 Created input using real appendKeyValuePairInput method`);
                console.log(`🔧 New input name: ${newInput.name}`);
                
                // Set the key name in the textbox (FieldTextInput, not FieldLabel)
                const keyField = dictBlock.getField('key_field_' + (dictBlock.length - 1));
                if (keyField && keyField.setValue) {
                    keyField.setValue(key);
                    console.log(`🔧 Set key field to: ${key}`);
                } else {
                    console.warn(`🔧 Could not find or set key field for ${key}`);
                }
                
                // The appendKeyValuePairInput method might create the connected block asynchronously
                // Let's try both immediately and with a small delay
                const tryPopulateConnectedBlock = () => {
                    const connectedBlock = dictBlock.getInputTargetBlock(newInput.name);
                    console.log(`🔧 Checking for connected block on input: ${newInput.name}`);
                    console.log(`🔧 Connected block found:`, !!connectedBlock);
                    
                    if (connectedBlock) {
                        console.log(`🔧 Found connected block of type: ${connectedBlock.type}`);
                        console.log(`🔧🔧 DEEP RECURSION: About to populate ${connectedBlock.type} with data:`, value);
                        console.log(`🔧🔧 DEEP RECURSION: Data type: ${typeof value}, is array: ${Array.isArray(value)}`);
                        console.log(`🔧🔧 DEEP RECURSION: Data keys:`, typeof value === 'object' && value !== null ? Object.keys(value) : 'N/A');
                        
                        // Now populate this connected block with the value data
                        console.log(`🔧🔧 CALLING populateExistingBlock NOW...`);
                        try {
                            this.populateExistingBlock(connectedBlock, value, schema, 0);
                            console.log(`🔧🔧 populateExistingBlock call completed`);
                        } catch (error) {
                            console.error(`🔧🔧 ERROR in populateExistingBlock:`, error);
                        }
                        return true; // Successfully found and populated
                    } else {
                        console.warn(`🔧 No connected block found for input ${newInput.name}`);
                        console.log(`🔧 Dict block inputs:`, dictBlock.inputList ? dictBlock.inputList.map(i => i.name) : 'no inputList');
                        console.log(`🔧 Dict block length:`, dictBlock.length);
                        return false; // No connected block found
                    }
                };
                
                // Try immediately first
                if (!tryPopulateConnectedBlock()) {
                    // If no connected block found immediately, try after a small delay
                    console.log(`🔧 No connected block found immediately, trying after delay...`);
                    setTimeout(() => {
                        console.log(`🔧 Retrying after delay...`);
                        tryPopulateConnectedBlock();
                    }, 10);
                }
            } else {
                console.error(`🔧 Dict block missing appendKeyValuePairInput method - not a real _dict block!`);
                console.error(`🔧 Dict block type: ${dictBlock.type}`);
                console.error(`🔧 Available methods:`, Object.getOwnPropertyNames(dictBlock));
            }
        });
        
        console.log(`🔧 Finished populating real dict block with ${Object.keys(data).length} entries`);
    }

    addOptionalFieldWithValue(targetBlock, fieldName, fieldValue, fieldSchema, parentSchema) {
        console.log(`🚀🚀🚀 addOptionalFieldWithValue START 🚀🚀🚀`);
        console.log(`🚀 Target block type: ${targetBlock.type}`);
        console.log(`🚀 Field name: ${fieldName}`);
        console.log(`🚀 Field value:`, fieldValue);
        console.log(`🚀 Field schema:`, fieldSchema);
        console.log(`🚀 Parent schema:`, parentSchema);
        
        // Use the existing dropdown mechanism from json-workspace-converter.js
        if (typeof Blockly.JSON.addOptionalFieldToBlock === 'function') {
            console.log(`🚀 Using existing addOptionalFieldToBlock mechanism`);
            Blockly.JSON.addOptionalFieldToBlock(targetBlock, fieldName, fieldValue, fieldSchema, parentSchema);
        } else {
            console.warn(`🚀 Blockly.JSON.addOptionalFieldToBlock not available, falling back to manual method`);
            
            // Fallback: manually add the field (existing code)
            // Get the current length for the new input index
            const lastIndex = targetBlock.length || 0;
            targetBlock.length = lastIndex + 1;
            console.log(`Using index ${lastIndex} for new input`);
            
            // Create the input for this field
            const newInput = targetBlock.appendValueInput('element_' + lastIndex);
            newInput.appendField(new Blockly.FieldTextbutton('–', function() { 
                // Delete button callback
                if (this.sourceBlock_) {
                    this.sourceBlock_.deleteKeyValuePairInput(newInput);
                    if (typeof updateJSONarea === 'function') {
                        updateJSONarea(this.sourceBlock_.workspace);
                    }
                }
            }))
            .appendField(new Blockly.FieldLabel(fieldName), 'key_field_' + lastIndex)
            .appendField(Blockly.keyValueArrow());
            
            console.log(`Created input for optional field ${fieldName}`);
            
            // Determine the block type for this field using the unified method
            const fieldType = this.determineTargetType(fieldValue, fieldSchema, false);
            
            console.log(`Creating block type ${fieldType} for field ${fieldName}`);
            
            // Create the target block for this field
            const fieldBlock = targetBlock.workspace.newBlock(fieldType);
            if (fieldBlock) {
                fieldBlock.initSvg();
                fieldBlock.render();
                
                // Connect the field block to the input
                const parentConnection = newInput.connection;
                const childConnection = fieldBlock.outputConnection || fieldBlock.previousConnection;
                
                if (parentConnection && childConnection) {
                    parentConnection.connect(childConnection);
                    console.log(`Connected ${fieldType} block to input for field ${fieldName}`);
                    
                    // Create required subfields first if needed
                    if (fieldBlock.createRequiredFieldBlocks && typeof fieldBlock.createRequiredFieldBlocks === 'function') {
                        console.log(`Creating required field blocks for ${fieldName}`);
                        fieldBlock.createRequiredFieldBlocks();
                    }
                    
                    // Then set the value (which may include nested optional fields)
                    setTimeout(() => {
                        console.log(`Setting value after required fields created for ${fieldName}`);
                        this.setBlockValue(fieldBlock, fieldValue, fieldSchema);
                    }, 50);
                    
                    // Update the JSON area to reflect the changes
                    if (typeof updateJSONarea === 'function') {
                        updateJSONarea(targetBlock.workspace);
                    }
                    
                    console.log(`Successfully added optional field ${fieldName} with value:`, fieldValue);
                } else {
                    console.warn(`Failed to connect field block for ${fieldName}`);
                    fieldBlock.dispose(true, true);
                }
            } else {
                console.warn(`Failed to create field block of type ${fieldType} for field ${fieldName}`);
            }
        }
        
        console.log(`🚀🚀🚀 addOptionalFieldWithValue END 🚀🚀🚀`);
    }
    
    applyFeatureToggles(workspace) {
        console.log('=== APPLYING FEATURE TOGGLES ===');
        console.log('Tenant properties for feature toggles:', this.tenantProperties);
        
        // Hide JSON preview if configured
        if (this.tenantProperties.hide_json_preview === 'true') {
            console.log('Hiding JSON preview area and related controls');
            const jsonArea = document.getElementById('json_area');
            if (jsonArea) {
                jsonArea.style.display = 'none';
                console.log('Hidden json_area element');
                // Also hide the label if it exists
                const jsonLabel = jsonArea.previousElementSibling;
                if (jsonLabel && jsonLabel.tagName === 'LABEL') {
                    jsonLabel.style.display = 'none';
                    console.log('Hidden json_area label');
                }
            } else {
                console.warn('json_area element not found');
            }
            
            // Hide Rebuild from JSON button and Root Schema Type controls
            const rebuildButton = document.getElementById('reverse');
            if (rebuildButton) {
                rebuildButton.style.display = 'none';
                console.log('Hidden Rebuild from JSON button');
            }
            
            const rootSchemaTypeInput = document.getElementById('root_schema_type');
            if (rootSchemaTypeInput) {
                rootSchemaTypeInput.style.display = 'none';
                console.log('Hidden root_schema_type input');
                // Hide the label and description
                const rootSchemaContainer = rootSchemaTypeInput.closest('div');
                if (rootSchemaContainer) {
                    rootSchemaContainer.style.display = 'none';
                    console.log('Hidden root schema type container');
                }
            }
        } else {
            console.log('JSON preview not hidden (hide_json_preview != "true")');
        }
        
        // Hide routes if configured
        if (this.tenantProperties.hide_routes === 'true') {
            console.log('Hiding route elements');
            const routeElements = document.querySelectorAll('#path_id, #full_route, label[for="path_id"]');
            routeElements.forEach(el => {
                if (el) {
                    el.style.display = 'none';
                    console.log(`Hidden route element: ${el.id || el.tagName}`);
                }
            });
        } else {
            console.log('Route elements not hidden (hide_routes != "true")');
        }
        
        // Customize post button text and color
        if (this.tenantProperties.post_text) {
            console.log(`Setting POST button text to: "${this.tenantProperties.post_text}"`);
            const postButton = document.getElementById('post');
            if (postButton) {
                postButton.textContent = this.tenantProperties.post_text;
                console.log('POST button text updated');
            } else {
                console.warn('POST button element not found');
            }
        } else {
            console.log('No post_text property found');
        }
        
        if (this.tenantProperties.post_button_color) {
            console.log(`Setting POST button color to: "${this.tenantProperties.post_button_color}"`);
            const postButton = document.getElementById('post');
            if (postButton) {
                postButton.style.backgroundColor = this.tenantProperties.post_button_color;
                console.log('POST button color updated');
            } else {
                console.warn('POST button element not found');
            }
        } else {
            console.log('No post_button_color property found');
        }
        
        // Disable dynamic types if configured
        if (this.tenantProperties.permit_dynamic_types === 'false') {
            console.log('Disabling dynamic types due to tenant configuration');
            
            // Hide the Dynamic Types category in the toolbox
            const dynamicTypesCategory = document.querySelector('#toolbox category[name="Dynamic Types"]');
            if (dynamicTypesCategory) {
                dynamicTypesCategory.style.display = 'none';
                console.log('Hidden Dynamic Types category due to tenant configuration');
            } else {
                // Alternative approach: find by text content
                const categories = document.querySelectorAll('#toolbox category');
                for (const category of categories) {
                    if (category.getAttribute('name') === 'Dynamic Types') {
                        category.style.display = 'none';
                        console.log('Hidden Dynamic Types category due to tenant configuration (alternative method)');
                        break;
                    }
                }
            }
            
            // Hide the Custom Lists category in the toolbox
            const customListsCategory = document.querySelector('#toolbox #custom-arrays');
            if (customListsCategory) {
                customListsCategory.style.display = 'none';
                console.log('Hidden Custom Lists category due to tenant configuration');
            } else {
                // Alternative approach: find by ID
                const categories = document.querySelectorAll('#toolbox category');
                for (const category of categories) {
                    if (category.id === 'custom-arrays') {
                        category.style.display = 'none';
                        console.log('Hidden Custom Lists category due to tenant configuration (alternative method)');
                        break;
                    }
                }
            }
            
            // Hide the Custom Dictionaries category in the toolbox
            const customDictsCategory = document.querySelector('#toolbox #custom-dicts');
            if (customDictsCategory) {
                customDictsCategory.style.display = 'none';
                console.log('Hidden Custom Dictionaries category due to tenant configuration');
            } else {
                // Alternative approach: find by ID
                const categories = document.querySelectorAll('#toolbox category');
                for (const category of categories) {
                    if (category.id === 'custom-dicts') {
                        category.style.display = 'none';
                        console.log('Hidden Custom Dictionaries category due to tenant configuration (alternative method)');
                        break;
                    }
                }
            }
            
            // Hide the Custom Objects category in the toolbox
            const customObjectsCategory = document.querySelector('#toolbox #custom-objects');
            if (customObjectsCategory) {
                customObjectsCategory.style.display = 'none';
                console.log('Hidden Custom Objects category due to tenant configuration');
            } else {
                // Alternative approach: find by ID
                const categories = document.querySelectorAll('#toolbox category');
                for (const category of categories) {
                    if (category.id === 'custom-objects') {
                        category.style.display = 'none';
                        console.log('Hidden Custom Objects category due to tenant configuration (alternative method)');
                        break;
                    }
                }
            }
            
            // Hide format-specific string blocks when dynamic types are disabled
            const primitivesCategory = document.querySelector('#toolbox category[name="Primitives"]');
            if (primitivesCategory) {
                const passwordBlock = primitivesCategory.querySelector('block[type="string_password"]');
                const emailBlock = primitivesCategory.querySelector('block[type="string_email"]');
                if (passwordBlock) {
                    passwordBlock.style.display = 'none';
                    console.log('Hidden string_password block due to tenant configuration');
                }
                if (emailBlock) {
                    emailBlock.style.display = 'none';
                    console.log('Hidden string_email block due to tenant configuration');
                }
            } else {
                // Alternative approach: find by name attribute
                const categories = document.querySelectorAll('#toolbox category');
                for (const category of categories) {
                    if (category.getAttribute('name') === 'Primitives') {
                        const passwordBlock = category.querySelector('block[type="string_password"]');
                        const emailBlock = category.querySelector('block[type="string_email"]');
                        if (passwordBlock) {
                            passwordBlock.style.display = 'none';
                            console.log('Hidden string_password block due to tenant configuration (alternative method)');
                        }
                        if (emailBlock) {
                            emailBlock.style.display = 'none';
                            console.log('Hidden string_email block due to tenant configuration (alternative method)');
                        }
                        break;
                    }
                }
            }
            
            // Remove dynarray and dictionary from selector blocks
            if (window.selectorBlocks) {
                const dynarrayIndex = window.selectorBlocks.indexOf('dynarray');
                const dictIndex = window.selectorBlocks.indexOf('dictionary');
                const passwordIndex = window.selectorBlocks.indexOf('string_password');
                const emailIndex = window.selectorBlocks.indexOf('string_email');
                if (dynarrayIndex > -1) {
                    window.selectorBlocks.splice(dynarrayIndex, 1);
                    console.log('Disabled dynarray due to tenant configuration');
                }
                if (dictIndex > -1) {
                    window.selectorBlocks.splice(dictIndex, 1);
                    console.log('Disabled dictionary due to tenant configuration');
                }
                if (passwordIndex > -1) {
                    window.selectorBlocks.splice(passwordIndex, 1);
                    console.log('Disabled string_password due to tenant configuration');
                }
                if (emailIndex > -1) {
                    window.selectorBlocks.splice(emailIndex, 1);
                    console.log('Disabled string_email due to tenant configuration');
                }
            }
            
            // Update the start block's selector field to exclude disabled types
            try {
                const startBlock = workspace.getTopBlocks(false).find(b => b.type === 'start');
                if (startBlock) {
                    const jsonInput = startBlock.getInput('json');
                    if (jsonInput) {
                        const selectorField = jsonInput.fieldRow.find(field => 
                            field instanceof Blockly.FieldDropdown || 
                            (field.constructor && field.constructor.name === 'FieldDropdown')
                        );
                        if (selectorField) {
                            // Get the current filtered selectorBlocks (which now excludes disabled types)
                            const filteredBlocks = window.selectorBlocks || [];
                            console.log('Filtered selectorBlocks:', filteredBlocks);
                            
                            // Create new dropdown options from the filtered blocks
                            const newOptions = [];
                            if (filteredBlocks.length === 1) {
                                newOptions.push([`→: `, filteredBlocks[0], `→`]);
                            } else {
                                for (let i = 0; i < filteredBlocks.length; i++) {
                                    newOptions.push([filteredBlocks[i], filteredBlocks[i], `→`]);
                                }
                            }
                            
                            // Update the dropdown options
                            selectorField.menuGenerator_ = () => newOptions;
                            console.log('Updated start block selector to exclude disabled types:', newOptions);
                        }
                    }
                }
            } catch (e) {
                console.warn('Failed to update start block selector:', e);
            }
        }
    }

    async initialize() {
        console.log(`Initializing dynamic blocks for tenant: ${this.tenantId}`);

        try {
            // Wait for all dependencies to be available
            await this.waitForDependencies();
            console.log('Dependencies are ready, proceeding with initialization');

            // Load tenant properties first
            await this.loadTenantProperties();
            
            const ok = await this.loadSchemas();
            if (!ok) {
                console.warn('Falling back to default blocks.');
                this.initializeBlockly();
                return;
            }

            // Load all schema details
            const schemaDetails = await Promise.all(
                this.schemas.map(async (schemaFile) => {
                    try {
                        console.log(`Fetching individual schema: /schema/${schemaFile} for tenant: ${this.tenantId}`);
                        
                        // Build the URL with tenant parameter if not default
                        let schemaUrl = `/schema/${schemaFile}`;
                        if (this.tenantId && this.tenantId !== 'default') {
                            schemaUrl += `?tenant=${encodeURIComponent(this.tenantId)}`;
                        }
                        
                        console.log(`Schema URL: ${schemaUrl}`);
                        const res = await fetch(schemaUrl);
                        console.log(`Schema ${schemaFile} response status:`, res.status);
                        
                        if (res.ok) {
                            const schema = await res.json();
                            console.log(`=== SCHEMA LOADED FROM SERVER: ${schemaFile} ===`);
                            console.log(`Raw schema object:`, schema);
                            console.log(`Raw schema response:`, JSON.stringify(schema, null, 2));
                            
                            return { filename: schemaFile, schema };
                        } else {
                            console.error(`Failed to load schema ${schemaFile}:`, res.status);
                            const errorText = await res.text();
                            console.error(`Error response for ${schemaFile}:`, errorText);
                        }
                    } catch (err) {
                        console.error(`Failed loading ${schemaFile}:`, err);
                        console.error(`Error stack for ${schemaFile}:`, err.stack);
                    }
                    return null;
                })
            );

            // IMMEDIATELY check the state of all schemas after Promise.all
            console.log(`=== SCHEMAS AFTER Promise.all ===`);
            schemaDetails.forEach((detail, index) => {
                if (detail && detail.schema) {
                    console.log(`Schema ${index + 1} (${detail.filename}):`, {
                        title: detail.schema.title,
                        properties: detail.schema.properties,
                        propertiesCount: Object.keys(detail.schema.properties || {}).length
                    });
                    
                    // Check each property for type
                    if (detail.schema.properties) {
                        for (const [key, prop] of Object.entries(detail.schema.properties)) {
                            if (!prop.type) {
                                console.error(`CRITICAL: Property ${key} missing type in ${detail.filename} after Promise.all!`);
                            }
                        }
                    }
                }
            });

                        // Register dynamic blocks and mappers
            console.log(`=== BEFORE PROCESSING LOOP ===`);
            console.log(`Total schemas to process:`, schemaDetails.filter(Boolean).length);
            schemaDetails.filter(Boolean).forEach((detail, index) => {
                console.log(`Schema ${index + 1} before loop:`, {
                    filename: detail.filename,
                    title: detail.schema.title,
                    properties: detail.schema.properties,
                    propertiesCount: Object.keys(detail.schema.properties || {}).length
                });
            });
            
            let schemaIndex = 0;
            schemaDetails.filter(Boolean).forEach(({ filename, schema }) => {
                schemaIndex++;
                
                console.log(`=== Processing Schema ${schemaIndex}/${schemaDetails.filter(Boolean).length} ===`);
                console.log(`Schema file: ${filename}`);
                console.log(`Schema title: ${schema.title}, $id: ${schema.$id}`);
                
                const name = this.getBlockName(schema);
                schema.color ||= this.getColorFromSchema(schema);

                console.log(`Processing schema: ${name} from file: ${filename}`);
                console.log(`Extracted block name: ${name}`);

                // Step 1: Register dynamic block (this handles both block creation and clean schema storage)
                console.log(`Checking addBlockFromSchema function:`, typeof window.addBlockFromSchema);
                if (typeof window.addBlockFromSchema === 'function') {
                    console.log(`Calling addBlockFromSchema for ${name}`);
                    
                    try {
                        window.addBlockFromSchema(name, schema);
                        console.log(`Successfully registered block for ${name}`);
                        
                        // Store schema in local library for later use
                        this.schemaLibrary[name] = schema;
                        console.log(`Stored schema for ${name} in local library`);
                    } catch (error) {
                        console.error(`Error registering block for ${name}:`, error);
                    }
                } else {
                    console.warn(`addBlockFromSchema function not available for ${name} - dynamic block creation disabled`);
                }

                // Step 2: Add clean schema to AJV validator (get it from schema library)
                setTimeout(() => {
                    if (typeof window.addSchemaToValidator === 'function') {
                        // Get the clean schema from the schema library
                        let cleanSchema = null;
                        if (typeof window.getSchemaLibrary === 'function') {
                            const schemaLib = window.getSchemaLibrary();
                            if (schemaLib[name]) {
                                cleanSchema = schemaLib[name];
                                console.log(`Using clean schema from library for validation of ${name}:`, cleanSchema);
                            }
                        }
                        
                        // Fallback: create clean schema if not found in library
                        if (!cleanSchema) {
                            console.warn(`Clean schema not found in library for ${name}, creating fallback`);
                            cleanSchema = { ...schema };
                            const blocklyProperties = ['color', 'apiCreationStrategy', 'endpoint', 'childRefToParent', 'format', 'uri'];
                            blocklyProperties.forEach(prop => {
                                if (prop in cleanSchema) {
                                    delete cleanSchema[prop];
                                }
                            });
                        }
                        
                        console.log(`Calling addSchemaToValidator for ${name} with clean schema:`, cleanSchema);
                        try {
                            window.addSchemaToValidator(name, cleanSchema);
                            console.log(`Successfully added clean schema ${name} to AJV validator`);
                        } catch (error) {
                            console.error(`Error adding clean schema ${name} to validator:`, error);
                        }
                    } else {
                        console.warn(`addSchemaToValidator function not available for ${name} - validation functionality disabled`);
                    }
                }, 50); // Small delay to ensure schema library is populated
            });
            
            // After all schemas are processed, wait a bit then initialize Blockly
            setTimeout(() => {
                // Summary of available functionality
                console.log('=== Schema Loading Complete ===');
                
                // List what's available in AJV
                if (typeof window.listSchemasInAJV === 'function') {
                    console.log('Final schema loading summary:');
                    window.listSchemasInAJV();
                }
                console.log('================================');
                
                // Register mappers AFTER all schemas are loaded
                this.registerDynamicMappers(schemaDetails);
                
                // Update toolbox AFTER mappers are registered
                this.updateToolbox(schemaDetails);
                
                // Initialize Blockly LAST
                this.initializeBlockly();
                
                // Populate root schema textbox if rootSchema parameter is present
                this.populateRootSchemaTextbox();
                
                // After everything is initialized, trigger a validation retry if needed
                if (typeof window.retryValidation === 'function') {
                    const workspace = Blockly.getMainWorkspace && Blockly.getMainWorkspace();
                    if (workspace) {
                        console.log('Triggering validation retry after schema loading');
                        setTimeout(() => window.retryValidation(workspace), 200);
                    }
                }
                
                                 // Apply tenant customizations AFTER Blockly is fully initialized
                 setTimeout(() => {
                     console.log('=== TIMEOUT: APPLYING TENANT CUSTOMIZATIONS ===');
                     const workspace = Blockly.getMainWorkspace && Blockly.getMainWorkspace();
                     console.log('Got workspace from timeout:', workspace);
                     
                     if (workspace) {
                         const startBlock = workspace.getTopBlocks(false).find(b => b.type === 'start');
                         console.log('Found start block from timeout:', startBlock);
                         
                         if (startBlock) {
                             console.log('Calling applyTenantCustomizations from timeout...');
                             this.applyTenantCustomizations(workspace, startBlock);
                         } else {
                             console.warn('No start block found in timeout');
                         }
                     } else {
                         console.warn('No workspace found in timeout');
                     }
                 }, 300);
            }, 100); // Wait for all schemas to be processed

        } catch (error) {
            console.error('Failed to initialize S3BlockLoader:', error);
            console.error('Error stack:', error.stack);
            
            // Fallback to basic initialization
            console.warn('Falling back to basic Blockly initialization');
            this.initializeBlockly();
        }
    }
    
    populateRootSchemaTextbox() {
        // Populate the root schema type textbox if rootSchema parameter is present
        if (this.rootSchema) {
            const textbox = document.getElementById('root_schema_type');
            if (textbox) {
                textbox.value = this.rootSchema;
                console.log(`Populated root schema textbox with: ${this.rootSchema}`);
            } else {
                console.warn('Root schema textbox not found');
            }
        }
    }
}

//---------------------------------- Initialization --------------------------------------//

// Wait for both DOM and bundle.js to be fully loaded
function waitForBundle() {
    return new Promise((resolve) => {
        const checkBundle = () => {
            // Check if bundle.js has loaded and exposed the required functions
            if (typeof window.addSchemaToValidator === 'function' &&
                typeof window.passSchemaToMain === 'function' &&
                typeof window.addBlockFromSchema === 'function') {
                console.log('bundle.js is fully loaded and ready');
                resolve();
            } else {
                console.log('Waiting for bundle.js to load...');
                setTimeout(checkBundle, 50);
            }
        };
        checkBundle();
    });
}

window.addEventListener('load', async () => {
    try {
        // Wait for bundle.js to be fully loaded
        await waitForBundle();
        
        // Small additional delay to ensure everything is settled
        setTimeout(() => {
            const loader = new S3BlockLoader();
            window.currentS3BlockLoader = loader; // Store for debugging
            loader.initialize();
        }, 50);
    } catch (error) {
        console.error('Failed to wait for bundle.js:', error);
        // Fallback: try to initialize anyway
        setTimeout(() => {
            const loader = new S3BlockLoader();
            window.currentS3BlockLoader = loader; // Store for debugging
            loader.initialize();
        }, 100);
    }
});