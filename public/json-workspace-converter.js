Blockly.JSON = {};

Blockly.JSON.toWorkspace = function(jsonText, workspace, rootSchema) {
	const jsonStructure = JSON.parse(jsonText);
	const startBlock = workspace.newBlock('start');
	startBlock.initSvg();
	startBlock.render();
	startBlock.moveBy(20, 20); // Position the start block properly
	
	// Check if we have a root schema that indicates this is an array
	if (rootSchema && rootSchema.endsWith('_array')) {
		// This is an array root - create the appropriate array block
		const arrayBlock = workspace.newBlock(rootSchema);
		arrayBlock.initSvg();
		arrayBlock.render();
		
		// Connect the array block to the start block
		const startConnection = startBlock.getInput('json').connection;
		const arrayConnection = arrayBlock.outputConnection;
		startConnection.connect(arrayConnection);
		
		// Populate the array with individual items
		if (Array.isArray(jsonStructure)) {
			for (let i = 0; i < jsonStructure.length; i++) {
				// Create input for this array element
				const lastIndex = arrayBlock.length || 0;
				arrayBlock.length = lastIndex + 1;
				
				const newInput = arrayBlock.appendValueInput('element_' + lastIndex);
				newInput.appendField(new Blockly.FieldTextbutton('–', function() { 
					if (this.sourceBlock_) {
						this.sourceBlock_.deleteElementInput(newInput);
						if (typeof updateJSONarea === 'function') {
							updateJSONarea(this.sourceBlock_.workspace);
						}
					}
				}));
				
				// Determine the child block type (remove _array suffix)
				const childBlockType = rootSchema.replace('_array', '');
				
				// Create child block
				const childBlock = workspace.newBlock(childBlockType);
				childBlock.initSvg();
				childBlock.render();
				
				// Connect child block to the input
				newInput.connection.connect(childBlock.outputConnection);
				
				// Populate the child block with the data
				// For custom blocks, we need to ensure required fields are created first
				if (childBlock.createRequiredFieldBlocks && typeof childBlock.createRequiredFieldBlocks === 'function') {
					childBlock.createRequiredFieldBlocks();
				}
				
				// Wait a bit for required fields to be created, then populate
				setTimeout(() => {
					// Create a schema for the child block based on the data
					const childSchema = {
						type: 'object',
						properties: jsonStructure[i] ? Object.keys(jsonStructure[i]).reduce((props, key) => {
							props[key] = { type: typeof jsonStructure[i][key] === 'number' ? 'number' : 'string' };
							return props;
						}, {}) : {},
						required: []
					};
					
					Blockly.JSON.populateBlockFromJson(childBlock, jsonStructure[i], childSchema);
				}, 50);
			}
		}
	} else {
		// Normal case - use existing logic
		Blockly.JSON.buildAndConnect(jsonStructure, startBlock.getInput('json').connection);
	}
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
							
							// Check if this field should be destringified
							let actualValue = value;
							if (propertySchema.stringify === true) {
								try {
									// Try to parse as JSON if it's a string
									if (typeof value === 'string') {
										actualValue = JSON.parse(value);
										console.log(`Destringified field ${key} from string to object:`, actualValue);
									} else if (Array.isArray(value)) {
										// If it's an array of strings, parse each element
										actualValue = value.map(item => {
											if (typeof item === 'string') {
												try {
													return JSON.parse(item);
												} catch (e) {
													return item;
												}
											}
											return item;
										});
										console.log(`Destringified array field ${key}:`, actualValue);
									}
								} catch (e) {
									console.warn(`Failed to destringify field ${key}:`, e);
									actualValue = value;
								}
							}
							
							// Populate the target block with the value (possibly destringified)
							Blockly.JSON.populateBlockFromJson(targetBlock, actualValue, propertySchema);
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
		if (Array.isArray(jsonStructure)) {
			for (let i = 0; i < jsonStructure.length; i++) {
				
				// Instead of using appendElementInput which creates default blocks,
				// manually create the input and the correct child block
				const lastIndex = block.length || 0;
				block.length = lastIndex + 1;
				
				// Create the input manually
				const newInput = block.appendValueInput('element_' + lastIndex);
				newInput.appendField(new Blockly.FieldTextbutton('–', function() { 
					if (this.sourceBlock_) {
						this.sourceBlock_.deleteElementInput(newInput);
						if (typeof updateJSONarea === 'function') {
							updateJSONarea(this.sourceBlock_.workspace);
						}
					}
				}));
				
				// Determine child block type
				let childBlockType = 'dictionary';
				
				// For x_array blocks, create x child blocks
				if (block.type.endsWith('_array')) {
					childBlockType = block.type.replace('_array', '');
				} else if (schema.items.$ref) {
					// Handle swagger-style references like "#/definitions/Tag"
					if (schema.items.$ref.includes('#/definitions/')) {
						childBlockType = schema.items.$ref.split('/').pop().toLowerCase();
					} else {
						childBlockType = schema.items.$ref.replace('.json', '');
					}
				} else if (schema.items.type === 'string') {
					childBlockType = 'string';
				} else if (schema.items.type === 'number') {
					childBlockType = 'number';
				} else if (schema.items.type === 'boolean') {
					childBlockType = 'boolean';
				}
				
				// Create child block directly
				const childBlock = block.workspace.newBlock(childBlockType);
				childBlock.initSvg();
				childBlock.render();
				
				// Connect it
				newInput.connection.connect(childBlock.outputConnection);
				
				// Populate child block - force object schema for custom blocks
				
				// For custom blocks (non-primitives), force object schema to trigger recursive population
				let childSchema;
				if (childBlockType === 'string' || childBlockType === 'number' || childBlockType === 'boolean') {
					childSchema = schema.items;
				} else {
					// Force object schema for custom blocks like 'tag'
					childSchema = {
						type: 'object',
						properties: jsonStructure[i] ? Object.keys(jsonStructure[i]).reduce((props, key) => {
							props[key] = { type: typeof jsonStructure[i][key] === 'number' ? 'number' : 'string' };
							return props;
						}, {}) : {},
						required: []
					};
				}
				
				Blockly.JSON.populateBlockFromJson(childBlock, jsonStructure[i], childSchema);
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
	// Directly create the input like required fields do - bypass dropdown bullshit
	const lastIndex = block.length || 0;
	block.length = lastIndex + 1;
	
	// Create the input
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
	
	// Determine the correct block type
	let blockType = 'string'; // default
	if (fieldSchema.type === 'array' && fieldSchema.items && fieldSchema.items.$ref) {
		blockType = fieldSchema.items.$ref.replace('.json', '') + '_array';
	} else if (fieldSchema.type === 'array') {
		blockType = 'dynarray';
	} else if (fieldSchema.type === 'string') {
		blockType = 'string';
	} else if (fieldSchema.type === 'number') {
		blockType = 'number';
	} else if (fieldSchema.type === 'boolean') {
		blockType = 'boolean';
	} else if (fieldSchema.$ref) {
		blockType = fieldSchema.$ref.replace('.json', '');
	}
	
	console.log(`Creating block type ${blockType} for field ${fieldName}`);
	
	// Create and connect the target block
	const targetBlock = block.workspace.newBlock(blockType);
	targetBlock.initSvg();
	targetBlock.render();
	
	// Connect it
	newInput.connection.connect(targetBlock.outputConnection);
	
	// Populate the target block with the value - EXACT SAME AS REQUIRED FIELDS LINE 109
	Blockly.JSON.populateBlockFromJson(targetBlock, fieldValue, fieldSchema);
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
	} else if (schema.$ref && !schema.type) {
		// Handle direct $ref without type (common in array items)
		const refType = schema.$ref.replace('.json', '');
		console.log(`Checking for custom block type: ${refType}`);
		if (Blockly.Blocks[refType]) {
			blockType = refType;
			console.log(`Using custom block type: ${refType}`);
		} else {
			console.log(`Custom block type ${refType} not found, using dictionary`);
		}
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
		console.log(`Populating custom object block ${blockType} with value:`, value);
		console.log(`Using schema:`, schema);
		
		// For custom blocks, we need to ensure required fields are created first
		if (targetBlock.createRequiredFieldBlocks && typeof targetBlock.createRequiredFieldBlocks === 'function') {
			console.log(`Creating required fields for custom block ${blockType}`);
			targetBlock.createRequiredFieldBlocks();
		}
		
		// Wait a bit for required fields to be created, then populate
		setTimeout(() => {
			console.log(`Populating custom block ${blockType} after required fields created`);
			Blockly.JSON.populateBlockFromJson(targetBlock, value, schema);
		}, 50);
	}
};