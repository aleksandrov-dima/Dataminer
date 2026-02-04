// Background service worker for Data Scraping Tool extension with Side Panel
const UNINSTALL_URL = "https://data-scraping.pro/delete/";

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
        // Listen for messages from content scripts and side panel
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            // Return true to indicate we may respond asynchronously
            return true;
        });

        // Handle extension installation
        chrome.runtime.onInstalled.addListener((details) => {
            this.handleInstallation(details);
        });

        // Click on extension icon opens side panel
        chrome.action.onClicked.addListener((tab) => {
            this.handleActionClicked(tab);
        });

        // Set up side panel behavior
        chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
            .catch((error) => console.log('Side panel setup error:', error));
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

            case 'fieldAdded':
            case 'previewUpdated':
            case 'selectionStopped':
            case 'stateLoaded':
                // Forward these messages from content script to side panel
                chrome.runtime.sendMessage(message).catch(() => {
                    // Side panel might not be open
                });
                sendResponse({ success: true });
                break;
            
            default:
                sendResponse({ success: false, error: 'Unknown action' });
        }
    }

    handleInstallation(details) {
        chrome.runtime.setUninstallURL(UNINSTALL_URL);

        if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
            // Open welcome page on first install
            chrome.tabs.create({
                url: "https://data-scraping.pro",
            });
            console.log('Data Scraping Tool extension installed');
        } else if (details.reason === chrome.runtime.OnInstalledReason.UPDATE) {
            // When extension is updated
            console.log('Data Scraping Tool extension updated');
        } else if (details.reason === chrome.runtime.OnInstalledReason.CHROME_UPDATE) {
            // When browser is updated
            console.log('Chrome browser updated');
        } else if (details.reason === chrome.runtime.OnInstalledReason.SHARED_MODULE_UPDATE) {
            // When a shared module is updated
            console.log('Shared module updated');
        }
    }

    async handleScrapedData(data, sender) {
        try {
            this.notifyPanel('scrapedData', { data: data });
        } catch (error) {
            console.log('Error handling scraped data:', error);
        }
    }

    async handleScrapingComplete(message, sender) {
        try {
            const data = message.data || [];
            const error = message.error || null;
            const count = message.count || data.length;
            this.notifyPanel('scrapingComplete', { 
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

        if (tabId !== null) {
            chrome.storage.local.get(['data-scraping-tool_selected_elements_by_tab']).then((res) => {
                const map = res['data-scraping-tool_selected_elements_by_tab'] || {};
                map[String(tabId)] = { origin, elements: elements || [] };
                return chrome.storage.local.set({ 'data-scraping-tool_selected_elements_by_tab': map });
            }).catch(() => {});
        }

        this.notifyPanel('elementSelectionComplete', { elements, tabId, origin });
    }

    handleElementSelectionCancelled(sender) {
        const tabId = sender && sender.tab ? sender.tab.id : null;
        if (tabId !== null) {
            chrome.storage.local.get(['data-scraping-tool_selected_elements_by_tab']).then((res) => {
                const map = res['data-scraping-tool_selected_elements_by_tab'] || {};
                delete map[String(tabId)];
                return chrome.storage.local.set({ 'data-scraping-tool_selected_elements_by_tab': map });
            }).catch(() => {});
        }

        this.notifyPanel('elementSelectionCancelled');
    }

    notifyPanel(action, data = {}) {
        chrome.runtime.sendMessage({
            action: action,
            ...data
        }).catch(() => {
            // Side panel might not be open
        });
    }

    async handleActionClicked(tab) {
        // Side panel opens automatically via openPanelOnActionClick
        // But we can still do additional setup here if needed
        
        if (!tab || tab.id == null) return;
        const url = tab.url || '';

        // Skip internal pages
        if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
            return;
        }

        // Ensure content script is ready
        try {
            await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
        } catch (e) {
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['utils/TextExtractionUtils.js', 'utils/ElementUtils.js', 'content.js']
                });
            } catch (e2) {
                console.log('Cannot inject content script:', e2);
            }
        }
    }

    async handleDownloadFile(message) {
        const filename = message.filename || `data-scraping-tool-export-${Date.now()}`;
        const mime = message.mime || 'application/octet-stream';
        const content = message.content || '';

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
