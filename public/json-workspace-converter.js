Blockly.JSON = {};

Blockly.JSON.toWorkspace = function(jsonText, workspace) {
	const jsonStructure = JSON.parse(jsonText);
	const startBlock = workspace.newBlock('start');
	startBlock.initSvg();
	startBlock.render();
	startBlock.moveBy(20, 20); // Position the start block properly
	Blockly.JSON.buildAndConnect(jsonStructure, startBlock.getInput('json').connection);
};

Blockly.JSON.buildAndConnect = function(jsonStructure, parentConnection) {
	if (jsonStructure === null) {
		return;
	}
	
	let type = typeof(jsonStructure);
	if (type === 'object') {
		type = (jsonStructure instanceof Array) ? 'dynarray' : 'dictionary';
	}
	
	const workspace = parentConnection.getSourceBlock().workspace;
	const targetBlock = workspace.newBlock(type);
	targetBlock.initSvg();
	targetBlock.render();

	const childConnection = targetBlock.outputConnection;
	parentConnection.connect(childConnection);

	switch(type) {
		case 'string':
			targetBlock.setFieldValue(String(jsonStructure), 'string_value');
			break;
		case 'string_enum':
			targetBlock.setFieldValue(String(jsonStructure), 'enum_value');
			break;
		case 'number':
			targetBlock.setFieldValue(String(jsonStructure), 'number_value');
			break;
		case 'boolean':
			targetBlock.setFieldValue(String(Boolean(jsonStructure)), 'boolean');
			break;
		case 'dictionary':
			let index = 0;
			for (const key in jsonStructure) {
				targetBlock.appendKeyValuePairInput();
				targetBlock.setFieldValue(key, 'key_field_' + index);
				const elementConnection = targetBlock.getInput('element_' + index).connection;
				Blockly.JSON.buildAndConnect(jsonStructure[key], elementConnection);
				index++;
			}
			break;
		case 'dynarray':
			for (let i = 0; i < jsonStructure.length; i++) {
				targetBlock.appendElementInput();
				const elementConnection = targetBlock.getInput('element_' + i).connection;
				Blockly.JSON.buildAndConnect(jsonStructure[i], elementConnection);
			}
			break;
	}
};

Blockly.JSON.populateBlockFromJson = function(block, jsonStructure, schema) {
	if (!block || !jsonStructure || !schema) {
		return;
	}
	
	const workspace = block.workspace;
	
	// Handle different block types based on schema
	if (schema.type === 'object' && schema.properties) {
		// This is a custom object block - populate its properties
		console.log('Populating custom object block with data:', jsonStructure);
		console.log('Block inputs:', block.inputList);
		console.log('Schema properties:', schema.properties);
		console.log('Schema required:', schema.required);
		
		// First, ensure required field blocks are created
		if (block.createRequiredFieldBlocks && typeof block.createRequiredFieldBlocks === 'function') {
			console.log('Creating required field blocks first');
			block.createRequiredFieldBlocks();
		}
		
		// Wait a bit for the blocks to be created, then populate values
		setTimeout(() => {
			// Process each field in the JSON data
			for (const [key, value] of Object.entries(jsonStructure)) {
				if (schema.properties[key]) {
					const propertySchema = schema.properties[key];
					console.log(`Processing field ${key} with value:`, value);
					console.log(`Property schema:`, propertySchema);
					
					// Check if this is a required field (already created by createRequiredFieldBlocks)
					const isRequired = schema.required && schema.required.includes(key);
					console.log(`Field ${key} is required:`, isRequired);
					
					if (isRequired) {
						// Find the existing required field input
						const input = block.inputList.find(input => {
							const field = input.fieldRow.find(field => field.name && field.name.startsWith('key_field_'));
							return field && field.getValue() === key;
						});
						
						if (input && input.connection && input.connection.targetBlock()) {
							const targetBlock = input.connection.targetBlock();
							console.log(`Found required field block for ${key}:`, targetBlock.type);
							
							// Populate the target block with the value
							Blockly.JSON.populateBlockFromJson(targetBlock, value, propertySchema);
						} else {
							console.warn(`No target block found for required field ${key}`);
						}
					} else {
						// This is an optional field - need to add it via dropdown
						console.log(`Adding optional field ${key} via dropdown mechanism`);
						Blockly.JSON.addOptionalFieldToBlock(block, key, value, propertySchema, schema);
					}
				}
			}
		}, 200); // Give time for createRequiredFieldBlocks to complete
		
	} else if (schema.type === 'array' && schema.items) {
		// This is an array block - populate its elements
		if (block.appendElementInput && Array.isArray(jsonStructure)) {
			for (let i = 0; i < jsonStructure.length; i++) {
				block.appendElementInput();
				const elementConnection = block.getInput('element_' + i).connection;
				Blockly.JSON.createBlockFromSchemaAndValue(elementConnection, jsonStructure[i], schema.items, workspace);
			}
		}
	} else {
		// This is a primitive block - set its value
		if (schema.type === 'string' && block.setFieldValue) {
			block.setFieldValue(String(jsonStructure), 'string_value');
		} else if (schema.type === 'number' && block.setFieldValue) {
			block.setFieldValue(String(jsonStructure), 'number_value');
		} else if (schema.type === 'boolean' && block.setFieldValue) {
			block.setFieldValue(String(Boolean(jsonStructure)), 'boolean');
		} else if (schema.type === 'string_enum' && block.setFieldValue) {
			block.setFieldValue(String(jsonStructure), 'enum_value');
		}
	}
};

Blockly.JSON.addOptionalFieldToBlock = function(block, fieldName, fieldValue, fieldSchema, parentSchema) {
	console.log(`Adding optional field ${fieldName} to block ${block.type}`);
	
	// Find the optional fields dropdown (usually the first input)
	const optionalFieldsInput = block.inputList.find(input => 
		input.name === 'open_bracket' && 
		input.fieldRow.some(field => field.name && field.name.startsWith('ddl_'))
	);
	
	if (!optionalFieldsInput) {
		console.warn(`No optional fields dropdown found in block ${block.type}`);
		return;
	}
	
	// Find the dropdown field
	const dropdownField = optionalFieldsInput.fieldRow.find(field => 
		field.name && field.name.startsWith('ddl_')
	);
	
	if (!dropdownField) {
		console.warn(`No dropdown field found in optional fields input`);
		return;
	}
	
	// Simulate selecting the field from the dropdown
	console.log(`Simulating dropdown selection for field ${fieldName}`);
	
	// Get the dropdown callback function
	const dropdownCallback = dropdownField.menuGenerator_;
	if (typeof dropdownCallback === 'function') {
		// Call the dropdown callback to add the field
		try {
			dropdownCallback.call(dropdownField, fieldName);
			console.log(`Successfully added optional field ${fieldName}`);
			
			// Wait a bit for the field to be created, then populate its value
			setTimeout(() => {
				// Find the newly created input for this field
				const newInput = block.inputList.find(input => {
					const field = input.fieldRow.find(field => field.name && field.name.startsWith('key_field_'));
					return field && field.getValue() === fieldName;
				});
				
				if (newInput && newInput.connection && newInput.connection.targetBlock()) {
					const targetBlock = newInput.connection.targetBlock();
					console.log(`Found newly created optional field block for ${fieldName}:`, targetBlock.type);
					
					// Populate the target block with the value
					Blockly.JSON.populateBlockFromJson(targetBlock, fieldValue, fieldSchema);
				} else {
					console.warn(`No target block found for newly created optional field ${fieldName}`);
				}
			}, 100);
		} catch (error) {
			console.error(`Failed to add optional field ${fieldName}:`, error);
		}
	} else {
		console.warn(`Dropdown callback is not a function for field ${fieldName}`);
	}
};

Blockly.JSON.createBlockFromSchemaAndValue = function(parentConnection, value, schema, workspace) {
	if (!parentConnection || !schema) {
		return;
	}
	
	let blockType = 'dictionary'; // default fallback
	
	// Determine block type based on schema
	if (schema.type === 'string') {
		blockType = 'string';
	} else if (schema.type === 'number') {
		blockType = 'number';
	} else if (schema.type === 'boolean') {
		blockType = 'boolean';
	} else if (schema.type === 'array') {
		blockType = 'dynarray';
	} else if (schema.type === 'object') {
		// Check if this is a custom object type
		if (schema.$ref) {
			const refType = schema.$ref.replace('.json', '');
			if (workspace.getFlyout && workspace.getFlyout().getWorkspace().getBlockTypeCount(refType) > 0) {
				blockType = refType;
			}
		}
		// If no custom type found, use dictionary
	}
	
	// Create the block
	const targetBlock = workspace.newBlock(blockType);
	targetBlock.initSvg();
	targetBlock.render();
	
	// Connect to parent
	const childConnection = targetBlock.outputConnection;
	parentConnection.connect(childConnection);
	
	// Populate the block with the value
	if (blockType === 'string') {
		targetBlock.setFieldValue(String(value), 'string_value');
	} else if (blockType === 'number') {
		targetBlock.setFieldValue(String(value), 'number_value');
	} else if (blockType === 'boolean') {
		targetBlock.setFieldValue(String(Boolean(value)), 'boolean');
	} else if (blockType === 'dynarray' && Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			targetBlock.appendElementInput();
			const elementConnection = targetBlock.getInput('element_' + i).connection;
			Blockly.JSON.createBlockFromSchemaAndValue(elementConnection, value[i], schema.items, workspace);
		}
	} else if (blockType === 'dictionary' && typeof value === 'object' && value !== null) {
		let index = 0;
		for (const [key, val] of Object.entries(value)) {
			targetBlock.appendKeyValuePairInput();
			targetBlock.setFieldValue(key, 'key_field_' + index);
			const elementConnection = targetBlock.getInput('element_' + index).connection;
			Blockly.JSON.createBlockFromSchemaAndValue(elementConnection, val, { type: 'object' }, workspace);
			index++;
		}
	} else if (blockType !== 'dictionary' && blockType !== 'dynarray') {
		// This is a custom object type - recursively populate it
		Blockly.JSON.populateBlockFromJson(targetBlock, value, schema);
	}
};