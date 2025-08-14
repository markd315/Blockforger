class ButtonField extends Blockly.Field {
  constructor(text, clickHandler, validator) {
    super(text, validator);
    
    this.text_ = text;
    this.clickHandler_ = clickHandler;
    this.CURSOR = 'pointer';
  }

  static fromJson(options) {
    return new ButtonField(options.text, options.clickHandler);
  }

  clone() {
    return new ButtonField(this.text_, this.clickHandler_);
  }

  showEditor_(e) {
    if (this.clickHandler_) {
      this.clickHandler_();
    }
  }

  getText() {
    return this.text_;
  }

  setValue(newValue) {
    if (newValue === null || newValue === this.getValue()) {
      return;
    }
    this.text_ = newValue;
    super.setValue(newValue);
  }
}

Blockly.fieldRegistry.register('field_textbutton', ButtonField);
Blockly.FieldTextbutton = ButtonField; // Backward compatibility


