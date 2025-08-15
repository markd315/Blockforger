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
        this.tenantProperties = {};
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

    async loadTenantProperties() {
        try {
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
                this.tenantProperties = this.parsePropertiesFile(propertiesText);
                console.log('Loaded tenant properties:', this.tenantProperties);
                return true;
            } else {
                console.warn(`No tenant properties found for ${this.tenantId} (${response.status})`);
                return true; // Not an error, just no custom properties
            }
        } catch (error) {
            console.warn('Failed to load tenant properties:', error);
            return true; // Not a critical error
        }
    }
    
    parsePropertiesFile(propertiesText) {
        const properties = {};
        const lines = propertiesText.split('\n');
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine && !trimmedLine.startsWith('#')) {
                const equalIndex = trimmedLine.indexOf('=');
                if (equalIndex > 0) {
                    const key = trimmedLine.substring(0, equalIndex).trim();
                    const value = trimmedLine.substring(equalIndex + 1).trim();
                    properties[key] = value;
                }
            }
        }
        
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

        // Apply tenant customizations
        this.applyTenantCustomizations(workspace, startBlock);

        workspace.addChangeListener(() => updateJSONarea(workspace));
        document.getElementById('path_id')?.addEventListener('input', () => updateJSONarea(workspace));

        if (window.getKeyboardManager) {
            const kb = window.getKeyboardManager();
            if (kb) kb.setWorkspace(workspace);
        }
    }
    
    applyTenantCustomizations(workspace, startBlock) {
        if (!this.tenantProperties || Object.keys(this.tenantProperties).length === 0) {
            console.log('No tenant properties to apply');
            return;
        }
        
        console.log('Applying tenant customizations:', this.tenantProperties);
        
        // Set root block dropdown to topic value if specified
        if (this.tenantProperties.topic && this.tenantProperties.topic.trim()) {
            try {
                const jsonInput = startBlock.getInput('json');
                if (jsonInput) {
                    const selectorField = jsonInput.fieldRow.find(field => 
                        field instanceof Blockly.FieldDropdown || 
                        (field.constructor && field.constructor.name === 'FieldDropdown')
                    );
                    
                    if (selectorField && selectorField.setValue) {
                        console.log(`Setting root block dropdown to topic: ${this.tenantProperties.topic}`);
                        selectorField.setValue(this.tenantProperties.topic);
                    }
                }
            } catch (e) {
                console.warn('Failed to set root block topic:', e);
            }
        }
        
        // Apply feature toggles
        this.applyFeatureToggles();
    }
    
    applyFeatureToggles() {
        // Hide JSON preview if configured
        if (this.tenantProperties.hide_json_preview === 'true') {
            const jsonArea = document.getElementById('json_area');
            if (jsonArea) {
                jsonArea.style.display = 'none';
                const jsonLabel = jsonArea.previousElementSibling;
                if (jsonLabel && jsonLabel.tagName === 'LABEL') {
                    jsonLabel.style.display = 'none';
                }
            }
        }
        
        // Hide routes if configured
        if (this.tenantProperties.hide_routes === 'true') {
            const routeElements = document.querySelectorAll('#path_id, #full_route, label[for="path_id"]');
            routeElements.forEach(el => el.style.display = 'none');
        }
        
        // Customize post button text and color
        if (this.tenantProperties.post_text) {
            const postButton = document.getElementById('post');
            if (postButton) {
                postButton.textContent = this.tenantProperties.post_text;
            }
        }
        
        if (this.tenantProperties.post_button_color) {
            const postButton = document.getElementById('post');
            if (postButton) {
                postButton.style.backgroundColor = this.tenantProperties.post_button_color;
            }
        }
        
        // Disable dynamic types if configured
        if (this.tenantProperties.permit_dynamic_types === 'false') {
            // Remove dynarray and dictionary from selector blocks
            if (window.selectorBlocks) {
                const dynarrayIndex = window.selectorBlocks.indexOf('dynarray');
                const dictIndex = window.selectorBlocks.indexOf('dictionary');
                if (dynarrayIndex > -1) {
                    window.selectorBlocks.splice(dynarrayIndex, 1);
                    console.log('Disabled dynarray due to tenant configuration');
                }
                if (dictIndex > -1) {
                    window.selectorBlocks.splice(dictIndex, 1);
                    console.log('Disabled dictionary due to tenant configuration');
                }
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
                            const blocklyProperties = ['color', 'apiCreationStrategy', 'endpoint', 'childRefToParent'];
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
                console.log('Schema Library:', typeof window.passSchemaToMain === 'function' ? 'Available' : 'Disabled');
                console.log('AJV Validation:', typeof window.addSchemaToValidator === 'function' ? 'Available' : 'Disabled');
                console.log('Dynamic Blocks:', typeof window.addBlockFromSchema === 'function' ? 'Available' : 'Disabled');
                
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