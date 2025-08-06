'use strict';
import { loadSchemas, loadSchemaDetails } from './setup_s3_workspace.js';



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

    async loadSchemas() {
        try {
            const response = await fetch('/schemas');
            if (response.ok) {
                this.schemas = await response.json();
                return true;
            } else {
                console.error('Failed to load schemas:', response.status);
                return false;
            }
        } catch (error) {
            console.error('Error loading schemas:', error);
            return false;
        }
    }

    getBlockName(schema) {
        let name = schema.title || schema.$id || 'custom';
        return name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    }
    
    getColorFromSchema(schema) {
        const title = schema.title || 'custom';
        let hash = 0;
        for (let i = 0; i < title.length; i++) {
            hash = title.charCodeAt(i) + ((hash << 5) - hash);
        }
        return Math.abs(hash) % 360;
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
                    const res = await fetch(`/schema/${schemaFile}`);
                    if (res.ok) {
                        const schema = await res.json();
                        return { filename: schemaFile, schema };
                    }
                } catch (err) {
                    console.error(`Failed loading ${schemaFile}:`, err);
                }
                return null;
            })
        );

        // Register dynamic blocks and mappers
        schemaDetails.filter(Boolean).forEach(({ filename, schema }) => {
            const name = this.getBlockName(schema);
            schema.color ||= this.getColorFromSchema(schema);

            // Register dynamic block if handler available
            if (typeof window.addBlockFromSchema === 'function') {
                window.addBlockFromSchema(name, schema);
            }
        });

        // Register mappers AFTER all schemas are loaded
        this.registerDynamicMappers(schemaDetails);
        
        // Update toolbox AFTER mappers are registered
        this.updateToolbox(schemaDetails);
        
        // Initialize Blockly LAST
        this.initializeBlockly();
    }
}

//---------------------------------- Initialization --------------------------------------//

window.addEventListener('load', () => {
    setTimeout(() => {
        new S3BlockLoader().initialize();
    }, 100);
});