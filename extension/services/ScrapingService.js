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
        debug: false,
        ...extractionOptions
    };

    const debug = !!options.debug;
    const log = debug ? console.log.bind(console) : () => {};
    const warn = debug ? (console.warn ? console.warn.bind(console) : console.log.bind(console)) : () => {};
    const errorLog = console.error ? console.error.bind(console) : console.log.bind(console);
    
    const scrapedData = [];
    const seenKeys = new Set();
    // Expose current run data for a single stop-listener (see bottom of function).
    window.__DataminerLastScrapedData = scrapedData;

    // Function to extract text from element
    const extractText = (element) => {
        if (!element) return '';
        
        // Use improved extraction logic from TextExtractionUtils
        if (typeof window !== 'undefined' && window.TextExtractionUtils) {
            return window.TextExtractionUtils.extractTextSmart(element, {
                preferVisible: options.visibleOnly !== false,
                maxDepth: 5,
                excludeSelectors: ['script', 'style', 'noscript', 'svg']
            });
        }
        
        // Fallback: legacy logic (in case TextExtractionUtils is not loaded)
        let text = element.textContent?.trim() || element.innerText?.trim() || '';
        
        if (!text && element.children && element.children.length > 0) {
            for (let i = 0; i < element.children.length; i++) {
                const child = element.children[i];
                const childText = child.textContent?.trim() || child.innerText?.trim() || '';
                if (childText) {
                    text = childText;
                    break;
                }
            }
        }
        
        return text;
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
    
    // Helper function to check if element matches selector classes (flexible matching)
    const elementMatchesClasses = (element, requiredClasses) => {
        const elementClasses = (element.className?.toString().toLowerCase() || '').split(/\s+/).filter(c => c.length > 0);
        // Check if element has at least one of the required classes
        return requiredClasses.some(cls => elementClasses.includes(cls.toLowerCase()));
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
        
        // Find common parent selector if available
        const parentSelectors = selectors.map(s => s.parentSelector).filter(Boolean);
        const commonParentSelector = parentSelectors.length > 0 && parentSelectors.every(ps => ps === parentSelectors[0]) 
            ? parentSelectors[0] 
            : null;
        
        // If we have multiple selectors AND a parent selector, skip the initial extraction
        // and go directly to parent-container-based extraction
        const shouldUseParentContainers = selectors.length > 1 && commonParentSelector;
        
        // Only do initial extraction if we don't have parent containers to process
        if (!shouldUseParentContainers) {
            // Get parent container if selector exists (for single selector case)
            let parentContainer = null;
            if (commonParentSelector) {
                try {
                    parentContainer = document.querySelector(commonParentSelector);
                    if (parentContainer) {
                        console.log(`📦 Limiting search to parent container: ${commonParentSelector}`);
                    }
                } catch (error) {
                    console.log(`⚠️ Could not find parent container: ${commonParentSelector}`, error);
                }
            }

            selectors.forEach(selector => {
                try {
                    // If parent container exists, search within it
                    const searchRoot = parentContainer || document;
                    const elements = searchRoot.querySelectorAll(selector.selector);
                    
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
        }
        
        const endTime = performance.now();
        log(`⏱️ Extraction completed in ${(endTime - startTime).toFixed(2)}ms`);

        // If we have multiple selectors, align them by index
        if (selectors.length > 1) {
            const alignedData = [];
            
            // Find common parent selector if available
            const parentSelectors = selectors.map(s => s.parentSelector).filter(Boolean);
            const commonParentSelector = parentSelectors.length > 0 && parentSelectors.every(ps => ps === parentSelectors[0]) 
                ? parentSelectors[0] 
                : null;
            
            // If we have a parent selector, find all parent containers (e.g., all product cards)
            let parentContainers = [];
            if (commonParentSelector) {
                try {
                    parentContainers = Array.from(document.querySelectorAll(commonParentSelector));
                    parentContainers = filterVisibleElements(parentContainers);
                    log(`📦 Found ${parentContainers.length} parent containers: ${commonParentSelector}`);
                } catch (error) {
                    warn(`⚠️ Could not find parent containers: ${commonParentSelector}`, error);
                }
            }
            
            // If we have parent containers, extract data from each container separately
            // If shouldUseParentContainers is true but containers not found, log warning
            if (shouldUseParentContainers && parentContainers.length === 0) {
                warn(`⚠️ Warning: parentSelector "${commonParentSelector}" was specified but no containers found. Falling back to full page extraction.`);
            }
            
            if (parentContainers.length > 0) {
                parentContainers.forEach((parentContainer, containerIndex) => {
                    const item = {};
                    let hasAnyValue = false;
                    
                    selectors.forEach(selector => {
                        try {
                            // Search within this specific parent container
                            let elements = parentContainer.querySelectorAll(selector.selector);
                            let visibleElements = filterVisibleElements(elements);
                            
                            // If no elements found, try searching in parent container's parent (for cases where elements are siblings)
                            if (visibleElements.length === 0 && parentContainer.parentElement) {
                                const parentParent = parentContainer.parentElement;
                                try {
                                    elements = parentParent.querySelectorAll(selector.selector);
                                    visibleElements = filterVisibleElements(elements);
                                    // Filter to only elements that are within the same "card" context
                                    if (visibleElements.length > 0) {
                                        // Check if elements are actually related to this container (same card)
                                        visibleElements = visibleElements.filter(el => {
                                            // Element should be a sibling or close relative of parentContainer
                                            return parentParent.contains(el) && 
                                                   (parentContainer.contains(el) || 
                                                    el.parentElement === parentParent ||
                                                    parentContainer.parentElement.contains(el));
                                        });
                                        if (visibleElements.length > 0) {
                                            log(`🔍 Found ${visibleElements.length} elements for ${selector.name} in parent's parent container`);
                                        }
                                    }
                                } catch (e) {}
                            }
                            
                            // If no elements found with exact selector, try flexible search
                            if (visibleElements.length === 0) {
                                // Try to find element by tag name and class name (more flexible)
                                const selectorParts = selector.selector.split('.');
                                if (selectorParts.length > 1) {
                                    const tagName = selectorParts[0];
                                    const classes = selectorParts.slice(1);
                                    
                                    // Try different strategies:
                                    // 1. Try with just tag name and first class
                                    if (classes.length > 0) {
                                        const simpleSelector = `${tagName}.${classes[0]}`;
                                        try {
                                            elements = parentContainer.querySelectorAll(simpleSelector);
                                            visibleElements = filterVisibleElements(elements);
                                            if (visibleElements.length === 0 && parentContainer.parentElement) {
                                                // Try in parent's parent
                                                elements = parentContainer.parentElement.querySelectorAll(simpleSelector);
                                                visibleElements = filterVisibleElements(elements);
                                                if (visibleElements.length > 0) {
                                                    visibleElements = visibleElements.filter(el => 
                                                        parentContainer.parentElement.contains(el)
                                                    );
                                                }
                                            }
                                            if (visibleElements.length > 0) {
                                                log(`🔍 Found ${visibleElements.length} elements for ${selector.name} using simple selector: ${simpleSelector}`);
                                            }
                                        } catch (e) {}
                                    }
                                    
                                    // 2. Try finding by tag and any class match (most flexible)
                                    if (visibleElements.length === 0 && classes.length > 0) {
                                        let allElements = Array.from(parentContainer.querySelectorAll(tagName));
                                        if (allElements.length === 0 && parentContainer.parentElement) {
                                            allElements = Array.from(parentContainer.parentElement.querySelectorAll(tagName));
                                        }
                                        visibleElements = allElements.filter(el => {
                                            return elementMatchesClasses(el, classes) && isElementVisible(el);
                                        });
                                        
                                        // If still no elements, try searching for elements that contain the class name in their class list
                                        if (visibleElements.length === 0) {
                                            visibleElements = allElements.filter(el => {
                                                const elClasses = (el.className?.toString().toLowerCase() || '').split(/\s+/);
                                                // Check if any of the required classes match any of the element's classes
                                                return classes.some(reqClass => {
                                                    const reqClassLower = reqClass.toLowerCase();
                                                    return elClasses.some(elClass => elClass.includes(reqClassLower) || reqClassLower.includes(elClass));
                                                }) && isElementVisible(el);
                                            });
                                        }
                                        
                                        if (visibleElements.length > 0) {
                                            log(`🔍 Found ${visibleElements.length} elements for ${selector.name} using flexible class matching (tag: ${tagName}, classes: ${classes.join(', ')})`);
                                        }
                                    }
                                    
                                    // 3. Last resort: try just by tag name (if selector name matches tag or if no classes specified)
                                    if (visibleElements.length === 0 && (selector.name.toLowerCase() === tagName || classes.length === 0)) {
                                        let allElements = Array.from(parentContainer.querySelectorAll(tagName));
                                        if (allElements.length === 0 && parentContainer.parentElement) {
                                            allElements = Array.from(parentContainer.parentElement.querySelectorAll(tagName));
                                        }
                                        
                                        // For tag-only selectors, prefer elements with classes or text content
                                        const elementsWithContent = allElements.filter(el => {
                                            const hasText = el.textContent?.trim() && el.textContent.trim().length > 0;
                                            const hasClasses = el.className && el.className.toString().trim().length > 0;
                                            return (hasText || hasClasses) && isElementVisible(el);
                                        });
                                        
                                        visibleElements = elementsWithContent.length > 0 ? elementsWithContent : filterVisibleElements(allElements);
                                        
                                        if (visibleElements.length > 0) {
                                            log(`🔍 Found ${visibleElements.length} elements for ${selector.name} using tag name only (filtered to ${elementsWithContent.length} with content)`);
                                        }
                                    }
                                }
                            }
                            
                            // Select the best matching element from this container
                            if (visibleElements.length > 0) {
                                // If selector is very general (like just "span"), try to find the most specific one
                                let selectedElement = visibleElements[0];
                                
                                // If selector is just a tag name without classes, prefer elements with classes or text content
                                const selectorParts = selector.selector.split('.');
                                if (selectorParts.length === 1 || (selectorParts.length === 1 && selectorParts[0] === selector.name)) {
                                    // Try to find element with classes or with actual text content
                                    const elementsWithContent = visibleElements.filter(el => {
                                        const hasText = el.textContent?.trim() && el.textContent.trim().length > 0;
                                        const hasClasses = el.className && el.className.toString().trim().length > 0;
                                        return hasText || hasClasses;
                                    });
                                    
                                    if (elementsWithContent.length > 0) {
                                        // Prefer element with both classes and text, or just text
                                        selectedElement = elementsWithContent.find(el => {
                                            const hasText = el.textContent?.trim() && el.textContent.trim().length > 0;
                                            const hasClasses = el.className && el.className.toString().trim().length > 0;
                                            return hasText && hasClasses;
                                        }) || elementsWithContent[0];
                                    }
                                }
                                
                                const el = selectedElement;
                                const dataType = selector.dataType || getDataType(el);
                                let value = extractValue(el, dataType);
                                
                                // If value is empty but element has children, try to extract from children
                                if ((!value || value.trim() === '') && dataType === 'textContent' && el.children.length > 0) {
                                    // Try to find text in child elements
                                    const childWithText = Array.from(el.children).find(child => {
                                        const childText = child.textContent?.trim();
                                        return childText && childText.length > 0;
                                    });
                                    
                                    if (childWithText) {
                                        value = extractText(childWithText);
                                    } else {
                                        // Try direct text content (might be in text nodes)
                                        value = extractText(el);
                                    }
                                }
                                
                                if (value && value.trim() !== '') {
                                    item[selector.name] = {
                                        text: dataType === 'textContent' ? value : '',
                                        href: dataType === 'href' ? value : '',
                                        src: dataType === 'src' ? value : ''
                                    };
                                    hasAnyValue = true;
                                } else {
                                    // Value is empty - add empty field but log it
                                    if (containerIndex === 0) {
                                        warn(`⚠️ Element found for ${selector.name} but value is empty. Element:`, el, `Tag: ${el.tagName}, Classes: ${el.className}, Text: "${el.textContent?.trim().substring(0, 50)}"`);
                                    }
                                    item[selector.name] = {
                                        text: '',
                                        href: '',
                                        src: ''
                                    };
                                }
                            } else {
                                // Element not found in this container - log for debugging
                                if (containerIndex === 0) {
                                    warn(`⚠️ Element not found for ${selector.name} in container. Selector: ${selector.selector}`);
                                    // Try to find any elements with similar tag/class in container for debugging
                                    const selectorParts = selector.selector.split('.');
                                    if (selectorParts.length > 1) {
                                        const tagName = selectorParts[0];
                                        const allTagElements = parentContainer.querySelectorAll(tagName);
                                        log(`   Found ${allTagElements.length} elements with tag "${tagName}" in container`);
                                    }
                                }
                                item[selector.name] = {
                                    text: '',
                                    href: '',
                                    src: ''
                                };
                            }
                        } catch (error) {
                            warn(`❌ Error extracting from container ${containerIndex} for selector ${selector.name}:`, error);
                            item[selector.name] = {
                                text: '',
                                href: '',
                                src: ''
                            };
                        }
                    });
                    
                    // Add only meaningful rows.
                    // Some parent containers are not product cards (headers/ads/spacers) and will produce all-empty fields.
                    // We skip those to avoid "every other row is empty" in results/export.
                    if (hasAnyValue) {
                        alignedData.push(item);
                    }
                });
            } else if (!shouldUseParentContainers || parentContainers.length === 0) {
                // Fallback: original logic without parent containers
                // Only use this if we didn't intend to use parent containers, or if they weren't found
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
                    warn(`⚠️ Warning: Selectors found different number of elements. Min: ${minCount}, Max: ${maxCount}, Difference: ${mismatchPercentage.toFixed(1)}%`);
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
                    
                    // Skip rows where all selector values are empty (noise from layout elements / mismatched selectors).
                    if (hasAnyValue) {
                        alignedData.push(item);
                    }
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
            // Single selector - check if we have parent container
            const selector = selectors[0];
            let finalData = scrapedData;
            
            // If parent selector exists, filter data to only include elements from parent containers
            if (selector.parentSelector) {
                try {
                    const parentContainers = Array.from(document.querySelectorAll(selector.parentSelector));
                    const visibleParents = filterVisibleElements(parentContainers);
                    
                    if (visibleParents.length > 0) {
                        log(`📦 Filtering single selector data by ${visibleParents.length} parent containers`);
                        // Re-extract data only from parent containers
                        finalData = [];
                        visibleParents.forEach(parentContainer => {
                            const elements = parentContainer.querySelectorAll(selector.selector);
                            const visibleElements = filterVisibleElements(elements);
                            
                            visibleElements.forEach(el => {
                                const dataType = selector.dataType || getDataType(el);
                                const value = extractValue(el, dataType);
                                
                                if (value && value.trim() !== '') {
                                    finalData.push({
                                        [selector.name]: {
                                            text: dataType === 'textContent' ? value : '',
                                            href: dataType === 'href' ? value : '',
                                            src: dataType === 'src' ? value : ''
                                        }
                                    });
                                }
                            });
                        });
                    }
                } catch (error) {
                    warn(`⚠️ Error filtering by parent container:`, error);
                    // Use original scrapedData as fallback
                }
            }
            
            if (finalData.length === 0) {
                throw new Error(`No data extracted. No elements found matching selector: ${selector.selector}`);
            }
            
                chrome.runtime.sendMessage({
                action: 'scrapedData',
                data: finalData
                });
            
            // Complete scraping
                window.OnPageScrapingActive = false;
                chrome.runtime.sendMessage({
                    action: 'scrapingComplete',
                data: finalData,
                count: finalData.length
            });
        }
    } catch (error) {
        // Keep errors visible even when debug=false
        errorLog('❌ Scraping error:', error);
                window.OnPageScrapingActive = false;
                chrome.runtime.sendMessage({
                    action: 'scrapingComplete',
            data: [],
            error: error.message || 'Unknown error occurred during extraction'
        });
    }

    // Listen for stop message (register once; use window.__DataminerLastScrapedData for current run)
    if (!window.__DataminerStopListenerRegistered) {
        window.__DataminerStopListenerRegistered = true;
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'stopScraping') {
                warn('🛑 Manual stop requested');
                window.OnPageScrapingActive = false;
                const currentData = window.__DataminerLastScrapedData || [];
                chrome.runtime.sendMessage({
                    action: 'scrapingComplete',
                    data: currentData,
                    manualStop: true,
                    count: currentData.length
                });
                if (sendResponse) sendResponse({ success: true });
                return true;
            }
            return false;
        });
    }
}
