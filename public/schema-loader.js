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

// Initialize stringify generators
jsonGenerator.forBlockWithStringify = {};

// Start block generator with stringify
jsonGenerator.forBlockWithStringify['start'] = function(block) {
    return this.generalBlockToObjWithStringify(block.getInputTargetBlock('json')) || {};
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

jsonGenerator.forBlock['variable'] = function(block) {
    // Get the variable name from the dropdown
    const variableName = block.getFieldValue('variable_name');
    if (!variableName) return null;
    
    // Get the actual variable value from the global variables
    const variables = window.getVariables ? window.getVariables() : {};
    let value = variables[variableName];
    
    // Numeric variable casting: try int, then double, then string
    if (value !== undefined && value !== null) {
        // First try casting to integer
        const intValue = parseInt(value, 10);
        if (!isNaN(intValue) && String(intValue) === String(value).trim()) {
            return intValue;
        }
        
        // Then try casting to double/float
        const floatValue = parseFloat(value);
        if (!isNaN(floatValue) && String(floatValue) === String(value).trim()) {
            return floatValue;
        }
        
        // Finally, return as string
        return String(value);
    }
    
    return value !== undefined ? value : null;
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

// Generate raw object without stringify (for validation)
jsonGenerator.getRawObject = function(workspace) {
    const startBlocks = workspace.getTopBlocks(false).filter(b => b.type === 'start');
    if (startBlocks.length > 0) {
        return this.generalBlockToObj(startBlocks[0]);
    }
    return null;
};

// Generate object with stringify applied (for JSON display)
jsonGenerator.getStringifiedObject = function(workspace) {
    const startBlocks = workspace.getTopBlocks(false).filter(b => b.type === 'start');
    if (startBlocks.length > 0) {
        return this.generalBlockToObjWithStringify(startBlocks[0]);
    }
    return null;
};

// Version of generalBlockToObj that applies stringify
jsonGenerator.generalBlockToObjWithStringify = function(block) {
    if (block) {
        const fn = this.forBlockWithStringify[block.type] || this.forBlock[block.type];
        if (fn) {
            return fn.call(this, block);
        } else {
            console.warn(`No generator for block type '${block.type}'`);
        }
    }
    return null;
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
        
        // Handle initial data from URL or browser storage
        const initialParam = this.queryParams.initial;
        if (initialParam === 'browserStorage') {
            // Get data from sessionStorage using the key "initial"
            const storedData = sessionStorage.getItem('initial');
            if (storedData) {
                this.initialJson = storedData;
                // DON'T clean up the storage - keep it for potential refresh
                console.log('Loaded initial data from browser storage');
            } else {
                console.warn('No data found in browser storage with key "initial"');
                this.initialJson = null;
            }
        } else {
            this.initialJson = initialParam;
        }
        
        this.schemas = [];
        this.tenantProperties = {};
        this.schemaLibrary = {}; // Local storage for schemas
        this.looseEndpoints = []; // Storage for loose endpoints
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
        let tenant = urlParams.get('tenant');
        
        // If no tenant in URL, default to stored tenant from localStorage
        if (!tenant) {
            tenant = localStorage.getItem('last_tenant') || 'default';
        }
        
        return tenant;
    }

    getQueryParams() {
        const urlParams = new URLSearchParams(window.location.search);
        let tenant = urlParams.get('tenant');
        
        // If no tenant in URL, default to stored tenant from localStorage
        if (!tenant) {
            tenant = localStorage.getItem('last_tenant') || 'default';
            console.log('No tenant in URL, using stored tenant:', tenant);
        }
        
        return {
            tenant: tenant,
            rootSchema: urlParams.get('rootSchema'),
            initial: urlParams.get('initial')
        };
    }

    // Wait for AJV and required functions to be available
    waitForDependencies() {
        return new Promise((resolve, reject) => {
            const checkDependencies = () => {
                // Log current dependency status

                // Check if required functions are available
                if (typeof window.addSchemaToValidator !== 'function' ||
                    typeof window.passSchemaToMain !== 'function' ||
                    typeof window.addBlockFromSchema !== 'function') {
                    console.log('Available window functions:', Object.keys(window).filter(key => 
                        typeof window[key] === 'function' && 
                        (key.includes('Schema') || key.includes('Block') || key.includes('Ajv'))
                    ));
                    this.retryCount++;
                    if (this.retryCount >= this.maxRetries) {
                        reject(new Error('Required functions failed to load after maximum retries'));
                        return;
                    }
                    setTimeout(checkDependencies, 10);
                    return;
                }
                
                resolve();
            };

            checkDependencies();
        });
    }

    waitForAuthCheck() {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 100; // 10 seconds max wait
            
            const checkAuthStatus = () => {
                attempts++;
                
                // Check if auth check is complete
                const authCheckComplete = !window.authCheckInProgress;
                const securityBlockLifted = !window.SECURITY_BLOCK_ALL_REQUESTS;
                
                if (authCheckComplete || securityBlockLifted) {
                    // Auth check completed or security block lifted
                    resolve();
                } else if (attempts >= maxAttempts) {
                    console.warn('⚠️ Timeout waiting for auth check, proceeding anyway');
                    // Don't reject - proceed with initialization even if auth check times out
                    resolve();
                } else {
                    console.log(`⏳ Waiting for auth check... attempt ${attempts}/${maxAttempts}`);
                    console.log(`   Auth check in progress: ${window.authCheckInProgress}`);
                    console.log(`   Security block active: ${window.SECURITY_BLOCK_ALL_REQUESTS}`);
                    setTimeout(checkAuthStatus, 100);
                }
            };

            checkAuthStatus();
        });
    }

    // REMOVED: loadTenantProperties method - now included in /schemas cache

    // REMOVED: loadLooseEndpoints method - now included in /schemas cache
    
    // REMOVED: parsePropertiesFile method - no longer needed with cache

    async loadSchemas() {
        try {
            console.log(`Fetching schemas from /schemas endpoint for tenant: ${this.tenantId}`);
            
            // Build the URL with tenant parameter if not default
            // Add cache-busting timestamp to ensure fresh content
            const timestamp = Date.now();
            let schemasUrl = '/schemas';
            if (this.tenantId && this.tenantId !== 'default') {
                schemasUrl += `?tenant=${encodeURIComponent(this.tenantId)}&_=${timestamp}`;
            } else {
                schemasUrl += `?_=${timestamp}`;
            }
            
            // Get the Google access token for authentication
            const token = localStorage.getItem('google_access_token');
            let actualToken = null;
            if (token) {
                try {
                    const tokenObj = JSON.parse(token);
                    actualToken = tokenObj.token || token;
                } catch (e) {
                    actualToken = token;
                }
            }
            
            // Prepare headers
            const headers = {
                'Accept': 'application/gzip, application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            };
            
            // Add Authorization header if token is available
            if (actualToken) {
                headers['Authorization'] = `Bearer ${actualToken}`;
                console.log('Added Authorization header to schemas request');
            } else {
                console.warn('No Google access token found for schemas request');
            }
            
            const response = await fetch(schemasUrl, {
                method: 'GET',
                headers: headers,
                cache: 'no-store' // Ensure fetch API doesn't cache the response
            });
            
            if (response.ok) {
                // Check if response is gzipped
                const contentType = response.headers.get('content-type');
                const contentEncoding = response.headers.get('content-encoding');
                
                if (contentType === 'application/gzip' || contentEncoding === 'gzip') {
                    console.log('Received compressed schema cache');
                    
                    // Get the compressed data
                    const compressedData = await response.arrayBuffer();
                    console.log('Compressed data size:', compressedData.byteLength, 'bytes');
                    console.log('First few bytes:', new Uint8Array(compressedData.slice(0, 10)));
                    console.log('Last few bytes:', new Uint8Array(compressedData.slice(-10)));
                    
                    // Check if this looks like valid gzip data (should start with 0x1f, 0x8b)
                    const firstBytes = new Uint8Array(compressedData.slice(0, 2));
                    console.log('Gzip magic bytes:', firstBytes[0], firstBytes[1]);
                    if (firstBytes[0] === 0x1f && firstBytes[1] === 0x8b) {
                        console.log('Data appears to be valid gzip format');
            } else {
                        console.warn('Data does not appear to be valid gzip format - magic bytes are', firstBytes[0], firstBytes[1]);
                    }
                    
                    // Simple approach: just try to parse as JSON first (in case it's not actually compressed)
                    let decompressedData;
                    try {
                        // First, try to parse the response as JSON directly (in case compression failed or wasn't applied)
                        const textData = new TextDecoder().decode(compressedData);
                        console.log('Trying to parse as JSON directly...');
                        JSON.parse(textData); // Test if it's valid JSON
                        decompressedData = textData;
                        console.log('Data was not compressed, parsed directly as JSON');
                    } catch (jsonError) {
                        console.log('Data is compressed, attempting decompression...');
                        
                        // If that fails, try browser's built-in decompression
                        try {
                            const stream = new DecompressionStream('gzip');
                            const writer = stream.writable.getWriter();
                            const reader = stream.readable.getReader();
                            
                            await writer.write(compressedData);
                            await writer.close();
                            
                            const chunks = [];
                            let done = false;
                            while (!done) {
                                const { value, done: readerDone } = await reader.read();
                                done = readerDone;
                                if (value) {
                                    chunks.push(value);
                                }
                            }
                            
                            const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
                            const decompressedArray = new Uint8Array(totalLength);
                            let offset = 0;
                            for (const chunk of chunks) {
                                decompressedArray.set(chunk, offset);
                                offset += chunk.length;
                            }
                            
                            decompressedData = new TextDecoder().decode(decompressedArray);
                            console.log('Successfully decompressed using browser built-in decompression');
                            
                        } catch (decompressionError) {
                            console.error('Decompression failed:', decompressionError);
                            throw new Error('Failed to decompress gzip data: ' + decompressionError.message);
                        }
                    }
                    
                    // Parse the decompressed JSON
                    const cacheData = JSON.parse(decompressedData);
                    console.log('Loaded compressed schema cache:', cacheData);
                    
                    // Store the schemas and properties
                    this.schemas = Object.keys(cacheData.schemas || {});
                    this.schemaLibrary = cacheData.schemas || {};
                    
                    // Handle properties - they should be parsed objects from the cache
                    if (cacheData.properties && cacheData.properties.tenant) {
                        this.tenantProperties = cacheData.properties.tenant;
                        console.log('Set tenant properties from cache:', this.tenantProperties);
                    } else {
                        this.tenantProperties = cacheData.properties || {};
                        console.log('Set tenant properties from cache (fallback):', this.tenantProperties);
                    }
                    
                    // Handle loose endpoints from cache
                    this.looseEndpoints = cacheData.looseEndpoints || [];
                    console.log('Set loose endpoints from cache:', this.looseEndpoints);
                    
                    console.log('Extracted schemas from cache:', this.schemas);
                    console.log('Schema library populated with', Object.keys(this.schemaLibrary).length, 'schemas');
                    
                    // Process the cache data globally (this handles schemaLibrary, tenantProperties, looseEndpoints, and AJV)
                    if (typeof window.processSchemaCache === 'function') {
                        window.processSchemaCache(cacheData);
                    }
                    
                    return true;
                } else {
                    // Fallback to old format (JSON array of schema names)
                this.schemas = await response.json();
                    console.log('Loaded schemas list (legacy format):', this.schemas);
                return true;
                }
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
        
        // Use $id instead of title since lambda function generates filenames based on $id
        let name = schema.$id || schema.title || 'custom';
        // Remove .json extension if present and sanitize
        if (name.endsWith('.json')) {
            name = name.slice(0, -5);
        }
        const result = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        
        // Store the original title for display purposes - REMOVED to fix AJV validation errors
        
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
        
        return color;
    }

    // Register dynamic mappers for schema-based blocks
    registerDynamicMappers(schemaDetails) {
        schemaDetails.filter(Boolean).forEach(({ filename, schema }) => {
            const name = this.getBlockName(schema);
            
            // Skip if mapper already exists to prevent duplicate registration
            if (jsonGenerator.forBlock[name]) {
                return;
            }
            
            // Register object mapper (without stringify - for validation)
            jsonGenerator.forBlock[name] = function (block) {
                const dict = {};
                for (let i = 0; i < block.length; i++) {
                    const key = block.getFieldValue(`key_field_${i}`);
                    const value = this.generalBlockToObj(block.getInputTargetBlock(`element_${i}`));
                    dict[key] = value;
                }
                return dict;
            };
            
            // Register object mapper with stringify (for JSON display)
            jsonGenerator.forBlockWithStringify = jsonGenerator.forBlockWithStringify || {};
            jsonGenerator.forBlockWithStringify[name] = function (block) {
                const dict = {};
                for (let i = 0; i < block.length; i++) {
                    const key = block.getFieldValue(`key_field_${i}`);
                    const value = this.generalBlockToObjWithStringify(block.getInputTargetBlock(`element_${i}`));
                    
                    // Apply stringify if specified in schema
                    if (schema.properties && schema.properties[key] && schema.properties[key].stringify === true) {
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
            

            // Register array mapper for JSON output
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
                
                // console.log(`Final JSON object:`, obj);
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
            zoom: {
                controls: true,
                wheel: true,
                startScale: 1.625,
                maxScale: 5,
                minScale: 0.4,
                scaleSpeed: 1.2,
                pinch: true
            }
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
                if (jsonInput) {
                    // Create a new block of the specified type
                    const rootBlock = workspace.newBlock(rootSchemaType);
                    console.log('Root block created:', rootBlock);
                    
                    if (rootBlock) {
                        // Initialize and render the root block
                        rootBlock.initSvg();
                        rootBlock.render();
                        
                        // Connect it to the json input
                        const connection = jsonInput.connection;
                        
                        if (connection && rootBlock.outputConnection) {
                            connection.connect(rootBlock.outputConnection);
                            // Create required field children for the root block
                            if (rootBlock.createRequiredFieldBlocks && typeof rootBlock.createRequiredFieldBlocks === 'function') {
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
        }
        
        // Apply feature toggles
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
        document.getElementById('path_id')?.addEventListener('input', () => {
            updateJSONarea(workspace);
            if (typeof handlePathIdChange === 'function') {
                handlePathIdChange();
            }
        });
        
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
            // Parse the initial JSON - if it came from browser storage it's already decoded
            // If it came from URL it needs to be decoded
            let initialData;
            try {
                // Try to parse directly first (for browser storage)
                initialData = JSON.parse(initialJsonString);
            } catch (e) {
                // If that fails, try URL decoding first (for URL parameters)
                const decodedJson = decodeURIComponent(initialJsonString);
                initialData = JSON.parse(decodedJson);
            }
            console.log('Parsed initial data:', initialData);
            
            // The data structure is {type: "json", body: {...schema: [...]}}
            // We need to handle the nested structure by providing the correct schemas
            
            // Get schemas we need
            let tenantBodySchema = null;
            let tenantSchema = null;
            if (window.getSchemaLibrary && typeof window.getSchemaLibrary === 'function') {
                const schemaLib = window.getSchemaLibrary();
                tenantSchema = schemaLib && schemaLib['tenant'];
                
                // Resolve the "body" field which has the nested structure
                if (tenantSchema && tenantSchema.properties && tenantSchema.properties.body && tenantSchema.properties.body.$ref) {
                    const bodyRef = tenantSchema.properties.body.$ref.replace('.json', '');
                    tenantBodySchema = schemaLib && schemaLib[bodyRef];
                    console.log('Got body schema:', tenantBodySchema);
                }
            }
            
            // Handle the nested structure {type: "json", body: {...schema: [...]}}
            // Need to destringify body.schema
            if (initialData && initialData.body && initialData.body.schema && Array.isArray(initialData.body.schema)) {
                // Check if schema is an array of strings
                if (initialData.body.schema.length > 0 && typeof initialData.body.schema[0] === 'string') {
                    console.log('Detected stringified schema array, destringifying...');
                    initialData.body.schema = initialData.body.schema.map(item => {
                        try {
                            return JSON.parse(item);
                        } catch (e) {
                            console.warn('Failed to parse schema item:', e);
                            return item;
                        }
                    });
                    console.log('Destringified schema array');
                }
            }
            
            console.log('After destringification:', initialData);
            
            // Get the schema for the root type - try multiple sources
            let schema = null;
            let baseSchemaType = rootSchemaType;
            
            // Handle array and dict types by extracting the base type
            if (rootSchemaType.endsWith('_array')) {
                baseSchemaType = rootSchemaType.replace('_array', '');
            } else if (rootSchemaType.endsWith('_dict')) {
                baseSchemaType = rootSchemaType.replace('_dict', '');
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
                    // The schema should be the individual item schema (like pet schema)
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
        // Handle array items - this is the key case for pet_array -> pet blocks
        if (isArray && schema && schema.$ref) {
            // Remove .json extension if present
            return schema.$ref.replace('.json', '');
        }
        
        // For array items, if we have a schema but no $ref, we need to determine the type
        // This handles cases where the schema is the actual item schema (like pet schema)
        if (isArray && schema) {
            // If this is an object schema (like pet schema), we need to find the schema name
            if (schema.type === 'object' && schema.properties) {
                // Try to find the schema name by looking at the schema library
                const schemaLib = window.getSchemaLibrary ? window.getSchemaLibrary() : {};
                for (const [schemaName, schemaDef] of Object.entries(schemaLib)) {
                    if (schemaDef === schema) {
                        console.log(`Found schema name for array item: ${schemaName}`);
                        return schemaName;
                    }
                }
                // If we can't find the schema name, this means we have a pet schema
                // but it's not in the schema library yet. In this case, we need to
                // determine the type from the rootSchemaType that was passed in
                console.log('Schema not found in library, using baseSchemaType');
                // We need to get the baseSchemaType from the calling context
                // For now, fall back to dictionary but this should be fixed
                return 'dictionary';
            }
            
            // Handle primitive types
            if (schema.type && !schema.$ref) {
            let result = schema.type;
            if (result === 'integer') {
                result = 'number';
            }
            return result;
            }
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
            } else if (schema.type === 'object') {
                // Generic object type - use dictionary
                return 'dictionary';
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
        
        // Get the base schema type from the rootBlock type (e.g., 'pet' from 'pet_array')
        const baseSchemaType = rootBlock.type.replace('_array', '');
        console.log(`populateArrayRootBlock: baseSchemaType = ${baseSchemaType}`);
        
        data.forEach((item, index) => {
            // For array items, we want to create blocks of the base type (e.g., 'pet' blocks)
            const targetType = baseSchemaType;
            console.log(`Creating ${targetType} block for array item ${index}`);
            this.createAndConnectBlock(rootBlock, 'item', item, targetType, true, schema);
        });
    }
    
    populateDictRootBlock(rootBlock, data, schema) {
        if (!rootBlock || !data || typeof data !== 'object' || !schema) {
            console.warn('Invalid data or schema for dict root block');
            return;
        }
        
        
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
        
        // Process each field in the data
        for (const [key, value] of Object.entries(data)) {
            if (schema.properties[key]) {
                const propertySchema = schema.properties[key];
                
                // Handle $ref properties - resolve the reference
                if (propertySchema.$ref) {
                    const refSchema = this.resolveSchemaReference(propertySchema.$ref);
                    if (refSchema) {
                        // Use the resolved schema for further processing
                        this.processFieldWithResolvedSchema(rootBlock, key, value, refSchema, schema);
                    } else {
                        console.warn(`Could not resolve $ref for ${key}: ${propertySchema.$ref}`);
                    }
                } else {
                // Check if this is a required field
                const isRequired = schema.required && schema.required.includes(key);
                
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
        
        
        // Handle different block types
        if (block.type === 'string' && block.setFieldValue) {
            block.setFieldValue(String(value), 'string_value');
        } else if (block.type === 'number' && block.setFieldValue) {
            block.setFieldValue(String(value), 'number_value');
        } else if (block.type === 'boolean' && block.setFieldValue) {
            block.setFieldValue(String(Boolean(value)), 'boolean');
        } else if (block.type === 'string_enum' && block.setFieldValue) {
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
            const baseType = block.type.replace('_dict', '');
            Object.entries(value).forEach(([key, fieldDef]) => {
                // For _dict blocks, we need to resolve the schema for the base type
                // and use that to populate the child block with the field definition data
                const resolvedSchema = this.resolveSchemaReference(baseType + '.json');
                this.createAndConnectBlock(block, key, fieldDef, baseType, false, resolvedSchema);
            });
        } else if (typeof value === 'object' && !Array.isArray(value)) {
            // Handle nested objects - populate the existing child block
            
            // For nested objects, we need to ensure the block has required fields first
            if (block.createRequiredFieldBlocks && typeof block.createRequiredFieldBlocks === 'function') {
                block.createRequiredFieldBlocks();
            }
            
            // Then populate with the nested data (including optional fields)
            setTimeout(() => {
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
        // TERMINATING CONDITION: Prevent infinite recursion
        if (depth > 10) {
            return;
        }
        
        // TERMINATING CONDITION: Check for primitive values
        if (data === null || data === undefined || typeof data !== 'object') {
            // For primitive values, we should set the block value directly
            if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
                this.setBlockValue(block, data, schema);
            }
            return;
        }
        
        // TERMINATING CONDITION: Check for empty objects - but allow them for blocks with required fields
        if (Object.keys(data).length === 0) {
            // If this block has required fields in its schema, we should still create those fields
            if (schema && schema.required && schema.required.length > 0) {
                // Create required field blocks but don't populate with data
                if (block && block.createRequiredFieldBlocks && typeof block.createRequiredFieldBlocks === 'function') {
                    block.createRequiredFieldBlocks();
                }
                return;
            } else {
                return;
            }
        }
        
        if (!block || !data || !schema || !schema.properties) {
            return;
        }
        
        // Ensure the block has all required fields before populating
        if (block.createRequiredFieldBlocks && typeof block.createRequiredFieldBlocks === 'function') {
            block.createRequiredFieldBlocks();
        }
        
        // Process each field in the data
        for (const [key, value] of Object.entries(data)) {
            if (schema.properties && schema.properties[key]) {
                const propertySchema = schema.properties[key];
                
                // Check if this is a required field
                const isRequired = schema.required && schema.required.includes(key);
                
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
                    // Use the same pattern as the dropdown callback in block-extensions.js
                    this.addOptionalFieldUsingDropdownPattern(block, key, value, propertySchema, schema, depth);
                }
            }
        }
    }

    addOptionalFieldUsingDropdownPattern(block, fieldName, fieldValue, fieldSchema, parentSchema, depth) {
        // Find the optional fields dropdown input (similar to block-extensions.js pattern)
        const optionalFieldsInput = block.inputList.find(input => 
            input.fieldRow && input.fieldRow.some(field => 
                field.name && field.name.includes('ddl_open_bracket')
            )
        );
        
        if (!optionalFieldsInput) {
            return;
        }
        
        // Check if this property is already attached to the block (duplicate check from block-extensions.js)
        for (const idx in block.inputList) {
            if (idx == 0) { // Skip the type of the block, go to the next row to see fields.
                continue;
            }
            let input = block.inputList[idx];
            if (input.fieldRow && input.fieldRow[1] && input.fieldRow[1].value_ == fieldName) { 
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
            }
        }
        
        // Create the block and connect it (same pattern as block-extensions.js)
        try {
            // Check if the block type exists
            if (!Blockly.Blocks[targetType]) {
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
                
                // Create required subfields for the newly created block
                if (targetBlock.createRequiredFieldBlocks && typeof targetBlock.createRequiredFieldBlocks === 'function') {
                    targetBlock.createRequiredFieldBlocks();
                }
                
                // Now populate the connected block with the field value
                if (targetType.endsWith('_dict')) {
                    // For dict blocks, use the dict population method
                    // CRITICAL FIX: If the fieldSchema has a $ref, we need to resolve it to get the actual schema
                    let schemaToUse = fieldSchema;
                    if (fieldSchema && fieldSchema.$ref) {
                        const resolvedSchema = this.resolveSchemaReference(fieldSchema.$ref);
                        if (resolvedSchema) {
                            schemaToUse = resolvedSchema;
                        }
                    }
                    this.populateDictBlock(targetBlock, fieldValue, schemaToUse);
                } else if (typeof fieldValue === 'object' && fieldValue !== null && !Array.isArray(fieldValue)) {
                    // For complex objects, recurse deeper
                    // CRITICAL FIX: If the fieldSchema has a $ref, we need to resolve it to get the actual schema
                    let schemaToUse = fieldSchema;
                    if (fieldSchema && fieldSchema.$ref) {
                        const resolvedSchema = this.resolveSchemaReference(fieldSchema.$ref);
                        if (resolvedSchema) {
                            schemaToUse = resolvedSchema;
                        }
                    }
                    
                    this.populateExistingBlock(targetBlock, fieldValue, schemaToUse, depth + 1);
                } else {
                    // For primitive values, set the block value directly
                    this.setBlockValue(targetBlock, fieldValue, fieldSchema);
                }
                
            } else {
                targetBlock.dispose(true, true);
            }
            
        } catch (e) {
            // Failed to create block
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
        
        // Convert from file reference (e.g., "tenant.json") to runtime schema name (e.g., "tenant")
        let schemaName = ref.toLowerCase();
        
        // Remove .json extension to get runtime schema name
        schemaName = schemaName.replace('.json', '');
        
        
        // Try to get from schema library
        if (window.getSchemaLibrary && typeof window.getSchemaLibrary === 'function') {
            const schemaLib = window.getSchemaLibrary();
            if (schemaLib && schemaLib[schemaName]) {
                return schemaLib[schemaName];
            }
        }
        
        // Try to get from local schema library
        if (this.schemaLibrary && this.schemaLibrary[schemaName]) {
            return this.schemaLibrary[schemaName];
        }
        return null;
    }

    processFieldWithResolvedSchema(rootBlock, fieldName, fieldValue, resolvedSchema, parentSchema) {
        
        // Check if this is a required field
        const isRequired = parentSchema.required && parentSchema.required.includes(fieldName);
        
        if (isRequired) {
            // Find the existing required field and set its value
            this.setRequiredFieldValueWithSchema(rootBlock, fieldName, fieldValue, resolvedSchema);
        } else {
            // This is an optional field - add it via dropdown
            this.addOptionalFieldWithResolvedSchema(rootBlock, fieldName, fieldValue, resolvedSchema, parentSchema);
        }
    }

    setRequiredFieldValueWithSchema(rootBlock, fieldName, fieldValue, fieldSchema) {
        
        // Find the input for this field
        const input = rootBlock.inputList.find(input => {
            const field = input.fieldRow.find(field => field.name && field.name.startsWith('key_field_'));
            return field && field.getValue() === fieldName;
        });
        
        if (input && input.connection && input.connection.targetBlock()) {
            const targetBlock = input.connection.targetBlock();
            
            // Set the value using the resolved schema
            this.setBlockValueWithSchema(targetBlock, fieldValue, fieldSchema);
        } else {
            console.warn(`No target block found for required field ${fieldName}`);
        }
    }

    setBlockValueWithSchema(block, value, schema) {
        if (!block || value === undefined || value === null) {
            return;
        }
        
        
        if (Array.isArray(value) && schema && schema.type === 'array' && schema.items) {
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
                } else if (originalFieldSchema.$ref && !originalFieldSchema.type) {
                    // This is $ref only -> create direct reference block
                    blockType = baseBlockType;
                } else {
                    // Fallback to direct reference
                    blockType = baseBlockType;
                }
            } else {
                // Fallback to direct reference
                blockType = baseBlockType;
            }
            
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
                    
                    // Create required field blocks first
                    if (fieldBlock.createRequiredFieldBlocks && typeof fieldBlock.createRequiredFieldBlocks === 'function') {
                        fieldBlock.createRequiredFieldBlocks();
                    }
                    
                    // Wait for required fields to be created, then populate with data
                    setTimeout(() => {
                        // Handle _dict blocks differently from direct reference blocks
                        if (blockType.endsWith('_dict')) {
                            this.populateDictBlock(fieldBlock, fieldValue, resolvedSchema);
                        } else {
                            this.populateExistingBlock(fieldBlock, fieldValue, resolvedSchema, 0);
                        }
                    }, 50);
                    
                    // Update the JSON area to reflect the changes
                    if (typeof updateJSONarea === 'function') {
                        updateJSONarea(targetBlock.workspace);
                    }
                } else {
                    fieldBlock.dispose(true, true);
                }
            }
        } else {
            // Fallback to the original method for non-$ref fields
            this.addOptionalFieldWithValue(targetBlock, fieldName, fieldValue, resolvedSchema, parentSchema);
        }
    }

    populateDictBlock(dictBlock, data, schema) {
        if (!dictBlock || !data || typeof data !== 'object' || Array.isArray(data)) {
            return;
        }
        
        // Use the REAL _dict block methods from block-definitions.js
        // These blocks have appendKeyValuePairInput method that creates proper inputs with textboxes
        
        Object.entries(data).forEach(([key, value]) => {
            // Use the real appendKeyValuePairInput method from block-definitions.js
            if (dictBlock.appendKeyValuePairInput && typeof dictBlock.appendKeyValuePairInput === 'function') {
                const newInput = dictBlock.appendKeyValuePairInput();
                
                // Set the key name in the textbox (FieldTextInput, not FieldLabel)
                const keyField = dictBlock.getField('key_field_' + (dictBlock.length - 1));
                if (keyField && keyField.setValue) {
                    keyField.setValue(key);
                }
                
                // The appendKeyValuePairInput method might create the connected block asynchronously
                // Let's try both immediately and with a small delay
                const tryPopulateConnectedBlock = () => {
                    const connectedBlock = dictBlock.getInputTargetBlock(newInput.name);
                    
                    if (connectedBlock) {
                        // Now populate this connected block with the value data
                        try {
                            this.populateExistingBlock(connectedBlock, value, schema, 0);
                        } catch (error) {
                            // Error populating block
                        }
                        return true; // Successfully found and populated
                    } else {
                        return false; // No connected block found
                    }
                };
                
                // Try immediately first
                if (!tryPopulateConnectedBlock()) {
                    // If no connected block found immediately, try after a small delay
                    setTimeout(() => {
                        tryPopulateConnectedBlock();
                    }, 10);
                }
            }
        });
    }

    addOptionalFieldWithValue(targetBlock, fieldName, fieldValue, fieldSchema, parentSchema) {
        // Use the existing dropdown mechanism from json-workspace-converter.js
        if (typeof Blockly.JSON.addOptionalFieldToBlock === 'function') {
            Blockly.JSON.addOptionalFieldToBlock(targetBlock, fieldName, fieldValue, fieldSchema, parentSchema);
        } else {
            
            // Fallback: manually add the field (existing code)
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
            
            
            // Determine the block type for this field using the unified method
            const fieldType = this.determineTargetType(fieldValue, fieldSchema, false);
            
            
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
                    
                    // Create required subfields first if needed
                    if (fieldBlock.createRequiredFieldBlocks && typeof fieldBlock.createRequiredFieldBlocks === 'function') {
                        fieldBlock.createRequiredFieldBlocks();
                    }
                    
                    // Then set the value (which may include nested optional fields)
                    setTimeout(() => {
                        this.setBlockValue(fieldBlock, fieldValue, fieldSchema);
                    }, 50);
                    
                    // Update the JSON area to reflect the changes
                    if (typeof updateJSONarea === 'function') {
                        updateJSONarea(targetBlock.workspace);
                    }
                    
                } else {
                    console.warn(`Failed to connect field block for ${fieldName}`);
                    fieldBlock.dispose(true, true);
                }
            } else {
                console.warn(`Failed to create field block of type ${fieldType} for field ${fieldName}`);
            }
        }
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
                // Get all indices first, then sort in descending order to remove from highest index first
                // This prevents index shifting issues when removing multiple items
                const itemsToRemove = [
                    { name: 'dynarray', index: window.selectorBlocks.indexOf('dynarray') },
                    { name: 'dictionary', index: window.selectorBlocks.indexOf('dictionary') },
                    { name: 'string_password', index: window.selectorBlocks.indexOf('string_password') },
                    { name: 'string_email', index: window.selectorBlocks.indexOf('string_email') }
                ];
                
                // Filter out items not found (-1) and sort by index descending
                const validItems = itemsToRemove
                    .filter(item => item.index > -1)
                    .sort((a, b) => b.index - a.index);
                
                console.log('Removing items from selectorBlocks in reverse order:', validItems);
                
                // Remove items from highest index to lowest to avoid index shifting
                validItems.forEach(item => {
                    window.selectorBlocks.splice(item.index, 1);
                });
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
                            // Use the proper ordering function instead of raw selectorBlocks
                            
                            // Update the dropdown options to use our ordering function
                            selectorField.menuGenerator_ = function() {
                                if (typeof getOrderedRootSelectorBlocks === 'function') {
                                    const orderedBlocks = getOrderedRootSelectorBlocks();
                                    return orderedBlocks.map(blockType => [blockType, blockType]);
                            } else {
                                    // Fallback to selectorBlocks if ordering function not available
                                    const filteredBlocks = window.selectorBlocks || [];
                                    return filteredBlocks.map(blockType => [blockType, blockType]);
                                }
                            };
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
            
            // CRITICAL: Wait for auth check to complete before proceeding
            await this.waitForAuthCheck();
            console.log('Auth check completed, proceeding with schema loading');

            // Load schemas first (this now includes everything: schemas, properties, and loose endpoints)
            const ok = await this.loadSchemas();
            if (!ok) {
                console.warn('Falling back to default blocks.');
                this.initializeBlockly();
                return;
            }

            // All data (schemas, properties, endpoints) is now loaded from the /schemas cache
            console.log('All data loaded from cache - no individual endpoint calls needed');

            // Load all schema details - now from cache if available
            let schemaDetails;
            
            if (this.schemaLibrary && Object.keys(this.schemaLibrary).length > 0) {
                // Use cached schemas
                console.log('Using cached schemas from schema library');
                schemaDetails = this.schemas.map(schemaName => {
                    const schema = this.schemaLibrary[schemaName];
                    if (schema) {
                        return { filename: schemaName + '.json', schema };
                    }
                    return null;
                }).filter(detail => detail !== null);
            } else {
                // Fallback to individual schema loading (legacy mode)
                console.log('Loading individual schemas (legacy mode)');
                schemaDetails = await Promise.all(
                this.schemas.map(async (schemaFile) => {
                    try {
                        // Build the URL with tenant parameter if not default
                        let schemaUrl = `/schema/${schemaFile}`;
                        if (this.tenantId && this.tenantId !== 'default') {
                            schemaUrl += `?tenant=${encodeURIComponent(this.tenantId)}`;
                        }
                        
                            // Get the Google access token for authentication
                            const token = localStorage.getItem('google_access_token');
                            let actualToken = null;
                            if (token) {
                                try {
                                    const tokenObj = JSON.parse(token);
                                    actualToken = tokenObj.token || token;
                                } catch (e) {
                                    actualToken = token;
                                }
                            }
                            
                            // Prepare headers
                            const headers = {
                                'Content-Type': 'application/json'
                            };
                            
                            // Add Authorization header if token is available
                            if (actualToken) {
                                headers['Authorization'] = `Bearer ${actualToken}`;
                            }
                            
                            const res = await fetch(schemaUrl, {
                                method: 'GET',
                                headers: headers
                            });
                        
                        if (res.ok) {
                            const schema = await res.json();
                            
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
            }

            // IMMEDIATELY check the state of all schemas after Promise.all
            schemaDetails.forEach((detail, index) => {
                if (detail && detail.schema) {
                    console.log(`Schema ${index + 1} (${detail.filename}):`, {
                        title: detail.schema.title,
                        properties: detail.schema.properties,
                        propertiesCount: Object.keys(detail.schema.properties || {}).length
                    });
                    
                    // Check each property for type (race condition handled)
                    if (detail.schema.properties) {
                        for (const [key, prop] of Object.entries(detail.schema.properties)) {
                            // Property type validation happens elsewhere
                        }
                    }
                }
            });

                        // Register dynamic blocks and mappers
            schemaDetails.filter(Boolean).forEach(({ filename, schema }) => {
                
                const name = this.getBlockName(schema);
                schema.color ||= this.getColorFromSchema(schema);

                // Step 1: Register dynamic block (this handles both block creation and clean schema storage)
                // Skip block creation for special schemas like loose-endpoints
                if (schema.skipBlockCreation) {
                    // Still store schema in local library for endpoint access
                    this.schemaLibrary[name] = schema;
                    
                    // Add to global schema library manually since addBlockFromSchema won't be called
                    if (typeof window.passSchemaToMain === 'function') {
                        window.passSchemaToMain(name, schema);
                    }
                } else {
                    // Create the block definition
                    if (typeof window.addBlockFromSchema === 'function') {
                        try {
                            // Check if block already exists to avoid duplicates
                            if (!Blockly.Blocks[name]) {
                                console.log(`Creating block from schema: ${name}`);
                        window.addBlockFromSchema(name, schema);
                            } else {
                                console.log(`Block ${name} already exists, skipping creation`);
                            }
                    } catch (error) {
                            console.error(`Error creating block for ${name}:`, error);
                    }
                } else {
                        console.warn('addBlockFromSchema function not available - blocks will not be created');
                    }
                    
                    // Store schema in local library for later use
                    this.schemaLibrary[name] = schema;
                }

                // AJV schema addition is now handled by processSchemaCache function
            });
            
            // After all schemas are processed, wait a bit then initialize Blockly
            setTimeout(() => {
                // List what's available in AJV
                if (typeof window.listSchemasInAJV === 'function') {
                    window.listSchemasInAJV();
                }
                
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
                        setTimeout(() => window.retryValidation(workspace), 200);
                    }
                }
                
                                 // Apply tenant customizations AFTER Blockly is fully initialized
                 setTimeout(() => {
                     const workspace = Blockly.getMainWorkspace && Blockly.getMainWorkspace();
                     
                     if (workspace) {
                         const startBlock = workspace.getTopBlocks(false).find(b => b.type === 'start');
                         
                         if (startBlock) {
                             console.log('Calling applyTenantCustomizations from timeout...');
                             this.applyTenantCustomizations(workspace, startBlock);
                             
                             // Refresh the start block dropdown after tenant customizations
                             if (typeof window.refreshStartBlockDropdown === 'function') {
                                 setTimeout(() => {
                                     window.refreshStartBlockDropdown();
                                 }, 50);
                             }
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
        
        // Refresh the start block dropdown after all schemas are loaded
        if (typeof window.refreshStartBlockDropdown === 'function') {
            setTimeout(() => {
                window.refreshStartBlockDropdown();
            }, 100);
        }
    }
    
    populateRootSchemaTextbox() {
        // Populate the root schema type textbox if rootSchema parameter is present
        if (this.rootSchema) {
            const textbox = document.getElementById('root_schema_type');
            if (textbox) {
                textbox.value = this.rootSchema;
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
                resolve();
            } else {
                console.log('Waiting for bundle.js to load...');
                setTimeout(checkBundle, 10);
            }
        };
        checkBundle();
    });
}

window.addEventListener('load', async () => {
    try {
        // Wait for bundle.js to be fully loaded
        await waitForBundle();
        
        // Initialize immediately - no need for settling delay
        const loader = new S3BlockLoader();
        window.currentS3BlockLoader = loader; // Store for debugging
        loader.initialize();
    } catch (error) {
        console.error('Failed to wait for bundle.js:', error);
        // Fallback: try to initialize anyway - no delay needed
        const loader = new S3BlockLoader();
        window.currentS3BlockLoader = loader; // Store for debugging
        loader.initialize();
    }
});