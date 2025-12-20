// Content Script - Visual element selector for Side Panel
// Version: 2.0.0 - Side Panel Architecture

(function() {
    'use strict';
    
    // Prevent multiple initializations
    if (window.DataminerContentScript) {
        return;
    }
    
    window.DataminerContentScript = true;
    
    class DataminerContentScript {
        constructor() {
            this.isInitialized = false;
            this.isSelecting = false;
            this.state = { version: 1, fields: [], columns: {}, updatedAt: Date.now() };
            this.lastPreviewRows = [];
            this.previewDirty = true;
            this.fieldElementsById = new Map();
            this.origin = null;
            this.highlightedElement = null;
            this.currentTooltip = null;
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
            if (document.getElementById('dataminer-selection-styles')) return;
            
            const style = document.createElement('style');
            style.id = 'dataminer-selection-styles';
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
                #dataminer-element-tooltip {
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
                
                #dataminer-element-tooltip .tooltip-selector {
                    font-family: 'JetBrains Mono', 'Fira Code', monospace !important;
                    font-size: 10px !important;
                    color: #94a3b8 !important;
                    margin-bottom: 6px !important;
                    padding-bottom: 6px !important;
                    border-bottom: 1px solid rgba(148, 163, 184, 0.2) !important;
                }
                
                #dataminer-element-tooltip .tooltip-type {
                    font-size: 11px !important;
                    font-weight: 600 !important;
                    color: #a78bfa !important;
                    margin-bottom: 4px !important;
                }
                
                #dataminer-element-tooltip .tooltip-preview {
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
                .dataminer-preview-highlight {
                    outline: 2px dashed #f59e0b !important;
                    outline-offset: 2px !important;
                    background-color: rgba(245, 158, 11, 0.1) !important;
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
                        this.exportCSV().then(() => {
                            sendResponse({ success: true });
                        }).catch((e) => {
                            sendResponse({ success: false, error: e.message });
                        });
                        return true; // async response
                    
                    case 'exportJSON':
                        this.exportJSON().then(() => {
                            sendResponse({ success: true });
                        }).catch((e) => {
                            sendResponse({ success: false, error: e.message });
                        });
                        return true; // async response
                    
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
            
            const element = event.target;
            if (this.isOwnElement(element)) return;
            
            this.highlightElement(element);
        }
        
        handleMouseOut(event) {
            if (!this.isSelecting) return;
            this.removeHighlight();
        }
        
        handleClick(event) {
            if (!this.isSelecting) return;
            
            const element = event.target;
            if (this.isOwnElement(element)) return;
            
            event.preventDefault();
            event.stopPropagation();
            
            this.addFieldFromElement(element);
        }
        
        isOwnElement(element) {
            if (!element) return true;
            return element.id === 'dataminer-element-tooltip' ||
                   element.closest?.('#dataminer-element-tooltip');
        }
        
        highlightElement(element) {
            this.removeHighlight();
            if (this.isOwnElement(element)) return;
            
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
        
        createTooltip(element) {
            this.removeTooltip();
            
            const rect = element.getBoundingClientRect();
            const tooltip = document.createElement('div');
            tooltip.id = 'dataminer-element-tooltip';
            
            // Element info
            const tagName = element.tagName.toLowerCase();
            const classNameStr = this.getElementClassName(element);
            const className = classNameStr ? `.${classNameStr.split(' ')[0]}` : '';
            const id = element.id ? `#${element.id}` : '';
            const elementInfo = `${tagName}${id}${className}`;
            
            // Data type and preview value
            const dataType = this.getDataType(element);
            const previewValue = this.getPreviewValue(element, dataType);
            const dataTypeLabel = dataType === 'href' ? '🔗 Link' : 
                                  dataType === 'src' ? '🖼️ Image' : '📝 Text';
            
            // Build tooltip HTML
            tooltip.innerHTML = `
                <div class="tooltip-selector">${this.escapeHtml(elementInfo)}</div>
                <div class="tooltip-type">${dataTypeLabel}</div>
                <div class="tooltip-preview">${this.escapeHtml(previewValue)}</div>
            `;
            
            // Position above element
            let top = rect.top - 35;
            if (top < 10) top = rect.bottom + 10;
            
            tooltip.style.cssText = `
                position: fixed !important;
                top: ${top}px !important;
                left: ${Math.max(10, rect.left)}px !important;
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
                    // Clean up whitespace
                    value = value.replace(/\s+/g, ' ');
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
            const selector = this.generateSelector(element);
            const dataType = this.getDataType(element);
            
            const field = {
                id,
                name,
                selector,
                dataType,
                parentSelector: null
            };
            
            // Check for duplicates
            const duplicate = (this.state.fields || []).some(f => 
                f.selector === field.selector && f.name === field.name
            );
            if (duplicate) return;
            
            this.fieldElementsById.set(field.id, element);
            this.state.fields = [...(this.state.fields || []), field];
            
            // Recompute common parent
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
            const nodes = [];
            (this.state.fields || []).forEach(f => {
                const el = this.fieldElementsById.get(f.id);
                if (el) nodes.push({ element: el, selector: f.selector, name: f.name });
            });
            
            const commonParent = this.findCommonParent(nodes);
            const parentSelector = commonParent ? this.generateParentSelector(commonParent) : null;
            
            this.state.fields = (this.state.fields || []).map(f => {
                const el = this.fieldElementsById.get(f.id);
                const refined = (commonParent && el) ? this.refineSelectorWithinParent(el, commonParent) : null;
                return {
                    ...f,
                    parentSelector,
                    selector: refined || f.selector
                };
            });
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
                    cls.length > 0 && !cls.startsWith('onpage-') && !cls.startsWith('dataminer-')
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
                    cls.length > 0 && !cls.startsWith('onpage-') && !cls.startsWith('dataminer-')
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
            
            const fieldCount = (this.state?.fields?.length || 0) + 1;
            return `${tagName}_field_${fieldCount}`;
        }
        
        getDataType(element) {
            if (!element) return 'textContent';
            
            try {
                if (window.DataminerOnPageUtils?.inferDataType) {
                    return window.DataminerOnPageUtils.inferDataType(element);
                }
            } catch (e) {}
            
            const tag = (element.tagName || '').toUpperCase();
            if (tag === 'A') return 'href';
            if (tag === 'IMG') return 'src';
            
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
                const res = await chrome.storage.local.get(['dataminer_state_by_origin']);
                const map = res.dataminer_state_by_origin || {};
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
                const res = await chrome.storage.local.get(['dataminer_state_by_origin']);
                const map = res.dataminer_state_by_origin || {};
                map[this.origin] = this.state;
                await chrome.storage.local.set({ dataminer_state_by_origin: map });
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
                    return style.display !== 'none' && style.visibility !== 'hidden';
                } catch (e) {
                    return false;
                }
            });
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
            const utils = window.DataminerOnPageUtils;
            
            const extractOne = (node) => {
                if (!node) return '';
                
                if (dataType === 'href') {
                    return utils?.extractHrefFromNode ? utils.extractHrefFromNode(node) : '';
                }
                
                if (dataType === 'src') {
                    return utils?.extractSrcFromNode ? utils.extractSrcFromNode(node) : '';
                }
                
                // Check if it's an image container
                const className = (node.className || '').toString().toLowerCase();
                const isImageContainer = className.includes('img') || className.includes('image');
                
                if (isImageContainer) {
                    const imgSrc = utils?.extractSrcFromNode ? utils.extractSrcFromNode(node) : '';
                    if (imgSrc) return imgSrc;
                }
                
                return utils?.extractTextFromNode 
                    ? utils.extractTextFromNode(node) 
                    : (node.textContent || '').trim();
            };
            
            let el = null;
            
            // Try direct querySelector
            try {
                el = containerEl.querySelector(field.selector);
            } catch (e) {}
            
            // Try finding element contained within
            if (!el) {
                try {
                    const all = Array.from(document.querySelectorAll(field.selector));
                    el = all.find(x => containerEl.contains(x)) || null;
                } catch (e) {}
            }
            
            if (!el) return '';
            
            let value = extractOne(el);
            if (value) return value;
            
            // Try other matches
            try {
                const matches = Array.from(containerEl.querySelectorAll(field.selector));
                for (const m of matches) {
                    const v = extractOne(m);
                    if (v && v.trim()) return v.trim();
                }
            } catch (e) {}
            
            return '';
        }
        
        buildRows(limit = 50) {
            const fields = this.state.fields || [];
            if (fields.length === 0) return [];
            
            const parentSelectors = fields.map(f => f.parentSelector).filter(Boolean);
            let commonParent = parentSelectors.length > 0 && 
                parentSelectors.every(ps => ps === parentSelectors[0]) 
                ? parentSelectors[0] : null;
            
            const rows = [];
            
            if (commonParent) {
                let containers = [];
                try {
                    containers = this.getVisibleMatches(commonParent, document);
                } catch (e) {}
                
                for (let i = 0; i < containers.length && rows.length < limit; i++) {
                    const c = containers[i];
                    const row = {};
                    
                    fields.forEach(f => {
                        row[f.id] = this.extractValueFromElement(c, f);
                    });
                    
                    const hasAny = Object.values(row).some(v => String(v || '').trim());
                    if (hasAny) rows.push(row);
                }
                
                if (rows.length > 0) return rows;
            }
            
            // Fallback: align by index
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
                        const a = el.tagName === 'A' ? el : el.querySelector('a[href]');
                        row[f.id] = (a?.href || a?.getAttribute('href') || '').trim();
                    } else if (f.dataType === 'src') {
                        const img = el.tagName === 'IMG' ? el : el.querySelector('img');
                        row[f.id] = (img?.src || img?.getAttribute('src') || img?.getAttribute('data-src') || '').trim();
                    } else {
                        row[f.id] = (el.textContent || '').trim();
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
            if (!Array.isArray(rows) || rows.length === 0) return '';
            
            const headers = Object.keys(rows[0] || {});
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
            
            return lines.join('\r\n');
        }
        
        async exportCSV() {
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
                    const a = document.createElement('a');
                    a.href = `data:${mime};charset=utf-8,${encodeURIComponent(content)}`;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                } catch (e2) {
                    console.log('Download failed:', e2);
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
            
            const style = document.getElementById('dataminer-selection-styles');
            if (style) style.remove();
            
            window.DataminerContentScript = false;
        }
    }
    
    // Initialize
    const contentScript = new DataminerContentScript();
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        contentScript.destroy();
    });
    
})();
