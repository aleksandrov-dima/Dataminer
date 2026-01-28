// Content Script - Visual element selector for Side Panel
// Version: 2.0.0 - Side Panel Architecture

(function() {
    'use strict';
    
    // Prevent multiple initializations
    if (window.DataScrapingToolContentScript) {
        return;
    }
    
    window.DataScrapingToolContentScript = true;
    
    class DataScrapingToolContentScript {
        constructor() {
            this.isInitialized = false;
            this.isSelecting = false;
            this.state = { version: 1, fields: [], columns: {}, updatedAt: Date.now() };
            this.lastPreviewRows = [];
            this.previewDirty = true;
            this.fieldElementsById = new Map();
            this.origin = null;
            this.highlightedElement = null;
            this.highlightedRowElement = null; // P1.2: For row hover highlighting
            this.currentTooltip = null;
            this.eventHandlers = {};
            
            // P3.1: Region selection state
            this.isSelectingRegion = false;
            this.regionOverlay = null;
            this.regionSelection = null;
            this.regionStartPoint = null;
            
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
                message: this.handleMessage.bind(this),
                keydown: this.handleKeyDown.bind(this)
            };
            
            // Global keyboard shortcuts
            document.addEventListener('keydown', this.eventHandlers.keydown, true);
            
            // Listen for messages from side panel/background
            chrome.runtime.onMessage.addListener(this.eventHandlers.message);
            
            // Add selection styles
            this.addSelectionStyles();
            
            // Load persisted state
            this.loadStateForCurrentOrigin().catch(() => {});
            
            this.isInitialized = true;
        }
        
        addSelectionStyles() {
            if (document.getElementById('data-scraping-tool-selection-styles')) return;
            
            const style = document.createElement('style');
            style.id = 'data-scraping-tool-selection-styles';
            style.textContent = `
                /* Hover state */
                .onpage-hover-element {
                    outline: 2px solid #6366f1 !important;
                    outline-offset: 2px !important;
                    background-color: rgba(99, 102, 241, 0.1) !important;
                    cursor: crosshair !important;
                    transition: all 0.15s ease !important;
                }
                
                /* Selected state */
                .onpage-selected-element {
                    outline: 2px solid #22c55e !important;
                    outline-offset: 2px !important;
                    background-color: rgba(34, 197, 94, 0.1) !important;
                }
                
                /* Element tooltip with preview */
                #data-scraping-tool-element-tooltip {
                    position: fixed !important;
                    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%) !important;
                    color: #f1f5f9 !important;
                    padding: 10px 14px !important;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
                    font-size: 12px !important;
                    z-index: 2147483649 !important;
                    pointer-events: none !important;
                    border-radius: 10px !important;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(99, 102, 241, 0.3) !important;
                    max-width: 320px !important;
                    min-width: 180px !important;
                    word-break: break-word !important;
                    line-height: 1.4 !important;
                }
                
                #data-scraping-tool-element-tooltip .tooltip-type {
                    font-size: 11px !important;
                    font-weight: 600 !important;
                    color: #a78bfa !important;
                    margin-bottom: 4px !important;
                }
                
                #data-scraping-tool-element-tooltip .tooltip-preview {
                    font-size: 13px !important;
                    color: #e2e8f0 !important;
                    background: rgba(0, 0, 0, 0.2) !important;
                    padding: 6px 8px !important;
                    border-radius: 6px !important;
                    margin-top: 4px !important;
                    overflow: hidden !important;
                    text-overflow: ellipsis !important;
                    white-space: nowrap !important;
                }
                
                /* Preview highlight */
                .data-scraping-tool-preview-highlight {
                    outline: 1px dashed #f59e0b !important;
                    outline-offset: 1px !important;
                    background-color: rgba(245, 158, 11, 0.05) !important;
                }
            `;
            document.head.appendChild(style);
        }
        
        // Keyboard shortcuts
        handleKeyDown(event) {
            // Escape - stop selection mode
            if (event.key === 'Escape' && this.isSelecting) {
                event.preventDefault();
                event.stopPropagation();
                this.stopSelection();
                this.notifySidePanel('selectionStopped', {});
            }
        }
        
        handleMessage(message, sender, sendResponse) {
            try {
                switch (message.action) {
                    case 'ping':
                        sendResponse({ success: true, message: 'Content script is ready' });
                        break;
                    
                    case 'startSelection':
                        this.startSelection();
                        sendResponse({ success: true });
                        break;
                    
                    case 'stopSelection':
                        this.stopSelection();
                        sendResponse({ success: true });
                        break;
                    
                    case 'getState':
                        this.ensurePreviewFresh().then(() => {
                            sendResponse({
                                success: true,
                                fields: this.state.fields || [],
                                rows: this.applyColumns(this.lastPreviewRows).rows
                            });
                        }).catch(() => {
                            sendResponse({
                                success: true,
                                fields: this.state.fields || [],
                                rows: []
                            });
                        });
                        return true; // async response
                    
                    case 'getPreview':
                        this.ensurePreviewFresh().then(() => {
                            sendResponse({
                                success: true,
                                rows: this.applyColumns(this.lastPreviewRows).rows
                            });
                        }).catch(() => {
                            sendResponse({ success: true, rows: [] });
                        });
                        return true; // async response
                    
                    case 'clearAll':
                        this.clearAllFields();
                        sendResponse({ success: true });
                        break;
                    
                    case 'removeField':
                        this.removeField(message.fieldId);
                        sendResponse({ success: true });
                        break;
                    
                    case 'updateField':
                        this.updateField(message.fieldId, message.updates);
                        sendResponse({ success: true });
                        break;
                    
                    case 'exportCSV':
                        // P0.1: Wrap export logic in try/catch
                        this.exportCSV().then(() => {
                            sendResponse({ success: true });
                        }).catch((e) => {
                            console.log('Export CSV error:', e);
                            sendResponse({ 
                                success: false, 
                                error: e?.message || String(e) || 'Unknown export error' 
                            });
                        });
                        return true; // async response
                    
                    case 'exportJSON':
                        // P0.1: Wrap export logic in try/catch
                        this.exportJSON().then(() => {
                            sendResponse({ success: true });
                        }).catch((e) => {
                            console.log('Export JSON error:', e);
                            sendResponse({ 
                                success: false, 
                                error: e?.message || String(e) || 'Unknown export error' 
                            });
                        });
                        return true; // async response
                    
                    // P1.2: Highlight source element on table hover
                    case 'highlightRow':
                        this.highlightRowElements(message.rowIndex);
                        sendResponse({ success: true });
                        break;
                    
                    case 'clearRowHighlight':
                        this.clearRowHighlight();
                        sendResponse({ success: true });
                        break;
                    
                    // P3.1: Region selection
                    case 'startRegionSelection':
                        this.startRegionSelection();
                        sendResponse({ success: true });
                        break;
                    
                    case 'stopRegionSelection':
                        this.stopRegionSelection();
                        sendResponse({ success: true });
                        break;
                    
                    default:
                        sendResponse({ success: false, error: 'Unknown action' });
                }
            } catch (error) {
                console.log('Message handler error:', error);
                sendResponse({ success: false, error: error.message });
            }
        }
        
        // Notify side panel of changes
        notifySidePanel(action, data = {}) {
            try {
                if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) return;
                chrome.runtime.sendMessage({ action, ...data }).catch(() => {});
            } catch (e) {
                // Ignore errors
            }
        }
        
        // Selection mode
        startSelection() {
            if (this.isSelecting) return;
            
            this.isSelecting = true;
            document.addEventListener('mouseover', this.eventHandlers.mouseover, true);
            document.addEventListener('mouseout', this.eventHandlers.mouseout, true);
            document.addEventListener('click', this.eventHandlers.click, true);
        }
        
        stopSelection() {
            if (!this.isSelecting) return;
            
            this.isSelecting = false;
            document.removeEventListener('mouseover', this.eventHandlers.mouseover, true);
            document.removeEventListener('mouseout', this.eventHandlers.mouseout, true);
            document.removeEventListener('click', this.eventHandlers.click, true);
            this.removeHighlight();
        }
        
        handleMouseOver(event) {
            if (!this.isSelecting) return;
            
            let element = event.target;
            if (this.isOwnElement(element)) return;
            
            const x = event.clientX;
            const y = event.clientY;
            
            // Check for overlay link pattern (Wildberries style)
            if (element.tagName === 'A' && this.isOverlayLink(element)) {
                const contentElement = this.findContentUnderOverlay(element, x, y);
                if (contentElement && contentElement !== element) {
                    element = contentElement;
                }
            }
            // For card-like links, try to highlight the inner element
            else if (element.tagName === 'A' && this.isCardLikeLink(element)) {
                // Temporarily hide the link to find what's underneath
                const originalPointerEvents = element.style.pointerEvents;
                element.style.pointerEvents = 'none';
                const innerElement = document.elementFromPoint(x, y);
                element.style.pointerEvents = originalPointerEvents;
                
                if (innerElement && innerElement !== element && element.contains(innerElement)) {
                    if (innerElement.tagName !== 'A') {
                        element = innerElement;
                    }
                }
            }
            
            this.highlightElement(element);
        }
        
        handleMouseOut(event) {
            if (!this.isSelecting) return;
            this.removeHighlight();
        }
        
        handleClick(event) {
            if (!this.isSelecting) return;
            
            let element = event.target;
            if (this.isOwnElement(element)) return;
            
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            
            const x = event.clientX;
            const y = event.clientY;
            
            // Check for overlay link pattern (Wildberries style)
            // Empty <a> positioned over card content
            if (element.tagName === 'A' && this.isOverlayLink(element)) {
                const contentElement = this.findContentUnderOverlay(element, x, y);
                if (contentElement && contentElement !== element) {
                    element = contentElement;
                }
            }
            // Check for card-like link that wraps content
            else if (element.tagName === 'A' && this.isCardLikeLink(element)) {
                // Temporarily hide the link to find what's underneath
                const originalPointerEvents = element.style.pointerEvents;
                element.style.pointerEvents = 'none';
                const innerElement = document.elementFromPoint(x, y);
                element.style.pointerEvents = originalPointerEvents;
                
                // If we found a more specific element inside the card, use it
                if (innerElement && innerElement !== element && element.contains(innerElement)) {
                    if (innerElement.tagName !== 'A' && 
                        (innerElement.textContent.trim() || innerElement.tagName === 'IMG')) {
                        element = innerElement;
                    }
                }
            }
            
            this.addFieldFromElement(element);
        }
        
        // Check if link is a card-like wrapper (contains product info)
        isCardLikeLink(element) {
            if (element.tagName !== 'A') return false;
            
            // Check if href looks like a product page
            const href = element.href || '';
            const isProductLink = /\/catalog\/\d+|\/product\/|\/detail\.aspx|\/dp\/|\/itm\//.test(href);
            
            // Check if contains structured content
            const hasImage = element.querySelector('img') !== null;
            const hasPrice = element.querySelector('[class*="price"]') !== null;
            const hasTitle = element.querySelector('[class*="name"], [class*="title"], [class*="brand"]') !== null;
            const hasLongText = element.textContent.length > 30;
            
            // It's a card-like link if it's a product link with structured content
            return isProductLink && (hasImage || hasPrice || hasTitle || hasLongText);
        }
        
        // Check if link is an overlay link (empty link positioned over card content)
        // Wildberries uses this pattern: empty <a class="product-card__link"> overlay
        isOverlayLink(element) {
            if (element.tagName !== 'A') return false;
            
            // Check if href looks like a product page
            const href = element.href || '';
            const isProductLink = /\/catalog\/\d+|\/product\/|\/detail\.aspx|\/dp\/|\/itm\//.test(href);
            if (!isProductLink) return false;
            
            // Check if link is empty or near-empty (overlay pattern)
            const textContent = element.textContent.trim();
            const hasNoContent = textContent.length < 5;
            const hasNoChildren = element.children.length === 0 || 
                (element.children.length === 1 && element.children[0].tagName === 'SPAN' && !element.children[0].textContent.trim());
            
            // Check for overlay-related classes
            const className = (element.className || '').toString().toLowerCase();
            const hasOverlayClass = className.includes('link') || className.includes('overlay') || className.includes('card-link');
            
            // Check if positioned absolutely (overlay pattern)
            const style = window.getComputedStyle(element);
            const isAbsolutePositioned = style.position === 'absolute';
            
            // It's an overlay link if it's empty/near-empty and has overlay characteristics
            return (hasNoContent || hasNoChildren) && (hasOverlayClass || isAbsolutePositioned);
        }
        
        // Find the actual content element under an overlay link
        findContentUnderOverlay(overlayLink, x, y) {
            if (!overlayLink) return null;
            
            // Get the parent container (usually .product-card__wrapper or .product-card)
            const parent = overlayLink.parentElement;
            if (!parent) return null;
            
            // Temporarily hide the overlay link
            const originalDisplay = overlayLink.style.display;
            const originalPointerEvents = overlayLink.style.pointerEvents;
            const originalZIndex = overlayLink.style.zIndex;
            
            overlayLink.style.pointerEvents = 'none';
            overlayLink.style.zIndex = '-1';
            
            // Find element at coordinates
            let foundElement = document.elementFromPoint(x, y);
            
            // Restore overlay
            overlayLink.style.display = originalDisplay;
            overlayLink.style.pointerEvents = originalPointerEvents;
            overlayLink.style.zIndex = originalZIndex;
            
            // If found element is still the overlay or parent, try to find content elements
            if (foundElement === overlayLink || foundElement === parent) {
                // Try to find specific content elements in parent
                const contentSelectors = [
                    '.product-card__price', '.price',
                    '.product-card__brand', '.product-card__name',
                    '.product-card__img-wrap', 'img',
                    '[class*="price"]', '[class*="name"]', '[class*="brand"]'
                ];
                
                for (const selector of contentSelectors) {
                    const found = parent.querySelector(selector);
                    if (found) {
                        // Check if this element is near the click coordinates
                        const rect = found.getBoundingClientRect();
                        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                            return found;
                        }
                    }
                }
            }
            
            return foundElement !== overlayLink ? foundElement : null;
        }
        
        isOwnElement(element) {
            if (!element) return true;
            return element.id === 'data-scraping-tool-element-tooltip' ||
                   element.closest?.('#data-scraping-tool-element-tooltip');
        }
        
        highlightElement(element) {
            this.removeHighlight();
            if (this.isOwnElement(element)) return;
            
            // Don't show tooltip for already selected elements
            if (element.classList.contains('onpage-selected-element')) {
                return;
            }
            
            element.classList.add('onpage-hover-element');
            this.highlightedElement = element;
            this.createTooltip(element);
        }
        
        removeHighlight() {
            if (this.highlightedElement) {
                this.highlightedElement.classList.remove('onpage-hover-element');
                this.highlightedElement = null;
            }
            this.removeTooltip();
        }
        
        // P1.2: Highlight source elements for a specific row in the preview table
        highlightRowElements(rowIndex) {
            this.clearRowHighlight();
            
            if (rowIndex < 0) return;
            
            const fields = this.state.fields || [];
            if (fields.length === 0) return;
            
            // Get common parent selector
            const parentSelector = fields[0]?.parentSelector;
            if (!parentSelector) return;
            
            try {
                const containers = document.querySelectorAll(parentSelector);
                if (rowIndex >= containers.length) return;
                
                const container = containers[rowIndex];
                if (!container) return;
                
                // Add highlight class to the container (row)
                container.classList.add('onpage-row-highlight');
                this.highlightedRowElement = container;
                
                // Scroll into view if not visible
                const rect = container.getBoundingClientRect();
                const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
                if (!isVisible) {
                    container.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            } catch (e) {
                console.log('Error highlighting row:', e);
            }
        }
        
        // P1.2: Clear row highlight
        clearRowHighlight() {
            if (this.highlightedRowElement) {
                try {
                    this.highlightedRowElement.classList.remove('onpage-row-highlight');
                } catch (e) {}
                this.highlightedRowElement = null;
            }
            
            // Also clear any orphaned highlights
            document.querySelectorAll('.onpage-row-highlight').forEach(el => {
                try { el.classList.remove('onpage-row-highlight'); } catch (e) {}
            });
        }
        
        // =====================================================
        // P3.1: Region Selection Methods
        // =====================================================
        
        startRegionSelection() {
            console.log('[DataScrapingTool] startRegionSelection called');
            if (this.isSelectingRegion) {
                console.log('[DataScrapingTool] Already selecting region, skipping');
                return;
            }
            
            // Stop element selection if active
            if (this.isSelecting) {
                this.stopSelection();
            }
            
            this.isSelectingRegion = true;
            this.createRegionOverlay();
            console.log('[DataScrapingTool] Region overlay created');
        }
        
        stopRegionSelection() {
            this.isSelectingRegion = false;
            this.removeRegionOverlay();
            this.notifySidePanel('regionSelectionCancelled', {});
        }
        
        createRegionOverlay() {
            // Create full-screen overlay
            this.regionOverlay = document.createElement('div');
            this.regionOverlay.id = 'data-scraping-region-overlay';
            this.regionOverlay.innerHTML = `
                <div class="region-instructions">
                    <span class="region-icon">⬚</span>
                    <span>Click and drag to select a region</span>
                    <span class="region-hint">Press ESC to cancel</span>
                </div>
                <div class="region-selection" id="regionSelectionBox"></div>
            `;
            document.body.appendChild(this.regionOverlay);
            
            this.regionSelection = this.regionOverlay.querySelector('#regionSelectionBox');
            
            // Bind event handlers
            this._regionMouseDown = this.handleRegionMouseDown.bind(this);
            this._regionMouseMove = this.handleRegionMouseMove.bind(this);
            this._regionMouseUp = this.handleRegionMouseUp.bind(this);
            this._regionKeyDown = this.handleRegionKeyDown.bind(this);
            
            this.regionOverlay.addEventListener('mousedown', this._regionMouseDown);
            document.addEventListener('mousemove', this._regionMouseMove);
            document.addEventListener('mouseup', this._regionMouseUp);
            document.addEventListener('keydown', this._regionKeyDown, true);
        }
        
        removeRegionOverlay() {
            if (this.regionOverlay) {
                this.regionOverlay.removeEventListener('mousedown', this._regionMouseDown);
                document.removeEventListener('mousemove', this._regionMouseMove);
                document.removeEventListener('mouseup', this._regionMouseUp);
                document.removeEventListener('keydown', this._regionKeyDown, true);
                
                this.regionOverlay.remove();
                this.regionOverlay = null;
                this.regionSelection = null;
                this.regionStartPoint = null;
            }
        }
        
        handleRegionMouseDown(e) {
            console.log('[DataScrapingTool] handleRegionMouseDown', e.clientX, e.clientY);
            
            e.preventDefault();
            e.stopPropagation();
            this.regionStartPoint = { x: e.clientX, y: e.clientY };
            
            // Position selection box at start point
            this.regionSelection.style.left = e.clientX + 'px';
            this.regionSelection.style.top = e.clientY + 'px';
            this.regionSelection.style.width = '0px';
            this.regionSelection.style.height = '0px';
            this.regionSelection.style.display = 'block';
            
            // Hide instructions
            const instructions = this.regionOverlay.querySelector('.region-instructions');
            if (instructions) {
                instructions.style.opacity = '0';
            }
        }
        
        handleRegionMouseMove(e) {
            if (!this.regionStartPoint) return;
            
            const x = Math.min(this.regionStartPoint.x, e.clientX);
            const y = Math.min(this.regionStartPoint.y, e.clientY);
            const width = Math.abs(e.clientX - this.regionStartPoint.x);
            const height = Math.abs(e.clientY - this.regionStartPoint.y);
            
            this.regionSelection.style.left = x + 'px';
            this.regionSelection.style.top = y + 'px';
            this.regionSelection.style.width = width + 'px';
            this.regionSelection.style.height = height + 'px';
        }
        
        handleRegionMouseUp(e) {
            console.log('[DataScrapingTool] handleRegionMouseUp', e.clientX, e.clientY);
            if (!this.regionStartPoint) {
                console.log('[DataScrapingTool] No start point, ignoring mouseup');
                return;
            }
            
            const rect = {
                left: Math.min(this.regionStartPoint.x, e.clientX),
                top: Math.min(this.regionStartPoint.y, e.clientY),
                right: Math.max(this.regionStartPoint.x, e.clientX),
                bottom: Math.max(this.regionStartPoint.y, e.clientY),
                width: Math.abs(e.clientX - this.regionStartPoint.x),
                height: Math.abs(e.clientY - this.regionStartPoint.y)
            };
            
            console.log('[DataScrapingTool] Selected rect:', rect);
            this.regionStartPoint = null;
            
            // Check minimum size (at least 50x50 pixels)
            if (rect.width < 50 || rect.height < 50) {
                console.log('[DataScrapingTool] Region too small');
                this.removeRegionOverlay();
                this.isSelectingRegion = false;
                this.notifySidePanel('regionSelected', { region: null, rows: [], fields: [] });
                return;
            }
            
            // Process the selected region
            this.processSelectedRegion(rect);
        }
        
        handleRegionKeyDown(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                this.stopRegionSelection();
            }
        }
        
        processSelectedRegion(rect) {
            console.log('[DataScrapingTool] processSelectedRegion', rect);
            
            // Remove overlay before processing
            this.removeRegionOverlay();
            this.isSelectingRegion = false;
            
            try {
                // P3.2: Find elements inside the region
                const elementsInRegion = this.findElementsInRegion(rect);
                console.log('[DataScrapingTool] Found elements in region:', elementsInRegion.length);
                
                if (elementsInRegion.length === 0) {
                    console.log('[DataScrapingTool] No elements found in region');
                    this.notifySidePanel('regionSelected', { region: rect, rows: [], fields: [] });
                    return;
                }
                
                // P3.2: Find the common ancestor (LCA)
                const commonAncestor = this.findCommonAncestor(elementsInRegion);
                console.log('[DataScrapingTool] Common ancestor:', commonAncestor?.tagName);
                
                if (!commonAncestor) {
                    this.notifySidePanel('regionSelected', { region: rect, rows: [], fields: [] });
                    return;
                }
                
                // P3.3: Auto-detect repeating rows
                let { rows: detectedRows, rowSelector } = this.detectRepeatingRows(commonAncestor, rect);
                console.log('[DataScrapingTool] Detected rows:', detectedRows.length, 'selector:', rowSelector);
                
                // If no rows found, try to find siblings with same structure
                if (detectedRows.length === 0 && commonAncestor !== document.body) {
                    console.log('[DataScrapingTool] Trying to find similar siblings...');
                    const siblingRows = this.findSimilarSiblings(commonAncestor);
                    if (siblingRows.length >= 2) {
                        detectedRows = siblingRows;
                        rowSelector = this.getElementStructureKey(siblingRows[0]).replace('|', '.');
                        console.log('[DataScrapingTool] Found siblings:', detectedRows.length, 'selector:', rowSelector);
                    }
                }
                
                if (detectedRows.length === 0) {
                    console.log('[DataScrapingTool] No repeating rows found');
                    this.notifySidePanel('regionSelected', { region: rect, rows: [], fields: [] });
                    return;
                }
                
                // Expand to all similar elements on the page
                if (detectedRows.length >= 2 && rowSelector) {
                    const expandedRows = this.expandToAllSimilarElements(detectedRows, rowSelector);
                    if (expandedRows.length > detectedRows.length) {
                        console.log('[DataScrapingTool] Expanded from', detectedRows.length, 'to', expandedRows.length, 'rows');
                        detectedRows = expandedRows;
                    }
                }
                
                // P3.4: Detect columns from the rows
                const { columns, fields } = this.detectColumns(detectedRows);
                console.log('[DataScrapingTool] Detected columns:', columns.length, 'fields:', fields.length);
                
                // Build preview data
                const rows = this.buildRowsFromRegion(detectedRows, columns);
                console.log('[DataScrapingTool] Built rows:', rows.length);
                
                // Update state
                this.state.fields = fields;
                this.lastPreviewRows = rows;
                
                this.notifySidePanel('regionSelected', { 
                    region: rect, 
                    rows: rows, 
                    fields: fields 
                });
                
            } catch (e) {
                console.log('Error processing region:', e);
                this.notifySidePanel('regionSelected', { region: rect, rows: [], fields: [] });
            }
        }
        
        // P3.2: Find all visible elements inside the selected region
        findElementsInRegion(rect) {
            const elements = [];
            const allElements = document.body.querySelectorAll('*');
            
            for (const el of allElements) {
                // Skip hidden, script, style elements
                if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'NOSCRIPT') continue;
                if (el.id && el.id.startsWith('data-scraping')) continue;
                
                const elRect = el.getBoundingClientRect();
                
                // Check if element is visible and inside region
                if (elRect.width === 0 || elRect.height === 0) continue;
                
                // Element center should be inside region
                const centerX = elRect.left + elRect.width / 2;
                const centerY = elRect.top + elRect.height / 2;
                
                if (centerX >= rect.left && centerX <= rect.right &&
                    centerY >= rect.top && centerY <= rect.bottom) {
                    elements.push(el);
                }
            }
            
            return elements;
        }
        
        // P3.2: Find lowest common ancestor of elements
        findCommonAncestor(elements) {
            if (elements.length === 0) return null;
            if (elements.length === 1) return elements[0].parentElement;
            
            // Get all ancestors of first element
            const ancestors = new Set();
            let el = elements[0];
            while (el && el !== document.body) {
                ancestors.add(el);
                el = el.parentElement;
            }
            ancestors.add(document.body);
            
            // Find first ancestor that contains all elements
            for (const ancestor of ancestors) {
                let containsAll = true;
                for (let i = 1; i < elements.length; i++) {
                    if (!ancestor.contains(elements[i])) {
                        containsAll = false;
                        break;
                    }
                }
                if (containsAll) {
                    return ancestor;
                }
            }
            
            return document.body;
        }
        
        // Expand selection to all similar elements on the page
        expandToAllSimilarElements(detectedRows, rowSelector) {
            if (detectedRows.length === 0) return detectedRows;
            
            const first = detectedRows[0];
            const key = this.getElementStructureKey(first);
            const [tag, firstClass] = key.split('|');
            
            // Try multiple strategies to find all similar elements
            let allSimilar = [];
            
            // Strategy 1: Use CSS selector if valid
            if (rowSelector && !rowSelector.includes('|')) {
                try {
                    allSimilar = Array.from(document.querySelectorAll(rowSelector));
                    console.log('[DataScrapingTool] Strategy 1 (CSS selector):', allSimilar.length);
                } catch (e) {
                    console.log('[DataScrapingTool] Strategy 1 failed:', e.message);
                }
            }
            
            // Strategy 2: Find by tag and class
            if (allSimilar.length <= detectedRows.length && firstClass) {
                try {
                    const selector = `${tag}.${CSS.escape(firstClass)}`;
                    allSimilar = Array.from(document.querySelectorAll(selector));
                    console.log('[DataScrapingTool] Strategy 2 (tag.class):', selector, allSimilar.length);
                } catch (e) {
                    console.log('[DataScrapingTool] Strategy 2 failed:', e.message);
                }
            }
            
            // Strategy 3: Find siblings of detected rows' parent
            if (allSimilar.length <= detectedRows.length) {
                const parent = first.parentElement;
                if (parent) {
                    allSimilar = Array.from(parent.children).filter(child => 
                        this.getElementStructureKey(child) === key
                    );
                    console.log('[DataScrapingTool] Strategy 3 (parent siblings):', allSimilar.length);
                }
            }
            
            // Strategy 4: Find all elements with same structure key in document
            if (allSimilar.length <= detectedRows.length) {
                allSimilar = Array.from(document.querySelectorAll(tag)).filter(el => 
                    this.getElementStructureKey(el) === key
                );
                console.log('[DataScrapingTool] Strategy 4 (all by key):', allSimilar.length);
            }
            
            // Filter out nested elements and return
            const filtered = allSimilar.filter((el, i) => 
                allSimilar.every((other, j) => i === j || !el.contains(other) && !other.contains(el))
            );
            
            return filtered.length > detectedRows.length ? filtered : detectedRows;
        }
        
        // Find siblings with the same structure as the selected element
        findSimilarSiblings(element) {
            if (!element || !element.parentElement) return [element];
            
            const parent = element.parentElement;
            const key = this.getElementStructureKey(element);
            const siblings = [];
            
            // Find all siblings with same tag and class pattern
            for (const child of parent.children) {
                const childKey = this.getElementStructureKey(child);
                if (childKey === key) {
                    siblings.push(child);
                }
            }
            
            console.log('[DataScrapingTool] findSimilarSiblings: key=', key, 'found=', siblings.length);
            
            // If found similar siblings, return them all
            if (siblings.length >= 2) {
                return siblings;
            }
            
            // Try parent's siblings if current level didn't work
            if (parent.parentElement && parent !== document.body) {
                const parentKey = this.getElementStructureKey(parent);
                const parentSiblings = [];
                
                for (const uncle of parent.parentElement.children) {
                    const uncleKey = this.getElementStructureKey(uncle);
                    if (uncleKey === parentKey) {
                        parentSiblings.push(uncle);
                    }
                }
                
                if (parentSiblings.length >= 2) {
                    console.log('[DataScrapingTool] Found parent-level siblings:', parentSiblings.length);
                    return parentSiblings;
                }
            }
            
            return [element];
        }
        
        // P3.3: Detect repeating rows inside container
        detectRepeatingRows(container, rect) {
            console.log('[DataScrapingTool] detectRepeatingRows starting, container:', container.tagName);
            
            const candidates = new Map(); // key -> elements[]
            
            // Collect all elements inside the region recursively
            const collectCandidates = (parent, depth = 0) => {
                if (depth > 5) return; // Increased depth
                
                for (const child of parent.children) {
                    // Skip script, style, hidden elements
                    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'BR', 'HR'].includes(child.tagName)) continue;
                    if (child.id && child.id.startsWith('data-scraping')) continue;
                    
                    const childRect = child.getBoundingClientRect();
                    if (childRect.width < 10 || childRect.height < 10) continue;
                    
                    // Check if element is inside selection region
                    const centerX = childRect.left + childRect.width / 2;
                    const centerY = childRect.top + childRect.height / 2;
                    const isInside = centerX >= rect.left && centerX <= rect.right &&
                                    centerY >= rect.top && centerY <= rect.bottom;
                    
                    if (!isInside) continue;
                    
                    // Use simplified key: tag + first class only
                    const key = this.getElementStructureKey(child);
                    if (!candidates.has(key)) {
                        candidates.set(key, []);
                    }
                    candidates.get(key).push(child);
                    
                    // Recurse into children
                    collectCandidates(child, depth + 1);
                }
            };
            
            collectCandidates(container);
            
            console.log('[DataScrapingTool] Candidate groups:', candidates.size);
            for (const [key, elements] of candidates) {
                if (elements.length >= 2) {
                    console.log('[DataScrapingTool] Group:', key, 'count:', elements.length);
                }
            }
            
            // Find the best group (at least 2 elements, prefer more)
            let bestGroup = [];
            let bestKey = '';
            let bestScore = 0;
            
            for (const [key, elements] of candidates) {
                if (elements.length < 2) continue;
                
                // Verify elements are not nested within each other
                const noNesting = elements.every((el, i) => 
                    elements.every((other, j) => i === j || !el.contains(other) && !other.contains(el))
                );
                
                if (!noNesting) continue;
                
                const first = elements[0];
                const tag = first.tagName.toLowerCase();
                const className = this.getElementClassName(first).toLowerCase();
                
                // Calculate average size
                const avgSize = elements.reduce((sum, el) => {
                    const r = el.getBoundingClientRect();
                    return sum + r.width * r.height;
                }, 0) / elements.length;
                
                // Calculate average number of children (containers have more)
                const avgChildren = elements.reduce((sum, el) => sum + el.children.length, 0) / elements.length;
                
                // Scoring system:
                // 1. Container bonus: article, section, li, or div with "card/item/product" in class
                let containerBonus = 1;
                if (tag === 'article' || tag === 'section' || tag === 'li') {
                    containerBonus = 10;
                } else if (tag === 'div' && (className.includes('card') || className.includes('item') || className.includes('product'))) {
                    containerBonus = 8;
                } else if (tag === 'div') {
                    containerBonus = 3;
                } else if (['p', 'span', 'button', 'a', 'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
                    containerBonus = 0.5; // Penalty for non-container elements
                }
                
                // 2. Size score: prefer larger elements (cards > tips)
                const sizeScore = avgSize > 10000 ? 3 : avgSize > 1000 ? 2 : 1;
                
                // 3. Children score: prefer elements with children (containers)
                const childrenScore = avgChildren > 3 ? 2 : avgChildren > 0 ? 1.5 : 1;
                
                // 4. Count score: more elements is better, but not too much weight
                const countScore = Math.log2(elements.length + 1);
                
                const score = containerBonus * sizeScore * childrenScore * countScore;
                
                console.log('[DataScrapingTool] Scoring:', key, 'count:', elements.length, 
                    'size:', Math.round(avgSize), 'children:', avgChildren.toFixed(1), 
                    'score:', score.toFixed(2));
                
                if (score > bestScore) {
                    bestGroup = elements;
                    bestKey = key;
                    bestScore = score;
                }
            }
            
            console.log('[DataScrapingTool] Best group:', bestKey, 'elements:', bestGroup.length, 'score:', bestScore.toFixed(2));
            
            // Generate a selector for the rows
            let rowSelector = '';
            if (bestGroup.length > 0) {
                const first = bestGroup[0];
                rowSelector = first.tagName.toLowerCase();
                const className = this.getElementClassName(first);
                if (className) {
                    const mainClass = className.split(/\s+/)[0];
                    if (mainClass && !mainClass.includes(':')) {
                        rowSelector += '.' + CSS.escape(mainClass);
                    }
                }
            }
            
            return { rows: bestGroup, rowSelector };
        }
        
        // Get a structural key for an element (tag + first class)
        getElementStructureKey(element) {
            const tag = element.tagName.toLowerCase();
            const className = this.getElementClassName(element);
            // Use only first class for grouping (more flexible)
            const firstClass = className ? className.split(/\s+/)[0] : '';
            return `${tag}|${firstClass}`;
        }
        
        // P3.4: Detect columns from rows
        detectColumns(rows) {
            if (rows.length === 0) return { columns: [], fields: [] };
            
            // Analyze structure of first few rows to find common patterns
            const pathCounts = new Map(); // path -> count
            const pathElements = new Map(); // path -> sample element
            
            for (const row of rows.slice(0, Math.min(10, rows.length))) {
                const atomicElements = this.findAtomicElements(row);
                
                for (const el of atomicElements) {
                    const path = this.getRelativePath(el, row);
                    pathCounts.set(path, (pathCounts.get(path) || 0) + 1);
                    if (!pathElements.has(path)) {
                        pathElements.set(path, el);
                    }
                }
            }
            
            // Keep paths that appear in at least 70% of rows
            const threshold = Math.floor(rows.length * 0.7);
            const validPaths = [];
            
            for (const [path, count] of pathCounts) {
                if (count >= threshold) {
                    validPaths.push({
                        path,
                        count,
                        sample: pathElements.get(path)
                    });
                }
            }
            
            // Sort columns by horizontal position (left to right)
            validPaths.sort((a, b) => {
                const rectA = a.sample.getBoundingClientRect();
                const rectB = b.sample.getBoundingClientRect();
                return rectA.left - rectB.left;
            });
            
            // Create fields from columns - use stable IDs based on index
            const timestamp = Date.now();
            const fields = validPaths.map((col, index) => {
                const dataType = this.getDataType(col.sample);
                const name = this.generateColumnName(col.sample, dataType, index);
                const fieldId = `region_col_${index}`;
                
                // Store fieldId in column for use in buildRowsFromRegion
                col.fieldId = fieldId;
                
                return {
                    id: fieldId,
                    name: name,
                    selector: col.path,
                    dataType: dataType
                };
            });
            
            return { columns: validPaths, fields };
        }
        
        // Find atomic (leaf) elements that contain actual content
        findAtomicElements(container) {
            const atomic = [];
            
            const walk = (el) => {
                // Skip hidden elements
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) return;
                
                // Check if this is an atomic element (has text or is img/input)
                const hasDirectText = Array.from(el.childNodes).some(
                    node => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0
                );
                const isMedia = ['IMG', 'VIDEO', 'AUDIO', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
                const isLink = el.tagName === 'A' && el.href;
                
                if (hasDirectText || isMedia || isLink) {
                    atomic.push(el);
                }
                
                // Continue walking children
                for (const child of el.children) {
                    walk(child);
                }
            };
            
            for (const child of container.children) {
                walk(child);
            }
            
            return atomic;
        }
        
        // Get relative DOM path from ancestor to element
        getRelativePath(element, ancestor) {
            const path = [];
            let current = element;
            
            while (current && current !== ancestor) {
                const tag = current.tagName.toLowerCase();
                const parent = current.parentElement;
                
                if (parent) {
                    const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
                    const index = siblings.indexOf(current);
                    
                    if (siblings.length > 1) {
                        path.unshift(`${tag}:nth-of-type(${index + 1})`);
                    } else {
                        path.unshift(tag);
                    }
                }
                
                current = parent;
            }
            
            return path.join(' > ');
        }
        
        // Generate a meaningful column name
        generateColumnName(element, dataType, index) {
            // Always use generic column names for region selection
            // This ensures consistency between fields and row data
            return `Column ${index + 1}`;
        }
        
        // Build rows data from detected structure
        buildRowsFromRegion(rowElements, columns) {
            const rows = [];
            
            for (const rowEl of rowElements) {
                const row = {};
                
                for (const col of columns) {
                    const cellEl = rowEl.querySelector(col.path) || 
                                  this.findElementByRelativePath(rowEl, col.path);
                    
                    // Use fieldId as key to match with fields in applyColumns
                    const key = col.fieldId || col.path;
                    
                    if (cellEl) {
                        const dataType = this.getDataType(cellEl);
                        row[key] = this.getPreviewValue(cellEl, dataType);
                    } else {
                        row[key] = '';
                    }
                }
                
                rows.push(row);
            }
            
            return rows;
        }
        
        // Find element by relative path (fallback)
        findElementByRelativePath(container, path) {
            try {
                return container.querySelector(path.replace(/:nth-of-type\(\d+\)/g, ''));
            } catch (e) {
                return null;
            }
        }
        
        createTooltip(element) {
            this.removeTooltip();
            
            const tooltip = document.createElement('div');
            tooltip.id = 'data-scraping-tool-element-tooltip';
            
            // Data type and preview value (simplified: no CSS selector)
            const dataType = this.getDataType(element);
            const previewValue = this.getPreviewValue(element, dataType);
            const dataTypeLabel = dataType === 'href' ? '🔗 Link' : 
                                  dataType === 'src' ? '🖼️ Image' : '📝 Text';
            
            // Build tooltip HTML (simplified: only type and preview)
            tooltip.innerHTML = `
                <div class="tooltip-type">${dataTypeLabel}</div>
                <div class="tooltip-preview">${this.escapeHtml(previewValue)}</div>
            `;
            
            // Position in bottom-left corner of screen
            tooltip.style.cssText = `
                position: fixed !important;
                bottom: 20px !important;
                left: 20px !important;
            `;
            
            document.body.appendChild(tooltip);
            this.currentTooltip = tooltip;
        }
        
        removeTooltip() {
            if (this.currentTooltip) {
                this.currentTooltip.remove();
                this.currentTooltip = null;
            }
        }
        
        // Get preview value for tooltip
        getPreviewValue(element, dataType) {
            if (!element) return '';
            
            const maxLen = 80;
            let value = '';
            
            try {
                if (dataType === 'href') {
                    // Extract URL
                    const a = element.tagName === 'A' ? element : element.querySelector('a[href]');
                    if (a) {
                        value = a.href || a.getAttribute('href') || '';
                        // Shorten long URLs
                        if (value.length > maxLen) {
                            const url = new URL(value);
                            value = url.origin + '/...' + url.pathname.slice(-30);
                        }
                    }
                } else if (dataType === 'src') {
                    // Extract image URL
                    const img = element.tagName === 'IMG' ? element : element.querySelector('img');
                    if (img) {
                        value = img.src || img.getAttribute('src') || img.getAttribute('data-src') || '';
                        // Shorten long URLs
                        if (value.length > maxLen) {
                            value = '...' + value.slice(-60);
                        }
                    }
                } else {
                    // Extract text
                    value = (element.textContent || element.innerText || '').trim();
                    // P1.1: Normalize text - remove \n, \t, normalize multiple spaces
                    value = value.replace(/\n/g, ' ').replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
                }
            } catch (e) {
                value = '';
            }
            
            // Truncate if too long
            if (value.length > maxLen) {
                value = value.slice(0, maxLen) + '...';
            }
            
            return value || '(empty)';
        }
        
        // Escape HTML for safe display
        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text || '';
            return div.innerHTML;
        }
        
        // Field management
        addFieldFromElement(element) {
            if (!element) return;
            
            // Visual feedback
            element.classList.add('onpage-selected-element');
            
            const id = this.generateFieldId();
            const name = this.generateElementName(element);
            const dataType = this.getDataType(element);

            // CRITICAL: Find repeating container FIRST, then build contextual selector
            const ctx = window.ContextUtils;
            let parentSelector = null;
            let selector = this.generateSelector(element);
            
            // Try to find repeating container (e.g., product card on Amazon/eBay)
            if (ctx?.inferRepeatingContainerSelector) {
                try {
                    parentSelector = ctx.inferRepeatingContainerSelector(element);
                    if (parentSelector) {
                        // Validate that container exists and repeats
                        const containers = document.querySelectorAll(parentSelector);
                        if (containers && containers.length > 1) {
                            // Build contextual selector: path from container to element
                            const container = element.closest(parentSelector);
                            if (container) {
                                const contextualSelector = this.generateContextualSelector(element, container);
                                if (contextualSelector) {
                                    selector = contextualSelector;
                                }
                            }
                        } else {
                            parentSelector = null; // Not a valid repeating container
                        }
                    }
                } catch (e) {}
            }

            // Store a lightweight sample to disambiguate overly-generic selectors (e.g. Amazon a-color-base)
            const rawSampleText = (() => {
                try {
                    if (window.TextExtractionUtils?.extractTextSmart) {
                        return window.TextExtractionUtils.extractTextSmart(element, { autoSeparate: true });
                    }
                } catch (e) {}
                return (element.textContent || element.innerText || '').trim();
            })();
            const sampleText = String(rawSampleText || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
            const sampleTag = (element.tagName || '').toUpperCase();
            const sampleClasses = (this.getElementClassName(element) || '')
                .split(/\s+/)
                .filter(c => c && !c.startsWith('onpage-') && !c.startsWith('data-scraping-tool-'))
                .slice(0, 10); // keep small
            
            const field = {
                id,
                name,
                selector,
                originalSelector: this.generateSelector(element), // Keep simple selector for fallback
                dataType,
                parentSelector, // Now set immediately at click time
                sampleText,
                sampleTag,
                sampleClasses
            };
            
            // Check for duplicates
            const duplicate = (this.state.fields || []).some(f => 
                f.selector === field.selector && f.name === field.name
            );
            if (duplicate) return;
            
            this.fieldElementsById.set(field.id, element);
            this.state.fields = [...(this.state.fields || []), field];
            
            // Recompute common parent (for multi-field scenarios)
            this.updateParentSelectors();
            
            // Save state
            this.previewDirty = true;
            this.saveStateForCurrentOrigin().catch(() => {});
            
            // Notify side panel
            this.notifySidePanel('fieldAdded', { field });
            
            // Refresh preview and notify
            this.ensurePreviewFresh().then(() => {
                this.notifySidePanel('previewUpdated', {
                    rows: this.applyColumns(this.lastPreviewRows).rows,
                    fields: this.state.fields
                });
            }).catch(() => {});
        }
        
        /**
         * Generate a contextual selector that uniquely identifies the element within a container.
         * Instead of just "span.a-color-base", returns something like ".a-price .a-offscreen"
         * which is unique within the product card.
         */
        generateContextualSelector(element, container) {
            if (!element || !container || !container.contains(element)) return null;
            
            // Build path from element up to container
            const pathParts = [];
            let current = element;
            let depth = 0;
            const maxDepth = 10;
            
            while (current && current !== container && depth < maxDepth) {
                const part = this.getElementSelectorPart(current);
                if (part) {
                    pathParts.unshift(part);
                }
                current = current.parentElement;
                depth++;
            }
            
            if (pathParts.length === 0) return null;
            
            // Try progressively shorter paths until we find one that's unique within container
            for (let i = 0; i < pathParts.length; i++) {
                const selector = pathParts.slice(i).join(' ');
                try {
                    const matches = container.querySelectorAll(selector);
                    if (matches.length === 1 && matches[0] === element) {
                        return selector;
                    }
                } catch (e) {}
            }
            
            // If no unique selector found, use the full path
            const fullSelector = pathParts.join(' ');
            
            // Verify it works
            try {
                const matches = container.querySelectorAll(fullSelector);
                if (matches.length >= 1) {
                    return fullSelector;
                }
            } catch (e) {}
            
            return null;
        }
        
        /**
         * Get a selector part for a single element (tag + significant classes/attributes)
         */
        getElementSelectorPart(element) {
            if (!element || !element.tagName) return null;
            
            const tag = element.tagName.toLowerCase();
            
            // Prioritize data attributes that are semantic
            const semanticDataAttrs = ['data-cy', 'data-testid', 'data-action'];
            for (const attr of semanticDataAttrs) {
                const val = element.getAttribute?.(attr);
                if (val && !val.includes(' ')) {
                    return `[${attr}="${val}"]`;
                }
            }
            
            // Use ID if short and meaningful
            if (element.id && element.id.length < 30 && !/^[a-z0-9]{20,}$/i.test(element.id)) {
                return `#${CSS.escape ? CSS.escape(element.id) : element.id}`;
            }
            
            // Build from tag and significant classes
            const classNameStr = this.getElementClassName(element);
            if (!classNameStr) return tag;
            
            const classes = classNameStr.split(/\s+/).filter(cls => 
                cls.length > 0 && 
                cls.length < 30 &&
                !cls.startsWith('onpage-') && 
                !cls.startsWith('data-scraping-tool-') &&
                !/^[a-z0-9]{15,}$/i.test(cls) // Skip hash-like classes
            );
            
            if (classes.length === 0) return tag;
            
            // Prefer semantic class names
            const semanticClass = classes.find(cls => {
                const lower = cls.toLowerCase();
                return lower.includes('price') || lower.includes('title') || 
                       lower.includes('name') || lower.includes('brand') ||
                       lower.includes('rating') || lower.includes('image') ||
                       lower.includes('description') || lower.includes('offscreen');
            });
            
            if (semanticClass) {
                return `.${semanticClass}`;
            }
            
            // Use first 1-2 classes to keep selector short but specific
            const selectedClasses = classes.slice(0, 2);
            return `${tag}.${selectedClasses.join('.')}`;
        }
        
        removeField(fieldId) {
            if (!fieldId) return;
            
            // Remove highlight from element
            const element = this.fieldElementsById.get(fieldId);
            if (element) {
                try { element.classList.remove('onpage-selected-element'); } catch (e) {}
            }
            
            this.state.fields = (this.state.fields || []).filter(f => f.id !== fieldId);
            this.fieldElementsById.delete(fieldId);
            this.previewDirty = true;
            
            this.saveStateForCurrentOrigin().catch(() => {});
            
            // Refresh preview
            this.ensurePreviewFresh().then(() => {
                this.notifySidePanel('previewUpdated', {
                    rows: this.applyColumns(this.lastPreviewRows).rows,
                    fields: this.state.fields
                });
            }).catch(() => {});
        }
        
        updateField(fieldId, updates) {
            if (!fieldId || !updates) return;
            
            const field = (this.state.fields || []).find(f => f.id === fieldId);
            if (field) {
                Object.assign(field, updates);
                this.previewDirty = true;
                this.saveStateForCurrentOrigin().catch(() => {});
            }
        }
        
        clearAllFields() {
            // Remove all highlights
            this.state.fields?.forEach(f => {
                const el = this.fieldElementsById.get(f.id);
                if (el) {
                    try { el.classList.remove('onpage-selected-element'); } catch (e) {}
                }
            });
            
            // Also clean up any orphaned highlights
            document.querySelectorAll('.onpage-selected-element').forEach(el => {
                try { el.classList.remove('onpage-selected-element'); } catch (e) {}
            });
            
            this.state.fields = [];
            this.state.columns = {};
            this.fieldElementsById.clear();
            this.lastPreviewRows = [];
            this.previewDirty = true;
            
            this.saveStateForCurrentOrigin().catch(() => {});
            
            this.notifySidePanel('previewUpdated', {
                rows: [],
                fields: []
            });
        }
        
        updateParentSelectors() {
            const fields = this.state.fields || [];
            if (fields.length === 0) return;
            
            const ctx = window.ContextUtils;
            
            // Strategy 1: Try to use existing parentSelector from any field
            // (if one field already has a good container, use it for all)
            let bestParentSelector = null;
            for (const f of fields) {
                if (f.parentSelector) {
                    try {
                        const containers = document.querySelectorAll(f.parentSelector);
                        if (containers && containers.length > 1) {
                            bestParentSelector = f.parentSelector;
                            break;
                        }
                    } catch (e) {}
                }
            }
            
            // Strategy 2: If no existing parentSelector, infer from first field's element
            if (!bestParentSelector && ctx?.inferRepeatingContainerSelector) {
                for (const f of fields) {
                    const el = this.fieldElementsById.get(f.id);
                    if (el) {
                        try {
                            const inferred = ctx.inferRepeatingContainerSelector(el);
                            if (inferred) {
                                const containers = document.querySelectorAll(inferred);
                                if (containers && containers.length > 1) {
                                    bestParentSelector = inferred;
                                    break;
                                }
                            }
                        } catch (e) {}
                    }
                }
            }
            
            // Strategy 3: Fallback to findCommonParent for traditional approach
            if (!bestParentSelector) {
                const nodes = [];
                fields.forEach(f => {
                    const el = this.fieldElementsById.get(f.id);
                    if (el) nodes.push({ element: el, selector: f.originalSelector || f.selector, name: f.name });
                });
                
                const commonParent = this.findCommonParent(nodes);
                const parentSelector = commonParent ? this.generateParentSelector(commonParent) : null;
                
                if (parentSelector) {
                    try {
                        const containers = document.querySelectorAll(parentSelector);
                        if (containers.length > 1) {
                            bestParentSelector = parentSelector;
                        }
                    } catch (e) {}
                }
            }
            
            // Now update all fields with the best parent selector
            if (bestParentSelector) {
                this.state.fields = fields.map(f => {
                    const el = this.fieldElementsById.get(f.id);
                    const originalSelector = f.originalSelector || f.selector;
                    
                    // Try to refine selector within the container
                    let refinedSelector = f.selector; // Keep existing if already refined
                    if (el) {
                        try {
                            const container = el.closest(bestParentSelector);
                            if (container) {
                                const contextual = this.generateContextualSelector(el, container);
                                if (contextual) {
                                    // Validate contextual selector works across containers
                                    const containers = document.querySelectorAll(bestParentSelector);
                                    let foundCount = 0;
                                    for (const c of containers) {
                                        try {
                                            if (c.querySelector(contextual)) foundCount++;
                                            if (foundCount >= 3) break;
                                        } catch (e) {}
                                    }
                                    if (foundCount >= 2) {
                                        refinedSelector = contextual;
                                    }
                                }
                            }
                        } catch (e) {}
                    }
                    
                    return {
                        ...f,
                        originalSelector,
                        parentSelector: bestParentSelector,
                        selector: refinedSelector
                    };
                });
            }
        }
        
        // Selector generation
        generateFieldId() {
            try {
                if (crypto && typeof crypto.randomUUID === 'function') {
                    return `fld_${crypto.randomUUID()}`;
                }
            } catch (e) {}
            return `fld_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        }
        
        generateSelector(element) {
            if (!element || element === document) return '';
            
            // Try ID first
            if (element.id) {
                const selector = `#${element.id}`;
                try {
                    const matches = document.querySelectorAll(selector);
                    if (matches.length === 1) return selector;
                } catch (e) {}
            }
            
            // Try data attributes
            if (element.dataset?.testid) {
                return `[data-testid="${element.dataset.testid}"]`;
            }
            
            // Build from tag and classes
            let selector = element.tagName.toLowerCase();
            
            const classNameStr = this.getElementClassName(element);
            if (classNameStr) {
                const cleanClasses = classNameStr.split(/\s+/).filter(cls => 
                    cls.length > 0 && !cls.startsWith('onpage-') && !cls.startsWith('data-scraping-tool-')
                );
                if (cleanClasses.length > 0) {
                    selector += '.' + cleanClasses[0];
                }
            }
            
            return selector;
        }
        
        generateElementName(element) {
            const tagName = element.tagName.toLowerCase();
            
            if (element.id) return element.id;
            if (element.dataset?.testid) return element.dataset.testid;
            
            const classNameStr = this.getElementClassName(element);
            if (classNameStr) {
                const classes = classNameStr.split(/\s+/).filter(cls => 
                    cls.length > 0 && !cls.startsWith('onpage-') && !cls.startsWith('data-scraping-tool-')
                );
                
                if (classes.length > 0) {
                    // Prefer semantic names
                    const semanticClass = classes.find(cls => {
                        const lower = cls.toLowerCase();
                        return lower.includes('price') || lower.includes('title') || 
                               lower.includes('name') || lower.includes('brand') ||
                               lower.includes('rating') || lower.includes('image') ||
                               lower.includes('description') || lower.includes('sold');
                    });
                    
                    if (semanticClass) return semanticClass;
                    
                    // Use first good class
                    const goodClass = classes.find(cls => 
                        cls.length > 3 && cls.length < 40 &&
                        !/^[a-z0-9]{20,}$/i.test(cls) &&
                        !/^\d/.test(cls)
                    );
                    
                    if (goodClass) return goodClass;
                    return classes[0];
                }
            }
            
            // Based on data type
            const dataType = this.getDataType(element);
            if (dataType === 'src') return 'image';
            if (dataType === 'href') return 'link';
            
            // Use more user-friendly fallback names
            const fieldCount = (this.state?.fields?.length || 0) + 1;
            // Use capitalized tag name instead of technical "tagName_field_N"
            const capitalizedTag = tagName.charAt(0).toUpperCase() + tagName.slice(1);
            return `Field ${fieldCount}`;
        }
        
        getDataType(element) {
            if (!element) return 'textContent';
            
            try {
                if (window.DataScrapingToolElementUtils?.inferDataType) {
                    return window.DataScrapingToolElementUtils.inferDataType(element);
                }
            } catch (e) {}
            
            const tag = (element.tagName || '').toUpperCase();
            
            // For <a> tags, check if it's a card-like wrapper
            if (tag === 'A') {
                // Check if this is a product card link (contains structured content)
                if (this.isCardLikeLink(element)) {
                    return 'textContent'; // Treat as container, not just a link
                }
                return 'href';
            }
            
            if (tag === 'IMG') return 'src';
            
            // Check if element is inside a card-like link but should extract text
            const parentLink = element.closest('a');
            if (parentLink && this.isCardLikeLink(parentLink)) {
                // Element is inside a card link - check what data to extract
                if (tag === 'IMG') return 'src';
                
                // For text elements inside card, extract text
                return 'textContent';
            }
            
            // Check for image container
            try {
                const img = element.querySelector('img');
                if (img) {
                    const className = (element.className || '').toString().toLowerCase();
                    if (className.includes('img') || className.includes('image') || 
                        className.includes('photo') || className.includes('thumb')) {
                        return 'src';
                    }
                    const text = (element.textContent || '').trim();
                    if (text.length < 10) return 'src';
                }
            } catch (e) {}
            
            return 'textContent';
        }
        
        // Parent finding
        findCommonParent(elements) {
            if (elements.length === 0) return null;
            
            const parentPaths = elements.map(el => {
                const path = [];
                let current = el.element;
                let depth = 0;
                while (current && current !== document.body && depth < 20) {
                    path.push(current);
                    current = current.parentElement;
                    depth++;
                }
                return path;
            });
            
            if (parentPaths.length === 0) return null;
            
            const canFindAllFields = (container) => {
                if (!container) return false;
                for (const el of elements) {
                    if (!el.selector) continue;
                    try {
                        const found = container.querySelector(el.selector);
                        if (!found && el.element && !container.contains(el.element)) {
                            return false;
                        }
                    } catch (e) {
                        return false;
                    }
                }
                return true;
            };
            
            const isMeaningfulContainer = (className, tagName) => {
                const lowerClass = className.toLowerCase();
                return lowerClass.includes('card') || lowerClass.includes('item') || 
                       lowerClass.includes('product') || lowerClass.includes('result') ||
                       lowerClass.includes('listing') || tagName === 'article' || 
                       tagName === 'section' || tagName === 'li';
            };
            
            let commonParent = null;
            const firstPath = parentPaths[0];
            
            for (let i = 0; i < firstPath.length; i++) {
                const candidate = firstPath[i];
                const isCommon = parentPaths.every(path => path.includes(candidate));
                if (!isCommon) break;
                
                const className = this.getElementClassName(candidate).toLowerCase();
                const tagName = candidate.tagName.toLowerCase();
                
                if (tagName === 'a') continue;
                
                if (canFindAllFields(candidate)) {
                    if (isMeaningfulContainer(className, tagName)) {
                        commonParent = candidate;
                    } else if (!commonParent) {
                        commonParent = candidate;
                    }
                }
            }
            
            return commonParent || firstPath[0]?.parentElement || null;
        }
        
        generateParentSelector(parent) {
            if (!parent || parent === document.body) return null;
            
            // Try data-component-type (Amazon)
            const componentType = parent.getAttribute?.('data-component-type');
            if (componentType) {
                const tag = parent.tagName.toLowerCase();
                const sel = `${tag}[data-component-type="${componentType}"]`;
                try {
                    if (document.querySelectorAll(sel).length > 1) return sel;
                } catch (e) {}
            }
            
            if (parent.id) return `#${parent.id}`;
            if (parent.dataset?.testid) return `[data-testid="${parent.dataset.testid}"]`;
            
            const classNameStr = this.getElementClassName(parent);
            if (classNameStr) {
                const classes = classNameStr.split(/\s+/).filter(cls => 
                    cls.length > 0 && !cls.startsWith('onpage-')
                );
                if (classes.length > 0) {
                    return `${parent.tagName.toLowerCase()}.${classes.join('.')}`;
                }
            }
            
            return parent.tagName.toLowerCase();
        }
        
        refineSelectorWithinParent(element, parentContainer) {
            if (!element || !parentContainer) return null;
            
            if (element.id) {
                const sel = `#${CSS.escape ? CSS.escape(element.id) : element.id}`;
                try {
                    const matches = parentContainer.querySelectorAll(sel);
                    if (matches.length === 1 && matches[0] === element) return sel;
                } catch (e) {}
            }
            
            const tag = element.tagName?.toLowerCase() || '';
            if (!tag) return null;
            
            const classNameStr = this.getElementClassName(element);
            const classes = classNameStr
                ? classNameStr.split(/\s+/).filter(c => c.length > 0 && !c.startsWith('onpage-'))
                : [];
            
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
            
            for (const sel of candidates) {
                try {
                    const matches = Array.from(parentContainer.querySelectorAll(sel));
                    if (matches.length === 1 && matches[0] === element) {
                        return sel;
                    }
                } catch (e) {}
            }
            
            return candidates[0] || null;
        }
        
        // State persistence
        getOriginSafe() {
            try {
                return location.origin || null;
            } catch (e) {
                return null;
            }
        }
        
        async loadStateForCurrentOrigin() {
            this.origin = this.getOriginSafe();
            if (!this.origin) return;
            
            if (!chrome?.storage?.local) return;
            
            try {
                const res = await chrome.storage.local.get(['data-scraping-tool_state_by_origin']);
                const map = res['data-scraping-tool_state_by_origin'] || {};
                const existing = map[this.origin];
                
                if (existing && Array.isArray(existing.fields)) {
                    this.state = {
                        version: 1,
                        fields: existing.fields.filter(f => f && f.selector),
                        columns: existing.columns || {},
                        updatedAt: existing.updatedAt || Date.now()
                    };
                }
            } catch (e) {
                if (!e?.message?.includes('context')) {
                    console.log('Error loading state:', e);
                }
            }
        }
        
        async saveStateForCurrentOrigin() {
            if (!this.origin || !chrome?.storage?.local) return;
            
            try {
                this.state.updatedAt = Date.now();
                const res = await chrome.storage.local.get(['data-scraping-tool_state_by_origin']);
                const map = res['data-scraping-tool_state_by_origin'] || {};
                map[this.origin] = this.state;
                await chrome.storage.local.set({ 'data-scraping-tool_state_by_origin': map });
            } catch (e) {
                if (!e?.message?.includes('context')) {
                    console.log('Error saving state:', e);
                }
            }
        }
        
        // Preview and extraction
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
                    if (style.display === 'none' || style.visibility === 'hidden') return false;
                    
                    // Filter out elements in sidebar/navigation
                    if (this.isInSidebarOrNavigation(el)) return false;
                    
                    return true;
                } catch (e) {
                    return false;
                }
            });
        }
        
        // Check if element is inside sidebar, navigation or other non-content areas
        isInSidebarOrNavigation(element) {
            if (!element) return false;
            
            // Check element and its ancestors for sidebar/nav indicators
            let current = element;
            let depth = 0;
            const maxDepth = 15;
            
            while (current && current !== document.body && depth < maxDepth) {
                const tagName = current.tagName?.toLowerCase() || '';
                const className = (current.className?.toString() || '').toLowerCase();
                const id = (current.id || '').toLowerCase();
                const role = (current.getAttribute?.('role') || '').toLowerCase();
                
                // Check tag names that indicate non-content areas
                if (['aside', 'nav', 'header', 'footer'].includes(tagName)) {
                    // header/footer near body are page-level, not product-level
                    if (tagName === 'header' || tagName === 'footer') {
                        if (current.parentElement === document.body) return true;
                    } else {
                        return true;
                    }
                }
                
                // Check ARIA roles
                if (['navigation', 'complementary', 'banner', 'contentinfo', 'menu', 'menubar'].includes(role)) {
                    return true;
                }
                
                // Check class names and IDs for sidebar/filter indicators
                const sidebarIndicators = [
                    'sidebar', 'side-bar', 'sidenav', 'side-nav',
                    'filter', 'refine', 'refinement', 'refinements', 'facet', 'navigation', 'nav-',
                    'menu', 'toolbar', 'header', 'footer',
                    'left-rail', 'right-rail', 'leftcol', 'rightcol',
                    'x-refine', 'srp-sidebar', // eBay specific
                    's-refinements' // Amazon specific
                ];
                
                for (const indicator of sidebarIndicators) {
                    if (className.includes(indicator) || id.includes(indicator)) {
                        return true;
                    }
                }
                
                current = current.parentElement;
                depth++;
            }
            
            return false;
        }

        /**
         * If we only have one field and no parentSelector, infer a repeating container
         * from the field's actual DOM matches (works even when state is restored and
         * we no longer have the originally clicked element).
         */
        inferParentSelectorFromMatchesForSingleField(field) {
            if (!field) return null;
            const ctx = window.ContextUtils;
            if (!ctx?.inferRepeatingContainerSelector) return null;

            // Try both refined + original selector
            const selectorsToTry = [field.selector];
            if (field.originalSelector && field.originalSelector !== field.selector) {
                selectorsToTry.push(field.originalSelector);
            }

            const candidatesCount = new Map();

            for (const sel of selectorsToTry) {
                const matches = this.getVisibleMatches(sel, document).slice(0, 50);
                for (const m of matches) {
                    try {
                        const inferred = ctx.inferRepeatingContainerSelector(m);
                        if (inferred) {
                            candidatesCount.set(inferred, (candidatesCount.get(inferred) || 0) + 1);
                        }
                    } catch (e) {}
                }
            }

            // Pick most frequent inferred selector that actually repeats on page.
            const sorted = Array.from(candidatesCount.entries()).sort((a, b) => b[1] - a[1]);
            for (const [inferred] of sorted) {
                try {
                    const containers = document.querySelectorAll(inferred);
                    if (containers && containers.length > 1) return inferred;
                } catch (e) {}
            }

            return null;
        }
        
        async ensurePreviewFresh() {
            if (!this.previewDirty && this.lastPreviewRows.length > 0) return;
            await this.runPreview();
            this.previewDirty = false;
        }
        
        async runPreview() {
            await this.waitForDynamicContent();
            this.lastPreviewRows = this.buildRows(50);
        }
        
        async waitForDynamicContent(maxWaitMs = 1000) {
            const fields = this.state.fields || [];
            if (fields.length === 0) return;
            
            const getElementCounts = () => fields.map(f => {
                try {
                    return document.querySelectorAll(f.selector).length;
                } catch (e) {
                    return 0;
                }
            });
            
            let previousCounts = getElementCounts();
            let stableIterations = 0;
            let elapsed = 0;
            
            while (elapsed < maxWaitMs && stableIterations < 2) {
                await new Promise(r => setTimeout(r, 150));
                elapsed += 150;
                
                const currentCounts = getElementCounts();
                const isStable = currentCounts.every((count, i) => count === previousCounts[i]);
                
                if (isStable) {
                    stableIterations++;
                } else {
                    stableIterations = 0;
                }
                
                previousCounts = currentCounts;
            }
        }
        
        extractValueFromElement(containerEl, field) {
            if (!containerEl || !field) return '';
            
            const dataType = field.dataType || 'textContent';
            const utils = window.DataScrapingToolElementUtils;
            const textUtils = window.TextExtractionUtils;
            const ctx = window.ContextUtils;
            
            // Inline price check (guaranteed to work even if ContextUtils not loaded)
            const looksLikePriceInline = (text) => {
                const t = String(text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
                if (!t) return false;
                const hasCurrency = /(\$|€|£|₽|¥|₹|\brub\b|\busd\b|\beur\b|\bgbp\b|\bchf\b|\bjpy\b)/i.test(t);
                const hasNumber = /\d/.test(t);
                return hasCurrency && hasNumber;
            };
            
            const extractOne = (node) => {
                if (!node) return '';
                
                if (dataType === 'href') {
                    if (utils?.extractHrefFromNode) return utils.extractHrefFromNode(node);
                    const a = node.tagName === 'A' ? node : node.querySelector?.('a[href]');
                    return (a?.href || a?.getAttribute?.('href') || '').trim();
                }
                
                if (dataType === 'src') {
                    if (utils?.extractSrcFromNode) return utils.extractSrcFromNode(node);
                    const img = node.tagName === 'IMG' ? node : node.querySelector?.('img');
                    return (img?.src || img?.getAttribute?.('src') || img?.getAttribute?.('data-src') || '').trim();
                }
                
                // Check if it's an image container
                const className = (node.className || '').toString().toLowerCase();
                const isImageContainer = className.includes('img') || className.includes('image');
                
                if (isImageContainer) {
                    const img = node.querySelector?.('img');
                    if (img) {
                        const imgSrc = img.src || img.getAttribute?.('src') || img.getAttribute?.('data-src') || '';
                        if (imgSrc) return imgSrc.trim();
                    }
                }
                
                // Use TextExtractionUtils for smart text extraction with auto-separation
                if (textUtils?.extractTextSmart) {
                    return textUtils.extractTextSmart(node, {
                        preferVisible: true,
                        autoSeparate: true
                    });
                }
                
                return utils?.extractTextFromNode 
                    ? utils.extractTextFromNode(node) 
                    : (() => {
                        // P1.1: Normalize text when TextExtractionUtils is not available
                        const rawText = (node.textContent || '').trim();
                        return rawText.replace(/\n/g, ' ').replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
                    })();
            };
            
            // Try multiple selectors: refined and original
            const selectorsToTry = [field.selector];
            if (field.originalSelector && field.originalSelector !== field.selector) {
                selectorsToTry.push(field.originalSelector);
            }
            
            for (const selector of selectorsToTry) {
                let el = null;
                
                // Strategy 1: Direct querySelector within container (but prefer best match if multiple)
                let matches = [];
                try {
                    matches = Array.from(containerEl.querySelectorAll(selector));
                } catch (e) {
                    matches = [];
                }
                if (matches.length > 0) {
                    // If multiple matches, choose best one based on sample
                    if (matches.length > 1 && ctx?.pickBestMatch) {
                        const selStr = `${field.selector || ''} ${field.originalSelector || ''}`.toLowerCase();
                        const preferPriceIfAny = selStr.includes('a-color-base');
                        const best = ctx.pickBestMatch(matches, {
                            sampleText: field.sampleText,
                            sampleTag: field.sampleTag,
                            sampleClasses: field.sampleClasses
                        }, textUtils, { preferPriceIfAny });
                        el = best || matches[0];
                    } else {
                        el = matches[0];
                    }
                }
                
                // Strategy 2: Find element that is contained within this container
                if (!el) {
                    try {
                        const all = Array.from(document.querySelectorAll(selector));
                        el = all.find(x => containerEl.contains(x)) || null;
                    } catch (e) {}
                }
                
                // Strategy 3: Search in parent (for WB-style layouts)
                if (!el && containerEl.parentElement) {
                    try {
                        const parent = containerEl.parentElement;
                        const allInParent = Array.from(parent.querySelectorAll(selector));
                        // Find element that's in the same "logical card" 
                        // by checking if it's a sibling or close relative
                        el = allInParent.find(x => {
                            const xParent = x.closest('[class*="card"], [class*="product"], [class*="item"], article, li');
                            const cParent = containerEl.closest('[class*="card"], [class*="product"], [class*="item"], article, li');
                            return xParent === cParent;
                        }) || null;
                    } catch (e) {}
                }
                
                if (el) {
                    const value = extractOne(el);
                    if (value && value.trim()) {
                        // Guard for generic Amazon selectors: don't treat "Sponsored"/ratings as "price"
                        const selStr = `${field.selector || ''} ${field.originalSelector || ''} ${field.name || ''}`.toLowerCase();
                        const isGenericSelector = selStr.includes('a-color-base') || selStr.includes('a-size-base');
                        
                        if (isGenericSelector) {
                            // Use both inline and ContextUtils checks
                            const isPriceLike = looksLikePriceInline(value) || (ctx?.looksLikePrice ? ctx.looksLikePrice(value) : false);
                            
                            if (!isPriceLike) {
                                // Try to find a real price-like candidate inside container instead of returning junk
                                const priceCandidates = [];

                                // 1) price-like among the same selector matches
                                for (const m of matches || []) {
                                    const v = extractOne(m);
                                    if (v && looksLikePriceInline(v)) priceCandidates.push(m);
                                }

                                // 2) common Amazon price selectors (even if user selected a generic class)
                                const extraSelectors = [
                                    '[data-cy="secondary-offer-recipe"] .a-color-base',
                                    '[data-cy="price-recipe"] .a-color-base',
                                    '.a-price .a-offscreen',
                                    'span.a-price > span.a-offscreen',
                                    '.a-price-whole'
                                ];

                                for (const extraSel of extraSelectors) {
                                    try {
                                        const extra = Array.from(containerEl.querySelectorAll(extraSel));
                                        for (const x of extra) {
                                            const xv = extractOne(x);
                                            if (xv && looksLikePriceInline(xv)) {
                                                priceCandidates.push(x);
                                            }
                                        }
                                    } catch (e) {}
                                }

                                if (priceCandidates.length > 0) {
                                    // Pick best price candidate
                                    if (ctx?.pickBestMatch) {
                                        const bestPrice = ctx.pickBestMatch(priceCandidates, {
                                            sampleText: field.sampleText,
                                            sampleTag: field.sampleTag,
                                            sampleClasses: field.sampleClasses
                                        }, textUtils, { preferPriceIfAny: true });
                                        const bestVal = extractOne(bestPrice);
                                        if (bestVal && bestVal.trim()) return bestVal.trim();
                                    } else {
                                        // Fallback: just use first price candidate
                                        const firstVal = extractOne(priceCandidates[0]);
                                        if (firstVal && firstVal.trim()) return firstVal.trim();
                                    }
                                }

                                // No price found in this container — return empty to avoid exporting junk like "Sponsored"
                                return '';
                            }
                        }

                        return value.trim();
                    }
                }
                
                // Try other matches within container
                try {
                    const matches = Array.from(containerEl.querySelectorAll(selector));
                    for (const m of matches) {
                        const v = extractOne(m);
                        if (v && v.trim()) return v.trim();
                    }
                } catch (e) {}
            }
            
            return '';
        }
        
        buildRows(limit = 50) {
            const fields = this.state.fields || [];
            if (fields.length === 0) return [];
            
            // Find common parent selector
            const parentSelectors = fields.map(f => f.parentSelector).filter(Boolean);
            let commonParent = null;
            
            // Check if all fields have the same parentSelector
            if (parentSelectors.length > 0 && parentSelectors.every(ps => ps === parentSelectors[0])) {
                commonParent = parentSelectors[0];
            }
            
            // If fields have different parentSelectors, try to find a valid one
            if (!commonParent && parentSelectors.length > 0) {
                // Use the first valid parentSelector that actually finds containers
                for (const ps of parentSelectors) {
                    try {
                        const containers = document.querySelectorAll(ps);
                        if (containers && containers.length > 1) {
                            commonParent = ps;
                            // Update all fields to use this parent
                            fields.forEach(f => { f.parentSelector = ps; });
                            break;
                        }
                    } catch (e) {}
                }
            }
            
            let rows = [];
            
            // Strategy 1: Container-based extraction
            // For single field without parent, try to infer
            if (!commonParent && fields.length === 1) {
                const inferred = this.inferParentSelectorFromMatchesForSingleField(fields[0]);
                if (inferred) {
                    fields[0].parentSelector = inferred;
                    commonParent = inferred;
                }
            }
            
            // For multiple fields without common parent, try to infer from field matches
            if (!commonParent && fields.length > 1) {
                // First try: use cached DOM elements (if available from current session)
                const ctx = window.ContextUtils;
                for (const f of fields) {
                    const el = this.fieldElementsById.get(f.id);
                    if (el && ctx?.inferRepeatingContainerSelector) {
                        try {
                            const inferred = ctx.inferRepeatingContainerSelector(el);
                            if (inferred) {
                                const containers = document.querySelectorAll(inferred);
                                if (containers && containers.length > 1) {
                                    commonParent = inferred;
                                    fields.forEach(field => { field.parentSelector = inferred; });
                                    break;
                                }
                            }
                        } catch (e) {}
                    }
                }
                
                // Second try: infer from selector matches (works even after page reload)
                if (!commonParent) {
                    for (const f of fields) {
                        const inferred = this.inferParentSelectorFromMatchesForSingleField(f);
                        if (inferred) {
                            try {
                                const containers = document.querySelectorAll(inferred);
                                if (containers && containers.length > 1) {
                                    commonParent = inferred;
                                    fields.forEach(field => { field.parentSelector = inferred; });
                                    break;
                                }
                            } catch (e) {}
                        }
                    }
                }
            }

            if (commonParent) {
                let containers = [];
                try {
                    containers = this.getVisibleMatches(commonParent, document);
                } catch (e) {}
                
                if (containers.length > 0) {
                    for (let i = 0; i < containers.length && rows.length < limit; i++) {
                        const c = containers[i];
                        const row = {};
                        
                        fields.forEach(f => {
                            row[f.id] = this.extractValueFromElement(c, f);
                        });
                        
                        const hasAny = Object.values(row).some(v => String(v || '').trim());
                        if (hasAny) rows.push(row);
                    }
                    
                    // Check quality: if too many empty cells, try fallback
                    if (rows.length > 0) {
                        const totalCells = rows.length * fields.length;
                        let emptyCells = 0;
                        rows.forEach(r => {
                            fields.forEach(f => {
                                if (!String(r[f.id] || '').trim()) emptyCells++;
                            });
                        });
                        
                        // If more than 60% empty, try index-based (was 40%, too aggressive)
                        if (emptyCells / totalCells > 0.6) {
                            const indexRows = this.buildRowsByIndex(fields, limit);
                            // Check if index-based is better
                            if (indexRows.length > 0) {
                                let indexEmptyCells = 0;
                                const indexTotalCells = indexRows.length * fields.length;
                                indexRows.forEach(r => {
                                    fields.forEach(f => {
                                        if (!String(r[f.id] || '').trim()) indexEmptyCells++;
                                    });
                                });
                                
                                if (indexEmptyCells / indexTotalCells < emptyCells / totalCells) {
                                    return indexRows;
                                }
                            }
                        }
                        
                        return rows;
                    }
                }
            }
            
            // Strategy 2: Fallback - align by index
            return this.buildRowsByIndex(fields, limit);
        }
        
        buildRowsByIndex(fields, limit = 50) {
            const rows = [];
            const textUtils = window.TextExtractionUtils;
            const ctx = window.ContextUtils;
            
            // Inline price check (doesn't depend on ContextUtils loading)
            const looksLikePriceInline = (text) => {
                const t = String(text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
                if (!t) return false;
                // Currency markers
                const hasCurrency = /(\$|€|£|₽|¥|₹|\brub\b|\busd\b|\beur\b|\bgbp\b|\bchf\b|\bjpy\b)/i.test(t);
                // Numbers with decimals/separators
                const hasNumber = /\d/.test(t);
                return hasCurrency && hasNumber;
            };
            
            // Get elements for each field, trying both original and refined selectors
            const columns = fields.map(f => {
                let elements = this.getVisibleMatches(f.selector, document);
                // If selector finds nothing, try original
                if (elements.length === 0 && f.originalSelector && f.originalSelector !== f.selector) {
                    elements = this.getVisibleMatches(f.originalSelector, document);
                }
                return elements;
            });
            
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
                        const a = el.tagName === 'A' ? el : el.querySelector('a[href]');
                        row[f.id] = (a?.href || a?.getAttribute('href') || '').trim();
                    } else if (f.dataType === 'src') {
                        const img = el.tagName === 'IMG' ? el : el.querySelector('img');
                        row[f.id] = (img?.src || img?.getAttribute('src') || img?.getAttribute('data-src') || '').trim();
                    } else {
                        // Use TextExtractionUtils for smart text extraction with auto-separation
                        let v = '';
                        if (textUtils?.extractTextSmart) {
                            v = textUtils.extractTextSmart(el, {
                                preferVisible: true,
                                autoSeparate: true
                            });
                        } else {
                            // P1.1: Normalize text when TextExtractionUtils is not available
                            const rawText = (el.textContent || '').trim();
                            v = rawText.replace(/\n/g, ' ').replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
                        }

                        // CRITICAL: Filter generic Amazon selectors
                        // If selector contains 'a-color-base', only keep price-like values
                        const selStr = `${f.selector || ''} ${f.originalSelector || ''} ${f.name || ''}`.toLowerCase();
                        const isGenericSelector = selStr.includes('a-color-base') || selStr.includes('a-size-base');
                        
                        if (isGenericSelector) {
                            // Use inline check (guaranteed to work)
                            const isPriceLike = looksLikePriceInline(v);
                            // Also try ContextUtils if available
                            const isPriceLikeCtx = ctx?.looksLikePrice ? ctx.looksLikePrice(v) : false;
                            
                            if (!isPriceLike && !isPriceLikeCtx) {
                                v = ''; // Filter out non-price values
                            }
                        }

                        row[f.id] = v;
                    }
                });
                
                const hasAny = Object.values(row).some(v => String(v || '').trim());
                if (hasAny) rows.push(row);
            }
            
            return rows;
        }
        
        applyColumns(rows) {
            const fields = this.state.fields || [];
            const headers = fields.map(f => f.name || f.id);
            
            const outRows = (rows || []).map(r => {
                const out = {};
                fields.forEach((f, idx) => {
                    out[headers[idx]] = r?.[f.id] ?? '';
                });
                return out;
            });
            
            return { headers, rows: outRows };
        }
        
        // Export
        toCSV(rows) {
            // P0.2: Handle empty data before export
            if (!Array.isArray(rows) || rows.length === 0) {
                return '';
            }
            
            const headers = Object.keys(rows[0] || {});
            if (headers.length === 0) {
                return '';
            }

            const esc = (v) => {
                const s = v == null ? '' : String(v);
                const needs = /[",\n\r]/.test(s);
                const out = s.replace(/"/g, '""');
                return needs ? `"${out}"` : out;
            };
            
            const lines = [headers.map(esc).join(',')];
            rows.forEach(r => {
                lines.push(headers.map(h => esc(r[h])).join(','));
            });
            
            // P0.2: Ensure CSV always valid UTF-8 - Add UTF-8 BOM for proper encoding in Excel (especially for Cyrillic text)
            const BOM = '\uFEFF';
            return BOM + lines.join('\r\n');
        }
        
        async exportCSV() {
            try {
                // P0.2: Handle empty data before export
                const rows = this.buildRows(5000);
                if (!rows || rows.length === 0) {
                    throw new Error('No data to export');
                }

                const applied = this.applyColumns(rows);
                if (!applied.rows || applied.rows.length === 0) {
                    throw new Error('No data to export');
                }

                // P0.2: Ensure CSV always valid UTF-8
                const csv = this.toCSV(applied.rows);
                if (!csv || csv.length === 0) {
                    throw new Error('Failed to generate CSV content');
                }

                const filename = `data-scraping-tool-export-${Date.now()}.csv`;
                await this.downloadViaBackground(csv, filename, 'text/csv');
            } catch (error) {
                console.log('CSV export error:', error);
                throw error; // Re-throw to be handled by sidepanel
            }
        }
        
        async exportJSON() {
            try {
                // P0.2: Handle empty data before export
                const rows = this.buildRows(5000);
                if (!rows || rows.length === 0) {
                    throw new Error('No data to export');
                }

                const applied = this.applyColumns(rows);
                if (!applied.rows || applied.rows.length === 0) {
                    throw new Error('No data to export');
                }

                // P0.2: Ensure JSON always valid UTF-8
                let json;
                try {
                    json = JSON.stringify(applied.rows, null, 2);
                } catch (e) {
                    throw new Error('Failed to serialize data to JSON: ' + e.message);
                }

                if (!json || json.length === 0) {
                    throw new Error('Failed to generate JSON content');
                }

                const filename = `data-scraping-tool-export-${Date.now()}.json`;
                await this.downloadViaBackground(json, filename, 'application/json');
            } catch (error) {
                console.log('JSON export error:', error);
                throw error; // Re-throw to be handled by sidepanel
            }
        }
        
        async downloadViaBackground(content, filename, mime) {
            try {
                // P0.2: Ensure content is valid UTF-8
                if (!content || (typeof content === 'string' && content.length === 0)) {
                    throw new Error('Empty content cannot be downloaded');
                }

                if (!chrome?.runtime?.sendMessage) {
                    throw new Error('Extension context not available');
                }
                
                await chrome.runtime.sendMessage({
                    action: 'downloadFile',
                    filename,
                    mime,
                    content
                });
            } catch (e) {
                // Fallback to anchor download
                try {
                    if (!content || (typeof content === 'string' && content.length === 0)) {
                        throw new Error('Empty content cannot be downloaded');
                    }
                    const a = document.createElement('a');
                    a.href = `data:${mime};charset=utf-8,${encodeURIComponent(content)}`;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                } catch (e2) {
                    console.log('Download failed:', e2);
                    throw new Error('Download failed: ' + (e2?.message || String(e2)));
                }
            }
        }
        
        destroy() {
            this.stopSelection();
            
            try {
                if (chrome?.runtime?.onMessage?.removeListener) {
                    chrome.runtime.onMessage.removeListener(this.eventHandlers.message);
                }
            } catch (e) {}
            
            document.removeEventListener('keydown', this.eventHandlers.keydown, true);
            
            const style = document.getElementById('data-scraping-tool-selection-styles');
            if (style) style.remove();
            
            window.DataScrapingToolContentScript = false;
        }
    }
    
    // Initialize
    const contentScript = new DataScrapingToolContentScript();
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        contentScript.destroy();
    });
    
})();
