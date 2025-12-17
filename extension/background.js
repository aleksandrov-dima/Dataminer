// Background service worker for Dataminer extension
class BackgroundService {
    constructor() {
        this.init();
    }

    getOriginFromUrl(url) {
        try {
            return new URL(url).origin;
        } catch (e) {
            return null;
        }
    }

    init() {
        // Listen for messages from content scripts and popup
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
        });

        // Handle extension installation
        chrome.runtime.onInstalled.addListener((details) => {
            this.handleInstallation(details);
        });

        // Click on extension icon toggles the on-page panel (no popup)
        chrome.action.onClicked.addListener((tab) => {
            this.handleActionClicked(tab);
        });

    }

    handleMessage(message, sender, sendResponse) {
        switch (message.action) {
            case 'scrapedData':
                this.handleScrapedData(message.data, sender);
                sendResponse({ success: true });
                break;
            
            case 'scrapingComplete':
                this.handleScrapingComplete(message, sender);
                sendResponse({ success: true });
                break;
            
            case 'elementSelectionComplete':
                this.handleElementSelectionComplete(message.elements, sender);
                sendResponse({ success: true });
                break;
            
            case 'elementSelectionCancelled':
                this.handleElementSelectionCancelled(sender);
                sendResponse({ success: true });
                break;

            case 'downloadFile':
                this.handleDownloadFile(message).then(() => {
                    sendResponse({ success: true });
                }).catch((error) => {
                    sendResponse({ success: false, error: error?.message || String(error) });
                });
                break;
            
            default:
                sendResponse({ success: false, error: 'Unknown action' });
        }
    }

    handleInstallation(details) {
        if (details.reason === 'install') {
            console.log('Dataminer extension installed');
        } else if (details.reason === 'update') {
            console.log('Dataminer extension updated');
        }
    }

    async handleScrapedData(data, sender) {
        try {
            // Forward data directly to popup (no need to store temporarily)
            this.notifyPopup('scrapedData', { data: data });
        } catch (error) {
            console.log('Error handling scraped data:', error);
        }
    }

    async handleScrapingComplete(message, sender) {
        try {
            const data = message.data || [];
            const error = message.error || null;
            const count = message.count || data.length;
            // Notify popup with complete data and error if any
            this.notifyPopup('scrapingComplete', { 
                data, 
                error,
                count 
            });
        } catch (error) {
            console.log('Error handling scraping complete:', error);
        }
    }

    handleElementSelectionComplete(elements, sender) {
        const tabId = sender && sender.tab ? sender.tab.id : null;
        const origin = sender && sender.tab ? this.getOriginFromUrl(sender.tab.url) : null;

        // Store selected elements per tab+origin to avoid leaking selections across sites/tabs
        if (tabId !== null) {
            chrome.storage.local.get(['dataminer_selected_elements_by_tab']).then((res) => {
                const map = res.dataminer_selected_elements_by_tab || {};
                map[String(tabId)] = { origin, elements: elements || [] };
                return chrome.storage.local.set({ dataminer_selected_elements_by_tab: map });
            }).catch(() => {
                // Ignore storage errors
            });
        }

        // Notify popup
        this.notifyPopup('elementSelectionComplete', { elements, tabId, origin });
    }

    handleElementSelectionCancelled(sender) {
        const tabId = sender && sender.tab ? sender.tab.id : null;
        // Clear selected elements only for this tab
        if (tabId !== null) {
            chrome.storage.local.get(['dataminer_selected_elements_by_tab']).then((res) => {
                const map = res.dataminer_selected_elements_by_tab || {};
                delete map[String(tabId)];
                return chrome.storage.local.set({ dataminer_selected_elements_by_tab: map });
            }).catch(() => {
                // Ignore storage errors
            });
        }

        // Notify popup
        this.notifyPopup('elementSelectionCancelled');
    }

    notifyPopup(action, data = {}) {
        // Try to send message to popup
        chrome.runtime.sendMessage({
            action: action,
            ...data
        }).catch(() => {
            // Popup might not be open, that's okay - silently fail
        });
    }

    async handleActionClicked(tab) {
        try {
            if (!tab || tab.id == null) return;
            const tabId = tab.id;
            const url = tab.url || '';

            // Skip internal pages
            if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
                return;
            }

            // Ensure content script is ready
            try {
                await chrome.tabs.sendMessage(tabId, { action: 'ping' });
            } catch (e) {
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId },
                        files: ['utils/OnPageUtils.js', 'content.js']
                    });
                } catch (e2) {
                    // ignore
                }
            }

            // Toggle panel
            try {
                await chrome.tabs.sendMessage(tabId, { action: 'togglePanel' });
            } catch (e) {
                // ignore
            }
        } catch (e) {
            console.log('handleActionClicked error', e);
        }
    }

    async handleDownloadFile(message) {
        const filename = message.filename || `dataminer-export-${Date.now()}`;
        const mime = message.mime || 'application/octet-stream';
        const content = message.content || '';

        // Build data URL (download API will download without navigating the page)
        const url = `data:${mime};charset=utf-8,${encodeURIComponent(content)}`;

        await chrome.downloads.download({
            url,
            filename,
            saveAs: false
        });
    }
}

// Initialize background service
const backgroundService = new BackgroundService();
