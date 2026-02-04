// Data Scraping Tool Side Panel Script
// Handles UI and communication with content script

class DataScrapingToolSidePanel {
    constructor() {
        this.isSelecting = false;
        this.isSelectingRegion = false; // P3.1: Region selection mode
        this.selectionMode = 'elements'; // 'elements' | 'region' — switch next to Select button
        this.fields = [];
        this.previewRows = [];
        this.currentTabId = null;
        this.origin = null;
        
        this.init();
    }

    async init() {
        this.bindElements();
        this.bindEvents();
        await this.getCurrentTab();
        await this.loadState();
        this.setupMessageListener();
        await this.checkFirstRun();
        this.render();
    }

    bindElements() {
        this.selectBtn = document.getElementById('selectBtn');
        this.modeElements = document.getElementById('modeElements');
        this.modeRegion = document.getElementById('modeRegion');
        this.clearBtn = document.getElementById('clearBtn');
        this.exportCSV = document.getElementById('exportCSV');
        this.exportJSON = document.getElementById('exportJSON');
        this.statText = document.getElementById('statText');
        this.emptyState = document.getElementById('emptyState');
        this.previewContext = document.getElementById('previewContext');
        this.tableWrapper = document.getElementById('tableWrapper');
        this.tableHead = document.getElementById('tableHead');
        this.tableBody = document.getElementById('tableBody');
        this.moreRows = document.getElementById('moreRows');
        this.toastContainer = document.getElementById('toastContainer');
    }

    bindEvents() {
        this.selectBtn.addEventListener('click', () => this.toggleSelectAction());
        this.modeElements.addEventListener('click', () => this.setSelectionMode('elements'));
        this.modeRegion.addEventListener('click', () => this.setSelectionMode('region'));
        this.clearBtn.addEventListener('click', () => this.clearAll());
        this.exportCSV.addEventListener('click', () => this.doExportCSV());
        this.exportJSON.addEventListener('click', () => this.doExportJSON());

        // Listen for column name changes and delete clicks
        this.tableHead.addEventListener('input', (e) => {
            if (e.target.dataset.kind === 'columnName') {
                this.handleColumnRename(e.target.dataset.fieldId, e.target.value);
            }
        });

        this.tableHead.addEventListener('click', (e) => {
            if (e.target.classList.contains('th-delete')) {
                this.removeField(e.target.dataset.fieldId);
            }
        });

        // P1.2: Highlight source element on table row hover
        this.tableBody.addEventListener('mouseover', (e) => {
            const row = e.target.closest('tr');
            if (row && row.dataset.rowIndex !== undefined) {
                this.highlightSourceRow(parseInt(row.dataset.rowIndex, 10));
            }
        });

        this.tableBody.addEventListener('mouseout', (e) => {
            const row = e.target.closest('tr');
            if (row) {
                this.clearSourceHighlight();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Escape stops selection (elements or region)
            if (e.key === 'Escape') {
                if (this.isSelecting) this.stopSelection();
                else if (this.isSelectingRegion) this.stopRegionSelection();
            }
            // Ctrl+E exports CSV
            if ((e.ctrlKey || e.metaKey) && e.key === 'e' && this.previewRows.length > 0) {
                e.preventDefault();
                this.doExportCSV();
            }
        });

        // Rating stars click handler - open in new tab
        document.querySelectorAll('.rating-star').forEach(star => {
            star.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const url = star.dataset.url;
                if (url) {
                    chrome.tabs.create({ url });
                }
            });
        });
    }

    async checkFirstRun() {
        // P0.3: Show message on first run
        try {
            const result = await chrome.storage.local.get(['data-scraping-tool-first-run']);
            if (!result['data-scraping-tool-first-run']) {
                // First run - show message
                this.showToast('Extracts data only from the current page', 'info');
                await chrome.storage.local.set({ 'data-scraping-tool-first-run': true });
            }
        } catch (e) {
            console.log('Error checking first run:', e);
        }
    }

    async getCurrentTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.id) {
                this.currentTabId = tab.id;
                this.origin = new URL(tab.url).origin;
            }
        } catch (e) {
            console.log('Error getting current tab:', e);
            this.showToast('No active tab', 'error');
        }
    }

    setupMessageListener() {
        // Listen for messages from content script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            // Only accept messages from the current tab
            if (sender.tab?.id !== this.currentTabId) return;

            switch (message.action) {
                case 'fieldAdded':
                    this.handleFieldAdded(message.field);
                    break;
                case 'previewUpdated':
                    this.handlePreviewUpdated(message.rows, message.fields);
                    break;
                case 'selectionStopped':
                    this.isSelecting = false;
                    this.updateSelectControl();
                    this.render(); // Re-render to show full table instead of compact preview
                    break;
                // P3.1: Region selection events
                case 'regionSelected':
                    this.isSelectingRegion = false;
                    this.updateSelectControl();
                    this.handleRegionSelected(message.region, message.rows, message.fields);
                    break;
                case 'regionSelectionCancelled':
                    this.isSelectingRegion = false;
                    this.updateSelectControl();
                    break;
                case 'stateLoaded':
                    this.fields = message.fields || [];
                    this.previewRows = message.rows || [];
                    this.render();
                    break;
            }
        });

        // Listen for tab changes
        chrome.tabs.onActivated.addListener(async (activeInfo) => {
            if (activeInfo.tabId !== this.currentTabId) {
                this.currentTabId = activeInfo.tabId;
                await this.getCurrentTab();
                await this.loadState();
                this.render();
            }
        });
    }

    async loadState() {
        if (!this.currentTabId || !this.origin) return;

        // Ensure isSelecting is false when loading state
        this.isSelecting = false;

        try {
            // First try to get state from content script
            const response = await this.sendToContentScript({ action: 'getState' });
            if (response && response.success && response.fields && response.fields.length > 0) {
                this.fields = response.fields || [];
                this.previewRows = response.rows || [];
                // Show context for saved extraction
                this.showSavedExtractionContext();
            }
        } catch (e) {
            console.log('Error loading state from content script:', e);
            // Try loading from storage
            try {
                const storageKey = `data-scraping-tool_state_${this.origin}`;
                const result = await chrome.storage.local.get([storageKey]);
                if (result[storageKey] && result[storageKey].fields && result[storageKey].fields.length > 0) {
                    this.fields = result[storageKey].fields || [];
                    // Request preview from content script
                    await this.requestPreview();
                    // Show context for saved extraction
                    this.showSavedExtractionContext();
                }
            } catch (e2) {
                console.log('Error loading state from storage:', e2);
            }
        }
    }

    showSavedExtractionContext() {
        if (this.fields.length > 0 && this.origin) {
            try {
                const domain = new URL(this.origin).hostname;
                this.showToast(`Saved extraction for ${domain}`, 'info');
            } catch (e) {
                this.showToast('Saved extraction loaded', 'info');
            }
        }
    }

    async requestPreview() {
        try {
            const response = await this.sendToContentScript({ action: 'getPreview' });
            if (response && response.success) {
                this.previewRows = response.rows || [];
                this.render();
            }
        } catch (e) {
            console.log('Error requesting preview:', e);
        }
    }

    async sendToContentScript(message) {
        if (!this.currentTabId) {
            throw new Error('No active tab');
        }

        try {
            // First try to ping
            await chrome.tabs.sendMessage(this.currentTabId, { action: 'ping' });
        } catch (e) {
            // Inject content script if needed
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: this.currentTabId },
                    files: ['utils/TextExtractionUtils.js', 'utils/ElementUtils.js', 'content.js']
                });
                await new Promise(r => setTimeout(r, 150));
            } catch (e2) {
                throw new Error('Cannot inject content script');
            }
        }

        return chrome.tabs.sendMessage(this.currentTabId, message);
    }

    /** Single Select button: starts/stops current mode (elements or region). */
    toggleSelectAction() {
        if (this.selectionMode === 'elements') {
            this.toggleSelection();
        } else {
            this.toggleRegionSelection();
        }
    }

    setSelectionMode(mode) {
        if (this.isSelecting || this.isSelectingRegion) return;
        this.selectionMode = mode;
        this.modeElements.classList.toggle('active', mode === 'elements');
        this.modeElements.setAttribute('aria-pressed', mode === 'elements');
        this.modeRegion.classList.toggle('active', mode === 'region');
        this.modeRegion.setAttribute('aria-pressed', mode === 'region');
        // Update empty state hint (and other mode-dependent UI)
        this.render();
    }

    async toggleSelection() {
        if (this.isSelecting) {
            await this.stopSelection();
        } else {
            await this.startSelection();
        }
    }

    async startSelection() {
        try {
            const response = await this.sendToContentScript({ action: 'startSelection' });
            if (response && response.success) {
                this.isSelecting = true;
                this.updateSelectControl();
            }
        } catch (e) {
            console.log('Error starting selection:', e);
            // Return UI to Idle state after error
            this.isSelecting = false;
            this.updateSelectControl();
            this.showToast('Cannot start selection. Refresh the page.', 'error');
        }
    }

    async stopSelection() {
        try {
            await this.sendToContentScript({ action: 'stopSelection' });
        } catch (e) {
            console.log('Error stopping selection:', e);
        }
        this.isSelecting = false;
        this.updateSelectControl();
        this.render(); // Re-render to show full table instead of compact preview
    }

    // P3.1: Region selection methods
    async toggleRegionSelection() {
        if (this.isSelectingRegion) {
            await this.stopRegionSelection();
        } else {
            // Stop element selection if active
            if (this.isSelecting) {
                await this.stopSelection();
            }
            await this.startRegionSelection();
        }
    }

    async startRegionSelection() {
        console.log('[SidePanel] startRegionSelection called');
        try {
            const response = await this.sendToContentScript({ action: 'startRegionSelection' });
            console.log('[SidePanel] startRegionSelection response:', response);
            if (response && response.success) {
                this.isSelectingRegion = true;
                this.updateSelectControl();
            } else {
                console.log('[SidePanel] startRegionSelection failed:', response);
                this.showToast('Cannot start region selection. Refresh the page.', 'error');
            }
        } catch (e) {
            console.log('[SidePanel] Error starting region selection:', e);
            this.isSelectingRegion = false;
            this.updateSelectControl();
            this.showToast('Cannot start region selection. Refresh the page.', 'error');
        }
    }

    async stopRegionSelection() {
        try {
            await this.sendToContentScript({ action: 'stopRegionSelection' });
        } catch (e) {
            console.log('Error stopping region selection:', e);
        }
        this.isSelectingRegion = false;
        this.updateSelectControl();
    }

    /** Updates the single Select button and mode toggle (Elements | Region). */
    updateSelectControl() {
        const icon = this.selectBtn.querySelector('.btn-icon');
        const text = this.selectBtn.querySelector('.btn-text');
        const selecting = this.isSelecting || this.isSelectingRegion;

        if (this.isSelecting) {
            icon.textContent = '⏸';
            text.textContent = 'Stop Selection';
            this.selectBtn.classList.add('selecting');
            document.body.classList.add('selecting-mode');
        } else if (this.isSelectingRegion) {
            icon.textContent = '✕';
            text.textContent = 'Cancel';
            this.selectBtn.classList.add('selecting');
            document.body.classList.add('selecting-mode');
        } else {
            icon.textContent = '▶';
            text.textContent = 'Select';
            this.selectBtn.classList.remove('selecting');
            document.body.classList.remove('selecting-mode');
        }

        this.modeElements.disabled = selecting;
        this.modeRegion.disabled = selecting;
        this.modeElements.classList.toggle('active', this.selectionMode === 'elements' && !selecting);
        this.modeElements.setAttribute('aria-pressed', this.selectionMode === 'elements');
        this.modeRegion.classList.toggle('active', this.selectionMode === 'region' && !selecting);
        this.modeRegion.setAttribute('aria-pressed', this.selectionMode === 'region');
    }

    // P3.1: Handle region selection result
    handleRegionSelected(region, rows, fields) {
        if (!region) {
            this.showToast('Region too small. Try selecting a larger area.', 'error');
            return;
        }
        
        if (!rows || rows.length === 0) {
            this.showToast('No repeating elements found in region.', 'error');
            return;
        }
        
        if (rows.length < 3) {
            this.showToast(`Only ${rows.length} row(s) found - try selecting a larger region.`, 'info');
        }
        
        // Update state with extracted data
        this.fields = fields || [];
        this.previewRows = rows || [];
        this.render();
        
        this.showToast(`Found ${rows.length} rows with ${fields.length} columns`, 'success');
    }

    async clearAll() {
        try {
            await this.sendToContentScript({ action: 'clearAll' });
            this.fields = [];
            this.previewRows = [];
            this.render();
            this.showToast('All fields cleared', 'success');
        } catch (e) {
            console.log('Error clearing all:', e);
            this.showToast('Cannot clear fields. Refresh the page.', 'error');
        }
    }

    handleFieldAdded(field) {
        if (!field) return;
        
        // Check for duplicates
        const exists = this.fields.some(f => f.selector === field.selector);
        if (!exists) {
            this.fields.push(field);
        }
        this.requestPreview();
    }

    handlePreviewUpdated(rows, fields) {
        if (fields) {
            this.fields = fields;
        }
        const prevRowCount = this.previewRows.length;
        this.previewRows = rows || [];
        
        // P1.4: Show warning for problematic extraction results (only on first detection)
        if (this.fields.length > 0 && this.previewRows.length === 0 && prevRowCount !== 0) {
            this.showToast('No repeating elements found', 'error');
        } else if (this.fields.length > 0 && this.previewRows.length > 0 && this.previewRows.length < 3 && prevRowCount === 0) {
            this.showToast(`Only ${this.previewRows.length} row(s) found - results may be incomplete`, 'info');
        }
        
        this.render();
    }

    handleColumnRename(fieldId, newName) {
        const field = this.fields.find(f => f.id === fieldId);
        if (field) {
            field.name = newName;
            // Debounce save
            clearTimeout(this._saveTimer);
            this._saveTimer = setTimeout(() => {
                this.sendToContentScript({
                    action: 'updateField',
                    fieldId,
                    updates: { name: newName }
                }).catch(() => {});
            }, 500);
        }
    }

    async removeField(fieldId) {
        try {
            await this.sendToContentScript({ action: 'removeField', fieldId });
            this.fields = this.fields.filter(f => f.id !== fieldId);
            await this.requestPreview();
        } catch (e) {
            console.log('Error removing field:', e);
        }
    }

    // P1.2: Highlight source element on page when hovering table row
    highlightSourceRow(rowIndex) {
        if (rowIndex < 0 || !this.currentTabId) return;
        
        this.sendToContentScript({ 
            action: 'highlightRow', 
            rowIndex 
        }).catch(() => {});
    }

    // P1.2: Clear source element highlight
    clearSourceHighlight() {
        if (!this.currentTabId) return;
        
        this.sendToContentScript({ 
            action: 'clearRowHighlight' 
        }).catch(() => {});
    }

    async doExportCSV() {
        // P0.2: Block export when rows < 1
        if (!this.previewRows || this.previewRows.length < 1) {
            this.showToast('No data to export', 'error');
            return;
        }

        // P0.1: Prevent double-click on Download
        if (this.exportCSV.disabled) {
            return;
        }

        // P0.1: Disable Download button while generating file
        this.exportCSV.disabled = true;
        const originalText = this.exportCSV.querySelector('.btn-text').textContent;
        this.exportCSV.querySelector('.btn-text').textContent = 'Exporting...';

        try {
            const response = await this.sendToContentScript({ action: 'exportCSV' });
            if (response && response.success) {
                this.showToast(`Exported ${this.previewRows.length} rows to CSV`, 'success');
            } else {
                // P0.1: Show error message instead of silent crash
                const errorMsg = response?.error || 'Export failed';
                this.showToast(`Export failed: ${errorMsg}`, 'error');
            }
        } catch (e) {
            console.log('Error exporting CSV:', e);
            // P0.1: Show error message instead of silent crash
            this.showToast(`Export failed: ${e.message || 'Unknown error'}. Refresh the page and try again.`, 'error');
        } finally {
            // Re-enable button
            this.exportCSV.disabled = false;
            this.exportCSV.querySelector('.btn-text').textContent = originalText;
        }
    }

    async doExportJSON() {
        // P0.2: Block export when rows < 1
        if (!this.previewRows || this.previewRows.length < 1) {
            this.showToast('No data to export', 'error');
            return;
        }

        // P0.1: Prevent double-click on Download
        if (this.exportJSON.disabled) {
            return;
        }

        // P0.1: Disable Download button while generating file
        this.exportJSON.disabled = true;
        const originalText = this.exportJSON.querySelector('.btn-text').textContent;
        this.exportJSON.querySelector('.btn-text').textContent = 'Exporting...';

        try {
            const response = await this.sendToContentScript({ action: 'exportJSON' });
            if (response && response.success) {
                this.showToast(`Exported ${this.previewRows.length} rows to JSON`, 'success');
            } else {
                // P0.1: Show error message instead of silent crash
                const errorMsg = response?.error || 'Export failed';
                this.showToast(`Export failed: ${errorMsg}`, 'error');
            }
        } catch (e) {
            console.log('Error exporting JSON:', e);
            // P0.1: Show error message instead of silent crash
            this.showToast(`Export failed: ${e.message || 'Unknown error'}. Refresh the page and try again.`, 'error');
        } finally {
            // Re-enable button
            this.exportJSON.disabled = false;
            this.exportJSON.querySelector('.btn-text').textContent = originalText;
        }
    }

    render() {
        const fieldCount = this.fields.length;
        const rowCount = this.previewRows.length;

        // Update stats (simplified: one line)
        this.statText.textContent = `${fieldCount} columns · ${rowCount} rows extracted`;

        // Update buttons
        this.clearBtn.disabled = fieldCount === 0;
        this.exportCSV.disabled = rowCount === 0;
        this.exportJSON.disabled = rowCount === 0;

        // Update Clear All button style based on selection mode (elements or region)
        if (this.isSelecting || this.isSelectingRegion) {
            this.clearBtn.classList.add('secondary');
        } else {
            this.clearBtn.classList.remove('secondary');
        }

        // Update export button texts with row count
        const exportCSVText = this.exportCSV.querySelector('.btn-text');
        const exportJSONText = this.exportJSON.querySelector('.btn-text');
        if (rowCount > 0) {
            exportCSVText.textContent = `Export CSV (${rowCount} rows)`;
            exportJSONText.textContent = `Export JSON (${rowCount} rows)`;
        } else {
            exportCSVText.textContent = 'Export CSV';
            exportJSONText.textContent = 'Export JSON';
        }

        // Render table or empty state
        if (fieldCount === 0) {
            this.emptyState.style.display = 'flex';
            this.tableWrapper.style.display = 'none';
            this.moreRows.style.display = 'none';

            // Update empty state: instruction (large, first) + sub (small, second)
            const emptyInstruction = this.emptyState.querySelector('.empty-instruction');
            const emptySub = this.emptyState.querySelector('.empty-sub');
            
            if (this.isSelecting || this.isSelectingRegion) {
                emptyInstruction.textContent = this.selectionMode === 'region' ? 'Drag a rectangle over one or more cards' : 'Each click adds a column';
                emptySub.textContent = 'Select elements on the page';
            } else if (fieldCount > 0 && rowCount === 0) {
                // P1.4: Fields selected but no rows found
                emptyInstruction.textContent = 'No repeating elements found';
                emptySub.textContent = 'Try selecting elements that appear multiple times';
            } else {
                emptyInstruction.textContent = this.selectionMode === 'region' ? 'Drag a rectangle over one or more cards' : 'Each click adds a column';
                emptySub.textContent = 'Select elements on the page';
            }
        } else {
            this.emptyState.style.display = 'none';
            this.tableWrapper.style.display = 'block';
            
            // In selecting mode, show compact preview; otherwise show full table
            if (this.isSelecting) {
                this.previewContext.style.display = 'none'; // Hide context in compact preview
                this.renderCompactPreview();
            } else {
                this.renderTable();
            }
        }
    }

    renderCompactPreview() {
        const rows = this.previewRows;
        const maxRows = 5; // Show only 3-5 rows in compact preview

        if (rows.length === 0) {
            this.tableHead.innerHTML = '';
            this.tableBody.innerHTML = '<tr><td colspan="100" style="text-align: center; color: var(--text-muted);">Calculating preview...</td></tr>';
            this.moreRows.style.display = 'none';
            return;
        }

        const headers = Object.keys(rows[0]);

        // Render headers only (no editing in compact mode)
        this.tableHead.innerHTML = `
            <tr>
                ${headers.map(h => {
                    return `
                        <th>
                            <div class="th-wrapper">
                                <span>${this.escapeHtml(h)}</span>
                            </div>
                        </th>
                    `;
                }).join('')}
            </tr>
        `;

        // Render body rows (limited to maxRows)
        const displayRows = rows.slice(0, maxRows);
        this.tableBody.innerHTML = displayRows.map((row, index) => `
            <tr data-row-index="${index}">
                ${headers.map(h => `<td title="${this.escapeHtml(String(row[h] || ''))}">${this.escapeHtml(String(row[h] || '').slice(0, 100))}</td>`).join('')}
            </tr>
        `).join('');

        // Don't show "more rows" in compact preview
        this.moreRows.style.display = 'none';
    }

    renderTable() {
        const rows = this.previewRows;
        const maxRows = 20;

        // Show context above table
        // P1.4: Show warning for low row count
        if (rows.length > 0 && rows.length < 3) {
            this.previewContext.textContent = '⚠ Only ' + rows.length + ' row(s) found - try selecting more elements';
            this.previewContext.style.display = 'block';
            this.previewContext.classList.add('warning');
        } else if (this.origin) {
            try {
                const domain = new URL(this.origin).hostname;
                this.previewContext.textContent = `Extracted from ${domain}`;
                this.previewContext.style.display = 'block';
                this.previewContext.classList.remove('warning');
            } catch (e) {
                this.previewContext.textContent = 'Based on selected elements';
                this.previewContext.style.display = 'block';
                this.previewContext.classList.remove('warning');
            }
        } else {
            this.previewContext.textContent = 'Based on selected elements';
            this.previewContext.style.display = 'block';
            this.previewContext.classList.remove('warning');
        }

        if (rows.length === 0) {
            this.tableHead.innerHTML = '';
            // P1.4: Never fail silently - show explicit message
            this.tableBody.innerHTML = '<tr><td colspan="100" style="text-align: center; color: var(--text-muted);">No data extracted. Try selecting different elements.</td></tr>';
            this.moreRows.style.display = 'none';
            return;
        }

        const headers = Object.keys(rows[0]);

        // Render headers with editable names and delete buttons
        this.tableHead.innerHTML = `
            <tr>
                ${headers.map(h => {
                    const field = this.fields.find(f => f.name === h);
                    const fieldId = field ? field.id : '';
                    return `
                        <th>
                            <div class="th-wrapper">
                                <input type="text" 
                                       value="${this.escapeHtml(h)}" 
                                       data-kind="columnName" 
                                       data-field-id="${fieldId}"
                                       title="Click to rename column">
                                <button class="th-delete" 
                                        data-field-id="${fieldId}" 
                                        title="Remove column">×</button>
                            </div>
                        </th>
                    `;
                }).join('')}
            </tr>
        `;

        // Render body rows
        // P1.2: Add data-row-index for hover highlighting
        const displayRows = rows.slice(0, maxRows);
        this.tableBody.innerHTML = displayRows.map((row, index) => `
            <tr data-row-index="${index}">
                ${headers.map(h => `<td title="${this.escapeHtml(String(row[h] || ''))}">${this.escapeHtml(String(row[h] || '').slice(0, 100))}</td>`).join('')}
            </tr>
        `).join('');

        // Show "more rows" indicator
        if (rows.length > maxRows) {
            this.moreRows.textContent = `...and ${rows.length - maxRows} more rows`;
            this.moreRows.style.display = 'block';
        } else {
            this.moreRows.style.display = 'none';
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        this.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideUp 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.dataScrapingToolPanel = new DataScrapingToolSidePanel();
});

