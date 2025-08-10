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

    async loadSchemas() {
        try {
            console.log('Fetching schemas from /schemas endpoint');
            const response = await fetch('/schemas');
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
        
        let name = schema.title || schema.$id || 'custom';
        const result = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        
        console.log(`getBlockName result: ${result}`);
        return result;
    }
    
    getColorFromSchema(schema) {
        console.log(`getColorFromSchema called with schema:`, {
            title: schema.title,
            properties: schema.properties ? Object.keys(schema.properties) : 'none'
        });
        
        const title = schema.title || 'custom';
        let hash = 0;
        for (let i = 0; i < title.length; i++) {
            hash = title.charCodeAt(i) + ((hash << 5) - hash);
        }
        const color = Math.abs(hash) % 360;
        
        console.log(`getColorFromSchema result: ${color}`);
        return color;
    }

    // Register dynamic mappers for schema-based blocks
    registerDynamicMappers(schemaDetails) {
        schemaDetails.filter(Boolean).forEach(({ filename, schema }) => {
            const name = this.getBlockName(schema);
            
            // Register object mapper
            jsonGenerator.forBlock[name] = function (block) {
                const dict = {};
                for (let i = 0; i < block.length; i++) {
                    const key = block.getFieldValue(`key_field_${i}`);
                    const value = this.generalBlockToObj(block.getInputTargetBlock(`element_${i}`));
                    dict[key] = value;
                }
                return dict;
            };

            // Register array mapper
            jsonGenerator.forBlock[`${name}_array`] = function (block) {
                const arr = [];
                for (let i = 0; i < block.length; i++) {
                    arr[i] = this.generalBlockToObj(block.getInputTargetBlock(`element_${i}`));
                }
                return arr;
            };
        });
    }
    
    updateToolbox(schemaDetails) {
        const toolbox = document.getElementById('toolbox');
        const custom = toolbox?.querySelector('#custom-objects');
        const customArrays = toolbox?.querySelector('#custom-arrays');
    
        if (!custom || !customArrays) {
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
        });
    }

    initializeBlockly() {
        const workspace = Blockly.inject(document.getElementById('blocklyDiv'), {
            toolbox: document.getElementById('toolbox'),
            media: 'media/',
            sounds: false,
            collapse: true,
            comments: true,
            disable: false,
            scrollbars: true,
            trashcan: true,
        });

        const startBlock = workspace.newBlock('start');
        startBlock.initSvg();
        startBlock.render();
        startBlock.moveBy(20, 20);

        workspace.addChangeListener(() => updateJSONarea(workspace));
        document.getElementById('path_id')?.addEventListener('input', () => updateJSONarea(workspace));

        if (window.getKeyboardManager) {
            const kb = window.getKeyboardManager();
            if (kb) kb.setWorkspace(workspace);
        }
    }

    async initialize() {
        console.log(`Initializing dynamic blocks for tenant: ${this.tenantId}`);

        try {
            // Wait for all dependencies to be available
            await this.waitForDependencies();
            console.log('Dependencies are ready, proceeding with initialization');

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
                        console.log(`Fetching individual schema: /schema/${schemaFile}`);
                        const res = await fetch(`/schema/${schemaFile}`);
                        console.log(`Schema ${schemaFile} response status:`, res.status);
                        
                        if (res.ok) {
                            const schema = await res.json();
                            console.log(`=== SCHEMA LOADED FROM SERVER: ${schemaFile} ===`);
                            console.log(`Raw schema object:`, schema);
                            console.log(`Schema properties count:`, Object.keys(schema.properties || {}).length);
                            console.log(`Schema properties:`, schema.properties);
                            console.log(`Schema required:`, schema.required);
                            console.log(`Raw schema response:`, JSON.stringify(schema, null, 2));
                            
                            // IMMEDIATELY verify the schema integrity
                            if (schema.properties) {
                                for (const [key, prop] of Object.entries(schema.properties)) {
                                    if (!prop.type) {
                                        console.error(`CRITICAL: Property ${key} already missing type when loaded from server!`);
                                    }
                                }
                            }
                            
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
                
                // Create a snapshot of the original schema state for comparison
                const originalSchemaState = {
                    properties: schema.properties ? JSON.parse(JSON.stringify(schema.properties)) : null,
                    required: schema.required ? [...schema.required] : null,
                    type: schema.type
                };
                
                console.log(`=== Processing Schema ${schemaIndex}/${schemaDetails.filter(Boolean).length} ===`);
                console.log(`Schema file: ${filename}`);
                console.log(`Original schema state:`, originalSchemaState);
                
                const name = this.getBlockName(schema);
                schema.color ||= this.getColorFromSchema(schema);

                console.log(`=== Processing Schema ${schemaIndex}/${schemaDetails.filter(Boolean).length} ===`);
                console.log(`Schema file: ${filename}`);
                console.log(`Schema name: ${name}`);
                console.log(`Schema index: ${schemaIndex}`);

                console.log(`Processing schema: ${name} from file: ${filename}`);
                console.log(`Schema title: ${schema.title}, $id: ${schema.$id}`);
                console.log(`Extracted block name: ${name}`);

                // Register dynamic block first to create clean schema
                console.log(`Checking addBlockFromSchema function:`, typeof window.addBlockFromSchema);
                if (typeof window.addBlockFromSchema === 'function') {
                    console.log(`Calling addBlockFromSchema for ${name}`);
                    console.log(`Schema state BEFORE addBlockFromSchema for ${name}:`, {
                        properties: schema.properties,
                        required: schema.required,
                        type: schema.type
                    });
                    
                    try {
                        window.addBlockFromSchema(name, schema);
                        console.log(`Successfully registered block for ${name}`);
                        
                        // Check if schema was modified during processing
                        console.log(`Schema state AFTER addBlockFromSchema for ${name}:`, {
                            properties: schema.properties,
                            required: schema.required,
                            type: schema.type
                        });
                        
                        // Verify no data was lost
                        if (schema.properties) {
                            for (const [key, prop] of Object.entries(schema.properties)) {
                                if (!prop.type) {
                                    console.warn(`WARNING: Property ${key} lost its type after processing ${name}!`);
                                }
                            }
                        }
                        
                        // Compare with original state
                        console.log(`=== Schema ${name} Processing Complete ===`);
                        console.log(`Final schema state:`, {
                            properties: schema.properties,
                            required: schema.required,
                            type: schema.type
                        });
                        
                        // Check for any data loss
                        if (originalSchemaState.properties && schema.properties) {
                            for (const [key, originalProp] of Object.entries(originalSchemaState.properties)) {
                                const currentProp = schema.properties[key];
                                if (originalProp.type !== currentProp?.type) {
                                    console.error(`CRITICAL: Property ${key} type changed from "${originalProp.type}" to "${currentProp?.type}" during processing!`);
                                }
                                if (originalProp.default !== currentProp?.default) {
                                    console.error(`CRITICAL: Property ${key} default changed from "${originalProp.default}" to "${currentProp?.default}" during processing!`);
                                }
                            }
                        }
                    } catch (error) {
                        console.error(`Error registering block for ${name}:`, error);
                    }
                } else {
                    console.warn(`addBlockFromSchema function not available for ${name} - dynamic block creation disabled`);
                }

                // Add schema to AJV validator for validation (use clean schema from library)
                if (typeof window.addSchemaToValidator === 'function') {
                    // Get the clean schema from the schema library (without Blockly-specific properties)
                    let cleanSchema = schema;
                    if (typeof window.getSchemaLibrary === 'function') {
                        const schemaLib = window.getSchemaLibrary();
                        if (schemaLib[name]) {
                            cleanSchema = schemaLib[name];
                            console.log(`Using clean schema for validation of ${name}:`, cleanSchema);
                        } else {
                            console.warn(`Clean schema not found in library for ${name}, using original schema`);
                        }
                    }
                    
                    console.log(`Calling addSchemaToValidator for ${name} with clean schema:`, cleanSchema);
                    try {
                        window.addSchemaToValidator(name, cleanSchema);
                        console.log(`Successfully processed clean schema ${name} through addSchemaToValidator`);
                    } catch (error) {
                        console.error(`Error processing clean schema ${name}:`, error);
                    }
                } else {
                    console.warn(`addSchemaToValidator function not available for ${name} - validation functionality disabled`);
                }
            });
            
            // After all schemas are processed, list what's available in AJV
            if (typeof window.listSchemasInAJV === 'function') {
                console.log('Final schema loading summary:');
                window.listSchemasInAJV();
            }
            
            // Check if AJV was successfully initialized
            if (typeof window.debugSchemaState === 'function') {
                console.log('Checking final AJV state:');
                window.debugSchemaState();
            }
            
            // Debug the complete schema state
            if (typeof window.debugSchemaState === 'function') {
                console.log('Complete schema state after loading:');
                window.debugSchemaState();
            }
            
            // Summary of available functionality
            console.log('=== Functionality Summary ===');
            console.log('Schema Library:', typeof window.passSchemaToMain === 'function' ? 'Available' : 'Disabled');
            console.log('AJV Validation:', typeof window.addSchemaToValidator === 'function' ? 'Available' : 'Disabled');
            console.log('Dynamic Blocks:', typeof window.addBlockFromSchema === 'function' ? 'Available' : 'Disabled');
            console.log('============================');

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