// OnPage.dev Content Script - Professional Web Scraper
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
                        this.startElementSelection();
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
                    
                    default:
                        sendResponse({ success: false, error: 'Unknown action' });
                }
            } catch (error) {
                console.log('OnPage message handler error:', error);
                sendResponse({ success: false, error: error.message });
            }
        }
        
        startElementSelection() {
            if (this.isSelecting) return;
            
            this.isSelecting = true;
            this.selectedElements = [];
            
            // Show UI
            this.overlay.style.display = 'block';
            this.instructionPanel.style.display = 'block';
            
            // Add event listeners
            document.addEventListener('mouseover', this.eventHandlers.mouseover, true);
            document.addEventListener('mouseout', this.eventHandlers.mouseout, true);
            document.addEventListener('click', this.eventHandlers.click, true);
            
            // Prevent page scrolling
            document.body.style.overflow = 'hidden';
            
            // Update selection count
            this.updateSelectionCount();
            
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
            
            // Restore page scrolling
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
            
            this.selectElement(element);
        }
        
        isOnPageElement(element) {
            // Block clicks on overlay and instruction panel elements
            return element === this.overlay || 
                   element === this.instructionPanel ||
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
            
            // If element is a link, use href
            if (element.tagName === 'A' && (element.href || element.getAttribute('href'))) {
                return 'href';
            }
            
            // If element is an image, use src
            if (element.tagName === 'IMG' && (element.src || element.getAttribute('src') || element.getAttribute('data-src'))) {
                return 'src';
            }
            
            // Check if element contains a link inside
            const linkEl = element.querySelector('a[href]');
            if (linkEl && linkEl.href) {
                return 'href';
            }
            
            // Check if element contains an image inside
            const imgEl = element.querySelector('img');
            if (imgEl) {
                // Check various src attributes
                const hasSrc = imgEl.src || 
                              imgEl.getAttribute('src') || 
                              imgEl.getAttribute('data-src') || 
                              imgEl.getAttribute('data-src-pb') ||
                              imgEl.getAttribute('data-lazy-src') || 
                              imgEl.getAttribute('data-original');
                if (hasSrc) {
                    return 'src';
                }
            }
            
            // Default to textContent
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
                    name: el.name,
                    selector: (() => {
                        // Refine selector within the common parent container when possible (avoids "a-color-base" ambiguity)
                        const refined = commonParent ? this.refineSelectorWithinParent(el.element, commonParent) : null;
                        return refined || el.selector;
                    })(),
                    dataType: el.dataType || 'textContent', // Include data type
                    parentSelector: parentSelector // Include parent selector to limit search scope
                }));
                
                // Save to multiple storage methods for reliability
                this.saveElementsToStorage(elements);
                
                // Keep selected elements highlighted but remove overlay
                this.keepSelectedElementsHighlighted();
                this.hideSelectionUI();
                
                // Show success message
                this.showSuccessMessage(`Selected ${elements.length} element(s) successfully!`);
                
            } catch (error) {
                console.log('❌ Error finishing selection:', error);
            }
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