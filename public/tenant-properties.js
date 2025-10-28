/**
 * Tenant Properties Manager
 * Handles all tenant property-based UI customization and feature toggles
 */
class TenantPropertiesManager {
    constructor(tenantProperties = {}) {
        this.tenantProperties = tenantProperties;
        console.log('TenantPropertiesManager initialized with properties:', tenantProperties);
    }

    /**
     * Apply all tenant property-based customizations
     */
    applyAllCustomizations() {
        console.log('=== APPLYING TENANT CUSTOMIZATIONS ===');
        
        // Set all elements to visible by default first
        this.setDefaultVisibility();
        
        // Then apply tenant-specific overrides
        this.applyTenantOverrides();
        
        // Store tenant properties globally for backward compatibility
        window.tenantProperties = this.tenantProperties;
        
        console.log('=== TENANT CUSTOMIZATIONS APPLIED ===');
    }

    /**
     * Set all UI elements to their default visibility state
     */
    setDefaultVisibility() {
        console.log('Setting default visibility for all elements');
        
        // AI Assist button - visible by default
        const aiAssistButton = document.getElementById('aiAssistButton');
        if (aiAssistButton) {
            aiAssistButton.style.display = 'flex';
            console.log('AI Assist button set to visible (default)');
        }
        
        // Root schema elements - visible by default
        const rootSchemaLabel = document.getElementById('rootSchemaLabel');
        const rootSchemaDescription = document.getElementById('rootSchemaDescription');
        const rootSchemaInput = document.getElementById('root_schema_type');
        
        if (rootSchemaLabel) {
            rootSchemaLabel.style.display = 'block';
            console.log('Root schema label set to visible (default)');
        }
        if (rootSchemaDescription) {
            rootSchemaDescription.style.display = 'block';
            console.log('Root schema description set to visible (default)');
        }
        if (rootSchemaInput) {
            rootSchemaInput.style.display = 'block';
            console.log('Root schema input set to visible (default)');
        }
        
        // Rebuild from JSON button - visible by default
        const rebuildButton = document.getElementById('reverse');
        if (rebuildButton) {
            rebuildButton.style.display = 'block';
            console.log('Rebuild from JSON button set to visible (default)');
        }
        
        // Relax Static Typing button - visible by default
        const relaxButton = document.getElementById('load_disk');
        if (relaxButton) {
            relaxButton.style.display = 'block';
            console.log('Relax Static Typing button set to visible (default)');
        }
        
        // JSON preview - visible by default
        const jsonArea = document.getElementById('json_area');
        if (jsonArea) {
            jsonArea.style.display = 'block';
            console.log('JSON preview area set to visible (default)');
        }
        
        // Routes - visible by default
        const routeElements = document.querySelectorAll('#path_id, #full_route, label[for="path_id"]');
        routeElements.forEach(el => {
            if (el) {
                el.style.display = 'block';
                console.log(`Route element ${el.id || el.tagName} set to visible (default)`);
            }
        });
        
        // Presentation layer link - hidden by default
        const presentationLink = document.getElementById('presentationLink');
        if (presentationLink) {
            presentationLink.style.display = 'none';
            console.log('Presentation layer link set to hidden (default)');
        }
    }

    /**
     * Apply tenant-specific overrides based on tenant properties
     */
    applyTenantOverrides() {
        console.log('Applying tenant-specific overrides');
        
        // Hide AI Assist button if configured
        if (this.tenantProperties.hide_ai_assist === 'true') {
            const aiAssistButton = document.getElementById('aiAssistButton');
            if (aiAssistButton) {
                aiAssistButton.style.display = 'none';
                console.log('AI Assist button hidden by tenant config');
            }
        }
        
        // Hide root schema elements if configured
        if (this.tenantProperties.hide_root_schema === 'true') {
            const rootSchemaLabel = document.getElementById('rootSchemaLabel');
            const rootSchemaDescription = document.getElementById('rootSchemaDescription');
            const rootSchemaInput = document.getElementById('root_schema_type');
            
            if (rootSchemaLabel) {
                rootSchemaLabel.style.display = 'none';
                console.log('Root schema label hidden by tenant config');
            }
            if (rootSchemaDescription) {
                rootSchemaDescription.style.display = 'none';
                console.log('Root schema description hidden by tenant config');
            }
            if (rootSchemaInput) {
                rootSchemaInput.style.display = 'none';
                console.log('Root schema input hidden by tenant config');
            }
        }
        
        // Hide Relax Static Typing if dynamic types not permitted
        if (this.tenantProperties.permit_dynamic_types === 'false') {
            const relaxButton = document.getElementById('load_disk');
            if (relaxButton) {
                relaxButton.style.display = 'none';
                console.log('Relax Static Typing button hidden by tenant config');
            }
        }
        
        // Hide JSON preview if configured
        if (this.tenantProperties.hide_json_preview === 'true') {
            const jsonArea = document.getElementById('json_area');
            if (jsonArea) {
                jsonArea.style.display = 'none';
                console.log('JSON preview area hidden by tenant config');
            }
        }
        
        // Hide routes if configured
        if (this.tenantProperties.hide_routes === 'true') {
            const routeElements = document.querySelectorAll('#path_id, #full_route, label[for="path_id"]');
            routeElements.forEach(el => {
                if (el) {
                    el.style.display = 'none';
                    console.log(`Route element ${el.id || el.tagName} hidden by tenant config`);
                }
            });
        }
        
        // Customize post button text and color
        if (this.tenantProperties.post_text) {
            const postButton = document.getElementById('post');
            if (postButton) {
                postButton.textContent = this.tenantProperties.post_text;
                console.log('POST button text updated');
            }
        }
        
        if (this.tenantProperties.post_button_color) {
            const postButton = document.getElementById('post');
            if (postButton) {
                postButton.style.backgroundColor = this.tenantProperties.post_button_color;
                console.log('POST button color updated');
            }
        }
        
        // Handle presentation layer link
        if (this.tenantProperties.presentation) {
            const presentationLink = document.getElementById('presentationLink');
            if (presentationLink) {
                presentationLink.style.display = 'inline-block';
                presentationLink.href = this.tenantProperties.presentation.trim();
                console.log('Presentation layer link enabled:', this.tenantProperties.presentation);
            }
        }
    }

    /**
     * Get the root schema type based on tenant properties and query parameters
     * @param {string} rootSchemaQueryParam - Root schema from query parameter
     * @returns {string|null} - The root schema type to use
     */
    getRootSchemaType(rootSchemaQueryParam = null) {
        // Priority 1: rootSchema query parameter
        if (rootSchemaQueryParam) {
            console.log(`Using rootSchema from query parameter: ${rootSchemaQueryParam}`);
            return rootSchemaQueryParam.toLowerCase();
        }
        
        // Priority 2: topic property from tenant properties
        if (this.tenantProperties && this.tenantProperties.topic && this.tenantProperties.topic.trim()) {
            const topic = this.tenantProperties.topic.toLowerCase();
            console.log(`Using topic from tenant properties: ${topic}`);
            return topic;
        }
        
        console.log('No root schema specified, using default behavior');
        return null;
    }

    /**
     * Update tenant properties
     * @param {Object} newProperties - New tenant properties
     */
    updateProperties(newProperties) {
        this.tenantProperties = { ...this.tenantProperties, ...newProperties };
        console.log('Tenant properties updated:', this.tenantProperties);
    }

    /**
     * Get a specific tenant property
     * @param {string} key - Property key
     * @param {*} defaultValue - Default value if property doesn't exist
     * @returns {*} - Property value or default
     */
    getProperty(key, defaultValue = null) {
        return this.tenantProperties[key] || defaultValue;
    }

    /**
     * Check if a boolean property is true
     * @param {string} key - Property key
     * @returns {boolean} - True if property is 'true'
     */
    isPropertyTrue(key) {
        return this.tenantProperties[key] === 'true';
    }
}

// Export for use in other modules
window.TenantPropertiesManager = TenantPropertiesManager;
