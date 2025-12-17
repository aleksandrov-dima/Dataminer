// Content Script - Visual element selector
// Version: 1.0.0

(function() {
    'use strict';
    
    // Prevent multiple initializations
    if (window.OnPageContentScript) {
        return;
    }
    
    // Global namespace
    window.OnPageContentScript = true;
    
    class OnPageContentScript {
        constructor() {
            this.isInitialized = false;
            this.isSelecting = false;
            this.overlay = null;
            this.instructionPanel = null;
            // On-page panel
            this.panelHost = null;
            this.panelShadow = null;
            this.panelOpen = false;
            this.panelActiveTab = 'fields'; // fields | preview
            this.panelSelecting = false;
            this.fieldElementsById = new Map();
            this.previewDirty = true;
            this._saveTimer = null;
            this.origin = null;
            this.state = { version: 1, fields: [], columns: {}, updatedAt: Date.now() };
            this.lastPreviewRows = [];
            this.previewHighlights = new Set();
            this.selectedElements = [];
            this.highlightedElement = null;
            this.eventHandlers = {};
            
            this.init();
        }
        
        // Utility function to safely get className as string
        getElementClassName(element) {
            if (!element || !element.className) return '';
            return element.className.toString().trim();
        }
        
        init() {
            if (this.isInitialized) return;
            
            // Bind event handlers
            this.eventHandlers = {
                mouseover: this.handleMouseOver.bind(this),
                mouseout: this.handleMouseOut.bind(this),
                click: this.handleClick.bind(this),
                message: this.handleMessage.bind(this)
            };
            
            // Listen for messages from popup/background
            chrome.runtime.onMessage.addListener(this.eventHandlers.message);
            
            // Create UI elements
            this.createUI();

            // Create panel and load persisted state
            this.initPanel();
            this.loadStateForCurrentOrigin().then(() => {
                this.renderPanel();
            }).catch(() => {
                this.renderPanel();
            });
            
            this.isInitialized = true;
        }
        
        createUI() {
            // Remove existing UI if any
            this.removeUI();
            
            // Add CSS classes for selection styling
            this.addSelectionStyles();
            
            // Create overlay
            this.overlay = this.createElement('div', {
                id: 'onpage-overlay',
                style: `
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100vw !important;
                    height: 100vh !important;
                    background: rgba(26, 26, 26, 0.03) !important;
                    z-index: 2147483647 !important;
                    pointer-events: none !important;
                    display: none !important;
                `
            });
            
            // Create instruction panel
            this.instructionPanel = this.createElement('div', {
                id: 'onpage-instructions',
                style: `
                    position: fixed !important;
                    top: 20px !important;
                    right: 20px !important;
                    background: #1a1a1a !important;
                    color: #faf9f6 !important;
                    padding: 24px !important;
                    border: 3px solid #d42c2c !important;
                    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.4) !important;
                    z-index: 2147483648 !important;
                    max-width: 360px !important;
                    font-family: 'Source Sans Pro', -apple-system, BlinkMacSystemFont, sans-serif !important;
                    display: none !important;
                    pointer-events: auto !important;
                    backdrop-filter: blur(20px) !important;
                `
            });
            
            this.instructionPanel.innerHTML = `
                <div style="text-align: center; margin-bottom: 20px;">
                    <p style="margin: 0; font-size: 14px; opacity: 0.9; text-transform: uppercase; letter-spacing: 0.5px;">Hover to highlight • Click to select multiple</p>
                </div>
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button id="onpage-finish" style="
                        background: #faf9f6 !important;
                        color: #1a1a1a !important;
                        border: 1px solid #faf9f6 !important;
                        padding: 12px 24px !important;
                        cursor: pointer !important;
                        font-size: 14px !important;
                        font-weight: 600 !important;
                        transition: all 0.2s !important;
                        text-transform: uppercase !important;
                        letter-spacing: 0.5px !important;
                        font-family: 'Source Sans Pro', sans-serif !important;
                    ">Finish</button>
                    <button id="onpage-cancel" style="
                        background: transparent !important;
                        color: #faf9f6 !important;
                        border: 1px solid #faf9f6 !important;
                        padding: 12px 24px !important;
                        cursor: pointer !important;
                        font-size: 14px !important;
                        font-weight: 600 !important;
                        transition: all 0.2s !important;
                        text-transform: uppercase !important;
                        letter-spacing: 0.5px !important;
                        font-family: 'Source Sans Pro', sans-serif !important;
                    ">Cancel</button>
                </div>
                <div id="onpage-selection-count" style="
                    text-align: center; 
                    margin-top: 16px; 
                    font-size: 12px; 
                    opacity: 0.8;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                ">0 elements selected</div>
            `;
            
            // Add hover effects
            const finishBtn = this.instructionPanel.querySelector('#onpage-finish');
            const cancelBtn = this.instructionPanel.querySelector('#onpage-cancel');
            
            finishBtn.addEventListener('mouseenter', () => {
                finishBtn.style.background = '#1a1a1a !important';
                finishBtn.style.color = '#faf9f6 !important';
            });
            finishBtn.addEventListener('mouseleave', () => {
                finishBtn.style.background = '#faf9f6 !important';
                finishBtn.style.color = '#1a1a1a !important';
            });
            
            cancelBtn.addEventListener('mouseenter', () => {
                cancelBtn.style.background = '#faf9f6 !important';
                cancelBtn.style.color = '#1a1a1a !important';
            });
            cancelBtn.addEventListener('mouseleave', () => {
                cancelBtn.style.background = 'transparent !important';
                cancelBtn.style.color = '#faf9f6 !important';
            });
            
            // Add event listeners
            finishBtn.addEventListener('click', () => this.finishSelection());
            cancelBtn.addEventListener('click', () => this.cancelSelection());
            
            // Append to document
            document.body.appendChild(this.overlay);
            document.body.appendChild(this.instructionPanel);
        }
        
        createElement(tag, attributes = {}) {
            const element = document.createElement(tag);
            Object.keys(attributes).forEach(key => {
                if (key === 'style') {
                    element.style.cssText = attributes[key];
                } else {
                    element.setAttribute(key, attributes[key]);
                }
            });
            return element;
        }
        
        addSelectionStyles() {
            // Add CSS classes for hover and selection states
            if (!document.getElementById('onpage-selection-styles')) {
                const style = document.createElement('style');
                style.id = 'onpage-selection-styles';
                style.textContent = `
                    /* Hover state - clean blue border */
                    .onpage-hover-element {
                        border: 2px solid #3b82f6 !important;
                        outline: none !important;
                        transition: all 0.2s ease !important;
                        position: relative !important;
                        z-index: 1000 !important;
                    }
                    
                    /* Selected state - persistent blue border with subtle background */
                    .onpage-selected-element {
                        border: 2px solid #3b82f6 !important;
                        background-color: rgba(59, 130, 246, 0.1) !important;
                        outline: none !important;
                        position: relative !important;
                        z-index: 1001 !important;
                        transition: all 0.2s ease !important;
                    }
                    
                    /* Ensure selected state overrides hover */
                    .onpage-selected-element.onpage-hover-element {
                        background-color: rgba(59, 130, 246, 0.15) !important;
                    }
                    
                    /* Restore box-sizing to prevent layout shifts */
                    .onpage-hover-element,
                    .onpage-selected-element {
                        box-sizing: border-box !important;
                    }

                    /* Dataminer preview highlight */
                    .dataminer-preview-highlight {
                        outline: 2px dashed #f59e0b !important;
                        outline-offset: 2px !important;
                        background-color: rgba(245, 158, 11, 0.12) !important;
                    }
                `;
                document.head.appendChild(style);
            }
        }

        createElementTooltip(element) {
            this.removeElementTooltip();
            
            const rect = element.getBoundingClientRect();
            const tooltip = this.createElement('div', {
                id: 'onpage-element-tooltip',
                style: `
                    position: fixed !important;
                    top: ${rect.top - 60}px !important;
                    left: ${rect.left}px !important;
                    background: #1a1a1a !important;
                    color: #faf9f6 !important;
                    padding: 8px 12px !important;
                    font-family: 'Source Sans Pro', monospace !important;
                    font-size: 12px !important;
                    font-weight: 500 !important;
                    z-index: 2147483649 !important;
                    pointer-events: none !important;
                    border: 1px solid #d42c2c !important;
                    max-width: 300px !important;
                    word-break: break-word !important;
                    text-transform: uppercase !important;
                    letter-spacing: 0.5px !important;
                `
            });
            
            const tagName = element.tagName.toLowerCase();
            // Safely handle className using utility function
            const classNameStr = this.getElementClassName(element);
            const className = classNameStr ? `.${classNameStr.split(' ')[0]}` : '';
            const id = element.id ? `#${element.id}` : '';
            
            tooltip.textContent = `${tagName}${id}${className}`;
            document.body.appendChild(tooltip);
            this.currentTooltip = tooltip;
        }

        removeElementTooltip() {
            if (this.currentTooltip) {
                this.currentTooltip.remove();
                this.currentTooltip = null;
            }
        }

        removeUI() {
            if (this.overlay) {
                this.overlay.remove();
                this.overlay = null;
            }
            if (this.instructionPanel) {
                this.instructionPanel.remove();
                this.instructionPanel = null;
            }
            this.removeElementTooltip();
            
            // Remove selection styles
            const selectionStyle = document.getElementById('onpage-selection-styles');
            if (selectionStyle) {
                selectionStyle.remove();
            }
        }
        
        handleMessage(message, sender, sendResponse) {
            try {
                switch (message.action) {
                    case 'startElementSelection':
                        this.startElementSelection(message.existingElements);
                        sendResponse({ success: true });
                        break;
                    
                    case 'stopElementSelection':
                        this.stopElementSelection();
                        sendResponse({ success: true });
                        break;
                    
                    case 'getSelectedElements':
                        sendResponse({ 
                            success: true, 
                            elements: this.selectedElements.map(el => ({
                                name: el.name,
                                selector: el.selector
                            }))
                        });
                        break;
                    
                    case 'clearAllHighlights':
                        this.clearAllHighlights();
                        this.selectedElements = [];
                        sendResponse({ success: true });
                        break;
                    
                    case 'ping':
                        sendResponse({ success: true, message: 'Content script is ready' });
                        break;

                    case 'togglePanel':
                        this.togglePanel();
                        sendResponse({ success: true, open: this.panelOpen });
                        break;

                    case 'openPanel':
                        this.openPanel();
                        sendResponse({ success: true, open: true });
                        break;

                    case 'closePanel':
                        this.closePanel();
                        sendResponse({ success: true, open: false });
                        break;
                    
                    default:
                        sendResponse({ success: false, error: 'Unknown action' });
                }
            } catch (error) {
                console.log('OnPage message handler error:', error);
                sendResponse({ success: false, error: error.message });
            }
        }
        
        startElementSelection(existingElements = null) {
            if (this.isSelecting) return;
            
            this.isSelecting = true;
            // Preload existing selected fields (so user can add one more without losing previous)
            this.selectedElements = [];
            if (Array.isArray(existingElements) && existingElements.length > 0) {
                this.preloadSelectedElements(existingElements);
            }
            
            // Legacy UI (Finish/Cancel) is no longer used in the on-page-first UX; keep hidden
            if (this.overlay) this.overlay.style.display = 'none';
            if (this.instructionPanel) this.instructionPanel.style.display = 'none';
            
            // Add event listeners
            document.addEventListener('mouseover', this.eventHandlers.mouseover, true);
            document.addEventListener('mouseout', this.eventHandlers.mouseout, true);
            document.addEventListener('click', this.eventHandlers.click, true);
            
            // Do not lock page scrolling
            document.body.style.overflow = '';
            
            // Update selection count
            this.updateSelectionCount();
            
        }

        preloadSelectedElements(existingElements) {
            try {
                existingElements.forEach((item) => {
                    if (!item || !item.selector) return;
                    let el = null;
                    try {
                        el = document.querySelector(item.selector);
                    } catch (e) {
                        el = null;
                    }

                    const elementData = {
                        id: item.id || this.generateFieldId(),
                        name: item.name || 'field',
                        selector: item.selector,
                        dataType: item.dataType || 'textContent',
                        parentSelector: item.parentSelector || null,
                        element: el
                    };

                    // Avoid duplicating selectors
                    const already = this.selectedElements.some(se => se.selector === elementData.selector && se.name === elementData.name);
                    if (already) return;

                    this.selectedElements.push(elementData);
                    if (el && !this.isOnPageElement(el)) {
                        el.classList.add('onpage-selected-element');
                    }
                });
            } catch (e) {
                console.log('Error preloading selected elements:', e);
            }
        }
        
        stopElementSelection() {
            if (!this.isSelecting) return;
            
            this.isSelecting = false;
            
            // Hide UI
            this.overlay.style.display = 'none';
            this.instructionPanel.style.display = 'none';
            
            // Remove event listeners
            document.removeEventListener('mouseover', this.eventHandlers.mouseover, true);
            document.removeEventListener('mouseout', this.eventHandlers.mouseout, true);
            document.removeEventListener('click', this.eventHandlers.click, true);
            
            // Restore page scrolling (we no longer lock it, but keep for safety)
            document.body.style.overflow = '';
            
            // Remove highlights
            this.removeHighlight();
        }
        
        handleMouseOver(event) {
            if (!this.isSelecting) {
                return;
            }
            
            const element = event.target;
            
            // Skip if it's our UI elements
            if (this.isOnPageElement(element)) {
                return;
            }
            
            this.highlightElement(element);
        }
        
        handleMouseOut(event) {
            if (!this.isSelecting) return;
            this.removeHighlight();
        }
        
        handleClick(event) {
            if (!this.isSelecting) {
                return;
            }
            
            const element = event.target;
            
            // Skip if it's our UI elements
            if (this.isOnPageElement(element)) {
                return;
            }
            
            event.preventDefault();
            event.stopPropagation();

            // New UX: when selection was started from the on-page panel,
            // each click immediately creates/updates fields in the panel.
            if (this.panelSelecting) {
                this.addFieldFromClickedElement(element);
            } else {
                this.selectElement(element);
            }
        }
        
        isOnPageElement(element) {
            // Block clicks on overlay and instruction panel elements
            return element === this.overlay || 
                   element === this.instructionPanel ||
                   element === this.panelHost ||
                   element?.closest?.('#dataminer-panel-host') ||
                   element.closest('#onpage-overlay') || 
                   element.closest('#onpage-instructions') ||
                   element.id === 'onpage-finish' ||
                   element.id === 'onpage-cancel' ||
                   element.id === 'onpage-selection-count';
        }
        
        highlightElement(element) {
            this.removeHighlight();
            
            // Skip if it's our UI elements
            if (this.isOnPageElement(element)) {
                return;
            }
            
            // Add hover class (CSS will handle the styling)
            element.classList.add('onpage-hover-element');
            
            this.highlightedElement = element;
            this.createElementTooltip(element);
        }
        
        removeHighlight() {
            if (this.highlightedElement) {
                // Simply remove the hover class (CSS handles the rest)
                this.highlightedElement.classList.remove('onpage-hover-element');
                this.highlightedElement = null;
            }
            this.removeElementTooltip();
        }
        
        selectElement(element) {
            const selector = this.generateSelector(element);
            const name = this.generateElementName(element);
            const dataType = this.getDataType(element);
            
            // Check if this element is already selected
            const existingIndex = this.selectedElements.findIndex(item => item.element === element);
            
            if (existingIndex !== -1) {
                // Deselect this specific element
                this.deselectElement(existingIndex);
            } else {
                // Add new selection (multi-selection mode)
                const elementData = {
                    id: this.generateFieldId(),
                    name: name,
                    selector: selector,
                    dataType: dataType, // Save data type (textContent/href/src)
                    element: element
                };
                
                this.selectedElements.push(elementData);
                
                // Apply selected class (CSS handles styling)
                element.classList.add('onpage-selected-element');
            }
            
            this.updateSelectionCount();
        }
        
        // Determine data type based on element
        getDataType(element) {
            if (!element) return 'textContent';

            // Shared logic (browser + tests)
            try {
                if (window.DataminerOnPageUtils && typeof window.DataminerOnPageUtils.inferDataType === 'function') {
                    return window.DataminerOnPageUtils.inferDataType(element);
                }
            } catch (e) {}

            // Fallback
            const tag = (element.tagName || '').toUpperCase();
            if (tag === 'A') return 'href';
            if (tag === 'IMG') return 'src';
            return 'textContent';
        }
        
        deselectElement(index) {
            // Remove selected class from specific element
            const elementData = this.selectedElements[index];
            if (elementData && elementData.element) {
                elementData.element.classList.remove('onpage-selected-element');
            }
            
            // Remove from selection array
            this.selectedElements.splice(index, 1);
        }
        
        clearSelection() {
            // Remove selected class from all previously selected elements
            this.selectedElements.forEach(item => {
                if (item.element) {
                    item.element.classList.remove('onpage-selected-element');
                }
            });
            
            // Clear the selection array
            this.selectedElements = [];
        }
        
        generateSelector(element) {
            if (!element || element === document) return '';
            
            // Try ID first (most specific)
            if (element.id) {
                const selector = `#${element.id}`;
                // Test if selector finds multiple elements (should be unique)
                const testElements = document.querySelectorAll(selector);
                if (testElements.length === 1) {
                    return selector;
                }
            }
            
            // Try data attributes (good for testing)
            if (element.dataset.testid) {
                const selector = `[data-testid="${element.dataset.testid}"]`;
                return selector;
            }
            
            if (element.dataset.cy) {
                const selector = `[data-cy="${element.dataset.cy}"]`;
                return selector;
            }
            
            // Build from tag and classes
            let selector = element.tagName.toLowerCase();
            
            // Safely get className as string using utility function
            const classNameStr = this.getElementClassName(element);
            if (classNameStr) {
                const allClasses = classNameStr.split(/\s+/);
                
                const cleanClasses = allClasses.filter(cls => 
                    cls.length > 0 && 
                    !cls.startsWith('onpage-') // Exclude our temporary classes
                );
                
                if (cleanClasses.length > 0) {
                    // Use only the first meaningful class for more flexible matching
                    // This prevents over-specific selectors that break when elements have different class combinations
                    // For example: use "a.a-size-mini" instead of "a.a-size-mini.a-size-small.span"
                    selector += '.' + cleanClasses[0];
                }
            }
            
            // Test selector to see how many elements it matches
            try {
                const testElements = document.querySelectorAll(selector);
                // Don't add nth-child - it's unreliable and can break when DOM structure changes
                // Instead, rely on filtering visible elements and order during extraction
                // This makes the selector more robust and reusable
            } catch (error) {
                console.log('Selector test failed:', error);
            }
            
            return selector;
        }
        
        generateElementName(element) {
            // Try to get meaningful name from various attributes
            // Keep original field names without formatting (no spaces, no uppercase)
            if (element.id) {
                return element.id; // Keep original: field_domain
            }
            
            if (element.dataset.testid) {
                return element.dataset.testid; // Keep original: field_domain
            }
            
            // Safely get className as string using utility function
            const classNameStr = this.getElementClassName(element);
            if (classNameStr) {
                const classes = classNameStr.split(/\s+/);
                // Filter out onpage- classes and find the most relevant class
                const relevantClasses = classes.filter(cls => !cls.startsWith('onpage-'));
                if (relevantClasses.length > 0) {
                    return relevantClasses[0]; // Keep original: field_domain
                }
            }
            
            // Use tag name with text content if available
            const text = element.textContent?.trim();
            if (text && text.length > 0 && text.length < 50) {
                return `${element.tagName.toLowerCase()}_${text.replace(/\s+/g, '_').toLowerCase()}`;
            }
            
            // Fallback to tag name
            return element.tagName.toLowerCase();
        }
        
        updateSelectionCount() {
            const countElement = this.instructionPanel?.querySelector('#onpage-selection-count');
            if (countElement) {
                const count = this.selectedElements.length;
                countElement.textContent = `${count} element${count !== 1 ? 's' : ''} selected`;
            }
        }
        
        // Find common parent container for selected elements
        findCommonParent(elements) {
            if (elements.length === 0) return null;
            
            // Collect all parent paths
            const parentPaths = elements.map(el => {
                const path = [];
                let current = el.element;
                let depth = 0;
                while (current && current !== document.body && current !== document.documentElement && depth < 15) {
                    path.push(current);
                    current = current.parentElement;
                    depth++;
                }
                return path;
            });
            
            if (parentPaths.length === 0) return null;
            
            // Find the deepest common ancestor
            let commonParent = null;
            const firstPath = parentPaths[0];
            
            // Check each level of the first path
            for (let i = 0; i < firstPath.length; i++) {
                const candidate = firstPath[i];
                // Check if all other paths contain this element
                const isCommon = parentPaths.every(path => path.includes(candidate));
                
                if (isCommon) {
                    // Check if this is a meaningful container
                    const className = this.getElementClassName(candidate).toLowerCase();
                    const tagName = candidate.tagName.toLowerCase();

                    // Prefer "repeating item containers" when available:
                    // if the candidate uses a stable data attribute that appears on multiple similar siblings,
                    // it's usually a better row/container boundary for aligning fields.
                    const componentType = candidate.getAttribute && candidate.getAttribute('data-component-type');
                    if (componentType) {
                        try {
                            const sameTypeCount = document.querySelectorAll(
                                `${candidate.tagName.toLowerCase()}[data-component-type="${componentType}"]`
                            ).length;
                            if (sameTypeCount > 1) {
                                return candidate;
                            }
                        } catch (e) {}
                    }
                    
                    // Skip links (a tags) as they're usually inside cards, not the card itself
                    if (tagName === 'a') {
                        // Skip links, continue to parent
                        continue;
                    }
                    
                    // Prefer containers with meaningful classes or structure
                    if (className.includes('card') || className.includes('item') || 
                        className.includes('product') || className.includes('result') ||
                        className.includes('listing') || className.includes('grid') ||
                        className.includes('container') || className.includes('wrapper') ||
                        className.includes('s-result-item') || className.includes('s-card-container') ||
                        tagName === 'article' || tagName === 'section' ||
                        (tagName === 'div' && className.length > 0)) {
                        commonParent = candidate;
                        // Continue searching for deeper common parent
                    } else if (!commonParent) {
                        // Use as fallback if no better parent found
                        commonParent = candidate;
                    }
                } else {
                    // No more common ancestors, return the last found
                    break;
                }
            }
            
            // If we found a link as common parent, try to find its parent container
            if (commonParent && commonParent.tagName.toLowerCase() === 'a') {
                let parent = commonParent.parentElement;
                let depth = 0;
                while (parent && parent !== document.body && depth < 3) {
                    const className = this.getElementClassName(parent).toLowerCase();
                    const tagName = parent.tagName.toLowerCase();
                    const componentType = parent.getAttribute && parent.getAttribute('data-component-type');
                    if (componentType) {
                        try {
                            const sameTypeCount = document.querySelectorAll(
                                `${parent.tagName.toLowerCase()}[data-component-type="${componentType}"]`
                            ).length;
                            if (sameTypeCount > 1) {
                                return parent;
                            }
                        } catch (e) {}
                    }
                    if (className.includes('card') || className.includes('item') || 
                        className.includes('product') || className.includes('result') ||
                        className.includes('s-result-item') || className.includes('s-card-container') ||
                        tagName === 'article' || tagName === 'section') {
                        return parent;
                    }
                    parent = parent.parentElement;
                    depth++;
                }
            }
            
            return commonParent || firstPath[0]?.parentElement || null;
        }
        
        // Generate selector for parent container
        generateParentSelector(parent) {
            if (!parent || parent === document.body || parent === document.documentElement) {
                return null;
            }

            // Prefer stable repeating container selectors based on data attributes (site-agnostic).
            const componentType = parent.getAttribute && parent.getAttribute('data-component-type');
            if (componentType) {
                try {
                    const tag = parent.tagName.toLowerCase();
                    const sel = `${tag}[data-component-type="${componentType}"]`;
                    const count = document.querySelectorAll(sel).length;
                    if (count > 1) {
                        return sel;
                    }
                } catch (e) {}
            }
            
            // Try ID first
            if (parent.id) {
                return `#${parent.id}`;
            }
            
            // Try data attributes
            if (parent.dataset.testid) {
                return `[data-testid="${parent.dataset.testid}"]`;
            }
            
            // Try classes - prefer meaningful container classes
            const classNameStr = this.getElementClassName(parent);
            if (classNameStr) {
                const classes = classNameStr.split(/\s+/).filter(cls => 
                    cls.length > 0 && 
                    !cls.startsWith('onpage-')
                );
                if (classes.length > 0) {
                    // Use all classes for specificity
                    return `${parent.tagName.toLowerCase()}.${classes.join('.')}`;
                }
            }
            
            // Fallback to tag name
            return parent.tagName.toLowerCase();
        }

        // Refine a selector for a selected element within a known parent container.
        // This helps avoid overly-generic selectors (e.g., ".a-color-base") that match multiple nodes inside a card (brand, price, etc.).
        refineSelectorWithinParent(element, parentContainer) {
            if (!element || !parentContainer) return null;

            // If element has a unique id inside parent, prefer it
            if (element.id) {
                const sel = `#${CSS.escape ? CSS.escape(element.id) : element.id}`;
                try {
                    const matches = parentContainer.querySelectorAll(sel);
                    if (matches.length === 1 && matches[0] === element) return sel;
                } catch (e) {}
            }

            const tag = element.tagName ? element.tagName.toLowerCase() : '';
            if (!tag) return null;

            const classNameStr = this.getElementClassName(element);
            const classes = classNameStr
                ? classNameStr.split(/\s+/).filter(c => c.length > 0 && !c.startsWith('onpage-'))
                : [];

            // Start with the existing strategy (tag + first class), then progressively add classes until unique within parent.
            const candidates = [];
            if (classes.length > 0) {
                let current = `${tag}.${classes[0]}`;
                candidates.push(current);
                for (let i = 1; i < classes.length; i++) {
                    current += `.${classes[i]}`;
                    candidates.push(current);
                }
            } else {
                candidates.push(tag);
            }

            let best = null;
            let bestCount = Infinity;

            for (const sel of candidates) {
                try {
                    const matches = Array.from(parentContainer.querySelectorAll(sel));
                    if (matches.length === 0) continue;
                    if (!matches.includes(element)) continue;

                    if (matches.length < bestCount) {
                        best = sel;
                        bestCount = matches.length;
                    }

                    if (matches.length === 1 && matches[0] === element) {
                        // Perfectly unique inside the card.
                        return sel;
                    }
                } catch (e) {
                    // ignore invalid selector
                }
            }

            return best;
        }

        finishSelection() {
            if (this.selectedElements.length === 0) {
                this.cancelSelection();
                return;
            }
            
            try {
                // Find common parent container
                const commonParent = this.findCommonParent(this.selectedElements);
                let parentSelector = null;
                
                if (commonParent) {
                    parentSelector = this.generateParentSelector(commonParent);
                    if (parentSelector) {
                        console.log('📦 Common parent found:', parentSelector, commonParent);
                    }
                }
                
                // Store selected elements with data type and parent selector
                const elements = this.selectedElements.map(el => ({
                    id: el.id || this.generateFieldId(),
                    name: el.name,
                    selector: (() => {
                        // Refine selector within the common parent container when possible (avoids "a-color-base" ambiguity)
                        const refined = (commonParent && el.element) ? this.refineSelectorWithinParent(el.element, commonParent) : null;
                        return refined || el.selector;
                    })(),
                    dataType: el.dataType || 'textContent', // Include data type
                    parentSelector: parentSelector // Include parent selector to limit search scope
                }));
                
                // Persist into new on-page state storage (origin-scoped)
                this.applyFieldsFromSelection(elements);

                // Backward compatibility: notify background/popup listeners
                try {
                    chrome.runtime.sendMessage({
                        action: 'elementSelectionComplete',
                        elements
                    }).catch(() => {});
                } catch (e) {}
                
                // Keep selected elements highlighted but remove overlay
                this.keepSelectedElementsHighlighted();
                this.hideSelectionUI();
                
                // Show success message
                this.showSuccessMessage(`Selected ${elements.length} element(s) successfully!`);
                
            } catch (error) {
                console.log('❌ Error finishing selection:', error);
            }
        }

        // -----------------------------
        // On-page panel + state storage
        // -----------------------------

        generateFieldId() {
            try {
                if (crypto && typeof crypto.randomUUID === 'function') {
                    return `fld_${crypto.randomUUID()}`;
                }
            } catch (e) {}
            return `fld_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        }

        getOriginSafe() {
            try {
                return location.origin || null;
            } catch (e) {
                return null;
            }
        }

        initPanel() {
            if (this.panelHost) return;

            this.panelHost = document.createElement('div');
            this.panelHost.id = 'dataminer-panel-host';
            this.panelHost.style.cssText = `
                position: fixed !important;
                top: 16px !important;
                right: 16px !important;
                z-index: 2147483649 !important;
                display: block !important;
                font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif !important;
            `;

            this.panelShadow = this.panelHost.attachShadow({ mode: 'open' });
            this.panelShadow.innerHTML = `
                <style>
                    :host { all: initial; }
                    .dm { all: initial; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
                    .dm * { box-sizing: border-box; }
                    .tab { cursor: pointer; padding: 6px 8px; border-radius: 6px; color: rgba(255,255,255,0.9); font-size: 12px; }
                    .tab.active { background: rgba(255,255,255,0.14); }
                    .btn { cursor: pointer; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); color: white; padding: 8px 10px; border-radius: 8px; font-size: 12px; }
                    .btn.primary { background: #3b82f6; border-color: #3b82f6; }
                    .btn.danger { background: rgba(220,38,38,0.20); border-color: rgba(220,38,38,0.35); }
                    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
                    .panel { display: block; width: 360px; background: #111827; color: white; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; box-shadow: 0 18px 60px rgba(0,0,0,0.45); overflow: hidden; color-scheme: dark; }
                    .header { display:flex; align-items:center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.10); }
                    .title { font-weight: 700; font-size: 13px; letter-spacing: 0.2px; }
                    .mini { opacity: 0.8; font-size: 12px; }
                    .tabs { display:flex; gap: 6px; padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.10); }
                    .content { padding: 12px; display:flex; flex-direction: column; gap: 10px; max-height: 65vh; overflow: auto; }
                    .row { display:flex; gap: 8px; align-items: center; }
                    .row.space { justify-content: space-between; }
                    .card { border: 1px solid rgba(255,255,255,0.10); border-radius: 10px; padding: 10px; background: rgba(255,255,255,0.04); }
                    .muted { opacity: 0.75; font-size: 12px; }
                    .input { width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.14); background: rgba(0,0,0,0.15); color: white; font-size: 12px; }
                    .table { width: 100%; border-collapse: collapse; font-size: 12px; }
                    .table th, .table td { border-bottom: 1px solid rgba(255,255,255,0.10); padding: 6px 6px; text-align: left; vertical-align: top; }
                    .table th { opacity: 0.85; font-weight: 600; }
                    .chip { display:inline-block; padding: 2px 6px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.18); font-size: 11px; opacity: 0.9; }
                    .toggle { cursor: pointer; display:inline-flex; align-items:center; gap: 6px; font-size: 12px; opacity: 0.9; }
                    .collapsed { width: 44px; height: 44px; border-radius: 12px; background: #111827; border: 1px solid rgba(255,255,255,0.12); display:flex; align-items:center; justify-content:center; box-shadow: 0 18px 60px rgba(0,0,0,0.45); cursor: pointer; }
                    .logo { font-weight: 800; letter-spacing: 0.5px; font-size: 12px; }
                </style>
                <div class="dm" id="dm-root"></div>
            `;

            this.attachPanelHandlers();
            document.documentElement.appendChild(this.panelHost);
        }

        attachPanelHandlers() {
            const root = this.panelShadow.getElementById('dm-root');
            root.addEventListener('click', async (e) => {
                const target = e.target;
                const action = target?.getAttribute?.('data-action');
                const tab = target?.getAttribute?.('data-tab');
                const fieldId = target?.getAttribute?.('data-field-id');

                if (tab) {
                    this.panelActiveTab = tab;
                    if (tab === 'preview') {
                        await this.ensurePreviewFresh();
                    }
                    this.renderPanel();
                    return;
                }

                if (!action) return;

                if (action === 'toggle') {
                    this.togglePanel();
                    return;
                }

                if (action === 'addField') {
                    this.openPanel();
                    this.panelActiveTab = 'fields';
                    // Toggle selection mode: each click on the page adds a field immediately
                    this.panelSelecting = !this.panelSelecting;
                    if (this.panelSelecting) {
                        this.startPanelSelectionMode();
                    } else {
                        this.stopPanelSelectionMode();
                    }
                    this.renderPanel();
                    return;
                }

                if (action === 'clearFields') {
                    this.state.fields = [];
                    this.state.columns = {};
                    this.lastPreviewRows = [];
                    this.fieldElementsById = new Map();
                    this.previewDirty = true;
                    await this.saveStateForCurrentOrigin();
                    this.clearPreviewHighlights();
                    // Remove any residual selection highlight from the page
                    try {
                        document.querySelectorAll('.onpage-selected-element').forEach(el => el.classList.remove('onpage-selected-element'));
                    } catch (e) {}
                    this.clearAllHighlights();
                    this.renderPanel();
                    return;
                }

                if (action === 'removeField' && fieldId) {
                    this.state.fields = (this.state.fields || []).filter(f => f.id !== fieldId);
                    const cols = { ...(this.state.columns || {}) };
                    delete cols[fieldId];
                    this.state.columns = cols;
                    this.fieldElementsById.delete(fieldId);
                    this.previewDirty = true;
                    await this.saveStateForCurrentOrigin();
                    this.renderPanel();
                    return;
                }

                if (action === 'highlight') {
                    this.togglePreviewHighlight();
                    this.renderPanel();
                    return;
                }

                if (action === 'exportCSV') {
                    await this.exportCSV();
                    return;
                }

                if (action === 'exportJSON') {
                    await this.exportJSON();
                    return;
                }
            });

            root.addEventListener('input', async (e) => {
                const target = e.target;
                const kind = target?.getAttribute?.('data-kind');
                if (!kind) return;

                if (kind === 'fieldName') {
                    const fieldId = target.getAttribute('data-field-id');
                    const value = target.value || '';
                    const idx = (this.state.fields || []).findIndex(f => f.id === fieldId);
                    if (idx >= 0) {
                        const oldName = this.state.fields[idx].name;
                        this.state.fields[idx].name = value;
                        this.previewDirty = true;
                        // Do NOT rerender on each keystroke (keeps input focus stable).
                        // Save is debounced; UI will update on other actions (tab switch, etc.)
                        this.scheduleSaveState();
                    }
                    return;
                }
            });

            root.addEventListener('change', async (e) => {
                const target = e.target;
                const kind = target?.getAttribute?.('data-kind');
                // No-op for now (Columns tab removed). Keep handler for future use.
                if (kind) return;
            });
        }

        scheduleSaveState(delayMs = 250) {
            try {
                if (this._saveTimer) clearTimeout(this._saveTimer);
                this._saveTimer = setTimeout(() => {
                    this.saveStateForCurrentOrigin().catch(() => {});
                }, delayMs);
            } catch (e) {
                // ignore
            }
        }

        startPanelSelectionMode() {
            if (this.isSelecting) return;
            this.isSelecting = true;
            document.addEventListener('mouseover', this.eventHandlers.mouseover, true);
            document.addEventListener('mouseout', this.eventHandlers.mouseout, true);
            document.addEventListener('click', this.eventHandlers.click, true);
        }

        stopPanelSelectionMode() {
            this.panelSelecting = false;
            if (!this.isSelecting) return;
            document.removeEventListener('mouseover', this.eventHandlers.mouseover, true);
            document.removeEventListener('mouseout', this.eventHandlers.mouseout, true);
            document.removeEventListener('click', this.eventHandlers.click, true);
            this.removeHighlight();
            this.isSelecting = false;
        }

        addFieldFromClickedElement(element) {
            if (!element || this.isOnPageElement(element)) return;

            // Visual feedback
            try { element.classList.add('onpage-selected-element'); } catch (e) {}

            const id = this.generateFieldId();
            const name = this.generateElementName(element);
            const dataType = this.getDataType(element);

            const field = this.normalizeField({
                id,
                name,
                selector: this.generateSelector(element),
                dataType,
                parentSelector: null
            });
            if (!field) return;

            // Avoid duplicates (rough heuristic for now)
            const dup = (this.state.fields || []).some(f => f.selector === field.selector && f.name === field.name);
            if (dup) return;

            this.fieldElementsById.set(field.id, element);
            this.state.fields = [...(this.state.fields || []), field];

            // Recompute common parent container across all selected field elements
            const nodes = [];
            (this.state.fields || []).forEach(f => {
                const el = this.fieldElementsById.get(f.id);
                if (el) nodes.push({ element: el });
            });

            const commonParent = this.findCommonParent(nodes);
            const parentSelector = commonParent ? this.generateParentSelector(commonParent) : null;

            // Update all fields: parentSelector + refine selector within the parent container
            this.state.fields = (this.state.fields || []).map(f => {
                const el = this.fieldElementsById.get(f.id);
                const refined = (commonParent && el) ? this.refineSelectorWithinParent(el, commonParent) : null;
                return {
                    ...f,
                    parentSelector,
                    selector: refined || f.selector
                };
            });

            this.ensureColumnsForFields();
            this.previewDirty = true;
            this.saveStateForCurrentOrigin().catch(() => {});

            // If user is on Preview tab, refresh immediately
            if (this.panelActiveTab === 'preview') {
                this.ensurePreviewFresh().then(() => this.renderPanel()).catch(() => this.renderPanel());
            } else {
                this.renderPanel();
            }
        }

        openPanel() {
            this.panelOpen = true;
            this.renderPanel();
        }

        closePanel() {
            this.panelOpen = false;
            // Safety: if selection mode was active, stop capturing clicks
            if (this.panelSelecting) {
                this.stopPanelSelectionMode();
            }
            this.renderPanel();
        }

        togglePanel() {
            this.panelOpen = !this.panelOpen;
            if (!this.panelOpen && this.panelSelecting) {
                this.stopPanelSelectionMode();
            }
            this.renderPanel();
        }

        normalizeField(field) {
            if (!field || !field.selector) return null;
            return {
                id: field.id || this.generateFieldId(),
                name: field.name || 'field',
                selector: field.selector,
                dataType: field.dataType || 'textContent',
                parentSelector: field.parentSelector || null
            };
        }

        ensureColumnsForFields() {
            this.state.columns = this.state.columns || {};
            (this.state.fields || []).forEach(f => {
                if (!this.state.columns[f.id]) {
                    this.state.columns[f.id] = { header: f.name, visible: true };
                } else {
                    if (typeof this.state.columns[f.id].visible !== 'boolean') this.state.columns[f.id].visible = true;
                    if (typeof this.state.columns[f.id].header !== 'string') this.state.columns[f.id].header = f.name;
                }
            });
        }

        async loadStateForCurrentOrigin() {
            this.origin = this.getOriginSafe();
            if (!this.origin || !chrome?.storage?.local) return;

            const res = await chrome.storage.local.get([
                'dataminer_state_by_origin',
                'dataminer_selected_elements_by_tab',
                'onpage_selected_elements',
                'dataminer_schema_version'
            ]);

            const map = res.dataminer_state_by_origin || {};
            const existing = map[this.origin];
            if (existing && Array.isArray(existing.fields)) {
                this.state = {
                    version: 1,
                    fields: (existing.fields || []).map(f => this.normalizeField(f)).filter(Boolean),
                    columns: existing.columns || {},
                    updatedAt: existing.updatedAt || Date.now()
                };
                this.ensureColumnsForFields();
                return;
            }

            // Migration: from dataminer_selected_elements_by_tab and/or onpage_selected_elements
            const fields = [];
            const seen = new Set();

            const byTab = res.dataminer_selected_elements_by_tab || {};
            Object.keys(byTab).forEach(tabId => {
                const entry = byTab[tabId];
                if (!entry || entry.origin !== this.origin || !Array.isArray(entry.elements)) return;
                entry.elements.forEach(el => {
                    const f = this.normalizeField(el);
                    if (!f) return;
                    const key = `${f.selector}|${f.name}`;
                    if (seen.has(key)) return;
                    seen.add(key);
                    fields.push(f);
                });
            });

            if (fields.length === 0 && Array.isArray(res.onpage_selected_elements)) {
                res.onpage_selected_elements.forEach(el => {
                    const f = this.normalizeField(el);
                    if (!f) return;
                    const key = `${f.selector}|${f.name}`;
                    if (seen.has(key)) return;
                    seen.add(key);
                    fields.push(f);
                });
            }

            this.state = { version: 1, fields, columns: {}, updatedAt: Date.now() };
            this.ensureColumnsForFields();

            map[this.origin] = this.state;
            await chrome.storage.local.set({ dataminer_state_by_origin: map, dataminer_schema_version: 1 });
        }

        async saveStateForCurrentOrigin() {
            if (!this.origin || !chrome?.storage?.local) return;
            this.ensureColumnsForFields();
            this.state.updatedAt = Date.now();
            const res = await chrome.storage.local.get(['dataminer_state_by_origin']);
            const map = res.dataminer_state_by_origin || {};
            map[this.origin] = this.state;
            await chrome.storage.local.set({ dataminer_state_by_origin: map, dataminer_schema_version: 1 });
        }

        applyFieldsFromSelection(elements) {
            const normalized = (elements || []).map(e => this.normalizeField(e)).filter(Boolean);
            this.state.fields = normalized;
            this.ensureColumnsForFields();
            this.previewDirty = true;
            this.saveStateForCurrentOrigin().catch(() => {});
            // Refresh panel to show new fields
            this.openPanel();
            this.panelActiveTab = 'fields';
            this.renderPanel();
        }

        getVisibleMatches(selector, root = document) {
            let nodes = [];
            try {
                nodes = Array.from(root.querySelectorAll(selector));
            } catch (e) {
                return [];
            }
            return nodes.filter(el => {
                try {
                    const rect = el.getBoundingClientRect();
                    if (rect.width === 0 || rect.height === 0) return false;
                    const style = getComputedStyle(el);
                    return style.display !== 'none' && style.visibility !== 'hidden';
                } catch (e) {
                    return false;
                }
            });
        }

        clearPreviewHighlights() {
            this.previewHighlights.forEach(el => {
                try { el.classList.remove('dataminer-preview-highlight'); } catch (e) {}
            });
            this.previewHighlights.clear();
        }

        togglePreviewHighlight() {
            // If already highlighted -> clear. Otherwise highlight all matches for current fields.
            if (this.previewHighlights.size > 0) {
                this.clearPreviewHighlights();
                return;
            }
            this.clearPreviewHighlights();
            const fields = this.state.fields || [];
            fields.forEach(f => {
                const matches = this.getVisibleMatches(f.selector);
                matches.slice(0, 400).forEach(el => {
                    el.classList.add('dataminer-preview-highlight');
                    this.previewHighlights.add(el);
                });
            });
        }

        extractValueFromElement(containerEl, field) {
            if (!containerEl || !field) return '';
            let el = null;
            try {
                el = containerEl.querySelector(field.selector);
            } catch (e) {
                el = null;
            }
            // Fallback: selector might be "global". Pick a match that is inside this container.
            if (!el) {
                try {
                    const all = Array.from(document.querySelectorAll(field.selector));
                    el = all.find(x => containerEl.contains(x)) || null;
                } catch (e) {
                    el = null;
                }
            }
            if (!el) return '';

            const dataType = field.dataType || 'textContent';
            const utils = window.DataminerOnPageUtils;
            const extractOne = (node) => {
                if (!node) return '';
                if (dataType === 'href') return utils?.extractHrefFromNode ? utils.extractHrefFromNode(node) : '';
                if (dataType === 'src') return utils?.extractSrcFromNode ? utils.extractSrcFromNode(node) : '';
                return utils?.extractTextFromNode ? utils.extractTextFromNode(node) : (node.textContent || node.innerText || '').trim();
            };

            // First try the matched element
            let value = extractOne(el);
            if (value && value.trim() !== '') return value;

            // If empty, try other matches within the same container and pick first non-empty
            try {
                const matches = Array.from(containerEl.querySelectorAll(field.selector));
                for (const m of matches) {
                    const v = extractOne(m);
                    if (v && String(v).trim() !== '') return String(v).trim();
                }
            } catch (e) {}

            return '';
        }

        buildRows(limit = 50) {
            const fields = this.state.fields || [];
            if (fields.length === 0) return [];

            const parentSelectors = fields.map(f => f.parentSelector).filter(Boolean);
            const commonParent = parentSelectors.length > 0 && parentSelectors.every(ps => ps === parentSelectors[0]) ? parentSelectors[0] : null;

            const rows = [];

            if (commonParent) {
                let containers = [];
                try {
                    containers = this.getVisibleMatches(commonParent, document);
                } catch (e) {
                    containers = [];
                }
                for (let i = 0; i < containers.length && rows.length < limit; i++) {
                    const c = containers[i];
                    const row = {};
                    fields.forEach(f => {
                        row[f.id] = this.extractValueFromElement(c, f);
                    });
                    // Skip rows where all fields are empty
                    const hasAny = Object.values(row).some(v => String(v || '').trim() !== '');
                    if (!hasAny) continue;
                    rows.push(row);
                }
                return rows;
            }

            // Fallback: align by index across each selector's matches
            const columns = fields.map(f => this.getVisibleMatches(f.selector, document));
            const maxLen = Math.max(...columns.map(a => a.length), 0);
            for (let i = 0; i < maxLen && rows.length < limit; i++) {
                const row = {};
                fields.forEach((f, idx) => {
                    const el = columns[idx][i];
                    if (!el) {
                        row[f.id] = '';
                        return;
                    }
                    if (f.dataType === 'href') {
                        const a = (el.tagName === 'A' && (el.href || el.getAttribute('href'))) ? el : el.querySelector('a[href]');
                        row[f.id] = (a && (a.href || a.getAttribute('href'))) ? (a.href || a.getAttribute('href') || '').trim() : '';
                    } else if (f.dataType === 'src') {
                        const img = (el.tagName === 'IMG') ? el : el.querySelector('img');
                        const src = img ? (img.src || img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original') || '') : '';
                        row[f.id] = (src || '').trim();
                    } else {
                        let txt = (el.textContent || el.innerText || '').trim();
                        if (!txt) {
                            txt = (el.getAttribute?.('aria-label') || el.getAttribute?.('title') || el.getAttribute?.('alt') || '').trim();
                        }
                        row[f.id] = txt;
                    }
                });
                const hasAny = Object.values(row).some(v => String(v || '').trim() !== '');
                if (!hasAny) continue;
                rows.push(row);
            }
            return rows;
        }

        applyColumns(rows) {
            const fields = this.state.fields || [];
            // Columns tab removed: columns are exactly fields, header = field name
            const visibleFields = fields;
            const headers = visibleFields.map(f => (f.name || f.id));

            const outRows = (rows || []).map(r => {
                const out = {};
                visibleFields.forEach((f, idx) => {
                    out[headers[idx]] = (r && r[f.id] !== undefined) ? r[f.id] : '';
                });
                return out;
            });
            return { headers, rows: outRows };
        }

        async ensurePreviewFresh() {
            if (!this.previewDirty && Array.isArray(this.lastPreviewRows) && this.lastPreviewRows.length > 0) return;
            await this.runPreview();
            this.previewDirty = false;
        }

        async runPreview() {
            // Preview sample; fast enough to recompute when user opens preview tab
            this.lastPreviewRows = this.buildRows(50);
        }

        toCSV(rows) {
            if (!Array.isArray(rows) || rows.length === 0) return '';
            const headers = Object.keys(rows[0] || {});
            const esc = (v) => {
                const s = (v === null || v === undefined) ? '' : String(v);
                const needs = /[",\n\r]/.test(s);
                const out = s.replace(/"/g, '""');
                return needs ? `"${out}"` : out;
            };
            const lines = [];
            lines.push(headers.map(esc).join(','));
            rows.forEach(r => {
                lines.push(headers.map(h => esc(r[h])).join(','));
            });
            return lines.join('\r\n');
        }

        async exportCSV() {
            // Export builds a "full" dataset from current DOM
            const rows = this.buildRows(5000);
            const applied = this.applyColumns(rows);
            const csv = this.toCSV(applied.rows);
            const filename = `dataminer-export-${Date.now()}.csv`;
            await this.downloadViaBackground(csv, filename, 'text/csv');
        }

        async exportJSON() {
            const rows = this.buildRows(5000);
            const applied = this.applyColumns(rows);
            const json = JSON.stringify(applied.rows, null, 2);
            const filename = `dataminer-export-${Date.now()}.json`;
            await this.downloadViaBackground(json, filename, 'application/json');
        }

        async downloadViaBackground(content, filename, mime) {
            try {
                await chrome.runtime.sendMessage({
                    action: 'downloadFile',
                    filename,
                    mime,
                    content
                });
                return;
            } catch (e) {
                // Fallback: try anchor download (may be blocked on some sites)
                try {
                    const a = document.createElement('a');
                    a.href = `data:${mime};charset=utf-8,${encodeURIComponent(content)}`;
                    a.download = filename;
                    a.rel = 'noopener';
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                } catch (e2) {
                    console.log('Download failed', e2);
                }
            }
        }

        renderPanel() {
            if (!this.panelShadow) return;
            const root = this.panelShadow.getElementById('dm-root');
            const fields = this.state.fields || [];
            const cols = this.state.columns || {};

            if (!this.panelOpen) {
                root.innerHTML = `
                    <div class="dm collapsed" data-action="toggle" title="Open Dataminer">
                        <div class="logo">DM</div>
                    </div>
                `;
                return;
            }

            const fieldCount = fields.length;
            const hasData = false;
            const hasPreview = (this.lastPreviewRows && this.lastPreviewRows.length > 0);
            const highlightOn = this.previewHighlights.size > 0;

            const tabBtn = (id, label) => `<div class="tab ${this.panelActiveTab === id ? 'active' : ''}" data-tab="${id}">${label}</div>`;

            const renderFields = () => {
                if (fields.length === 0) {
                    return `
                        <div class="card">
                            <div class="muted">No fields yet. Click <span class="chip">Add field</span> and then click an element on the page.</div>
                        </div>
                    `;
                }
                const items = fields.map(f => {
                    const count = this.getVisibleMatches(f.selector).length;
                    return `
                        <div class="card">
                            <div class="row space">
                                <div class="chip">${count} match</div>
                                <button class="btn danger" data-action="removeField" data-field-id="${f.id}">Remove</button>
                            </div>
                            <div style="height:8px"></div>
                            <div class="muted" style="margin-bottom:6px">Column name</div>
                            <input class="input" data-kind="fieldName" data-field-id="${f.id}" value="${(f.name || '').replace(/"/g, '&quot;')}"/>
                            <div style="height:8px"></div>
                            <div class="muted">Selector</div>
                            <div style="font-size:12px; opacity:0.9; word-break: break-word;">${(f.selector || '').replace(/</g,'&lt;')}</div>
                        </div>
                    `;
                }).join('');
                return items;
            };

            const renderPreview = () => {
                const rows = hasPreview ? this.applyColumns(this.lastPreviewRows).rows : [];
                const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
                const table = rows.length === 0
                    ? `<div class="card"><div class="muted">No preview data. Check your fields and try again.</div></div>`
                    : `
                        <div class="card">
                            <div class="row space" style="margin-bottom:8px">
                                <div class="chip">${rows.length} rows</div>
                                <label class="toggle"><input type="checkbox" ${highlightOn ? 'checked' : ''} data-action="highlight"/> highlight</label>
                            </div>
                            <div style="overflow:auto; max-height: 240px;">
                                <table class="table">
                                    <thead><tr>${headers.map(h => `<th>${h.replace(/</g,'&lt;')}</th>`).join('')}</tr></thead>
                                    <tbody>
                                        ${rows.slice(0, 20).map(r => `<tr>${headers.map(h => `<td>${String(r[h] ?? '').slice(0, 120).replace(/</g,'&lt;')}</td>`).join('')}</tr>`).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    `;
                return `
                    ${table}
                    <div class="row">
                        <button class="btn" data-action="exportCSV" ${(hasData || hasPreview) ? '' : 'disabled'}>Export CSV</button>
                        <button class="btn" data-action="exportJSON" ${(hasData || hasPreview) ? '' : 'disabled'}>Export JSON</button>
                    </div>
                `;
            };

            const content = this.panelActiveTab === 'fields'
                ? renderFields()
                : renderPreview();

            root.innerHTML = `
                <div class="dm panel">
                    <div class="header">
                        <div>
                            <div class="title">Dataminer</div>
                            <div class="mini">${this.origin || ''} • ${fieldCount} fields${this.panelSelecting ? ' • selecting' : ''}</div>
                        </div>
                        <div class="row">
                            <button class="btn" data-action="toggle">Close</button>
                        </div>
                    </div>
                    <div class="tabs">
                        ${tabBtn('fields','Fields')}
                        ${tabBtn('preview','Preview')}
                    </div>
                    <div class="content">
                        <div class="row">
                            <button class="btn primary" data-action="addField">${this.panelSelecting ? 'Stop selecting' : 'Add field'}</button>
                            <button class="btn danger" data-action="clearFields" ${fieldCount === 0 ? 'disabled' : ''}>Clear all</button>
                        </div>
                        ${content}
                    </div>
                </div>
            `;
        }
        
        saveElementsToStorage(elements) {
            // Method 1: Chrome storage (for extension communication)
            if (chrome && chrome.storage) {
                chrome.storage.local.set({
                    'onpage_selected_elements': elements
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.log('❌ Chrome storage error:', chrome.runtime.lastError);
                    }
                });
            }
            
            // Method 2: Regular localStorage (as backup)
            try {
                localStorage.setItem('onpage_selected_elements', JSON.stringify(elements));
            } catch (error) {
                console.log('❌ localStorage error:', error);
            }
            
            // Method 3: Session storage (for immediate access)
            try {
                sessionStorage.setItem('onpage_selected_elements', JSON.stringify(elements));
            } catch (error) {
                console.log('❌ sessionStorage error:', error);
            }
        }
        
        showSuccessMessage(message) {
            // Create a temporary success message
            const successDiv = document.createElement('div');
            successDiv.style.cssText = `
                position: fixed !important;
                top: 50% !important;
                left: 50% !important;
                transform: translate(-50%, -50%) !important;
                background: #22c55e !important;
                color: white !important;
                padding: 16px 24px !important;
                border-radius: 4px !important;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
                z-index: 2147483649 !important;
                font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
                font-size: 14px !important;
                font-weight: 500 !important;
                text-align: center !important;
            `;
            successDiv.textContent = message;
            
            document.body.appendChild(successDiv);
            
            // Remove after 3 seconds
            setTimeout(() => {
                if (successDiv.parentNode) {
                    successDiv.parentNode.removeChild(successDiv);
                }
            }, 3000);
        }
        
        cancelSelection() {
            try {
                // Remove all highlights and clear selection
                this.clearAllHighlights();
                this.selectedElements = [];
                
                // Hide UI
                this.hideSelectionUI();
                
                // Send cancellation message
                chrome.runtime.sendMessage({
                    action: 'elementSelectionCancelled'
                });
                
            } catch (error) {
                console.log('Error cancelling selection:', error);
            }
        }
        
        hideSelectionUI() {
            // Hide overlay and instruction panel but keep selection active
            if (this.overlay) {
                this.overlay.style.display = 'none';
            }
            if (this.instructionPanel) {
                this.instructionPanel.style.display = 'none';
            }
            
            // Remove event listeners but keep selection
            document.removeEventListener('mouseover', this.eventHandlers.mouseover, true);
            document.removeEventListener('mouseout', this.eventHandlers.mouseout, true);
            document.removeEventListener('click', this.eventHandlers.click, true);
            
            // Restore page scrolling
            document.body.style.overflow = '';
            
            this.isSelecting = false;
        }
        
        keepSelectedElementsHighlighted() {
            // Ensure all selected elements keep their selected class
            this.selectedElements.forEach(item => {
                if (item.element) {
                    // Make sure the selected class is applied
                    item.element.classList.add('onpage-selected-element');
                }
            });
        }
        
        clearAllHighlights() {
            // Remove CSS classes from all elements
            this.selectedElements.forEach(item => {
                if (item.element) {
                    item.element.classList.remove('onpage-selected-element');
                    item.element.classList.remove('onpage-hover-element');
                }
            });
            
            // Clear selection array
            this.selectedElements = [];
            
            // Also remove current highlight
            this.removeHighlight();
        }
        
        destroy() {
            this.stopElementSelection();
            this.removeUI();
            
            if (chrome.runtime.onMessage.hasListener(this.eventHandlers.message)) {
                chrome.runtime.onMessage.removeListener(this.eventHandlers.message);
            }
            
            window.OnPageContentScript = false;
        }
    }
    
    // Initialize the content script
    const contentScript = new OnPageContentScript();
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        contentScript.destroy();
    });
    
})();