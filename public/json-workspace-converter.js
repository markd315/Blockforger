Blockly.JSON = {};

Blockly.JSON.toWorkspace = function(jsonText, workspace) {
	const jsonStructure = JSON.parse(jsonText);
	workspace.clear();
	const startBlock = workspace.newBlock('start');
	startBlock.initSvg();
	startBlock.render();
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
