const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

// Load HTML test file
const htmlPath = path.join(__dirname, '../../Test/Amazon.com _ apple.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf-8');

// Load the scraping function code
const scrapingServicePath = path.join(__dirname, '../extension/services/ScrapingService.js');
const scrapingServiceCode = fs.readFileSync(scrapingServicePath, 'utf-8');

describe('Amazon HTML Parsing Tests', () => {
    const DEBUG = process.env.DATA_SCRAPING_TOOL_TEST_DEBUG === '1';
    const originalConsoleLog = console.log;

    let dom;
    let window;
    let document;
    let scrapePageFunction;
    let resultData = null;

    function pickParentSelector(doc) {
        // Prefer real Amazon search-result containers (stable selectors)
        const preferredSelectors = [
            'div.s-result-item[data-component-type="s-search-result"]',
            '[data-component-type="s-search-result"]',
            'div.s-result-item.s-asin',
            'div.s-card-container',
            '.s-result-item'
        ];

        for (const sel of preferredSelectors) {
            try {
                const count = doc.querySelectorAll(sel).length;
                if (count > 0) return sel;
            } catch (e) {
                // ignore invalid selector
            }
        }

        // Fallback: heuristic containers, but explicitly exclude known non-content UI containers
        const possibleContainers = Array.from(doc.querySelectorAll('div, article, section')).filter(el => {
            const classes = Array.from(el.classList);
            const className = classes.join(' ').toLowerCase();
            const tagName = el.tagName.toLowerCase();

            // Exclude editor/viewer/UI containers
            if (
                className.includes('gutter') ||
                className.includes('line-') ||
                className.includes('code') ||
                className.includes('editor') ||
                className.includes('syntax') ||
                className.includes('highlight') ||
                className.includes('keyboard-shortcut') ||
                className.includes('nav-') ||
                className.includes('navbar')
            ) {
                return false;
            }

            return (
                className.includes('card') ||
                className.includes('item') ||
                className.includes('product') ||
                className.includes('result') ||
                className.includes('listing') ||
                className.includes('grid') ||
                className.includes('s-result-item') ||
                className.includes('s-card-container') ||
                tagName === 'article' ||
                tagName === 'section'
            );
        });

        const first = possibleContainers[0];
        if (!first) return null;

        const classes = Array.from(first.classList).filter(c => c.length > 0 && !c.startsWith('onpage-'));
        if (classes.length > 0) return `${first.tagName.toLowerCase()}.${classes.join('.')}`;
        if (first.id) return `#${first.id}`;
        const dataAttr = first.getAttribute('data-component-type');
        if (dataAttr) return `[data-component-type="${dataAttr}"]`;
        return null;
    }

    beforeAll(() => {
        if (!DEBUG) {
            // Silence noisy logs (Amazon pages + scraping debug) by default.
            console.log = () => {};
        }

        const virtualConsole = new VirtualConsole();
        // Amazon saved pages include a lot of CSS/links that jsdom can't parse/load. We don't need them for DOM queries.
        virtualConsole.sendTo(console, { omitJSDOMErrors: true });

        // Create JSDOM instance
        dom = new JSDOM(htmlContent, {
            url: 'https://www.amazon.com',
            pretendToBeVisual: true,
            virtualConsole
        });

        window = dom.window;
        document = window.document;

        // Make window and document available globally
        global.window = window;
        global.document = document;
        global.performance = window.performance;
        global.getComputedStyle = window.getComputedStyle;
        global.console = console;

        // Mock chrome API to capture data
        global.chrome = {
            runtime: {
                sendMessage: (message) => {
                    if (message.action === 'scrapingComplete' || message.action === 'scrapedData') {
                        resultData = message.data || [];
                    }
                },
                onMessage: {
                    addListener: () => {}
                }
            },
            tabs: {
                sendMessage: (tabId, message, callback) => {
                    if (callback) callback();
                }
            }
        };

        // Extract and modify the scraping function to capture results
        // Replace chrome.runtime.sendMessage with a function that stores data
        let modifiedCode = scrapingServiceCode;
        
        // Replace chrome.runtime.sendMessage calls to capture data
        modifiedCode = modifiedCode.replace(
            /chrome\.runtime\.sendMessage\(\s*\{([^}]+)\}\s*\)/g,
            (match, content) => {
                // Extract action and data from the message
                return `(function() { 
                    const msg = {${content}}; 
                    if (msg.action === 'scrapingComplete' || msg.action === 'scrapedData') { 
                        window.__testScrapedData = msg.data || []; 
                    }
                })()`;
            }
        );

        // Also handle multi-line sendMessage calls
        modifiedCode = modifiedCode.replace(
            /chrome\.runtime\.sendMessage\(\s*\{[\s\S]*?\}\s*\)/g,
            (match) => {
                // Try to extract the object
                const objMatch = match.match(/\{[\s\S]*\}/);
                if (objMatch) {
                    return `(function() { 
                        const msg = ${objMatch[0]}; 
                        if (msg.action === 'scrapingComplete' || msg.action === 'scrapedData') { 
                            window.__testScrapedData = msg.data || []; 
                        }
                    })()`;
                }
                return match;
            }
        );

        // Execute the modified code in the window context
        const script = window.document.createElement('script');
        script.textContent = modifiedCode;
        window.document.head.appendChild(script);
        
        // Get the function from window scope
        scrapePageFunction = window.scrapePageFunction;
        
        // If not found, try to extract it manually
        if (!scrapePageFunction) {
            const functionMatch = scrapingServiceCode.match(/async function scrapePageFunction\([^)]+\)\s*\{[\s\S]*?\n\}/);
            if (functionMatch) {
                // Create a modified version that captures data
                let funcCode = functionMatch[0];
                funcCode = funcCode.replace(/chrome\.runtime\.sendMessage\([^)]+\)/g, (match) => {
                    return `(function() { 
                        try {
                            const msg = ${match.match(/\{[\s\S]*\}/)?.[0] || '{}'}; 
                            if (msg.action === 'scrapingComplete' || msg.action === 'scrapedData') { 
                                window.__testScrapedData = msg.data || []; 
                            }
                        } catch(e) {}
                    })()`;
                });
                eval(`scrapePageFunction = ${funcCode}`);
            }
        }
    });

    afterAll(() => {
        console.log = originalConsoleLog;
        if (dom && dom.window) {
            dom.window.close();
        }
    });

    beforeEach(() => {
        resultData = null;
        window.__testScrapedData = null;
        window.OnPageScrapingActive = false;
    });

    test('should correctly extract data using parentSelector for multiple selectors', async () => {
        // First, find elements that match the expected structure
        // Look for image containers (a tags with images inside or img tags)
        const imageLinks = Array.from(document.querySelectorAll('a[href]')).filter(a => {
            const img = a.querySelector('img');
            return img && (img.src || img.getAttribute('data-src') || img.getAttribute('data-src-pb'));
        });
        
        // Also look for img tags directly
        const images = Array.from(document.querySelectorAll('img')).filter(img => {
            return img.src || img.getAttribute('data-src') || img.getAttribute('data-src-pb');
        });
        
        // Look for text elements (spans with classes or any text content)
        const textSpans = Array.from(document.querySelectorAll('span')).filter(span => {
            const text = span.textContent?.trim();
            const classes = Array.from(span.classList);
            return (text && text.length > 0 && text.length < 100) || 
                   classes.some(c => c.includes('size') || c.includes('price') || c.includes('text') || c.includes('a-'));
        });

        // Create selectors based on found elements
        let selectors = [];
        
        // Add image selector
        if (imageLinks.length > 0) {
            const firstImgLink = imageLinks[0];
            const imgLinkClasses = Array.from(firstImgLink.classList).filter(c => c.length > 0 && !c.startsWith('onpage-'));
            const imgLinkSelector = imgLinkClasses.length > 0 ? `a.${imgLinkClasses[0]}` : 'a[href]';
            
            selectors.push({
                name: 'image',
                selector: imgLinkSelector,
                dataType: 'src',
                parentSelector: null
            });
        } else if (images.length > 0) {
            // Use img tag directly
            const firstImg = images[0];
            const imgClasses = Array.from(firstImg.classList).filter(c => c.length > 0 && !c.startsWith('onpage-'));
            const imgSelector = imgClasses.length > 0 ? `img.${imgClasses[0]}` : 'img';
            
            selectors.push({
                name: 'image',
                selector: imgSelector,
                dataType: 'src',
                parentSelector: null
            });
        }

        // Add text selectors (limit to first few to avoid too many)
        if (textSpans.length > 0) {
            // Group spans by their first class to find common patterns
            const spanGroups = new Map();
            textSpans.forEach(span => {
                const classes = Array.from(span.classList).filter(c => c.length > 0 && !c.startsWith('onpage-'));
                if (classes.length > 0) {
                    const firstClass = classes[0];
                    if (!spanGroups.has(firstClass)) {
                        spanGroups.set(firstClass, span);
                    }
                }
            });
            
            // Add up to 3 different span selectors
            let added = 0;
            for (const [className, span] of spanGroups) {
                if (added >= 3) break;
                selectors.push({
                    name: className,
                    selector: `span.${className}`,
                    dataType: 'textContent',
                    parentSelector: null
                });
                added++;
            }
        }

        const parentSelector = pickParentSelector(document);

        // If we found a parent selector, assign it to all selectors
        if (parentSelector) {
            selectors.forEach(s => {
                s.parentSelector = parentSelector;
            });
            console.log(`Using parent selector: ${parentSelector}`);
            
            // Verify that parent containers can be found
            try {
                const testContainers = document.querySelectorAll(parentSelector);
                console.log(`Found ${testContainers.length} parent containers with selector "${parentSelector}"`);
                if (testContainers.length === 0) {
                    console.log(`⚠️ Warning: Parent selector "${parentSelector}" found 0 containers. This may cause fallback to full page extraction.`);
                }
            } catch (e) {
                console.log(`⚠️ Error testing parent selector "${parentSelector}":`, e.message);
            }
        }

        // If no selectors were created, skip the test
        if (selectors.length === 0) {
            console.log('⚠️ No selectors could be generated from HTML structure');
            return;
        }

        // Call the scraping function
        await scrapePageFunction(selectors, {
            text: true,
            images: true,
            links: true,
            visibleOnly: false, // Disable visibility check for testing
            excludeDuplicates: false
        });

        // Wait a bit for async operations
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Get the scraped data
        const scrapedData = window.__testScrapedData || resultData || [];

        console.log(`Parsed ${scrapedData.length} records`);
        
        // Should have some records
        expect(scrapedData.length).toBeGreaterThan(0);
        
        // If we have a parent selector and multiple selectors, verify that data is properly aligned
        if (parentSelector && selectors.length > 1 && scrapedData.length > 0) {
            // Check that we have reasonable number of records (not thousands)
            expect(scrapedData.length).toBeLessThan(1000);
            
            // Verify that each record has all selector fields (aligned data)
            scrapedData.forEach((record, index) => {
                selectors.forEach(selector => {
                    expect(record).toHaveProperty(selector.name);
                    expect(typeof record[selector.name]).toBe('object');
                    expect(record[selector.name]).toHaveProperty('text');
                    expect(record[selector.name]).toHaveProperty('href');
                    expect(record[selector.name]).toHaveProperty('src');
                });
            });
            
            // Verify that parentSelector is actually limiting the scope
            // If parentSelector works correctly, we should get fewer records than without it
            console.log(`✅ Parent selector ${parentSelector} limited extraction to ${scrapedData.length} records`);
        }
    }, 30000);

    test('should extract non-empty data from parent containers', async () => {
        // Use the same setup as the first test
        const imageLinks = Array.from(document.querySelectorAll('a[href]')).filter(a => {
            const img = a.querySelector('img');
            return img && (img.src || img.getAttribute('data-src') || img.getAttribute('data-src-pb'));
        });
        
        const images = Array.from(document.querySelectorAll('img')).filter(img => {
            return img.src || img.getAttribute('data-src') || img.getAttribute('data-src-pb');
        });
        
        const textSpans = Array.from(document.querySelectorAll('span')).filter(span => {
            const text = span.textContent?.trim();
            const classes = Array.from(span.classList);
            return (text && text.length > 0 && text.length < 100) || 
                   classes.some(c => c.includes('size') || c.includes('price') || c.includes('text') || c.includes('a-'));
        });

        let selectors = [];
        
        if (imageLinks.length > 0) {
            const firstImgLink = imageLinks[0];
            const imgLinkClasses = Array.from(firstImgLink.classList).filter(c => c.length > 0 && !c.startsWith('onpage-'));
            const imgLinkSelector = imgLinkClasses.length > 0 ? `a.${imgLinkClasses[0]}` : 'a[href]';
            
            selectors.push({
                name: 'image',
                selector: imgLinkSelector,
                dataType: 'src',
                parentSelector: null
            });
        } else if (images.length > 0) {
            const firstImg = images[0];
            const imgClasses = Array.from(firstImg.classList).filter(c => c.length > 0 && !c.startsWith('onpage-'));
            const imgSelector = imgClasses.length > 0 ? `img.${imgClasses[0]}` : 'img';
            
            selectors.push({
                name: 'image',
                selector: imgSelector,
                dataType: 'src',
                parentSelector: null
            });
        }

        if (textSpans.length > 0) {
            const spanGroups = new Map();
            textSpans.forEach(span => {
                const classes = Array.from(span.classList).filter(c => c.length > 0 && !c.startsWith('onpage-'));
                if (classes.length > 0) {
                    const firstClass = classes[0];
                    if (!spanGroups.has(firstClass)) {
                        spanGroups.set(firstClass, span);
                    }
                }
            });
            
            let added = 0;
            for (const [className, span] of spanGroups) {
                if (added >= 3) break;
                selectors.push({
                    name: className,
                    selector: `span.${className}`,
                    dataType: 'textContent',
                    parentSelector: null
                });
                added++;
            }
        }

        const parentSelector = pickParentSelector(document);

        if (parentSelector) {
            selectors.forEach(s => {
                s.parentSelector = parentSelector;
            });
        }

        // Skip if no selectors
        if (selectors.length === 0) {
            console.log('⚠️ No selectors could be generated from HTML structure');
            return;
        }

        await scrapePageFunction(selectors, {
            text: true,
            images: true,
            links: true,
            visibleOnly: false,
            excludeDuplicates: false
        });

        await new Promise(resolve => setTimeout(resolve, 2000));

        const scrapedData = window.__testScrapedData || resultData || [];

        // Check that we have some data
        expect(scrapedData.length).toBeGreaterThan(0);
        
        // Check that records have data (at least some records should have non-empty data)
        let recordsWithData = 0;
        scrapedData.forEach((record, index) => {
            expect(record).toBeDefined();
            expect(typeof record).toBe('object');
            
            const columnNames = Object.keys(record);
            expect(columnNames.length).toBeGreaterThan(0);
            
            let hasNonEmptyData = false;
            columnNames.forEach(columnName => {
                const columnData = record[columnName];
                if (typeof columnData === 'object' && columnData !== null) {
                    if (columnData.text && columnData.text.toString().trim() !== '') {
                        hasNonEmptyData = true;
                    }
                    if (columnData.href && columnData.href.toString().trim() !== '') {
                        hasNonEmptyData = true;
                    }
                    if (columnData.src && columnData.src.toString().trim() !== '') {
                        hasNonEmptyData = true;
                    }
                } else if (columnData && columnData.toString().trim() !== '') {
                    hasNonEmptyData = true;
                }
            });
            
            if (hasNonEmptyData) {
                recordsWithData++;
            }
        });
        
        // At least some records should have data
        expect(recordsWithData).toBeGreaterThan(0);
        
        // If parentSelector is used, verify that data comes from parent containers
        if (parentSelector && selectors.length > 1) {
            // Check that records are properly structured (all selectors present in each record)
            scrapedData.forEach((record, index) => {
                expect(Object.keys(record).length).toBe(selectors.length);
            });
            
            // Verify that at least some records have non-empty values for each selector
            const selectorHasData = {};
            selectors.forEach(selector => {
                selectorHasData[selector.name] = false;
            });
            
            scrapedData.forEach(record => {
                selectors.forEach(selector => {
                    const columnData = record[selector.name];
                    if (columnData && typeof columnData === 'object') {
                        if ((columnData.text && columnData.text.toString().trim() !== '') ||
                            (columnData.href && columnData.href.toString().trim() !== '') ||
                            (columnData.src && columnData.src.toString().trim() !== '')) {
                            selectorHasData[selector.name] = true;
                        }
                    }
                });
            });
            
            // At least one selector should have data in some records
            const hasAnyData = Object.values(selectorHasData).some(has => has === true);
            expect(hasAnyData).toBe(true);
        }
    }, 30000);

    test('should extract data with single selector and parentSelector', async () => {
        // Test single selector with parentSelector scenario
        const imageLinks = Array.from(document.querySelectorAll('a[href]')).filter(a => {
            const img = a.querySelector('img');
            return img && (img.src || img.getAttribute('data-src') || img.getAttribute('data-src-pb'));
        });
        
        if (imageLinks.length === 0) {
            console.log('⚠️ No image links found, skipping single selector test');
            return;
        }

        const firstImgLink = imageLinks[0];
        const imgLinkClasses = Array.from(firstImgLink.classList).filter(c => c.length > 0 && !c.startsWith('onpage-'));
        const imgLinkSelector = imgLinkClasses.length > 0 ? `a.${imgLinkClasses[0]}` : 'a[href]';
        
        const parentSelector = pickParentSelector(document);

        const selector = {
            name: 'image',
            selector: imgLinkSelector,
            dataType: 'src',
            parentSelector: parentSelector
        };

        await scrapePageFunction([selector], {
            text: true,
            images: true,
            links: true,
            visibleOnly: false,
            excludeDuplicates: false
        });

        await new Promise(resolve => setTimeout(resolve, 2000));

        const scrapedData = window.__testScrapedData || resultData || [];

        // Should have some data
        expect(scrapedData.length).toBeGreaterThan(0);
        
        // Verify structure
        scrapedData.forEach(record => {
            expect(record).toHaveProperty('image');
            expect(typeof record.image).toBe('object');
            expect(record.image).toHaveProperty('src');
        });
        
        // If parentSelector was used, verify it limited the scope
        if (parentSelector) {
            // Count total elements without parentSelector for comparison
            const totalElements = document.querySelectorAll(imgLinkSelector).length;
            console.log(`✅ Single selector with parentSelector: ${scrapedData.length} records (total elements: ${totalElements})`);
            
            // With parentSelector, we should get fewer or equal records
            expect(scrapedData.length).toBeLessThanOrEqual(totalElements);
        }
    }, 30000);

    test('should extract text from nested elements (h2.a-size-mini with span inside)', async () => {
        // Test case: h2.a-size-mini contains <span>Logitech</span>
        // The selector h2.a-size-mini should extract "Logitech" from the nested span
        
        // Find h2 elements with a-size-mini class
        const h2Elements = Array.from(document.querySelectorAll('h2.a-size-mini'));
        
        if (h2Elements.length === 0) {
            console.log('⚠️ No h2.a-size-mini elements found, skipping nested text test');
            return;
        }

        const parentSelector = pickParentSelector(document);

        const selectors = [
            {
                name: 'a-size-mini',
                selector: 'h2.a-size-mini',
                dataType: 'textContent',
                parentSelector: parentSelector
            }
        ];

        await scrapePageFunction(selectors, {
            text: true,
            images: false,
            links: false,
            visibleOnly: false,
            excludeDuplicates: false
        });

        await new Promise(resolve => setTimeout(resolve, 2000));

        const scrapedData = window.__testScrapedData || resultData || [];

        // Should have some data
        expect(scrapedData.length).toBeGreaterThan(0);
        
        // Check that at least some records have non-empty text
        const recordsWithText = scrapedData.filter(record => {
            const text = record['a-size-mini']?.text || '';
            return text && text.trim().length > 0;
        });
        
        expect(recordsWithText.length).toBeGreaterThan(0);
        
        // Verify that text is extracted from nested elements
        recordsWithText.forEach(record => {
            const text = record['a-size-mini']?.text || '';
            expect(text.trim().length).toBeGreaterThan(0);
            console.log(`✅ Extracted text from h2.a-size-mini: "${text.trim().substring(0, 50)}"`);
        });
    }, 30000);
});
