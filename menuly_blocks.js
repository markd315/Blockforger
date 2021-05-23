'use strict';


Blockly.selectionArrow  = function() { return Blockly.RTL ? "←" : "→"; };
Blockly.keyValueArrow   = function() { return Blockly.RTL ? "⇐" : "⇒"; };

//==========================================================================================================

//TODO add base schema objects to this (base flag in schema file)
var selectorBlocks = ['var', 'dictionary', 'array', 'number', 'string',
                          'true_false', 'if_logic', 'logical', 'not',
                          'boolean', 'comparison', 'minmax', 'between',
                          'arithmatic', 'map_filter', 'merge', 'InMiss',
                          'inString','catString', 'subStr'];

function appendElementInput(that) {

        var lastIndex = that.length++;

        var appended_input = that.appendValueInput('element_'+lastIndex);
        appended_input.appendField(new Blockly.FieldTextbutton('–', function() { that.deleteElementInput(appended_input); }) )
          .appendSelector(selectorBlocks, Blockly.selectionArrow(), 'null');
          
        that.moveInputBefore('element_'+lastIndex);

        return appended_input;
  }

function deleteElementInput(inputToDelete, that) {

        var inputNameToDelete = inputToDelete.name;

        var substructure = that.getInputTargetBlock(inputNameToDelete);
        if(substructure) {
            substructure.dispose(true, true);
        }
        that.removeInput(inputNameToDelete);

        var inputIndexToDelete = parseInt(inputToDelete.name.match(/\d+/)[0]);

        var lastIndex = --that.length;

        for(var i=inputIndexToDelete+1; i<=lastIndex; i++) { // rename all the subsequent element-inputs
            var input  = that.getInput( 'element_'+i );

            input.name = 'element_'+(i-1);
        }
  }

//------------------------------------------------------------------------------------------------------- 

var schemadict = {}

function propertyInList(property, list){
  for(let element in list){
    if(property == list[element]){
      return true;
    }
  }
  return false;
}

function optionalFields(schema){
  var list = []
  for(var property in schema.properties){
    if(! propertyInList(property, schema.required)) {
      list.push(property);
    }
  }
  return list;
}

function addBlockFromSchema(name, schema) {
selectorBlocks.push(name);
Blockly.Blocks[name] = {
    length: 0,
    init: function() {
      this.setColour(schema.color);
      this.setOutput(true, ["element"]);
      this.setInputsInline(false);
      //Optionals
      this.appendDummyInput('open_bracket')
        .appendField(" " + name + " ")
        .appendOptionalFieldsSelector(schema, optionalFields(schema), Blockly.selectionArrow(), ' ')

      //Requireds
      for(var requiredField in schema.required){
        //TODO first field in schema.required causes a bug with double spawning
        let fieldName = schema.required[requiredField]
        var lastIndex = this.length++;
        var appended_input = this.appendValueInput('element_'+lastIndex);
        appended_input = appended_input.appendField(new Blockly.FieldLabel(fieldName), 'key_field_'+lastIndex)
            .appendField( Blockly.keyValueArrow() )
        var type = schema.properties[fieldName].type;
        if(type == undefined){
          type = schema.properties[fieldName]['$ref'].replace(".json", "");
        }
        if(type == 'integer'){
          type = 'number';
        }
        appended_input.appendChild(type, Blockly.selectionArrow(), 'null');
      }
      
    },
  deleteKeyValuePairInput: function(inputToDelete) {

        var inputNameToDelete = inputToDelete.name;

        var substructure = this.getInputTargetBlock(inputNameToDelete);
        if(substructure) {
            substructure.dispose(true, true);
        }
        this.removeInput(inputNameToDelete);

        var inputIndexToDelete = parseInt(inputToDelete.name.match(/\d+/)[0]);

        var lastIndex = --this.length;

        for(var i=inputIndexToDelete+1; i<=lastIndex; i++) { // rename all the subsequent element-inputs
            var input       = this.getInput( 'element_'+i );
            input.name      = 'element_'+(i-1);

            var key_field   = this.getField_( 'key_field_'+i );
            key_field.name  = 'key_field_'+(i-1);
        }
  }
  };
}

function loadRoot(){
  let xhttp = new XMLHttpRequest();
  xhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
      const regex = /<a href=".*">(.*)\.json<\/a>/gm;
      let m;
      while ((m = regex.exec(this.responseText)) !== null) {
        // This is necessary to avoid infinite loops with zero-width matches
        if (m.index === regex.lastIndex) {
          regex.lastIndex++;
        }
        // The result can be accessed through the `m`-variable.
        m.forEach((match, groupIndex) => {
          if(groupIndex == 1){
            loadJson(`${match}`);
          }
        });
      }
    }
  };
  xhttp.open("GET", 'http://localhost:8888/schema/', true);
  xhttp.send();
}

function loadJson(name){
  let xhttp = new XMLHttpRequest();
  xhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
        var schema = JSON.parse(this.responseText);
        //console.log(schema);
        addBlockFromSchema(name, schema);
    }
  };
  xhttp.open("GET", 'http://localhost:8888/schema/' + name + ".json", true);
  xhttp.send();
}

loadRoot();

Blockly.Blocks['dictionary'] = {
  length: 0,
  init: function() {
    this.setColour(120);
    this.setOutput(true, ["element"]);

    this.appendDummyInput('open_bracket')
        .appendField(" dictionary ")
        .appendField(new Blockly.FieldTextbutton('+', function() { this.sourceBlock_.appendKeyValuePairInput(); }) );

    this.setInputsInline(false);
  },

  appendKeyValuePairInput: function() {

        var lastIndex = this.length++;
        var appended_input = this.appendValueInput('element_'+lastIndex);
        appended_input.appendField(new Blockly.FieldTextbutton('–', function() { this.sourceBlock_.deleteKeyValuePairInput(appended_input); }) )
            .appendField(new Blockly.FieldTextInput('key_'+lastIndex), 'key_field_'+lastIndex)
            .appendField( Blockly.keyValueArrow() )
            .appendSelector(selectorBlocks, Blockly.selectionArrow(), 'null');

        this.moveInputBefore('element_'+lastIndex);

        return appended_input;
  },

  deleteKeyValuePairInput: function(inputToDelete) {

        var inputNameToDelete = inputToDelete.name;

        var substructure = this.getInputTargetBlock(inputNameToDelete);
        if(substructure) {
            substructure.dispose(true, true);
        }
        this.removeInput(inputNameToDelete);

        var inputIndexToDelete = parseInt(inputToDelete.name.match(/\d+/)[0]);

        var lastIndex = --this.length;

        for(var i=inputIndexToDelete+1; i<=lastIndex; i++) { // rename all the subsequent element-inputs
            var input       = this.getInput( 'element_'+i );
            input.name      = 'element_'+(i-1);

            var key_field   = this.getField_( 'key_field_'+i );
            key_field.name  = 'key_field_'+(i-1);
        }
  }
};

//================================================================================================================

Blockly.Blocks['start'] = {
  init: function() {
    this.setColour(250);
    this.appendDummyInput()
        .setAlign(Blockly.ALIGN_CENTRE)
        .appendField("JsonLogic");

    this.appendValueInput('json')
        .appendSelector(selectorBlocks, Blockly.selectionArrow(), 'null');

    this.setDeletable(false);
  }
};

//------------------------------------------------------------------------------------------------------- 
Blockly.Blocks['true_false'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(new Blockly.FieldDropdown([['true','true'], ['false','false']]), "bool");
    this.setOutput(true, ["element"]);
    this.setColour(210);
  }
};

//------------------------------------------------------------------------------------------------------- 

Blockly.Blocks['string'] = {
  init: function() {
    this.setColour(190);
    this.setOutput(true, ["element"]);

    this.appendDummyInput()
        .setAlign(Blockly.ALIGN_CENTRE)
        .appendField(" string ")
        .appendField('"')
        .appendField(new Blockly.FieldTextInput(''), 'string_value')
        .appendField('"');
  }
};

//------------------------------------------------------------------------------------------------------- 
Blockly.Blocks['number'] = {
  init: function() {
    this.setColour(210);
    this.setOutput(true, ["element"]);

    this.appendDummyInput()
        .setAlign(Blockly.ALIGN_CENTRE)
        .appendField("number")
        .appendField(new Blockly.FieldTextInput('0', Blockly.FieldTextInput.numberValidator), "number_value");
  }
};

//---------------------------------------------------------------------------------------------------------

Blockly.Blocks['array'] = {
  length: 0,
  init: function() {
    this.setColour(350);
    this.setOutput(true, ["element"]);

    this.appendDummyInput('open_bracket')
        .appendField(" Array ")
        .appendField(new Blockly.FieldTextbutton('+', function() { this.sourceBlock_.appendElementInput(); }) );

    this.setInputsInline(false);
  },
  appendElementInput: function() {
    appendElementInput(this);
  },
  deleteElementInput: function(inputToDelete) {
    deleteElementInput(inputToDelete, this);
  }
};

//------------------------------------------------------------------------------------------------------- 

Blockly.Blocks['var'] = {
  length: 0,
  init: function() {
    this.setColour(130);
    this.setOutput(true, ["element"]);

    this.appendValueInput('json0')
        .appendField(" var ")
        .appendSelector(selectorBlocks, Blockly.selectionArrow(), 'null');
    this.setInputsInline(false);
  },
};

//-------------------------------------------------------------------------------------------------------

Blockly.Blocks['if_logic'] = {
  length: 0,
  init: function() {
    this.setColour(330);
    this.setOutput(true, ["element"]);

    this.appendDummyInput('if')
        .appendField(" if ")
        .appendField(new Blockly.FieldTextbutton('+', function() { this.sourceBlock_.appendElementInput(); }) );
    this.setInputsInline(false);
  },
  appendElementInput: function() {
    appendElementInput(this);
  },
  deleteElementInput: function(inputToDelete) {
    deleteElementInput(inputToDelete, this);
  }
};


//------------------------------------------------------------------------------------------------------- 

Blockly.Blocks['logical'] = {
  init: function() {
    var options = [['!=', '!='], [' === ', '==='], [' == ', '=='], [' !== ', '!==']];

    this.appendValueInput("json0")
        .appendField(" Logical ")
        .appendSelector(selectorBlocks, Blockly.selectionArrow(), 'null');
    this.appendValueInput("json1")
        .appendField(new Blockly.FieldDropdown(options), "operator")
        .appendSelector(selectorBlocks, Blockly.selectionArrow(), 'null');
        
    this.setInputsInline(true);
    this.setOutput(true, ["element"]);
    this.setColour(210);
 
  }
};

//-------------------------------------------------------------------------------------------------------

Blockly.Blocks['not'] = {
  length: 0,
  init: function() {
    this.setColour(160);
    this.setOutput(true, ["element"]);
    var options = [['!', '!'], ['!!', '!!']];

    this.appendValueInput('json0')
        .appendField(" NOT ")
        .appendField(new Blockly.FieldDropdown(options),'operator')
        .appendSelector(selectorBlocks, Blockly.selectionArrow(), 'null');
    this.setInputsInline(false);
  },
};


//-------------------------------------------------------------------------------------------------------

Blockly.Blocks['boolean'] = {
  length: 0,
  init: function() {
    this.setColour(330);
    this.setOutput(true, ["element"]);
    var options = [['and', 'and'], [' or ', 'or']];

    this.appendDummyInput('boolean')
        .appendField(" boolean ")
        .appendField(new Blockly.FieldDropdown(options),'operator')
        .appendField(new Blockly.FieldTextbutton('+', function() { this.sourceBlock_.appendElementInput(); }) );
    this.setInputsInline(false);
  },
  appendElementInput: function() {
    appendElementInput(this);
  },
  deleteElementInput: function(inputToDelete) {
    deleteElementInput(inputToDelete, this);
  }
};

//-------------------------------------------------------------------------------------------------------

Blockly.Blocks['comparison'] = {
  length: 0,
  init: function() {
    this.setColour(160);
    this.setOutput(true, ["element"]);
    var options = [['>', '>'], [' >= ', '>='], [' < ', '<'], [' <= ', '<=']];

    this.appendValueInput('json0')
        .appendField(" comparison ")
        .appendSelector(selectorBlocks, Blockly.selectionArrow(), 'null');
    this.appendValueInput('json1')
        .appendField(new Blockly.FieldDropdown(options),'operator')
        .appendSelector(selectorBlocks, Blockly.selectionArrow(), 'null');
        
    this.setInputsInline(true);
  },
};


//-------------------------------------------------------------------------------------------------------

Blockly.Blocks['minmax'] = {
  length: 0,
  init: function() {
    this.setColour(270);
    this.setOutput(true, ["element"]);
    var options = [['min', 'min'], [' max ', 'max']];

    this.appendDummyInput('minmax')
        .appendField(" MinMax ")
        .appendField(new Blockly.FieldDropdown(options),'operator')
        .appendField(new Blockly.FieldTextbutton('+', function() { this.sourceBlock_.appendElementInput(); }) )
        .appendField(" ");
    this.setInputsInline(true);
  },
  appendElementInput: function() {
    appendElementInput(this);
  },
  deleteElementInput: function(inputToDelete) {
    deleteElementInput(inputToDelete, this);
  }
};


//-------------------------------------------------------------------------------------------------------------

Blockly.Blocks['between'] = {
  length: 0,
  init: function() {
    this.setColour(290);
    this.setOutput(true, ["element"]);
    var options = [['<=', '<='], [' < ', '<']];

    this.appendDummyInput('between')
        .appendField(" Between ")
        .appendField(new Blockly.FieldDropdown(options),'operator')
        .appendField("  ")
    this.appendValueInput('json0')
        .appendSelector(selectorBlocks, Blockly.selectionArrow(), 'null');
    this.appendValueInput('json1')
        .appendSelector(selectorBlocks, Blockly.selectionArrow(), 'null');
    this.appendValueInput('json2')
        .appendSelector(selectorBlocks, Blockly.selectionArrow(), 'null');

    this.setInputsInline(true);
  },
};

//-------------------------------------------------------------------------------------------------------

Blockly.Blocks['arithmatic'] = {
  length: 0,
  init: function() {
    this.setColour(330);
    this.setOutput(true, ["element"]);
    var options = [['*', '*'], ['/', '/'], ['+', '+'], ['-','-'], ['%', '%']];

    this.appendDummyInput('Arithmatic')
        .appendField(" Arithmatic ")
        .appendField(new Blockly.FieldDropdown(options),'operator')
        .appendField("  ")
        .appendField(new Blockly.FieldTextbutton('+', function() { this.sourceBlock_.appendElementInput(); }) )
        .appendField("  ");
        
    this.setInputsInline(true);
  },
  appendElementInput: function() {
    appendElementInput(this);
  },
  deleteElementInput: function(inputToDelete) {
    deleteElementInput(inputToDelete, this);
  }
};

//-------------------------------------------------------------------------------------------------------

Blockly.Blocks['map_filter'] = {
  length: 0,
  init: function() {
    this.setColour(330);
    this.setOutput(true, ["element"]);
    var options = [['map', 'map'], ['filter', 'filter'], ['reduce', 'reduce'], ['all', 'all'], ['some', 'some'], ['none', 'none']];

    this.appendDummyInput('json0')
        .appendField(new Blockly.FieldDropdown(options),'operator')
        .appendSelector(selectorBlocks, Blockly.selectionArrow(), 'null')
        .appendField("  ")
        .appendField(new Blockly.FieldTextbutton('+', function() { this.sourceBlock_.appendElementInput(); }) )
        .appendField("  ");
    this.setInputsInline(false);
  },
  appendElementInput: function() {
    appendElementInput(this);
  },
  deleteElementInput: function(inputToDelete) {
    deleteElementInput(inputToDelete, this);
  }
};
//------------------------------------------------------------------------------------------------------------
Blockly.Blocks['merge'] = {
  length: 0,
  init: function() {
    this.setColour(330);
    this.setOutput(true, ["element"]);

    this.appendDummyInput('merge')
        .appendField(" Merge ")
        .appendField(new Blockly.FieldTextbutton('+', function() { this.sourceBlock_.appendElementInput(); }) )
        .appendField("  ");
    this.setInputsInline(true);
  },
  appendElementInput: function() {
    appendElementInput(this);
  },
  deleteElementInput: function(inputToDelete) {
    deleteElementInput(inputToDelete, this);
  }
};

//-------------------------------------------------------------------------------------------------------------
Blockly.Blocks['InMiss'] = {
  length: 0,
  init: function() {
    this.setColour(330);
    this.setOutput(true, ["element"]);
    var options = [['in', 'in'], ['missing', 'missing'], ['missing_some', 'missing_some']];

    this.appendDummyInput('json0')
        .appendField(new Blockly.FieldDropdown(options),'operator')
        .appendSelector(selectorBlocks, Blockly.selectionArrow(), 'null')
        .appendField(new Blockly.FieldTextbutton('+', function() { this.sourceBlock_.appendElementInput(); }) )
        .appendField("  ");
    this.setInputsInline(false);
  },
  appendElementInput: function() {
    appendElementInput(this);
  },
  deleteElementInput: function(inputToDelete) {
    deleteElementInput(inputToDelete, this);
  }
};
//----------------------------------------------------------------------------------------------------------
Blockly.Blocks['inString'] = {
  init: function() {
    this.appendValueInput("json0")
        .appendSelector(selectorBlocks, Blockly.selectionArrow(), 'null');
    this.appendValueInput("json1")
        .appendField("in  ")
        .appendSelector(selectorBlocks, Blockly.selectionArrow(), 'null');
    this.setInputsInline(true);
    this.setOutput(true, ["element"]);
    this.setColour(210);
 
  }
};
//-------------------------------------------------------------------------------------------------------

Blockly.Blocks['catString'] = {
  length: 0,
  init: function() {
    this.setColour(330);
    this.setOutput(true, ["element"]);

    this.appendDummyInput('cat')
        .appendField(" cat ")
        .appendField(new Blockly.FieldTextbutton('+', function() { this.sourceBlock_.appendElementInput(); }) );
    this.setInputsInline(false);
  },
  appendElementInput: function() {
    appendElementInput(this);
  },
  deleteElementInput: function(inputToDelete) {
    deleteElementInput(inputToDelete, this);
  }
};

//-------------------------------------------------------------------------------------------------------

Blockly.Blocks['subStr'] = {
  length: 0,
  init: function() {
    this.setColour(330);
    this.setOutput(true, ["element"]);

    this.appendDummyInput('substr')
        .appendField(" substr ")
        .appendField(new Blockly.FieldTextbutton('+', function() { this.sourceBlock_.appendElementInput(); }) );
    this.setInputsInline(false);
  },
  appendElementInput: function() {
    appendElementInput(this);
  },
  deleteElementInput: function(inputToDelete) {
    deleteElementInput(inputToDelete, this);
  }
};
//------------------------------------------------------------------------------------------------------- 

Blockly.Blocks['log'] = {
  length: 0,
  init: function() {
    this.setColour(130);
    this.setOutput(true, ["element"]);

    this.appendValueInput('json0')
        .appendField(" log ")
        .appendSelector(selectorBlocks, Blockly.selectionArrow(), 'null');
    this.setInputsInline(false);
  },
};

//-------------------------------------------------------------------------------------------------------
