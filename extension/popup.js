// Dataminer - Simplified popup controller
class DataminerController {
    constructor() {
        this.scrapingService = new ScrapingService();
        this.toastService = new ToastService();
        this.selectedElements = [];
        this.scrapedData = [];
        this.isExtracting = false;
        this.currentTab = null; // { id, url, origin }
        
        this.init();
    }

    async init() {
        // Load selection for current tab (prevents selections from leaking across sites)
        await this.initTabContextAndLoadSelection();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Listen for messages from background script
        this.setupMessageListeners();
        
        // Update UI
        this.updateUI();
    }

    getOriginFromUrl(url) {
        try {
            return new URL(url).origin;
        } catch (e) {
            return null;
        }
    }

    async initTabContextAndLoadSelection() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) return;

            this.currentTab = { id: tab.id, url: tab.url, origin: this.getOriginFromUrl(tab.url) };

            const res = await chrome.storage.local.get(['dataminer_selected_elements_by_tab', 'onpage_selected_elements']);
            const map = res.dataminer_selected_elements_by_tab || {};

            // One-time migration from legacy storage key
            if ((!map[String(tab.id)] || !Array.isArray(map[String(tab.id)].elements)) &&
                Array.isArray(res.onpage_selected_elements) && res.onpage_selected_elements.length > 0) {
                map[String(tab.id)] = { origin: this.currentTab.origin, elements: res.onpage_selected_elements };
                await chrome.storage.local.set({ dataminer_selected_elements_by_tab: map });
                await chrome.storage.local.remove(['onpage_selected_elements']);
            }

            const entry = map[String(tab.id)];
            if (entry && Array.isArray(entry.elements) && entry.elements.length > 0) {
                // If tab navigated to a different site, drop stale selection.
                if (entry.origin && this.currentTab.origin && entry.origin !== this.currentTab.origin) {
                    delete map[String(tab.id)];
                    await chrome.storage.local.set({ dataminer_selected_elements_by_tab: map });
                    this.selectedElements = [];
                } else {
                    this.selectedElements = entry.elements;
                }
            } else {
                this.selectedElements = [];
            }
        } catch (error) {
            console.log('Error loading selection:', error);
        }
    }

    setupEventListeners() {
        // Select element button
        const selectElementBtn = document.getElementById('selectElementBtn');
        if (selectElementBtn) {
            selectElementBtn.addEventListener('click', this.handleSelectElement.bind(this));
        }

        // Add element button (adds a new field without clearing existing ones)
        const addElementBtn = document.getElementById('addElementBtn');
        if (addElementBtn) {
            addElementBtn.addEventListener('click', this.handleSelectElement.bind(this));
        }

        // Extract data button
        const extractDataBtn = document.getElementById('extractDataBtn');
        if (extractDataBtn) {
            extractDataBtn.addEventListener('click', this.handleExtractData.bind(this));
        }

        // Clear all selectors button
        const clearAllBtn = document.getElementById('clearAllSelectorsBtn');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', this.clearAllSelectors.bind(this));
        }

        // Export buttons
        const exportCSVBtn = document.getElementById('exportCSVBtn');
        if (exportCSVBtn) {
            exportCSVBtn.addEventListener('click', this.handleExportCSV.bind(this));
        }

        const exportJSONBtn = document.getElementById('exportJSONBtn');
        if (exportJSONBtn) {
            exportJSONBtn.addEventListener('click', this.handleExportJSON.bind(this));
        }

        // Remove selector buttons (event delegation)
        const selectorsList = document.getElementById('selectorsList');
        if (selectorsList) {
            selectorsList.addEventListener('click', (e) => {
                if (e.target.classList.contains('remove-selector')) {
                    const index = parseInt(e.target.dataset.selectorIndex);
                    this.removeSelector(index);
                }
            });
        }
    }

    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleBackgroundMessage(message, sender, sendResponse);
        });
    }

    handleBackgroundMessage(message, sender, sendResponse) {
        switch (message.action) {
            case 'elementsSelected':
                this.updateSelectedElements(message.elements);
                sendResponse({ success: true });
                break;
            
            case 'elementSelectionComplete':
                this.handleElementSelectionComplete(message.elements);
                sendResponse({ success: true });
                break;
            
            case 'elementSelectionCancelled':
                this.handleElementSelectionCancelled();
                sendResponse({ success: true });
                break;
            
            case 'scrapedData':
                this.updateScrapedData(message.data);
                sendResponse({ success: true });
                break;
            
            case 'scrapingComplete':
                this.handleScrapingComplete(message);
                sendResponse({ success: true });
                break;
            
            default:
                sendResponse({ success: false, error: 'Unknown action' });
        }
        return true; // Keep message channel open for async response
    }

    async handleSelectElement() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                this.showStatus('No active tab found', 'error');
                return;
            }

            // Refresh tab context (user may have navigated)
            this.currentTab = { id: tab.id, url: tab.url, origin: this.getOriginFromUrl(tab.url) };

            // Check if page is accessible
            if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
                this.showStatus('Cannot select elements on Chrome internal pages. Please navigate to a regular website.', 'error');
                return;
            }

            // Inject content script if needed
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
                
                await new Promise(resolve => setTimeout(resolve, 300));
                
                // Start element selection
                await chrome.tabs.sendMessage(tab.id, {
                    action: 'startElementSelection',
                    existingElements: this.selectedElements
                });
                
                this.showStatus('Element selection mode activated. Click on elements to select them.', 'info');
                
                // Close popup to allow element selection
                window.close();
                
            } catch (error) {
                console.log('Element selection setup error:', error);
                if (error.message && error.message.includes('Cannot access')) {
                    this.showStatus('Cannot access this page. Please refresh the page and try again.', 'error');
                } else {
                    this.showStatus('Error starting element selection. Please refresh the page and try again.', 'error');
                }
            }
            
        } catch (error) {
            console.log('Element selection error:', error);
            this.showStatus('Error starting element selection: ' + error.message, 'error');
        }
    }

    async handleExtractData() {
        if (this.selectedElements.length === 0) {
            this.showStatus('Please select elements first', 'error');
            return;
        }

        if (this.isExtracting) {
            await this.stopExtraction();
        } else {
            await this.startExtraction();
        }
    }

    async startExtraction() {
        try {
            this.isExtracting = true;
            this.scrapedData = [];
            
            // Show progress
            this.showProgress('Extracting data...', 'Initializing...');
            this.updateExtractButton();
            
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                throw new Error('No active tab found');
            }

            // Simplified extraction options - only basic text extraction
            const extractionOptions = {
                text: true,
                images: false,
                links: false,
                structured: false,
                deepScan: false,
                visibleOnly: true,
                excludeDuplicates: true
            };

            // Start scraping
            const result = await this.scrapingService.startScraping(
                this.selectedElements, 
                tab.url, 
                extractionOptions
            );
            
            if (result.success) {
                this.showStatus('Extraction in progress...', 'info');
                // Update progress after a short delay
                setTimeout(() => {
                    if (this.isExtracting) {
                        this.updateProgress(30, 'Searching for elements...');
                    }
                }, 300);
                setTimeout(() => {
                    if (this.isExtracting) {
                        this.updateProgress(60, 'Extracting data...');
                    }
                }, 1000);
            } else {
                throw new Error(result.error || 'Failed to start extraction');
            }
        } catch (error) {
            console.log('Start extraction error:', error);
            this.showStatus('Error starting extraction: ' + error.message, 'error');
            this.stopExtraction();
        }
    }

    async stopExtraction() {
        try {
            const result = await this.scrapingService.stopScraping();
            
            if (result.success) {
                this.showStatus('Extraction stopped', 'info');
            }
        } catch (error) {
            console.log('Stop extraction error:', error);
        } finally {
            this.isExtracting = false;
            this.hideProgress();
            this.updateExtractButton();
        }
    }

    updateSelectedElements(elements) {
        this.selectedElements = elements;
        this.updateSelectorsList();
        this.updateExtractButton();
    }

    handleElementSelectionComplete(elements) {
        if (!elements || elements.length === 0) {
            this.showStatus('No elements selected', 'info');
            return;
        }
        
        this.selectedElements = elements;
        this.updateSelectorsList();
        this.updateExtractButton();
        this.persistSelectionForCurrentTab().catch(() => {});
        this.showStatus(`Selected ${elements.length} element(s). Ready to extract!`, 'success');
    }

    handleElementSelectionCancelled() {
        this.showStatus('Element selection cancelled', 'info');
    }

    updateSelectorsList() {
        const selectorsList = document.getElementById('selectorsList');
        const clearAllBtn = document.getElementById('clearAllSelectorsBtn');
        const addElementBtn = document.getElementById('addElementBtn');
        
        if (!selectorsList) return;
        
        if (this.selectedElements.length === 0) {
            selectorsList.innerHTML = `
                <div class="empty-state">
                    <p>No elements selected yet</p>
                    <small>Click "Select Element" to begin</small>
                </div>
            `;
            if (clearAllBtn) {
                clearAllBtn.style.display = 'none';
            }
            if (addElementBtn) {
                addElementBtn.style.display = 'none';
            }
        } else {
            if (clearAllBtn) {
                clearAllBtn.style.display = 'block';
            }
            if (addElementBtn) {
                addElementBtn.style.display = 'block';
            }

            const html = this.selectedElements.map((element, index) => {
                return `
                    <div class="selector-item">
                        <div class="selector-info">
                            <div class="selector-name">${element.name}</div>
                            <div class="selector-value">${element.selector}</div>
                        </div>
                        <button class="remove-selector" data-selector-index="${index}">Remove</button>
                    </div>
                `;
            }).join('');

            selectorsList.innerHTML = html;
        }
    }

    removeSelector(index) {
        this.selectedElements.splice(index, 1);
        this.updateSelectorsList();
        this.updateExtractButton();
        this.persistSelectionForCurrentTab().catch(() => {});
    }

    async clearAllSelectors() {
        if (confirm('Are you sure you want to clear all selected elements?')) {
            this.selectedElements = [];
            this.updateSelectorsList();
            this.updateExtractButton();
            
            await this.clearSelectionForCurrentTab();
            
            // Clear highlights from page
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab) {
                    await chrome.tabs.sendMessage(tab.id, { action: 'clearAllHighlights' });
                }
            } catch (error) {
                console.log('Error clearing highlights:', error);
            }
            
            this.showStatus('All elements cleared', 'info');
        }
    }

    async persistSelectionForCurrentTab() {
        try {
            if (!this.currentTab || this.currentTab.id === undefined || this.currentTab.id === null) {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab) return;
                this.currentTab = { id: tab.id, url: tab.url, origin: this.getOriginFromUrl(tab.url) };
            }

            const res = await chrome.storage.local.get(['dataminer_selected_elements_by_tab']);
            const map = res.dataminer_selected_elements_by_tab || {};
            map[String(this.currentTab.id)] = { origin: this.currentTab.origin, elements: this.selectedElements };
            await chrome.storage.local.set({ dataminer_selected_elements_by_tab: map });
        } catch (error) {
            console.log('Error persisting selected elements:', error);
        }
    }

    async clearSelectionForCurrentTab() {
        if (!this.currentTab || this.currentTab.id === undefined || this.currentTab.id === null) {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) return;
            this.currentTab = { id: tab.id, url: tab.url, origin: this.getOriginFromUrl(tab.url) };
        }

        const res = await chrome.storage.local.get(['dataminer_selected_elements_by_tab']);
        const map = res.dataminer_selected_elements_by_tab || {};
        delete map[String(this.currentTab.id)];
        await chrome.storage.local.set({ dataminer_selected_elements_by_tab: map });
    }

    updateScrapedData(data) {
        if (Array.isArray(data) && data.length > 0) {
            // Append new data (for incremental updates during scraping)
            this.scrapedData.push(...data);
            this.updateResultsPreview();
            this.updateExportButtons();
            
            // Update progress (show progress based on data count, max 90%)
            if (this.isExtracting) {
                // Simple progress calculation: 10% + (data count / 100) * 80%, capped at 90%
                const estimatedTotal = Math.max(this.scrapedData.length, 10);
                const progress = Math.min(90, 10 + (this.scrapedData.length / estimatedTotal) * 80);
                this.updateProgress(progress, `Extracted ${this.scrapedData.length} item(s)...`);
            }
        }
    }

    handleScrapingComplete(message) {
        // Check for errors
        if (message.error) {
            this.isExtracting = false;
            this.hideProgress();
            this.updateExtractButton();
            this.showStatus(`Extraction failed: ${message.error}`, 'error');
            return;
        }
        
        const data = message.data || [];
        
        // Replace scraped data with complete data (not append, to avoid duplicates)
        if (data.length > 0) {
            this.scrapedData = data;
        } else {
            // If no data provided but we have existing data, keep it
            // Otherwise clear it
            if (this.scrapedData.length === 0) {
                this.scrapedData = [];
            }
        }
        
        this.isExtracting = false;
        
        // Complete progress
        this.updateProgress(100, 'Complete!');
        setTimeout(() => {
            this.hideProgress();
        }, 500);
        
        this.updateExtractButton();
        this.updateResultsPreview();
        this.updateExportButtons();
        
        // Show appropriate message
        const count = message.count || this.scrapedData.length;
        if (this.scrapedData.length === 0) {
            this.showStatus('No data extracted. Try selecting a different element or check if the selector is correct.', 'warning');
        } else {
            this.showStatus(`Extraction complete! Found ${count} item(s)`, 'success');
        }
    }

    updateResultsPreview() {
        const resultsPreview = document.getElementById('resultsPreview');
        const noResults = document.getElementById('noResults');
        const resultsCount = document.getElementById('resultsCount');
        const resultsTableHead = document.getElementById('resultsTableHead');
        const resultsTableBody = document.getElementById('resultsTableBody');
        
        if (this.scrapedData.length === 0) {
            if (resultsPreview) resultsPreview.style.display = 'none';
            if (noResults) noResults.style.display = 'block';
            return;
        }
        
        if (resultsPreview) resultsPreview.style.display = 'block';
        if (noResults) noResults.style.display = 'none';
        if (resultsCount) resultsCount.textContent = this.scrapedData.length;
        
        // Build table
        if (resultsTableHead && resultsTableBody) {
            // Get all unique keys from scraped data
            const allKeys = new Set();
            this.scrapedData.forEach(item => {
                Object.keys(item).forEach(key => {
                    if (item[key] && typeof item[key] === 'object') {
                        // Check if object has text, href, or src
                        if (item[key].text !== undefined || item[key].href !== undefined || item[key].src !== undefined) {
                            allKeys.add(key);
                        }
                    }
                });
            });
            
            const keys = Array.from(allKeys);
            
            // If no keys found, try to extract simple values
            if (keys.length === 0) {
                this.scrapedData.forEach(item => {
                    Object.keys(item).forEach(key => {
                        allKeys.add(key);
                    });
                });
            }
            
            const finalKeys = Array.from(allKeys);
            
            // Build header
            const headerRow = document.createElement('tr');
            const indexHeader = document.createElement('th');
            indexHeader.textContent = '#';
            indexHeader.style.width = '40px';
            headerRow.appendChild(indexHeader);
            
            finalKeys.forEach(key => {
                const th = document.createElement('th');
                th.textContent = key;
                th.title = key; // Tooltip for long names
                headerRow.appendChild(th);
            });
            resultsTableHead.innerHTML = '';
            resultsTableHead.appendChild(headerRow);
            
            // Build body
            resultsTableBody.innerHTML = '';
            this.scrapedData.forEach((item, index) => {
                const row = document.createElement('tr');
                
                // Index column
                const indexCell = document.createElement('td');
                indexCell.textContent = index + 1;
                indexCell.style.fontWeight = '500';
                indexCell.style.color = 'var(--text-secondary)';
                row.appendChild(indexCell);
                
                // Data columns
                finalKeys.forEach(key => {
                    const cell = document.createElement('td');
                    const value = item[key];
                    
                    let displayValue = '';
                    if (value && typeof value === 'object') {
                        // Priority: href > src > text (same as export)
                        displayValue = value.href || value.src || value.text || '';
                    } else {
                        displayValue = value || '';
                    }
                    
                    // Handle empty values
                    if (!displayValue || displayValue.trim() === '') {
                        cell.textContent = '(empty)';
                        cell.style.color = 'var(--text-secondary)';
                        cell.style.fontStyle = 'italic';
                    } else {
                        // Truncate long values
                        const trimmedValue = displayValue.trim();
                        if (trimmedValue.length > 50) {
                            cell.textContent = trimmedValue.substring(0, 50) + '...';
                            cell.title = trimmedValue; // Full value in tooltip
                        } else {
                            cell.textContent = trimmedValue;
                        }
                    }
                    
                    row.appendChild(cell);
                });
                
                resultsTableBody.appendChild(row);
            });
        }
    }

    updateExtractButton() {
        const extractBtn = document.getElementById('extractDataBtn');
        if (!extractBtn) return;
        
        if (this.isExtracting) {
            extractBtn.innerHTML = '<span class="icon">⏸</span> Stop Extraction';
            extractBtn.disabled = false;
        } else {
            extractBtn.innerHTML = '<span class="icon">▶</span> Extract Data';
            extractBtn.disabled = this.selectedElements.length === 0;
        }
    }

    updateExportButtons() {
        const exportCSVBtn = document.getElementById('exportCSVBtn');
        const exportJSONBtn = document.getElementById('exportJSONBtn');
        
        const hasData = this.scrapedData.length > 0;
        
        if (exportCSVBtn) exportCSVBtn.disabled = !hasData;
        if (exportJSONBtn) exportJSONBtn.disabled = !hasData;
    }

    // Helper method to extract value from item data object based on data type
    extractValueFromItemData(itemData) {
        if (!itemData || typeof itemData !== 'object') return '';
        
        // Priority: href > src > text
        if (itemData.href && itemData.href.trim()) {
            return itemData.href.trim();
        }
        if (itemData.src && itemData.src.trim()) {
            return itemData.src.trim();
        }
        if (itemData.text && itemData.text.trim()) {
            return itemData.text.trim();
        }
        
        return '';
    }

    // Helper method to get all column keys from scraped data
    getAllColumnKeys() {
        const allKeys = new Set();
        this.scrapedData.forEach(item => {
            Object.keys(item).forEach(key => {
                if (item[key] && typeof item[key] === 'object') {
                    // Check if object has text, href, or src
                    if (item[key].text !== undefined || item[key].href !== undefined || item[key].src !== undefined) {
                        allKeys.add(key);
                    }
                }
            });
        });
        return Array.from(allKeys);
    }

    handleExportCSV() {
        if (this.scrapedData.length === 0) {
            this.showStatus('No data to export', 'error');
            return;
        }

        try {
            // Get all column keys
            const columnKeys = this.getAllColumnKeys();
            
            // If multiple columns, export with all columns; otherwise use simple format
            let exportData;
            if (columnKeys.length > 1) {
                // Multiple columns format: [{index: 1, "Column1": "value1", "Column2": "value2"}, ...]
                exportData = this.scrapedData.map((item, index) => {
                    const row = { index: index + 1 };
                    columnKeys.forEach(key => {
                        const itemData = item[key];
                        row[key] = this.extractValueFromItemData(itemData) || '';
                    });
                    return row;
                });
            } else if (columnKeys.length === 1) {
                // Single column format: [{index: 1, value: "..."}, ...]
                const columnKey = columnKeys[0];
                exportData = this.scrapedData.map((item, index) => {
                    const itemData = item[columnKey];
                    return {
                        index: index + 1,
                        value: this.extractValueFromItemData(itemData) || ''
                    };
                });
            } else {
                // Fallback: try to extract any values
                exportData = this.scrapedData.map((item, index) => {
                    const firstKey = Object.keys(item)[0];
                    const itemData = item[firstKey];
                    return {
                        index: index + 1,
                        value: this.extractValueFromItemData(itemData) || ''
                    };
                });
            }

            if (exportData.length === 0) {
                this.showStatus('No data to export (all values are empty)', 'warning');
                return;
            }

            const csvContent = CSVUtils.convertToCSV(exportData);
            if (!csvContent || csvContent.trim() === '') {
                throw new Error('Failed to generate CSV content');
            }
            
            const filename = CSVUtils.generateFilename('dataminer-export');
            const result = CSVUtils.downloadCSV(csvContent, filename);
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to download CSV file');
            }
            
            this.showStatus(`CSV exported successfully (${exportData.length} items, ${columnKeys.length} column(s))`, 'success');
        } catch (error) {
            console.log('CSV export error:', error);
            this.showStatus('Error exporting CSV: ' + error.message, 'error');
        }
    }

    handleExportJSON() {
        if (this.scrapedData.length === 0) {
            this.showStatus('No data to export', 'error');
            return;
        }

        try {
            // Get all column keys
            const columnKeys = this.getAllColumnKeys();
            
            // If multiple columns, export with all columns; otherwise use simple format
            let exportData;
            if (columnKeys.length > 1) {
                // Multiple columns format: [{index: 1, "Column1": "value1", "Column2": "value2"}, ...]
                exportData = this.scrapedData.map((item, index) => {
                    const row = { index: index + 1 };
                    columnKeys.forEach(key => {
                        const itemData = item[key];
                        row[key] = this.extractValueFromItemData(itemData) || '';
                    });
                    return row;
                });
            } else if (columnKeys.length === 1) {
                // Single column format: [{index: 1, value: "..."}, ...]
                const columnKey = columnKeys[0];
                exportData = this.scrapedData.map((item, index) => {
                    const itemData = item[columnKey];
                    return {
                        index: index + 1,
                        value: this.extractValueFromItemData(itemData) || ''
                    };
                });
            } else {
                // Fallback: try to extract any values
                exportData = this.scrapedData.map((item, index) => {
                    const firstKey = Object.keys(item)[0];
                    const itemData = item[firstKey];
                    return {
                        index: index + 1,
                        value: this.extractValueFromItemData(itemData) || ''
                    };
                });
            }

            const jsonContent = JSONUtils.convertToJSON(exportData, true);
            if (!jsonContent || jsonContent.trim() === '') {
                throw new Error('Failed to generate JSON content');
            }
            
            const filename = JSONUtils.generateFilename('dataminer-export');
            const result = JSONUtils.downloadJSON(jsonContent, filename);
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to download JSON file');
            }
            
            this.showStatus(`JSON exported successfully (${exportData.length} items, ${columnKeys.length} column(s))`, 'success');
        } catch (error) {
            console.log('JSON export error:', error);
            this.showStatus('Error exporting JSON: ' + error.message, 'error');
        }
    }

    showProgress(title, status) {
        const progressContainer = document.getElementById('extractionProgress');
        const progressFill = document.getElementById('progressFill');
        const progressStatus = document.getElementById('progressStatus');
        
        if (progressContainer) progressContainer.style.display = 'block';
        if (progressFill) {
            progressFill.style.width = '0%';
            progressFill.style.transition = 'width 0.3s ease';
        }
        if (progressStatus) progressStatus.textContent = status || 'Extracting data...';
    }

    hideProgress() {
        const progressContainer = document.getElementById('extractionProgress');
        const progressFill = document.getElementById('progressFill');
        if (progressContainer) progressContainer.style.display = 'none';
        if (progressFill) progressFill.style.width = '0%';
    }
    
    updateProgress(percent, status) {
        const progressFill = document.getElementById('progressFill');
        const progressStatus = document.getElementById('progressStatus');
        
        if (progressFill) {
            progressFill.style.width = Math.min(100, Math.max(0, percent)) + '%';
        }
        if (progressStatus && status) {
            progressStatus.textContent = status;
        }
    }

    showStatus(message, type = 'info') {
        const statusMessage = document.getElementById('statusMessage');
        if (statusMessage) {
            statusMessage.textContent = message;
            statusMessage.className = `status-message ${type}`;
            
            setTimeout(() => {
                statusMessage.textContent = '';
                statusMessage.className = 'status-message';
            }, 3000);
        }
    }

    updateUI() {
        this.updateSelectorsList();
        this.updateExtractButton();
        this.updateExportButtons();
        this.updateResultsPreview();
    }
}

// Initialize controller when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dataminerController = new DataminerController();
});

