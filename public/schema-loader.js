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
    return block.getFieldValue('string_value');
};

jsonGenerator.forBlock['string_email'] = function(block) {
    return block.getFieldValue('string_value');
};

jsonGenerator.forBlock['string_enum'] = function(block) {
    return block.getFieldValue('enum_value');
};

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
                console.log(`Generating JSON for ${name}_dict block with length: ${block.length}`);
                
                for (let i = 0; i < block.length; i++) {
                    const key = block.getFieldValue(`key_field_${i}`);
                    const val = this.generalBlockToObj(block.getInputTargetBlock(`element_${i}`));
                    console.log(`  Processing element_${i}: key="${key}", value=`, val);
                    
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
            rootSchemaType = this.rootSchema;
            console.log(`Using rootSchema from query parameter: ${rootSchemaType}`);
        }
        // Priority 2: topic property from tenant properties
        else if (this.tenantProperties && this.tenantProperties.topic && this.tenantProperties.topic.trim()) {
            rootSchemaType = this.tenantProperties.topic;
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
            
            // Try to get from global schema library
            if (window.getSchemaLibrary && typeof window.getSchemaLibrary === 'function') {
                const schemaLib = window.getSchemaLibrary();
                schema = schemaLib && schemaLib[rootSchemaType];
                console.log('Schema from getSchemaLibrary:', schema);
            }
            
            // If not found, try to get from the local schema library
            if (!schema && this.schemaLibrary && this.schemaLibrary[rootSchemaType]) {
                schema = this.schemaLibrary[rootSchemaType];
                console.log('Schema from local schemaLibrary:', schema);
            }
            
            if (schema) {
                console.log('Found schema for root type:', schema);
                
                // Directly populate the root block with the initial data
                this.populateRootBlockWithData(rootBlock, initialData, schema);
                
                console.log('Successfully populated root block with initial data');
            } else {
                console.warn(`No schema found for root type: ${rootSchemaType}`);
                console.log('Available schemas:', Object.keys(window.getSchemaLibrary ? window.getSchemaLibrary() : {}));
            }
        } catch (error) {
            console.error('Failed to handle initial JSON:', error);
        }
    }

    populateRootBlockWithData(rootBlock, data, schema) {
        if (!rootBlock || !data || !schema || !schema.properties) {
            return;
        }
        
        console.log('Populating root block with data:', data);
        console.log('Schema properties:', schema.properties);
        console.log('Schema required:', schema.required);
        
        // Process each field in the data
        for (const [key, value] of Object.entries(data)) {
            if (schema.properties[key]) {
                const propertySchema = schema.properties[key];
                console.log(`Processing field ${key} with value:`, value);
                
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

    setRequiredFieldValue(rootBlock, fieldName, fieldValue, fieldSchema) {
        console.log(`Setting required field ${fieldName} to value:`, fieldValue);
        
        // Find the input for this field
        const input = rootBlock.inputList.find(input => {
            const field = input.fieldRow.find(field => field.name && field.name.startsWith('key_field_'));
            return field && field.getValue() === fieldName;
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
            return;
        }
        
        console.log(`Setting value ${value} in block type ${block.type}`);
        
        // Handle different block types
        if (block.type === 'string' && block.setFieldValue) {
            block.setFieldValue(String(value), 'string_value');
        } else if (block.type === 'number' && block.setFieldValue) {
            block.setFieldValue(String(value), 'number_value');
        } else if (block.type === 'boolean' && block.setFieldValue) {
            block.setFieldValue(String(Boolean(value)), 'boolean');
        } else if (block.type === 'string_enum' && block.setFieldValue) {
            block.setFieldValue(String(value), 'enum_value');
        }
    }

    addOptionalFieldWithValue(targetBlock, fieldName, fieldValue, fieldSchema, parentSchema) {
        console.log(`Adding optional field ${fieldName} with value to block ${targetBlock.type}`);
        
        // Manually add the field to the block by creating the input and block structure
        // This mimics what the dropdown callback would do
        
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
        
        console.log(`Created input for optional field ${fieldName}`);
        
        // Determine the block type for this field
        let fieldType = 'string'; // default fallback
        if (fieldSchema && fieldSchema.type) {
            fieldType = fieldSchema.type;
            if (fieldType === 'integer') {
                fieldType = 'number';
            }
            if (fieldType === 'string' && fieldSchema.enum) {
                fieldType = 'string_enum';
            }
        }
        
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
                
                // Set the value in the field block
                this.setBlockValue(fieldBlock, fieldValue, fieldSchema);
                
                // Create required subfields if needed
                if (fieldBlock.createRequiredFieldBlocks && typeof fieldBlock.createRequiredFieldBlocks === 'function') {
                    setTimeout(() => {
                        fieldBlock.createRequiredFieldBlocks();
                    }, 10);
                }
                
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
    
    applyFeatureToggles(workspace) {
        console.log('=== APPLYING FEATURE TOGGLES ===');
        console.log('Tenant properties for feature toggles:', this.tenantProperties);
        
        // Hide JSON preview if configured
        if (this.tenantProperties.hide_json_preview === 'true') {
            console.log('Hiding JSON preview area');
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