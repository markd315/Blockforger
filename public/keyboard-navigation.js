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
        
        // Override workspace selection methods
        this.overrideWorkspaceSelection();
        
        // Select root block by default
        this.selectRootBlock();
    }
    
    overrideWorkspaceSelection() {
        const self = this;
        
        // Override the workspace's select method
        const originalSelect = this.workspace.select;
        this.workspace.select = function(block) {
            // Clear any existing selection first
            if (self.currentSelection && self.currentSelection !== block) {
                if (typeof self.currentSelection.removeSelect === 'function') {
                    self.currentSelection.removeSelect();
                }
            }
            
            // Clear dropdown mode when a different block is selected (but preserve field editing)
            if (self.currentSelection !== block) {
                self.exitDropdown();
            }
            
            // Update our tracking
            self.currentSelection = block;
            
            // Call original method
            return originalSelect.call(this, block);
        };
    }
    
    setupBlockClickHandlers() {
        // Listen for Blockly's selection events
        if (this.workspace) {
            this.workspace.addChangeListener((event) => {
                if (event.type === Blockly.Events.SELECTED) {
                    if (event.newElementId) {
                        const selectedBlock = this.workspace.getBlockById(event.newElementId);
                        if (selectedBlock) {
                            this.handleBlockSelection(selectedBlock);
                        }
                    }
                }
            });
        }
        
        // Simplified click handling - rely primarily on Blockly's selection events
    }
    
    handleBlockSelection(block) {
        // Clear any existing selection first
        if (this.currentSelection && this.currentSelection !== block) {
            if (typeof this.currentSelection.removeSelect === 'function') {
                this.currentSelection.removeSelect();
            }
        }
        
        // Clear dropdown mode when a different block is selected (but preserve field editing)
        if (this.currentSelection !== block) {
            this.exitDropdown();
        }
        
        // Update our tracking
        this.currentSelection = block;
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
        
        // Handle block changes that might affect navigation
        if (event.type === Blockly.Events.BLOCK_CHANGE || 
            event.type === Blockly.Events.BLOCK_MOVE ||
            event.type === Blockly.Events.BLOCK_CREATE ||
            event.type === Blockly.Events.BLOCK_DELETE) {
            
            // If current selection is affected, refresh it
            // BUT NOT if we're in field editing mode (to prevent focus jumps)
            // AND NOT if this is just a field value change (not structural)
            const isFieldValueChange = event.type === Blockly.Events.BLOCK_CHANGE && 
                                     event.name && 
                                     (event.name === 'field' || event.name.startsWith('field_'));
            
            if (this.currentSelection && event.blockId === this.currentSelection.id && 
                !this.isFieldEditing && !isFieldValueChange) {
                setTimeout(() => {
                    this.refreshCurrentSelection();
                }, 50);
            }
        }
        
        // Handle root block type changes - this is critical for navigation
        if (event.type === Blockly.Events.BLOCK_CHANGE && event.name === 'type') {
            // Check if this is a root block type change
            const changedBlock = this.workspace.getBlockById(event.blockId);
            if (changedBlock && this.isRootBlock(changedBlock)) {
                this.handleRootBlockTypeChange(changedBlock);
            }
        }
    }
    
    isRootBlock(block) {
        // A root block is a start block or a top-level block
        return block.type === 'start' || 
               (block.getParent() === null && this.workspace.getTopBlocks(false).includes(block));
    }
    
    handleRootBlockTypeChange(rootBlock) {
        // Clear ALL selections first
        const allBlocks = this.workspace.getAllBlocks(false);
        for (const block of allBlocks) {
            if (block && typeof block.removeSelect === 'function' && block.isSelected()) {
                block.removeSelect();
            }
        }
        
        // Clear our tracking
        this.currentSelection = null;
        
        // CRITICAL: Clear field editing and dropdown modes
        this.exitFieldEditing();
        this.exitDropdown();
        
        // Wait for the block structure to update, then reselect the root
        setTimeout(() => {
            this.selectRootBlock();
            
            // Also refresh the navigation state
            this.refreshNavigationState();
        }, 200); // Increased timeout to ensure block structure is fully updated
    }
    
    refreshNavigationState() {
        // Rebuild our understanding of the object graph
        if (this.workspace) {
            // Clear any stale selections
            this.currentSelection = null;
            
            // Force clear all modes to ensure clean state
            this.forceClearAllModes();
            
            // Force a complete reset by selecting the root block
            this.selectRootBlock();
        }
    }
    
    refreshCurrentSelection() {
        if (!this.currentSelection) return;
        
        // Check if current selection is still valid
        if (this.currentSelection.isDisposed && this.currentSelection.isDisposed()) {
            this.selectRootBlock();
            return;
        }
        
        // Check if current selection is still connected properly
        if (this.isOrphanedBlock(this.currentSelection)) {
            this.selectRootBlock();
            return;
        }
        
        // Re-select the current block to refresh its state
        this.selectBlock(this.currentSelection);
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
        
        // Check if block is disposed or invalid
        if (block.isDisposed && block.isDisposed()) {
            this.selectRootBlock();
            return;
        }
        
        // Verify the block has the required methods
        if (typeof block.addSelect !== 'function' || typeof block.removeSelect !== 'function') {
            this.selectRootBlock();
            return;
        }
        
        // Don't select orphaned blocks (blocks without proper connections)
        if (this.isOrphanedBlock(block)) {
            this.selectRootBlock();
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
    }
    
    isOrphanedBlock(block) {
        // A block is orphaned if it's not connected to a start block
        if (!block) return true;
        
        // Start blocks are never orphaned
        if (block.type === 'start') {
            return false;
        }
        
        // Check if this block is connected to a start block
        return !this.isConnectedToStartBlock(block);
    }
    
    isConnectedToStartBlock(block) {
        if (!block || !this.workspace) return false;
        
        // If this is a start block, it's connected
        if (block.type === 'start') {
            return true;
        }
        
        // Check if any parent is connected to a start block
        let currentBlock = block;
        const visited = new Set();
        
        while (currentBlock && !visited.has(currentBlock)) {
            visited.add(currentBlock);
            
            // Check if current block is a start block
            if (currentBlock.type === 'start') {
                return true;
            }
            
            // Move to parent
            currentBlock = currentBlock.getParent();
        }
        
        return false;
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
        // Mouse handling is now done through the workspace change listener
        // in setupBlockClickHandlers() which listens for SELECTED events
    }
    
    // Mouse click handlers removed - now handled via workspace change events
    
    forceSelectBlock(block) {
        if (!block) return;
        
        try {
            // Clear ALL existing selections first using Blockly's method
            const selectedBlocks = this.workspace.getSelectedBlocks();
            
            for (const existingBlock of selectedBlocks) {
                if (existingBlock && typeof existingBlock.removeSelect === 'function') {
                    existingBlock.removeSelect();
                }
            }
            
            // Also clear our tracking
            this.currentSelection = null;
            
            // Ensure the block is still valid before selecting
            if (block.isDisposed && block.isDisposed()) {
                this.selectRootBlock();
                return;
            }
            
            // Verify the block has the required methods
            if (typeof block.addSelect !== 'function') {
                this.selectRootBlock();
                return;
            }
            
            // Select the new block
            this.currentSelection = block;
            block.addSelect();
        } catch (error) {
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
        
        // Ensure only one block is selected at a time
        if (blocklySelected && this.currentSelection && blocklySelected !== this.currentSelection) {
            // Clear the other selection
            if (typeof this.currentSelection.removeSelect === 'function') {
                this.currentSelection.removeSelect();
            }
            this.currentSelection = blocklySelected;
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
                // Clear dropdown mode when navigating (but not field editing)
                this.exitDropdown();
                this.navigateToParent();
                break;
                
            case 'ArrowRight':
                event.preventDefault();
                // Clear dropdown mode when navigating (but not field editing)
                this.exitDropdown();
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
                    // Clear dropdown mode when navigating (but not field editing)
                    this.exitDropdown();
                    this.navigateToPreviousSibling();
                }
                break;
                
            case 'ArrowDown':
                if (!this.isDropdownOpen) {
                    event.preventDefault();
                    // Clear dropdown mode when navigating (but not field editing)
                    this.exitDropdown();
                    this.navigateToNextSibling();
                }
                break;
                
            case 'Delete':
                event.preventDefault();
                this.handleDeleteKey();
                break;
            case 'Minus':
            case 'NumpadSubtract':
                // Don't handle minus key if we're editing a field (let user type minus)
                if (this.isFieldEditing) {
                    return;
                }
                event.preventDefault();
                this.handleMinusKey();
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
        // Enter: Edit primitive fields OR toggle boolean/enum values
        
        // Special case for boolean: cycle through values directly
        if (this.currentSelection.type === 'boolean') {
            this.toggleBooleanValue();
            return;
        }
        
        // Special case for enum: cycle through enum values directly
        if (this.currentSelection.type === 'string_enum') {
            this.toggleEnumValue();
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
        
    }
    
    toggleEnumValue() {
        if (!this.currentSelection || this.currentSelection.type !== 'string_enum') return;
        
        // Call the toggle method on the enum block
        if (typeof this.currentSelection.toggleEnumValue === 'function') {
            this.currentSelection.toggleEnumValue();
        }
    }
    
    cancelDropdown() {
        this.exitDropdown();
    }
    
    exitDropdown() {
        this.isDropdownOpen = false;
        this.currentDropdown = null;
    }
    
    forceClearAllModes() {
        this.exitFieldEditing();
        this.exitDropdown();
    }
    
    enterFieldEditing(field) {
        this.isFieldEditing = true;
        this.currentField = field;
        
        // Focus the field for editing
        field.showEditor();
        
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
    }
    
    handleDeleteKey() {
        // Delete: Remove deletable elements (optional fields, array elements)
        if (!this.currentSelection) return;
        
        const selectedBlock = this.currentSelection;
        if (selectedBlock.type === 'start') return; // Don't delete root block
        
        // Check if this block is connected to a deletable input
        const parentBlock = selectedBlock.getParent();
        if (parentBlock) {
            // Find the input this block is connected to
            for (const input of parentBlock.inputList) {
                if (input.connection && input.connection.targetBlock() === selectedBlock) {
                    // Check if this input has a delete button (optional field or array element)
                    const hasDeleteButton = input.fieldRow.some(field => 
                        field instanceof Blockly.FieldTextbutton && 
                        field.getText && field.getText() === '–'
                    );
                    
                    if (hasDeleteButton) {
                        // Store parent for focus return
                        const parentToFocus = parentBlock;
                        
                        // Determine if this is an array or optional field based on parent type
                        const isArray = parentBlock.type.endsWith('_array') || parentBlock.type === 'dynarray';
                        
                        // Use the proper deletion method with reindexing
                        if (isArray && typeof parentBlock.deleteElementInput === 'function') {
                            parentBlock.deleteElementInput(input);
                        } else if (typeof parentBlock.deleteKeyValuePairInput === 'function') {
                            parentBlock.deleteKeyValuePairInput(input);
                        } else {
                            // Fallback: use the delete button click handler
                            const deleteButton = input.fieldRow.find(field => 
                                field instanceof Blockly.FieldTextbutton && 
                                field.getText && field.getText() === '–'
                            );
                            
                            if (deleteButton && deleteButton.clickHandler_) {
                                deleteButton.clickHandler_();
                            } else {
                                return;
                            }
                        }
                        
                        // Update JSON area after deletion
                        if (typeof updateJSONarea === 'function') {
                            updateJSONarea(parentBlock.workspace);
                        }
                        
                        // Return focus to parent after a short delay
                        setTimeout(() => {
                            this.selectBlock(parentToFocus);
                        }, 50);
                        
                        return;
                    }
                    break;
                }
            }
        }
        
        // If no deletable input found, try to delete the block itself if it's deletable
        if (selectedBlock.isDeletable()) {
            selectedBlock.dispose(true, true);
            // Return focus to root block
            this.selectRootBlock();
        }
    }
    
    handleMinusKey() {
        // Minus key: Delete optional fields or array elements and return focus to parent
        if (!this.currentSelection) return;
        
        const selectedBlock = this.currentSelection;
        if (selectedBlock.type === 'start') return; // Don't delete root block
        
        // Check if this block is connected to a deletable input (optional field or array element)
        const parentBlock = selectedBlock.getParent();
        if (parentBlock) {
            // Find the input this block is connected to
            for (const input of parentBlock.inputList) {
                if (input.connection && input.connection.targetBlock() === selectedBlock) {
                    // Check if this input has a delete button (optional field or array element)
                    const hasDeleteButton = input.fieldRow.some(field => 
                        field instanceof Blockly.FieldTextbutton && 
                        field.getText && field.getText() === '–'
                    );
                    
                    if (hasDeleteButton) {
                        // Store parent for focus return
                        const parentToFocus = parentBlock;
                        
                        // Determine if this is an array or optional field based on parent type
                        const isArray = parentBlock.type.endsWith('_array') || parentBlock.type === 'dynarray';
                        
                        // Use the proper deletion method with reindexing
                        if (isArray && typeof parentBlock.deleteElementInput === 'function') {
                            parentBlock.deleteElementInput(input);
                        } else if (typeof parentBlock.deleteKeyValuePairInput === 'function') {
                            parentBlock.deleteKeyValuePairInput(input);
                        } else {
                            // Fallback: use the delete button click handler
                            const deleteButton = input.fieldRow.find(field => 
                                field instanceof Blockly.FieldTextbutton && 
                                field.getText && field.getText() === '–'
                            );
                            
                            if (deleteButton && deleteButton.clickHandler_) {
                                deleteButton.clickHandler_();
                            } else {
                                return;
                            }
                        }
                        
                        // Update JSON area after deletion
                        if (typeof updateJSONarea === 'function') {
                            updateJSONarea(parentBlock.workspace);
                        }
                        
                        // Return focus to parent after a short delay
                        setTimeout(() => {
                            this.selectBlock(parentToFocus);
                        }, 50);
                        
                        return;
                    }
                    break;
                }
            }
        }
        
    }
    
    handleShiftPress() {
        if (!this.currentSelection) return;
        
        // Check if this is a custom object block (not an array)
        if (this.currentSelection.type && !this.currentSelection.type.includes('array') && this.currentSelection.type != 'dictionary') {
            // For custom object blocks, find and open the dropdown for optional fields
            const dropdown = this.findDropdownOnBlock(this.currentSelection);
            if (dropdown) {
                this.openDropdown(dropdown);
            } else {
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
        
        // Check if current selection is still valid
        if (this.currentSelection.isDisposed && this.currentSelection.isDisposed()) {
            this.selectRootBlock();
            return;
        }
        
        const parent = this.currentSelection.getParent();
        if (parent) {
            this.selectBlock(parent);
        } else {
            // If no parent and this is an orphaned block, go to start block
            if (this.isOrphanedBlock(this.currentSelection)) {
                this.selectRootBlock();
            } else {
            }
        }
    }
    
    navigateToFirstChild() {
        if (!this.currentSelection) return;
        
        // Check if current selection is still valid
        if (this.currentSelection.isDisposed && this.currentSelection.isDisposed()) {
            this.selectRootBlock();
            return;
        }
        
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
        } else {
        }
    }
    
    navigateToPreviousSibling() {
        if (!this.currentSelection) return;
        
        // Check if current selection is still valid
        if (this.currentSelection.isDisposed && this.currentSelection.isDisposed()) {
            this.selectRootBlock();
            return;
        }
        
        const targetSibling = this.getSiblingByIndex(this.currentSelection, 'previous');
        if (targetSibling) {
            this.selectBlock(targetSibling);
        } else {
        }
    }
    
    navigateToNextSibling() {
        if (!this.currentSelection) return;
        
        // Check if current selection is still valid
        if (this.currentSelection.isDisposed && this.currentSelection.isDisposed()) {
            this.selectRootBlock();
            return;
        }
        
        const targetSibling = this.getSiblingByIndex(this.currentSelection, 'next');
        if (targetSibling) {
            this.selectBlock(targetSibling);
        } else {
        }
    }
    
    getSiblings(block) {
        const parent = block.getParent();
        if (!parent) {
            // If no parent, siblings are only start blocks (not orphaned blocks)
            return this.workspace.getTopBlocks(false).filter(b => b.type === 'start');
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
            // If no parent, navigate only start blocks (not orphaned blocks)
            const startBlocks = this.workspace.getTopBlocks(false).filter(b => b.type === 'start');
            const currentIndex = startBlocks.indexOf(block);
            if (currentIndex === -1) return null;
            
            const targetIndex = direction === 'next' 
                ? (currentIndex + 1) % startBlocks.length 
                : currentIndex === 0 ? startBlocks.length - 1 : currentIndex - 1;
            
            return startBlocks[targetIndex];
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
        
        
        if (currentIndex === -1) {
            // Try to find the block by checking all children more thoroughly
            for (let i = 0; i < validChildren.length; i++) {
                if (validChildren[i].id === block.id) {
                    currentIndex = i;
                    break;
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