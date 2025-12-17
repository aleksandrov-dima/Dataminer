class ScrapingService {
    constructor() {
        this.isScraping = false;
        this.scrapedData = [];
        this.selectors = [];
    }

    async startScraping(selectors, url, extractionOptions = {}) {
        if (this.isScraping) {
            return { success: false, error: 'Scraping is already in progress' };
        }

        this.isScraping = true;
        this.scrapedData = [];
        this.selectors = selectors;

        try {
            // Get the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                throw new Error('No active tab found');
            }

            // Check if content script is already available
            try {
                await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
            } catch (error) {
                // Content script not available, inject it
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
                // Wait for content script to initialize
                await new Promise(resolve => setTimeout(resolve, 200));
            }

            // Inject scraping function
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: scrapePageFunction,
                args: [selectors, extractionOptions]
            });

            return { success: true };
        } catch (error) {
            console.log('Start scraping error:', error);
            this.isScraping = false;
            return { success: false, error: error.message };
        }
    }

    async stopScraping() {
        this.isScraping = false;
        
        try {
            // Get the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (tab) {
                // Send stop message to content script
                await chrome.tabs.sendMessage(tab.id, { action: 'stopScraping' });
            }

            return { success: true };
        } catch (error) {
            console.log('Stop scraping error:', error);
            return { success: false, error: error.message };
        }
    }

    async getScrapedData() {
        return this.scrapedData;
    }

    getScrapingStatus() {
        return {
            isScraping: this.isScraping,
            dataCount: this.scrapedData.length
        };
    }

    clearData() {
        this.scrapedData = [];
        this.selectors = [];
    }
}

// Simplified scraping function - no auto-scroll, no infinite scroll
async function scrapePageFunction(selectors, extractionOptions = {}) {
    // Prevent multiple instances from running
    if (window.OnPageScrapingActive) {
        console.log('⚠️ Scraping already active, ignoring duplicate call');
        return;
    }
    window.OnPageScrapingActive = true;
    
    // Set default options - simplified
    const options = {
        text: true,
        images: false,
        links: false,
        visibleOnly: true,
        excludeDuplicates: true,
        ...extractionOptions
    };
    
    const scrapedData = [];
    const seenKeys = new Set();

    // Function to extract text from element
    const extractText = (element) => {
        if (!element) return '';
        return element.textContent?.trim() || element.innerText?.trim() || '';
    };

    // Function to find image element (check element itself or search inside)
    const findImageElement = (element) => {
        if (element.tagName === 'IMG') {
            return element;
        }
        // Search for img inside the element
        const img = element.querySelector('img');
        return img || null;
    };

    // Function to find link element (check element itself or search inside)
    const findLinkElement = (element) => {
        if (element.tagName === 'A' && element.href) {
            return element;
        }
        // Search for link inside the element
        const link = element.querySelector('a[href]');
        return link || null;
    };

    // Function to determine data type based on element
    const getDataType = (element) => {
        // Check for link first
        const linkEl = findLinkElement(element);
        if (linkEl && linkEl.href) {
            return 'href';
        }
        // Check for image
        const imgEl = findImageElement(element);
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
        return 'textContent';
    };

    // Function to extract value based on data type
    const extractValue = (element, dataType) => {
        switch (dataType) {
            case 'href': {
                const linkEl = findLinkElement(element);
                if (linkEl) {
                    return linkEl.href || linkEl.getAttribute('href') || '';
                }
                return '';
            }
            case 'src': {
                const imgEl = findImageElement(element);
                if (imgEl) {
                    // Try multiple attributes in order of priority
                    const src = imgEl.src || 
                               imgEl.getAttribute('src') || 
                               imgEl.getAttribute('data-src') || 
                               imgEl.getAttribute('data-src-pb') ||
                               imgEl.getAttribute('data-lazy-src') || 
                               imgEl.getAttribute('data-original') ||
                               '';
                    // Debug logging (can be removed in production)
                    if (!src) {
                        console.log(`⚠️ Image element found but no src attribute. Element:`, imgEl, 'Attributes:', {
                            src: imgEl.src,
                            'data-src': imgEl.getAttribute('data-src'),
                            'data-src-pb': imgEl.getAttribute('data-src-pb'),
                            'data-lazy-src': imgEl.getAttribute('data-lazy-src')
                        });
                    }
                    return src;
                } else {
                    console.log(`⚠️ No image element found in container:`, element.className || element.tagName, element);
                }
                return '';
            }
            default:
                return extractText(element);
        }
    };

    // Helper function to check if element is visible (optimized)
    const isElementVisible = (el) => {
        if (!options.visibleOnly) return true;
        
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        
        const style = getComputedStyle(el);
        return style.visibility !== 'hidden' && style.display !== 'none';
    };

    // Helper function to filter visible elements (optimized)
    const filterVisibleElements = (elements) => {
        if (!options.visibleOnly) return Array.from(elements);
        
        const visible = [];
        for (let i = 0; i < elements.length; i++) {
            if (isElementVisible(elements[i])) {
                visible.push(elements[i]);
            }
        }
        return visible;
    };

    // Simple extraction - find all matching elements and extract data
    try {
        const startTime = performance.now();
        
        // Wait a bit for dynamic content to load (if needed)
        // This is a simple approach - in production, could use MutationObserver
        const waitForDynamicContent = async () => {
            return new Promise(resolve => {
                // Wait for DOM to be ready
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', resolve);
                } else {
                    // Small delay to allow dynamic content to render
                    setTimeout(resolve, 100);
                }
            });
        };
        
        await waitForDynamicContent();
        
        selectors.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector.selector);
                
                if (elements.length === 0) {
                    console.log(`⚠️ No elements found for selector: ${selector.selector}`);
                    // Try to find elements after a short delay (for dynamic content)
                    setTimeout(() => {
                        const retryElements = document.querySelectorAll(selector.selector);
                        if (retryElements.length > 0) {
                            console.log(`✅ Found ${retryElements.length} elements on retry (dynamic content)`);
                        }
                    }, 500);
                    return;
                }

                const visibleElements = filterVisibleElements(elements);
                
                if (visibleElements.length === 0) {
                    console.log(`⚠️ No visible elements found for selector: ${selector.selector}`);
                    return;
                }

                visibleElements.forEach((el) => {
                    // Use saved data type from selector, or determine automatically
                    const dataType = selector.dataType || getDataType(el);
                    const value = extractValue(el, dataType);

                    // Skip empty values if needed
                    if (!value || value.trim() === '') {
                        return;
                    }

                    // Create item with proper data type
                    const item = {
                        [selector.name]: {
                            text: dataType === 'textContent' ? value : '',
                            href: dataType === 'href' ? value : '',
                            src: dataType === 'src' ? value : ''
                        }
                    };

                    // Exclude duplicates if enabled
                    if (options.excludeDuplicates) {
                        const key = `${selector.name}:${value}`;
                        if (seenKeys.has(key)) {
                            return;
                        }
                        seenKeys.add(key);
                    }

                    scrapedData.push(item);
                });
            } catch (selectorError) {
                console.log(`❌ Error processing selector ${selector.name}:`, selectorError);
                // Continue with other selectors
            }
        });
        
        const endTime = performance.now();
        console.log(`⏱️ Extraction completed in ${(endTime - startTime).toFixed(2)}ms`);

        // If we have multiple selectors, align them by index
        if (selectors.length > 1) {
            const alignedData = [];
            
            // Pre-calculate visible elements for each selector (optimization)
            const selectorElements = selectors.map(s => {
                try {
                    const elements = document.querySelectorAll(s.selector);
                    return filterVisibleElements(elements);
                } catch (error) {
                    console.log(`❌ Error querying selector ${s.name}:`, error);
                    return [];
                }
            });
            
            const maxLength = Math.max(...selectorElements.map(el => el.length), 0);

            if (maxLength === 0) {
                throw new Error('No elements found for any selector');
            }

            // Check for significant mismatch in element counts
            const elementCounts = selectorElements.map(el => el.length);
            const minCount = Math.min(...elementCounts);
            const maxCount = Math.max(...elementCounts);
            const mismatchPercentage = ((maxCount - minCount) / maxCount) * 100;
            
            if (mismatchPercentage > 20) {
                console.log(`⚠️ Warning: Selectors found different number of elements. Min: ${minCount}, Max: ${maxCount}, Difference: ${mismatchPercentage.toFixed(1)}%`);
            }

            for (let i = 0; i < maxLength; i++) {
                const item = {};
                let hasAnyValue = false;
                
                selectors.forEach((selector, selectorIndex) => {
                    const visibleElements = selectorElements[selectorIndex];
                    
                    // Always add field for each selector, even if element not found
                    if (visibleElements[i]) {
                        const el = visibleElements[i];
                        // Use saved data type from selector, or determine automatically
                        const dataType = selector.dataType || getDataType(el);
                        const value = extractValue(el, dataType);
                        
                        // Always add field, even if value is empty
                        item[selector.name] = {
                            text: dataType === 'textContent' ? (value || '') : '',
                            href: dataType === 'href' ? (value || '') : '',
                            src: dataType === 'src' ? (value || '') : ''
                        };
                        
                        if (value && value.trim() !== '') {
                            hasAnyValue = true;
                        }
                    } else {
                        // Element not found at this index - add empty field
                        item[selector.name] = {
                            text: '',
                            href: '',
                            src: ''
                        };
                    }
                });
                
                // Only skip if ALL values are empty (all selectors failed)
                if (hasAnyValue || Object.keys(item).length === selectors.length) {
                    alignedData.push(item);
                }
            }

            // Send aligned data
            if (alignedData.length > 0) {
                chrome.runtime.sendMessage({
                    action: 'scrapedData',
                    data: alignedData
                });
            }

            // Complete scraping
            window.OnPageScrapingActive = false;
            chrome.runtime.sendMessage({
                action: 'scrapingComplete',
                data: alignedData,
                count: alignedData.length
            });
        } else {
            // Single selector - send data as is
            if (scrapedData.length === 0) {
                throw new Error(`No data extracted. No elements found matching selector: ${selectors[0].selector}`);
            }
            
            chrome.runtime.sendMessage({
                action: 'scrapedData',
                data: scrapedData
            });

            // Complete scraping
            window.OnPageScrapingActive = false;
            chrome.runtime.sendMessage({
                action: 'scrapingComplete',
                data: scrapedData,
                count: scrapedData.length
            });
        }
    } catch (error) {
        console.log('❌ Scraping error:', error);
        window.OnPageScrapingActive = false;
        chrome.runtime.sendMessage({
            action: 'scrapingComplete',
            data: [],
            error: error.message || 'Unknown error occurred during extraction'
        });
    }

    // Listen for stop message
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'stopScraping') {
            console.log('🛑 Manual stop requested');
            window.OnPageScrapingActive = false;
            chrome.runtime.sendMessage({
                action: 'scrapingComplete',
                data: scrapedData,
                manualStop: true
            });
        }
    });
}
