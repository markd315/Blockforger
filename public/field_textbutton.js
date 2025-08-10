// Modern Blockly field definition
class FieldTextbutton extends Blockly.Field {
  constructor(buttontext, changeHandler, validator) {
    super(buttontext, validator);
    
    this.buttontext_ = buttontext;
    this.changeHandler_ = changeHandler;
    this.CURSOR = 'pointer';
  }

  static fromJson(options) {
    return new FieldTextbutton(options.text, options.changeHandler);
  }

  clone() {
    return new FieldTextbutton(this.buttontext_, this.changeHandler_);
  }

  showEditor_(e) {
    // Prevent the default editor from showing
    if (this.changeHandler_) {
      this.changeHandler_();
    }
  }

  getText() {
    return this.buttontext_;
  }

  setValue(newValue) {
    if (newValue === null || newValue === this.getValue()) {
      return;
    }
    this.buttontext_ = newValue;
    super.setValue(newValue);
  }
}

// Register the field
Blockly.fieldRegistry.register('field_textbutton', FieldTextbutton);

// For backward compatibility, also expose it the old way
Blockly.FieldTextbutton = FieldTextbutton;

/*
    
//    An example of how to use FieldTextbutton: implementation of a simple register with limiters linked to "-" and "+" buttons

Blockly.Block.appendMinusPlusCounter = function(block, name, startValue, lowerLimit, upperLimit) {
    block.appendDummyInput(name+'_input')
        .appendField(name+':', name+'_label')
        .appendField(String(startValue || '0'), name)
        .appendField(new Blockly.FieldTextbutton('–', function() { var counter_=parseInt(this.sourceBlock_.getFieldValue(name))-1; if((lowerLimit===undefined) || counter_>=lowerLimit) { this.sourceBlock_.setFieldValue(String(counter_), name); } }), name+'_minus')
        .appendField(new Blockly.FieldTextbutton('+', function() { var counter_=parseInt(this.sourceBlock_.getFieldValue(name))+1; if((upperLimit===undefined) || counter_<=upperLimit) { this.sourceBlock_.setFieldValue(String(counter_), name); } }), name+'_plus');
}

//  A usage example of the above. You can add two independent MinusPlusCounters to a block by saying:

    Blockly.Block.appendMinusPlusCounter(this, 'age', 0, 0 );
    Blockly.Block.appendMinusPlusCounter(this, 'temperature', 37, 34, 42 );

*/
