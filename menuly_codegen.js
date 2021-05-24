'use strict';

Blockly.JSON = new Blockly.Generator('JSON');
//TODO add additional validations for these custom schemas later.
function loadCustomSchemaMappers(){
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
            Blockly.JSON[`${match}`] = function(block) {
                var dictionary = {};
                for(var i = 0; i<block.length; i++) {
                    var pair_key    = block.getFieldValue( 'key_field_'+i );
                    var pair_value  = this.generalBlockToObj( block.getInputTargetBlock( 'element_'+i ) );
                    dictionary[pair_key] = pair_value;
                }
                return dictionary;
            };
            Blockly.JSON[`${match}_array`] = function(block) {
                var array = [];
                for(var i = 0; i<block.length; i++) {
                    var element_value  = this.generalBlockToObj( block.getInputTargetBlock( 'element_'+i ) );
                    array[i] = element_value;
                }
                return array;
            };
          }
        });
      }
    }
  };
  xhttp.open("GET", 'http://localhost:8888/schema/', true);
  xhttp.send();
}
loadCustomSchemaMappers();
//-------------------------------------------------------------------------------------------------
Blockly.JSON.fromWorkspace = function(workspace) {
    var json_text = '';
    var top_blocks = workspace.getTopBlocks(false);
    for(var i in top_blocks) {
        var top_block = top_blocks[i];
        if(top_block.type == 'start') {
            var json_structure = this.generalBlockToObj( top_block );

            json_text += JSON.stringify(json_structure, null, 4) + '\n\n';
        }
    }
    return json_text;
};
//-------------------------------------------------------------------------------------------------
Blockly.JSON.generalBlockToObj = function(block) {
    if(block) {
        var func = this[block.type];
        if(func) {
            return func.call(this, block);
        } else {
            console.log("Don't know how to generate JSON code for a '"+block.type+"'");
        }
    } else {
        return null;
    }
};
//-------------------------------------------------------------------------------------------------
Blockly.JSON['start'] = function(block) {
    var json    = this.generalBlockToObj( block.getInputTargetBlock( 'json' ) );
    return json;
};
//-------------------------------------------------------------------------------------------------
Blockly.JSON['true_false'] = function(block) {
    var boole = block.getFieldValue('bool');
    if (boole == 'true'){
        return true;
    }else{
        return false;
    }
};
//-------------------------------------------------------------------------------------------------
Blockly.JSON['string'] = function(block) {
    var string_value = block.getFieldValue( 'string_value' );
    return string_value ;
};
//-------------------------------------------------------------------------------------------------
Blockly.JSON['number'] = function(block) {
    var number_value = Number(block.getFieldValue( 'number_value' ));
    return number_value ;
};
//-------------------------------------------------------------------------------------------------
Blockly.JSON['dictionary'] = function(block) {
    var dictionary = {};
    for(var i = 0; i<block.length; i++) {
        var pair_key    = block.getFieldValue( 'key_field_'+i );
        var pair_value  = this.generalBlockToObj( block.getInputTargetBlock( 'element_'+i ) );
        dictionary[pair_key] = pair_value;
    }
    return dictionary;
};
//-------------------------------------------------------------------------------------------------
Blockly.JSON['dynarray'] = function(block) {
    var array = [];
    for(var i = 0; i<block.length; i++) {
        var element_value  = this.generalBlockToObj( block.getInputTargetBlock( 'element_'+i ) );

        array[i] = element_value;
    }
    return array;
};
//-------------------------------------------------------------------------------------------------
Blockly.JSON['string_array'] = function(block) {
    var array = [];
    for(var i = 0; i<block.length; i++) {
        var element_value  = this.generalBlockToObj( block.getInputTargetBlock( 'element_'+i ) );

        array[i] = element_value;
    }
    return array;
};
//-------------------------------------------------------------------------------------------------
Blockly.JSON['number_array'] = function(block) {
    var array = [];
    for(var i = 0; i<block.length; i++) {
        var element_value  = this.generalBlockToObj( block.getInputTargetBlock( 'element_'+i ) );

        array[i] = element_value;
    }
    return array;
};
//-------------------------------------------------------------------------------------------------
//-------------------------------------------------------------------------------------------------
Blockly.JSON['var'] = function(block) {
    var var_op = {};
    var array = [];
    for(var i = 0; i<1; i++) {
        var pair_key    = "var";
        var element_value  = this.generalBlockToObj( block.getInputTargetBlock( 'json'+i));
        var_op[pair_key] = element_value;
    }
    return var_op;
};
//-------------------------------------------------------------------------------------------------
Blockly.JSON['if_logic'] = function(block) {
    var if_logic = {};
    var array = [];
    for(var i = 0; i<block.length; i++) {
        var pair_key    = "if";
        var element_value  = this.generalBlockToObj( block.getInputTargetBlock( 'element_'+i));
        array[i] = element_value;
        if_logic[pair_key] = array;
    }
    return if_logic;
};
//-------------------------------------------------------------------------------------------------
Blockly.JSON['logical'] = function(block) {
    var strict_not_equal = {};
    var array = [];
    for(var i = 0; i<2; i++) {
        var pair_key    = block.getFieldValue('operator');
        var element_value  = this.generalBlockToObj( block.getInputTargetBlock( 'json'+i));
        array[i] = element_value;
    strict_not_equal[pair_key] = array;
    }
    return strict_not_equal;
};
//-------------------------------------------------------------------------------------------------
Blockly.JSON['not'] = function(block) {
    var not = {};
    var array = [];
    var pair_key    = block.getFieldValue('operator');
    var element_value  = this.generalBlockToObj( block.getInputTargetBlock( 'json0'));
    array[0] = element_value;
    not[pair_key] = array;
    return not;
};
//-------------------------------------------------------------------------------------------------
Blockly.JSON['var'] = function(block) {
    var var_op = {};
    var array = [];
    for(var i = 0; i<1; i++) {
        var pair_key    = "var";
        var element_value  = this.generalBlockToObj( block.getInputTargetBlock( 'json'+i));
        var_op[pair_key] = element_value;
    }
    return var_op;
};
//-------------------------------------------------------------------------------------------------
Blockly.JSON['boolean'] = function(block) {
    var bool = {};
    var array = [];
    for(var i = 0; i<block.length; i++) {
        var pair_key    = block.getFieldValue('operator');
        var element_value  = this.generalBlockToObj( block.getInputTargetBlock( 'element_'+i));
        array[i] = element_value;
    bool[pair_key] = array;
    }
    return bool;
};
//-------------------------------------------------------------------------------------------------
Blockly.JSON['comparison'] = function(block) {
    var compare = {};
    var array = [];
    for(var i = 0; i<2; i++) {
        var pair_key    = block.getFieldValue('operator');
        var element_value  = this.generalBlockToObj( block.getInputTargetBlock( 'json'+i));
        array[i] = element_value;
    compare[pair_key] = array;
    }
    return compare;
};
//-------------------------------------------------------------------------------------------------
Blockly.JSON['minmax'] = function(block) {
    var mm = {};
    var array = [];
    for(var i = 0; i<block.length; i++) {
        var pair_key    = block.getFieldValue('operator');
        var element_value  = this.generalBlockToObj( block.getInputTargetBlock( 'element_'+i));
        array[i] = element_value;
    mm[pair_key] = array;
    }
    return mm;
};
//-------------------------------------------------------------------------------------------------
Blockly.JSON['between'] = function(block) {
    var between = {};
    var array = [];
    for(var i = 0; i<3; i++) {
        var pair_key    = block.getFieldValue( 'operator' );
        var element_value  = this.generalBlockToObj( block.getInputTargetBlock( 'json'+i));
        array[i] = element_value;
    between[pair_key] = array;
    }
    return between;
};
//-------------------------------------------------------------------------------------------------
Blockly.JSON['arithmatic'] = function(block) {
    var arithmatic = {};
    var array = [];
    for(var i = 0; i<block.length; i++) {
        var pair_key    = block.getFieldValue( 'operator' )
        var element_value  = this.generalBlockToObj( block.getInputTargetBlock( 'element_'+i));
        array[i] = element_value;

    arithmatic[pair_key] = array;
    }
    return arithmatic;
};
//-------------------------------------------------------------------------------------------------
Blockly.JSON['merge'] = function(block) {
    var bool = {};
    var array = [];
    for(var i = 0; i<block.length; i++) {
        var pair_key    = "merge";
        var element_value  = this.generalBlockToObj( block.getInputTargetBlock( 'element_'+i));
        array[i] = element_value;

    bool[pair_key] = array;
    }
    return bool;
};
//-------------------------------------------------------------------------------------------------
Blockly.JSON['InMiss'] = function(block) {
    var InMiss = {};
    var array = [];
    for(var i = 0; i<block.length; i++) {
        var pair_key    = block.getFieldValue( 'operator' )
        var element_value  = this.generalBlockToObj( block.getInputTargetBlock( 'element_'+i));
        array[i] = element_value;
    InMiss[pair_key] = array;
    }
    return InMiss;
};
//-------------------------------------------------------------------------------------------------
Blockly.JSON['map_filter'] = function(block) {
    var mapFilter = {};
    var array = [];
    for(var i = 0; i<block.length; i++) {
        var pair_key    = block.getFieldValue( 'operator' )
        var element_value  = this.generalBlockToObj( block.getInputTargetBlock( 'element_'+i));
        array[i] = element_value;
    mapFilter[pair_key] = array;
    }
    return mapFilter;
};
//-------------------------------------------------------------------------------------------------
Blockly.JSON['inString'] = function(block) {
    var inString = {};
    var array = [];
    for(var i = 0; i<2; i++) {
        var pair_key    = "in";
        var element_value  = this.generalBlockToObj( block.getInputTargetBlock( 'json'+i));
        array[i] = element_value;
    }
    inString[pair_key] = array;
    console.log(inString);
    return inString;
};
//-------------------------------------------------------------------------------------------------
Blockly.JSON['catString'] = function(block) {
    var cat_string = {};
    var array = [];
    for(var i = 0; i<block.length; i++) {
        var pair_key    = "cat";
        var element_value  = this.generalBlockToObj( block.getInputTargetBlock( 'element_'+i));
        array[i] = element_value;
        cat_string[pair_key] = array;
    }
    return cat_string;
};
//-------------------------------------------------------------------------------------------------
Blockly.JSON['subStr'] = function(block) {
    var sub_string = {};
    var array = [];
    for(var i = 0; i<block.length; i++) {
        var pair_key    = "substr";
        var element_value  = this.generalBlockToObj( block.getInputTargetBlock( 'element_'+i));
        array[i] = element_value;
        sub_string[pair_key] = array;
    }
    return sub_string;
};
//-------------------------------------------------------------------------------------------------
Blockly.JSON['log'] = function(block) {
    var log_op = {};
    var array = [];
    for(var i = 0; i<1; i++) {
        var pair_key    = "log";
        var element_value  = this.generalBlockToObj( block.getInputTargetBlock( 'json'+i));
        log_op[pair_key] = element_value;
    }
    return log_op;
};
//-------------------------------------------------------------------------------------------------
