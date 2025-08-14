class KeyboardNavigationManager {
    constructor() {
        this.workspace = null;
        this.currentSelection = null;
        this.isFieldEditing = false;
        this.isDropdownOpen = false;
        this.currentDropdown = null;
        this.currentField = null;
        
        this.initializeKeyboardHandlers();
    }
    
    setWorkspace(workspace) {
        this.workspace = workspace;
        
        // Listen for workspace changes that might affect our state
        workspace.addChangeListener((event) => {
            this.handleWorkspaceChange(event);
        });
        
        // Listen for block clicks to maintain selection state
        this.setupBlockClickHandlers();
        
        // Select root block by default
        this.selectRootBlock();
    }
    
    setupBlockClickHandlers() {
        // Override Blockly's block selection to work with our system
        const originalAddSelect = Blockly.Block.prototype.addSelect;
        const self = this;
        
        Blockly.Block.prototype.addSelect = function() {
            // Set this as our current selection
            self.currentSelection = this;
            
            // Call original method
            return originalAddSelect.call(this);
        };
    }
    
    handleWorkspaceChange(event) {
        // Handle dropdown close events
        if (event.type === 'ui' && this.isDropdownOpen) {
            // Dropdown might have closed
            setTimeout(() => {
                if (!document.querySelector('.blocklyDropdownMenu')) {
                    this.exitDropdown();
                }
            }, 100);
        }
    }
    
    selectRootBlock() {
        if (!this.workspace) return;
        
        const topBlocks = this.workspace.getTopBlocks(false);
        if (topBlocks && topBlocks.length > 0) {
            // Find the 'start' block specifically
            const startBlock = topBlocks.find(block => block.type === 'start');
            if (startBlock) {
                this.selectBlock(startBlock);
            } else {
                this.selectBlock(topBlocks[0]);
            }
        }
    }
    
    selectBlock(block) {
        if (!block) return;
        
        // Verify the block has the required methods
        if (typeof block.addSelect !== 'function' || typeof block.removeSelect !== 'function') {
            console.error('Block does not have required selection methods:', block);
            return;
        }
        
        // Don't select orphaned blocks (blocks without proper connections)
        if (this.isOrphanedBlock(block)) {
            console.log('Skipping orphaned block:', block.type);
            return;
        }
        
        // Clear previous selection safely
        if (this.currentSelection && typeof this.currentSelection.removeSelect === 'function') {
            this.currentSelection.removeSelect();
        }
        
        // Select new block using Blockly's native selection (yellow highlight)
        this.currentSelection = block;
        block.addSelect();
        
        // Exit field editing mode
        this.exitFieldEditing();
        
        console.log('Selected block:', block.type);
    }
    
    isOrphanedBlock(block) {
        // A block is orphaned if it's not connected to anything and not a top-level block
        if (!block) return true;
        
        // Top-level blocks (like 'start') are not orphaned
        const topBlocks = this.workspace.getTopBlocks(false);
        if (topBlocks.includes(block)) {
            return false;
        }
        
        // Block is orphaned if it has no parent and no output connection to anything
        const hasParent = block.getParent() !== null;
        const hasOutputConnection = block.outputConnection && block.outputConnection.targetConnection;
        
        return !hasParent && !hasOutputConnection;
    }
    
    initializeKeyboardHandlers() {
        document.addEventListener('keydown', (event) => {
            // Don't handle keys if we're in a regular input field (not our custom editing)
            if (this.isRegularInputFocused() && !this.isFieldEditing) {
                return;
            }
            
            this.handleKeyDown(event);
        });
        
        document.addEventListener('keyup', (event) => {
            this.handleKeyUp(event);
        });
        
        // Mouse click handler to ensure single selection
        this.initializeMouseHandlers();
    }
    
    initializeMouseHandlers() {
        // Listen for clicks on the workspace to handle selection
        if (this.workspace && this.workspace.getCanvas()) {
            this.workspace.getCanvas().addEventListener('mousedown', (event) => {
                this.handleMouseDown(event);
            });
            this.workspace.getCanvas().addEventListener('click', (event) => {
                this.handleMouseClick(event);
            });
        }
        
        // Listen for block clicks via Blockly events
        if (this.workspace) {
            this.workspace.addChangeListener((event) => {
                if (event.type === Blockly.Events.CLICK) {
                    this.handleBlockClick(event);
                }
            });
        }
        
        // Add a more robust click handler that works with any click
        if (this.workspace) {
            this.workspace.addChangeListener((event) => {
                if (event.type === Blockly.Events.SELECTED) {
                    // When Blockly selects a block, update our tracking
                    if (event.newElementId) {
                        const selectedBlock = this.workspace.getBlockById(event.newElementId);
                        if (selectedBlock) {
                            this.currentSelection = selectedBlock;
                        }
                    }
                }
            });
        }
    }
    
    handleMouseDown(event) {
        // Let Blockly handle the click first, then clean up selection
        setTimeout(() => {
            this.ensureSingleSelection();
        }, 10);
    }
    
    handleMouseClick(event) {
        // Additional mouse click handler for more robust selection recovery
        setTimeout(() => {
            const blocklySelected = Blockly.getSelected();
            if (blocklySelected && blocklySelected !== this.currentSelection) {
                this.forceSelectBlock(blocklySelected);
            }
        }, 5);
    }
    
    handleBlockClick(event) {
        if (event.blockId) {
            const clickedBlock = this.workspace.getBlockById(event.blockId);
            if (clickedBlock) {
                // Force selection of the clicked block, regardless of current state
                this.forceSelectBlock(clickedBlock);
            }
        }
    }
    
    forceSelectBlock(block) {
        if (!block) return;
        
        try {
            // Clear ALL existing selections first
            const allBlocks = this.workspace.getAllBlocks(false);
            for (const existingBlock of allBlocks) {
                // Check if it's a valid Blockly block with selection methods
                if (existingBlock && 
                    typeof existingBlock.isSelected === 'function' && 
                    typeof existingBlock.removeSelect === 'function' &&
                    existingBlock.isSelected()) {
                    existingBlock.removeSelect();
                }
            }
            
            // Clear our tracking
            this.currentSelection = null;
            
            // Ensure the block is still valid before selecting
            if (block.isDisposed && block.isDisposed()) {
                console.log('Block was disposed, cannot select');
                return;
            }
            
            // Verify the block has the required methods
            if (typeof block.addSelect !== 'function') {
                console.error('Block does not have addSelect method:', block);
                return;
            }
            
            // Select the new block
            this.currentSelection = block;
            block.addSelect();
            
            console.log('Force selected block:', block.type);
        } catch (error) {
            console.error('Error in forceSelectBlock:', error);
            // Fallback: try to select root block
            this.selectRootBlock();
        }
    }
    
    ensureSingleSelection() {
        // Get the currently selected block from Blockly
        const blocklySelected = Blockly.getSelected();
        
        // If Blockly has a selection and it's different from our tracking
        if (blocklySelected && blocklySelected !== this.currentSelection) {
            // Clear our old selection if it exists and is different
            if (this.currentSelection && 
                this.currentSelection !== blocklySelected && 
                typeof this.currentSelection.removeSelect === 'function') {
                this.currentSelection.removeSelect();
            }
            this.currentSelection = blocklySelected;
        }
        
        // If we have a current selection but Blockly doesn't, clear it
        if (this.currentSelection && !blocklySelected) {
            if (typeof this.currentSelection.removeSelect === 'function') {
                this.currentSelection.removeSelect();
            }
            this.currentSelection = null;
        }
        
        // If Blockly has no selection but we think we should have one, try to recover
        if (!blocklySelected && !this.currentSelection) {
            // Try to select the root block as a fallback
            this.selectRootBlock();
        }
    }
    
    isRegularInputFocused() {
        const activeElement = document.activeElement;
        return activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.contentEditable === 'true'
        );
    }
    
    handleKeyDown(event) {
        if (!this.currentSelection) return;
        
        // Handle dropdown navigation - but allow left/right/shift to pass through
        if (this.isDropdownOpen && this.currentDropdown) {
            if (event.code === 'ArrowUp' || event.code === 'ArrowDown' || 
                event.code === 'Space' || event.code === 'Enter' || event.code === 'Escape') {
                this.handleDropdownNavigation(event);
                return;
            }
            // For left/right/shift, fall through to main navigation
        }
        
        // Handle field editing - but allow arrows and shift to pass through
        if (this.isFieldEditing && this.currentField) {
            if (event.code === 'Enter') {
                this.handleFieldEditing(event);
                return;
            }
            // For arrows and shift, fall through to main navigation
        }
        
        // Handle main navigation - these ALWAYS work
        switch (event.code) {
            case 'ArrowLeft':
                event.preventDefault();
                this.navigateToParent();
                break;
                
            case 'ArrowRight':
                event.preventDefault();
                this.navigateToFirstChild();
                break;
                
            case 'ShiftLeft':
            case 'ShiftRight':
                event.preventDefault();
                this.handleShiftPress();
                break;
                
            case 'Space':
                if (!this.isDropdownOpen && !this.isFieldEditing) {
                    event.preventDefault();
                    this.handleSpacePress();
                }
                break;
                
            case 'Enter':
                if (!this.isDropdownOpen && !this.isFieldEditing) {
                    event.preventDefault();
                    this.handleEnterPress();
                }
                break;
                
            case 'ArrowUp':
                if (!this.isDropdownOpen) {
                    event.preventDefault();
                    this.navigateToPreviousSibling();
                }
                break;
                
            case 'ArrowDown':
                if (!this.isDropdownOpen) {
                    event.preventDefault();
                    this.navigateToNextSibling();
                }
                break;
        }
    }
    
    handleKeyUp(event) {
        // Handle any key up events if needed
    }
    
    handleSpacePress() {
        // Spacebar: Change the type of current block via parent dropdown
        // Special case: if root is selected, target root's own dropdown
        if (this.currentSelection.type === 'start') {
            const dropdown = this.findDropdownOnBlock(this.currentSelection);
            if (dropdown) {
                this.openDropdown(dropdown);
                return;
            }
        }
        
        // Normal case: target parent's dropdown that controls this block
        const parent = this.currentSelection.getParent();
        if (parent) {
            const dropdown = this.findDropdownControllingBlock(parent, this.currentSelection);
            if (dropdown) {
                this.openDropdown(dropdown);
                return;
            }
        }
    }
    
    handleEnterPress() {
        // Enter: Edit primitive fields OR toggle boolean value
        
        // Special case for boolean: cycle through values directly
        if (this.currentSelection.type === 'boolean') {
            this.toggleBooleanValue();
            return;
        }
        
        // Normal case: edit primitive fields (string, number)
        const field = this.findEditableFieldOnBlock(this.currentSelection);
        if (field) {
            this.enterFieldEditing(field);
            return;
        }
    }
    
    findDropdownOnBlock(block) {
        if (!block || !block.inputList) return null;
        
        // Look for dropdown fields in all inputs
        for (const input of block.inputList) {
            for (const field of input.fieldRow) {
                if (field instanceof Blockly.FieldDropdown) {
                    return field;
                }
            }
        }
        return null;
    }
    
    findDropdownControllingBlock(parentBlock, childBlock) {
        if (!parentBlock || !parentBlock.inputList || !childBlock) return null;
        
        // Find which input of the parent contains the child block
        for (const input of parentBlock.inputList) {
            if (input.connection && input.connection.targetBlock() === childBlock) {
                // Found the input that contains our child block
                // Look for dropdown in this specific input
                for (const field of input.fieldRow) {
                    if (field instanceof Blockly.FieldDropdown) {
                        return field;
                    }
                }
            }
        }
        return null;
    }
    
    findEditableFieldOnBlock(block) {
        if (!block || !block.inputList) return null;
        
        // Look for editable fields (TextInput, Number)
        for (const input of block.inputList) {
            for (const field of input.fieldRow) {
                if (field instanceof Blockly.FieldTextInput || 
                    field instanceof Blockly.FieldNumber) {
                    return field;
                }
            }
        }
        return null;
    }
    
    openDropdown(dropdown) {
        this.isDropdownOpen = true;
        this.currentDropdown = dropdown;
        
        // Trigger dropdown opening
        try {
            dropdown.showEditor();
        } catch (e) {
            // Fallback for different Blockly versions
            if (dropdown.showEditor_) {
                dropdown.showEditor_();
            }
        }
        
        console.log('Opened dropdown');
    }
    
    handleDropdownNavigation(event) {
        switch (event.code) {
            case 'ArrowUp':
                event.preventDefault();
                // Navigate up in dropdown
                this.navigateDropdownUp();
                break;
                
            case 'ArrowDown':
                event.preventDefault();
                // Navigate down in dropdown
                this.navigateDropdownDown();
                break;
                
            case 'Space':
            case 'Enter':
                event.preventDefault();
                // Confirm dropdown selection
                this.confirmDropdownSelection();
                break;
                
            case 'Escape':
                event.preventDefault();
                // Cancel dropdown
                this.cancelDropdown();
                break;
        }
    }
    
    navigateDropdownUp() {
        // Implementation depends on Blockly's dropdown internals
        // This is a simplified version
        if (this.currentDropdown && this.currentDropdown.menu_) {
            const menu = this.currentDropdown.menu_;
            if (menu.highlightPrevious) {
                menu.highlightPrevious();
            }
        }
    }
    
    navigateDropdownDown() {
        // Implementation depends on Blockly's dropdown internals
        if (this.currentDropdown && this.currentDropdown.menu_) {
            const menu = this.currentDropdown.menu_;
            if (menu.highlightNext) {
                menu.highlightNext();
            }
        }
    }
    
    confirmDropdownSelection() {
        if (this.currentDropdown && this.currentDropdown.menu_) {
            // Store the current block before dropdown changes
            const currentBlock = this.currentSelection;
            
            // Trigger selection of highlighted item
            const menu = this.currentDropdown.menu_;
            if (menu.performActionInternal) {
                menu.performActionInternal();
            }
            
            // After dropdown completes, jump to the newly created child
            setTimeout(() => {
                this.jumpToNewChild(currentBlock);
            }, 50);
        }
        this.exitDropdown();
    }
    
    jumpToNewChild(parentBlock) {
        if (!parentBlock) return;
        
        // Find the child block that was just created/modified
        if (parentBlock.type === 'start') {
            // For start block, look for its json input
            const jsonInput = parentBlock.getInput('json');
            if (jsonInput && jsonInput.connection && jsonInput.connection.targetBlock()) {
                this.selectBlock(jsonInput.connection.targetBlock());
                return;
            }
        } else {
            // For other blocks, find the child that was just modified
            const parent = parentBlock.getParent();
            if (parent && parent.inputList) {
                for (const input of parent.inputList) {
                    if (input.connection && input.connection.targetBlock() === parentBlock) {
                        // This input contains our block, so the new child should be here
                        if (parentBlock.getChildren && parentBlock.getChildren().length > 0) {
                            this.selectBlock(parentBlock.getChildren()[0]);
                            return;
                        }
                    }
                }
            }
        }
    }
    
    toggleBooleanValue() {
        if (!this.currentSelection || this.currentSelection.type !== 'boolean') return;
        
        // Find the dropdown field on the boolean block
        const dropdown = this.findDropdownOnBlock(this.currentSelection);
        if (!dropdown) return;
        
        // Get current value
        const currentValue = dropdown.getValue();
        
        // Toggle between 'true' and 'false' (or 0 and 1)
        let newValue;
        if (currentValue === 'true' || currentValue === true || currentValue === 1 || currentValue === '1') {
            newValue = 'false';
        } else {
            newValue = 'true';
        }
        
        // Set the new value
        dropdown.setValue(newValue);
        
        console.log(`Toggled boolean from ${currentValue} to ${newValue}`);
    }
    
    cancelDropdown() {
        this.exitDropdown();
    }
    
    exitDropdown() {
        this.isDropdownOpen = false;
        this.currentDropdown = null;
        console.log('Exited dropdown');
    }
    
    enterFieldEditing(field) {
        this.isFieldEditing = true;
        this.currentField = field;
        
        // Focus the field for editing
        field.showEditor();
        
        console.log('Entered field editing mode');
    }
    
    handleFieldEditing(event) {
        if (event.code === 'Enter') {
            event.preventDefault();
            this.exitFieldEditing();
        }
        // Let other keys pass through to the field editor
    }
    
    exitFieldEditing() {
        if (this.isFieldEditing && this.currentField) {
            // Close the field editor
            if (this.currentField.htmlInput_) {
                this.currentField.htmlInput_.blur();
            }
        }
        
        this.isFieldEditing = false;
        this.currentField = null;
        console.log('Exited field editing mode');
    }
    
    handleShiftPress() {
        if (!this.currentSelection) return;
        
        // Check if this is a custom object block (not an array)
        if (this.currentSelection.type && !this.currentSelection.type.includes('array') && this.currentSelection.type != 'dictionary') {
            // For custom object blocks, find and open the dropdown for optional fields
            const dropdown = this.findDropdownOnBlock(this.currentSelection);
            if (dropdown) {
                this.openDropdown(dropdown);
                console.log('Opened dropdown for custom object block via Shift');
            } else {
                console.log('No dropdown found for custom object block');
            }
        } else {
            const plusButton = this.findPlusButtonOnBlock(this.currentSelection);
            if (plusButton) {
                // Simulate clicking the + button
                if (plusButton.clickHandler_) {
                    plusButton.clickHandler_();
                } else if (plusButton.changeHandler_) {
                    plusButton.changeHandler_();
                }
                console.log('Added child element via Shift');
            }
        }
    }
    
    findPlusButtonOnBlock(block) {
        if (!block || !block.inputList) return null;
        
        for (const input of block.inputList) {
            for (const field of input.fieldRow) {
                if (field instanceof Blockly.FieldTextbutton && 
                    (field.getText() === '+' || field.buttontext_ === '+')) {
                    return field;
                }
            }
        }
        return null;
    }
    
    navigateToParent() {
        if (!this.currentSelection) return;
        
        const parent = this.currentSelection.getParent();
        if (parent) {
            this.selectBlock(parent);
            console.log('Navigated to parent:', parent.type);
        } else {
            console.log('No parent available');
        }
    }
    
    navigateToFirstChild() {
        if (!this.currentSelection) return;
        
        // Get the first valid child by checking parent's inputs
        let firstChild = null;
        if (this.currentSelection.inputList) {
            for (const input of this.currentSelection.inputList) {
                if (input.connection && input.connection.targetBlock()) {
                    const childBlock = input.connection.targetBlock();
                    if (childBlock && !this.isOrphanedBlock(childBlock)) {
                        firstChild = childBlock;
                        break;
                    }
                }
            }
        }
        
        if (firstChild) {
            this.selectBlock(firstChild);
            console.log('Navigated to first child:', firstChild.type);
        } else {
            console.log('No children available');
        }
    }
    
    navigateToPreviousSibling() {
        if (!this.currentSelection) return;
        
        const targetSibling = this.getSiblingByIndex(this.currentSelection, 'previous');
        if (targetSibling) {
            this.selectBlock(targetSibling);
            console.log('Navigated to previous sibling:', targetSibling.type);
        } else {
            console.log('No previous sibling available');
        }
    }
    
    navigateToNextSibling() {
        if (!this.currentSelection) return;
        
        const targetSibling = this.getSiblingByIndex(this.currentSelection, 'next');
        if (targetSibling) {
            this.selectBlock(targetSibling);
            console.log('Navigated to next sibling:', targetSibling.type);
        } else {
            console.log('No next sibling available');
        }
    }
    
    getSiblings(block) {
        const parent = block.getParent();
        if (!parent) {
            // If no parent, siblings are all top-level blocks (excluding orphaned blocks)
            return this.workspace.getTopBlocks(false).filter(b => b.getParent() === null);
        }
        
        // Get children in the order they appear in the parent's inputs (visual order)
        const siblings = [];
        if (parent.inputList) {
            for (const input of parent.inputList) {
                if (input.connection && input.connection.targetBlock()) {
                    const childBlock = input.connection.targetBlock();
                    if (childBlock && !this.isOrphanedBlock(childBlock) && !siblings.includes(childBlock)) {
                        siblings.push(childBlock);
                    }
                }
            }
        }
        
        return siblings;
    }
    
    getSiblingByIndex(block, direction) {
        const parent = block.getParent();
        if (!parent) {
            // If no parent, navigate top-level blocks
            const topBlocks = this.workspace.getTopBlocks(false).filter(b => b.getParent() === null);
            const currentIndex = topBlocks.indexOf(block);
            if (currentIndex === -1) return null;
            
            const targetIndex = direction === 'next' 
                ? (currentIndex + 1) % topBlocks.length 
                : currentIndex === 0 ? topBlocks.length - 1 : currentIndex - 1;
            
            return topBlocks[targetIndex];
        }
        
        // Find the current block's index in its parent
        let currentIndex = -1;
        let validChildren = [];
        
        if (parent.inputList) {
            for (const input of parent.inputList) {
                if (input.connection && input.connection.targetBlock()) {
                    const childBlock = input.connection.targetBlock();
                    if (childBlock && !this.isOrphanedBlock(childBlock)) {
                        validChildren.push(childBlock);
                        if (childBlock === block) {
                            currentIndex = validChildren.length - 1;
                        }
                    }
                }
            }
        }
        
        if (currentIndex === -1 || validChildren.length <= 1) {
            return null;
        }
        
        // Calculate target index
        const targetIndex = direction === 'next' 
            ? (currentIndex + 1) % validChildren.length 
            : currentIndex === 0 ? validChildren.length - 1 : currentIndex - 1;
        
        return validChildren[targetIndex];
    }
}

// Global instance
let keyboardManager = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    keyboardManager = new KeyboardNavigationManager();
});

// Export for use in other files
window.KeyboardNavigationManager = KeyboardNavigationManager;
window.getKeyboardManager = function() {
    return keyboardManager;
}; 