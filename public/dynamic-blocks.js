// Dynamic block loading based on tenant schemas
class DynamicBlockLoader {
    constructor() {
        this.tenantId = this.getTenantId();
        this.schemas = [];
        this.toolbox = null;
    }

    getTenantId() {
        // Extract tenant from hostname
        const hostname = window.location.hostname;
        const tenantMatch = hostname.match(/^([^.]+)\.frontend2\.zanzalaz\.com$/);
        
        if (tenantMatch) {
            return tenantMatch[1];
        } else {
            // Fallback for local development
            const urlParams = new URLSearchParams(window.location.search);
            return urlParams.get('tenant') || 'default';
        }
    }

    async loadSchemas() {
        try {
            const response = await fetch('/schemas');
            if (response.ok) {
                this.schemas = await response.json();
                console.log(`Loaded ${this.schemas.length} schemas for tenant: ${this.tenantId}`);
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

    async loadSchemaDetails() {
        const schemaDetails = [];
        
        for (const schemaFile of this.schemas) {
            try {
                const response = await fetch(`/schema/${schemaFile}`);
                if (response.ok) {
                    const schema = await response.json();
                    schemaDetails.push({
                        filename: schemaFile,
                        schema: schema
                    });
                }
            } catch (error) {
                console.error(`Error loading schema ${schemaFile}:`, error);
            }
        }
        
        return schemaDetails;
    }

    createBlockFromSchema(schemaDetail) {
        const schema = schemaDetail.schema;
        const blockName = this.getBlockName(schema);
        const blockTitle = schema.title || blockName;
        const color = this.getColorFromSchema(schema);
        
        // Create block definition
        const blockDefinition = {
            init: function() {
                this.setColour(color);
                this.appendDummyInput()
                    .appendField(blockTitle);
                
                // Add properties as fields based on schema type
                if (schema.properties) {
                    for (const [propName, propDef] of Object.entries(schema.properties)) {
                        const fieldName = propName.toUpperCase();
                        
                        if (propDef.type === 'string') {
                            this.appendValueInput(fieldName)
                                .setCheck('String')
                                .appendField(propName);
                        } else if (propDef.type === 'number' || propDef.type === 'integer') {
                            this.appendValueInput(fieldName)
                                .setCheck('Number')
                                .appendField(propName);
                        } else if (propDef.type === 'boolean') {
                            this.appendValueInput(fieldName)
                                .setCheck('Boolean')
                                .appendField(propName);
                        } else {
                            this.appendValueInput(fieldName)
                                .setCheck(null)
                                .appendField(propName);
                        }
                    }
                }
                
                this.setOutput(true, null);
                this.setTooltip(schema.description || `Schema for ${blockTitle}`);
            }
        };
        
        // Register the block
        Blockly.Blocks[blockName] = blockDefinition;
        
        // Create generator
        Blockly.JavaScript[blockName] = function(block) {
            const properties = {};
            
            // Generate properties
            if (schema.properties) {
                for (const [propName, propDef] of Object.entries(schema.properties)) {
                    const fieldName = propName.toUpperCase();
                    const value = Blockly.JavaScript.valueToCode(block, fieldName, Blockly.JavaScript.ORDER_ATOMIC);
                    if (value) {
                        properties[propName] = value;
                    } else if (propDef.default !== undefined) {
                        properties[propName] = JSON.stringify(propDef.default);
                    }
                }
            }
            
            const code = `{"${blockName}": ${JSON.stringify(properties)}}`;
            return [code, Blockly.JavaScript.ORDER_ATOMIC];
        };
        
        return blockName;
    }

    getBlockName(schema) {
        // Use schema title or id, sanitized for block name
        let name = schema.title || schema.$id || 'custom';
        return name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    }

    getColorFromSchema(schema) {
        // Generate consistent color based on schema title
        const title = schema.title || 'custom';
        let hash = 0;
        for (let i = 0; i < title.length; i++) {
            hash = title.charCodeAt(i) + ((hash << 5) - hash);
        }
        return Math.abs(hash) % 360;
    }

    updateToolbox() {
        const toolbox = document.getElementById('toolbox');
        if (!toolbox) {
            console.error('Toolbox element not found');
            return;
        }

        // Clear existing custom categories
        const existingCustom = toolbox.querySelector('#custom-objects');
        const existingCustomArrays = toolbox.querySelector('#custom-arrays');
        
        if (existingCustom) {
            existingCustom.innerHTML = '';
        }
        if (existingCustomArrays) {
            existingCustomArrays.innerHTML = '';
        }

        // Add blocks for each schema to custom objects category
        if (this.schemas.length > 0 && existingCustom) {
            this.schemas.forEach(schemaFile => {
                const block = document.createElement('block');
                const blockName = this.getBlockName({ title: schemaFile.replace('.json', '') });
                block.setAttribute('type', blockName);
                existingCustom.appendChild(block);
            });
        }
    }

    async initialize() {
        console.log(`Initializing dynamic blocks for tenant: ${this.tenantId}`);
        
        // Load schemas
        const schemasLoaded = await this.loadSchemas();
        if (!schemasLoaded) {
            console.warn('Failed to load schemas, using default blocks');
            return;
        }
        
        // Load schema details and create blocks
        const schemaDetails = await this.loadSchemaDetails();
        
        // Create blocks for each schema
        schemaDetails.forEach(schemaDetail => {
            this.createBlockFromSchema(schemaDetail);
        });
        
        // Update toolbox
        this.updateToolbox();
        
        // Initialize Blockly after dynamic blocks are loaded
        this.initializeBlockly();
    }

    initializeBlockly() {
        // Initialize Blockly with the updated toolbox
        Blockly.inject(document.getElementById('blocklyDiv'), {
            toolbox: document.getElementById('toolbox'),
            media: 'media/',
            sound: false,
            collapse: true, 
            comments: true, 
            disable: false, 
            scrollbars: true, 
            trashcan: true
        });

        Blockly.JSON.toWorkspace('null', Blockly.getMainWorkspace());
        Blockly.addChangeListener(updateJSONarea);
        document.getElementById('path_id').addEventListener('input', updateJSONarea);
    }
}

// Initialize dynamic blocks after all scripts are loaded
window.addEventListener('load', function() {
    // Wait a bit to ensure all Blockly components are loaded
    setTimeout(() => {
        const blockLoader = new DynamicBlockLoader();
        blockLoader.initialize();
    }, 100);
}); 