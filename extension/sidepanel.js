// Data Scraping Tool Side Panel Script
// Handles UI and communication with content script

class DataScrapingToolSidePanel {
    constructor() {
        this.isSelecting = false;
        this.isSmartAdd = false;
        this.fields = [];
        this.previewRows = [];
        this.currentTabId = null;
        this.origin = null;
        this.smartAddCandidates = [];
        this.exportOptions = {
            removeEmptyRows: true,
            removeDuplicateRows: false,
            exportNormalizedPrices: false
        };
        
        this.init();
    }

    async init() {
        this.bindElements();
        this.bindEvents();
        await this.getCurrentTab();
        await this.loadState();
        this.setupMessageListener();
        this.render();
    }

    bindElements() {
        this.selectBtn = document.getElementById('selectBtn');
        this.smartAddBtn = document.getElementById('smartAddBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.exportCSV = document.getElementById('exportCSV');
        this.exportJSON = document.getElementById('exportJSON');
        this.optRemoveEmpty = document.getElementById('optRemoveEmpty');
        this.optDedup = document.getElementById('optDedup');
        this.optNormPrice = document.getElementById('optNormPrice');
        this.statText = document.getElementById('statText');
        this.emptyState = document.getElementById('emptyState');
        this.previewContext = document.getElementById('previewContext');
        this.tableWrapper = document.getElementById('tableWrapper');
        this.tableHead = document.getElementById('tableHead');
        this.tableBody = document.getElementById('tableBody');
        this.moreRows = document.getElementById('moreRows');
        this.toastContainer = document.getElementById('toastContainer');

        this.smartAddPanel = document.getElementById('smartAddPanel');
        this.smartAddList = document.getElementById('smartAddList');
        this.smartAddApply = document.getElementById('smartAddApply');
        this.smartAddClose = document.getElementById('smartAddClose');
    }

    bindEvents() {
        this.selectBtn.addEventListener('click', () => this.toggleSelection());
        this.smartAddBtn.addEventListener('click', () => this.toggleSmartAdd());
        this.clearBtn.addEventListener('click', () => this.clearAll());
        this.exportCSV.addEventListener('click', () => this.doExportCSV());
        this.exportJSON.addEventListener('click', () => this.doExportJSON());

        // Export options
        this.optRemoveEmpty?.addEventListener('change', () => this.onExportOptionsChanged());
        this.optDedup?.addEventListener('change', () => this.onExportOptionsChanged());
        this.optNormPrice?.addEventListener('change', () => this.onExportOptionsChanged());

        // Listen for column name changes and delete clicks
        this.tableHead.addEventListener('input', (e) => {
            if (e.target.dataset.kind === 'columnName') {
                this.handleColumnRename(e.target.dataset.fieldId, e.target.value);
            }
        });

        this.tableHead.addEventListener('change', (e) => {
            if (e.target.classList.contains('th-type')) {
                this.handleColumnTypeChange(e.target.dataset.fieldId, e.target.value);
            }
        });

        this.tableHead.addEventListener('click', (e) => {
            if (e.target.classList.contains('th-delete')) {
                this.removeField(e.target.dataset.fieldId);
            }
            if (e.target.classList.contains('th-refine')) {
                this.refineField(e.target.dataset.fieldId);
            }
        });

        this.smartAddApply.addEventListener('click', () => this.applySmartAdd());
        this.smartAddClose.addEventListener('click', () => this.hideSmartAddPanel());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Escape stops selection
            if (e.key === 'Escape' && this.isSelecting) {
                this.stopSelection();
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
                case 'smartAddCandidates':
                    this.smartAddCandidates = Array.isArray(message.candidates) ? message.candidates : [];
                    this.showSmartAddPanel();
                    break;
                case 'smartAddError':
                    this.showToast(message.message || 'Smart Add failed', 'error');
                    break;
                case 'selectionStopped':
                    this.isSelecting = false;
                    this.setSmartAdd(false);
                    this.updateSelectButton();
                    this.render(); // Re-render to show full table instead of compact preview
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
            if (response && response.success) {
                if (response.exportOptions) {
                    this.exportOptions = { ...this.exportOptions, ...response.exportOptions };
                    this.applyExportOptionsToUi();
                }
            }
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
                this.updateSelectButton();
                // Enable smart add button only while selecting
                this.smartAddBtn.disabled = false;
            }
        } catch (e) {
            console.log('Error starting selection:', e);
            // Return UI to Idle state after error
            this.isSelecting = false;
            this.updateSelectButton();
            this.smartAddBtn.disabled = true;
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
        this.setSmartAdd(false);
        this.updateSelectButton();
        this.render(); // Re-render to show full table instead of compact preview
    }

    async toggleSmartAdd() {
        if (!this.isSelecting) {
            this.showToast('Start selection first', 'info');
            return;
        }
        await this.setSmartAdd(!this.isSmartAdd);
    }

    async setSmartAdd(enabled) {
        this.isSmartAdd = !!enabled;
        this.updateSmartAddButton();
        this.hideSmartAddPanel();
        try {
            await this.sendToContentScript({ action: 'setSmartAddMode', enabled: this.isSmartAdd });
        } catch (e) {
            // If we can't set it in content script, keep UI consistent but do not crash
        }
    }

    updateSmartAddButton() {
        if (!this.smartAddBtn) return;
        this.smartAddBtn.disabled = !this.isSelecting;
        const textEl = this.smartAddBtn.querySelector('.btn-text');
        if (textEl) {
            textEl.textContent = this.isSmartAdd ? 'Smart Add: On' : 'Smart Add';
        }
    }

    showSmartAddPanel() {
        if (!this.smartAddPanel) return;
        if (!this.isSmartAdd) {
            // Ignore candidates when Smart Add is off
            return;
        }
        this.renderSmartAddCandidates();
        this.smartAddPanel.style.display = 'block';
    }

    hideSmartAddPanel() {
        if (!this.smartAddPanel) return;
        this.smartAddPanel.style.display = 'none';
        this.smartAddCandidates = [];
        if (this.smartAddList) this.smartAddList.innerHTML = '';
    }

    renderSmartAddCandidates() {
        const list = this.smartAddList;
        const candidates = this.smartAddCandidates || [];
        if (!list) return;

        if (candidates.length === 0) {
            list.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 8px 0;">No candidates found. Try clicking on a card/container.</div>';
            return;
        }

        list.innerHTML = candidates.map(c => {
            const id = c.id || '';
            const title = this.escapeHtml(c.label || c.name || 'Field');
            const preview = this.escapeHtml(String(c.preview || '').slice(0, 140));
            return `
                <div class="smartadd-item">
                    <input type="checkbox" class="smartadd-check" data-id="${id}" checked>
                    <div class="smartadd-item-main">
                        <div class="smartadd-item-title">${title}</div>
                        <div class="smartadd-item-preview">${preview || '(empty)'}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    async applySmartAdd() {
        if (!this.isSmartAdd || !Array.isArray(this.smartAddCandidates) || this.smartAddCandidates.length === 0) return;
        try {
            const selected = Array.from(document.querySelectorAll('.smartadd-check'))
                .filter(el => el.checked)
                .map(el => el.dataset.id)
                .filter(Boolean);

            if (selected.length === 0) {
                this.showToast('Select at least one field', 'info');
                return;
            }

            const res = await this.sendToContentScript({ action: 'applySmartAdd', candidateIds: selected });
            if (res && res.success) {
                this.hideSmartAddPanel();
                await this.requestPreview();
                this.showToast(`Added ${selected.length} fields`, 'success');
            } else {
                this.showToast('Cannot add fields. Refresh the page.', 'error');
            }
        } catch (e) {
            console.log('Error applying smart add:', e);
            this.showToast('Cannot add fields. Refresh the page.', 'error');
        }
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
        this.previewRows = rows || [];
        this.render();
    }

    applyExportOptionsToUi() {
        if (this.optRemoveEmpty) this.optRemoveEmpty.checked = this.exportOptions.removeEmptyRows !== false;
        if (this.optDedup) this.optDedup.checked = !!this.exportOptions.removeDuplicateRows;
        if (this.optNormPrice) this.optNormPrice.checked = !!this.exportOptions.exportNormalizedPrices;
    }

    async onExportOptionsChanged() {
        this.exportOptions = {
            removeEmptyRows: this.optRemoveEmpty ? !!this.optRemoveEmpty.checked : true,
            removeDuplicateRows: this.optDedup ? !!this.optDedup.checked : false,
            exportNormalizedPrices: this.optNormPrice ? !!this.optNormPrice.checked : false
        };
        try {
            await this.sendToContentScript({ action: 'setExportOptions', options: this.exportOptions });
            this.showToast('Export options saved', 'success');
        } catch (e) {
            this.showToast('Cannot save options. Refresh the page.', 'error');
        }
    }

    async handleColumnTypeChange(fieldId, type) {
        if (!fieldId) return;
        const normalized = String(type || '').toLowerCase();
        const dataType = normalized === 'url' ? 'href' : normalized === 'image' ? 'src' : 'textContent';
        try {
            await this.sendToContentScript({
                action: 'updateField',
                fieldId,
                updates: { columnType: normalized, dataType }
            });
            await this.requestPreview();
        } catch (e) {
            this.showToast('Cannot update column type. Refresh the page.', 'error');
        }
    }

    async refineField(fieldId) {
        if (!fieldId) return;
        try {
            const res = await this.sendToContentScript({ action: 'refineField', fieldId });
            if (res && res.success && res.updated) {
                this.showToast('Selector refined', 'success');
                await this.requestPreview();
            } else {
                this.showToast('Cannot refine selector', 'error');
            }
        } catch (e) {
            console.log('Error refining field:', e);
            this.showToast('Cannot refine selector. Refresh the page.', 'error');
        }
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

    async doExportCSV() {
        if (this.previewRows.length === 0) return;

        try {
            const response = await this.sendToContentScript({ action: 'exportCSV' });
            if (response && response.success) {
                this.showToast(`Exported ${this.previewRows.length} rows to CSV`, 'success');
            }
        } catch (e) {
            console.log('Error exporting CSV:', e);
            this.showToast('Export failed. Refresh the page and try again.', 'error');
        }
    }

    async doExportJSON() {
        if (this.previewRows.length === 0) return;

        try {
            const response = await this.sendToContentScript({ action: 'exportJSON' });
            if (response && response.success) {
                this.showToast(`Exported ${this.previewRows.length} rows to JSON`, 'success');
            }
        } catch (e) {
            console.log('Error exporting JSON:', e);
            this.showToast('Export failed. Refresh the page and try again.', 'error');
        }
    }

    updateSelectButton() {
        const icon = this.selectBtn.querySelector('.btn-icon');
        const text = this.selectBtn.querySelector('.btn-text');

        if (this.isSelecting) {
            icon.textContent = '⏸';
            text.textContent = 'Stop Selection';
            this.selectBtn.classList.add('selecting');
            document.body.classList.add('selecting-mode');
        } else {
            icon.textContent = '▶';
            text.textContent = 'Select Elements';
            this.selectBtn.classList.remove('selecting');
            document.body.classList.remove('selecting-mode');
        }

        this.updateSmartAddButton();
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

        // Update Clear All button style based on selection mode
        if (this.isSelecting) {
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

            // Update empty state text based on selection mode
            const emptyText = this.emptyState.querySelector('.empty-text');
            const emptyHint = this.emptyState.querySelector('.empty-hint');
            
            if (this.isSelecting) {
                emptyText.textContent = 'Select elements on the page';
                emptyHint.textContent = 'Each click adds a column';
            } else {
                emptyText.textContent = 'Select elements on the page';
                emptyHint.textContent = 'Each click adds a column';
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
        this.tableBody.innerHTML = displayRows.map(row => `
            <tr>
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
        if (this.origin) {
            try {
                const domain = new URL(this.origin).hostname;
                this.previewContext.textContent = `Extracted from ${domain}`;
                this.previewContext.style.display = 'block';
            } catch (e) {
                this.previewContext.textContent = 'Based on selected elements';
                this.previewContext.style.display = 'block';
            }
        } else {
            this.previewContext.textContent = 'Based on selected elements';
            this.previewContext.style.display = 'block';
        }

        if (rows.length === 0) {
            this.tableHead.innerHTML = '';
            this.tableBody.innerHTML = '<tr><td colspan="100" style="text-align: center; color: var(--text-muted);">Calculating preview...</td></tr>';
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
                    const q = field && field.quality ? field.quality : null;
                    const warnings = q && Array.isArray(q.warnings) ? q.warnings : [];
                    const hasWarn = warnings.length > 0;
                    const matchCount = q && typeof q.matchCount === 'number' ? q.matchCount : null;
                    const fillRate = q && typeof q.fillRate === 'number' ? q.fillRate : null;
                    const dupRate = q && typeof q.dupRate === 'number' ? q.dupRate : null;
                    const qualityTitle = (() => {
                        const parts = [];
                        if (matchCount != null) parts.push(`${matchCount} matches`);
                        if (fillRate != null) parts.push(`${Math.round(fillRate * 100)}% filled`);
                        if (dupRate != null) parts.push(`${Math.round(dupRate * 100)}% dup`);
                        if (warnings.length) parts.push(`warnings: ${warnings.join(', ')}`);
                        return parts.join(' · ') || 'No quality data';
                    })();
                    const columnType = field ? (field.columnType || (field.dataType === 'href' ? 'url' : field.dataType === 'src' ? 'image' : 'text')) : 'text';
                    return `
                        <th>
                            <div class="th-wrapper">
                                <input type="text" 
                                       value="${this.escapeHtml(h)}" 
                                       data-kind="columnName" 
                                       data-field-id="${fieldId}"
                                       title="Click to rename column">
                                <select class="th-type" data-field-id="${fieldId}" title="Column type">
                                    <option value="text" ${columnType === 'text' ? 'selected' : ''}>Text</option>
                                    <option value="price" ${columnType === 'price' ? 'selected' : ''}>Price</option>
                                    <option value="url" ${columnType === 'url' ? 'selected' : ''}>URL</option>
                                    <option value="image" ${columnType === 'image' ? 'selected' : ''}>Image URL</option>
                                </select>
                                <span class="th-quality ${hasWarn ? 'warn' : 'ok'}" title="${this.escapeHtml(qualityTitle)}"></span>
                                ${hasWarn && fieldId ? `<button class="th-refine" data-field-id="${fieldId}" title="Refine selector">Refine</button>` : ''}
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
        const displayRows = rows.slice(0, maxRows);
        this.tableBody.innerHTML = displayRows.map(row => `
            <tr>
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

