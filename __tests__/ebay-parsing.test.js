/**
 * Unit tests for eBay parsing issues
 * 
 * Test data from: Test/ebay.html and Test/ebay_wrong.json
 * 
 * Known issues:
 * 1. bsig__price column contains wrong data (sidebar filter labels instead of prices)
 * 2. brwrvr__item-card__signals__body text from nested elements is concatenated without separators
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Load TextExtractionUtils
const TextExtractionUtils = require('../extension/utils/TextExtractionUtils.js');

describe('eBay Parsing Tests', () => {
    let dom;
    let document;

    beforeEach(() => {
        dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
        document = dom.window.document;
        global.document = document;
        global.window = dom.window;
        global.Node = dom.window.Node;
        global.getComputedStyle = dom.window.getComputedStyle;
    });

    afterEach(() => {
        dom.window.close();
    });

    describe('Issue #2: Text from nested elements should be separated', () => {
        test('should separate text from sibling div elements with separator', () => {
            // Simulating eBay structure: brwrvr__item-card__signals__body
            const container = document.createElement('div');
            container.className = 'brwrvr__item-card__signals__body';
            container.innerHTML = `
                <div class="bsig brw-signal bsig--primary">
                    <span class="textual-display bsig__price bsig__price--displayprice">$529.00</span>
                </div>
                <div class="bsig brw-signal bsig--primary">
                    <span class="textual-display bsig__generic bsig__logisticsCost">Free shipping</span>
                </div>
                <div class="bsig brw-signal bsig--primary">
                    <span class="bsig__item-hotness">
                        <span class="textual-display">
                            <span class="textual-display negative">75 sold</span>
                        </span>
                    </span>
                </div>
            `;
            document.body.appendChild(container);

            // extractTextSmart now auto-detects block containers and uses separator automatically
            // This solves the problem of text merging like "$529.00Free shipping75 sold"
            const autoSeparated = TextExtractionUtils.extractTextSmart(container);
            expect(autoSeparated).toBe('$529.00 | Free shipping | 75 sold');

            // With explicit separator - same result
            const withSeparator = TextExtractionUtils.extractTextWithSeparator(container, { separator: ' | ' });
            expect(withSeparator).toBe('$529.00 | Free shipping | 75 sold');
            
            // Can disable auto-separation if needed
            const withoutAutoSeparate = TextExtractionUtils.extractTextSmart(container, { autoSeparate: false });
            // When autoSeparate is false, it finds the best/most relevant element (price)
            expect(withoutAutoSeparate).toBe('$529.00');
        });

        test('should handle price with offer and shipping info', () => {
            const container = document.createElement('div');
            container.className = 'brwrvr__item-card__signals__body';
            container.innerHTML = `
                <div class="bsig"><span>$450.00</span></div>
                <div class="bsig"><span>or Best Offer</span></div>
                <div class="bsig"><span>$11.42 shipping</span></div>
            `;
            document.body.appendChild(container);

            const result = TextExtractionUtils.extractTextWithSeparator(container, { separator: ' | ' });
            expect(result).toBe('$450.00 | or Best Offer | $11.42 shipping');
        });

        test('should handle complex pricing with was price', () => {
            const container = document.createElement('div');
            container.innerHTML = `
                <div><span>$364.01</span></div>
                <div><span>Was: $404.46</span></div>
                <div><span>Free shipping</span></div>
                <div><span>Only 2 left</span></div>
                <div><span>eBay Refurbished</span></div>
            `;
            document.body.appendChild(container);

            const result = TextExtractionUtils.extractTextWithSeparator(container, { separator: ' | ' });
            expect(result).toBe('$364.01 | Was: $404.46 | Free shipping | Only 2 left | eBay Refurbished');
        });

        test('should use extractTextSmart with separator option', () => {
            const container = document.createElement('div');
            container.innerHTML = `
                <div><span>$529.00</span></div>
                <div><span>Free shipping</span></div>
            `;
            document.body.appendChild(container);

            const result = TextExtractionUtils.extractTextSmart(container, { separator: ' | ' });
            expect(result).toBe('$529.00 | Free shipping');
        });

        test('should return plain text for single child element', () => {
            const container = document.createElement('div');
            container.innerHTML = `<span>$529.00</span>`;
            document.body.appendChild(container);

            const result = TextExtractionUtils.extractTextWithSeparator(container, { separator: ' | ' });
            expect(result).toBe('$529.00');
        });

        test('should return plain text for element without children', () => {
            const container = document.createElement('span');
            container.textContent = '$529.00';
            document.body.appendChild(container);

            const result = TextExtractionUtils.extractTextWithSeparator(container, { separator: ' | ' });
            expect(result).toBe('$529.00');
        });

        test('should exclude script and style elements', () => {
            const container = document.createElement('div');
            container.innerHTML = `
                <div><span>$529.00</span></div>
                <script>console.log('test');</script>
                <div><span>Free shipping</span></div>
                <style>.test { color: red; }</style>
            `;
            document.body.appendChild(container);

            const result = TextExtractionUtils.extractTextWithSeparator(container, { separator: ' | ' });
            expect(result).toBe('$529.00 | Free shipping');
        });
    });

    describe('Issue #1: Price selector captures wrong elements', () => {
        /**
         * This test documents the issue where bsig__price selector
         * captures elements from the sidebar filters instead of product prices.
         * 
         * The problem is that the same CSS class is used in multiple places:
         * - Product card prices (correct)
         * - Sidebar filter labels like "Digital Cameras", "Model", "Brand" (wrong)
         * 
         * Solution: Use parentSelector to limit search scope to product cards
         */
        test('should demonstrate the importance of parentSelector for price extraction', () => {
            // Simulating eBay page structure with sidebar and product cards
            const page = document.createElement('div');
            page.innerHTML = `
                <!-- Sidebar with filters (wrong elements) -->
                <aside class="x-refine">
                    <div class="bsig"><span class="bsig__price">Digital Cameras</span></div>
                    <div class="bsig"><span class="bsig__price">Model</span></div>
                    <div class="bsig"><span class="bsig__price">Brand</span></div>
                </aside>
                
                <!-- Product cards (correct elements) -->
                <ul class="srp-results">
                    <li class="s-item">
                        <div class="brwrvr__item-card">
                            <span class="bsig__price">$479.99</span>
                        </div>
                    </li>
                    <li class="s-item">
                        <div class="brwrvr__item-card">
                            <span class="bsig__price">$450.00</span>
                        </div>
                    </li>
                </ul>
            `;
            document.body.appendChild(page);

            // Without parentSelector - captures ALL elements with class bsig__price
            const allPriceElements = document.querySelectorAll('.bsig__price');
            expect(allPriceElements.length).toBe(5); // 3 sidebar + 2 product prices
            
            // First 3 are wrong (sidebar filters)
            expect(allPriceElements[0].textContent).toBe('Digital Cameras');
            expect(allPriceElements[1].textContent).toBe('Model');
            expect(allPriceElements[2].textContent).toBe('Brand');

            // With parentSelector - only captures product card prices
            const productCards = document.querySelectorAll('.brwrvr__item-card');
            const correctPrices = [];
            productCards.forEach(card => {
                const price = card.querySelector('.bsig__price');
                if (price) {
                    correctPrices.push(price.textContent);
                }
            });
            
            expect(correctPrices).toEqual(['$479.99', '$450.00']);
        });

        test('should extract correct prices when using proper parent container', () => {
            const page = document.createElement('div');
            page.innerHTML = `
                <!-- Product list container -->
                <ul class="srp-results srp-list clearfix">
                    <li class="s-item s-item__pl-on-bottom">
                        <div class="brwrvr__item-card">
                            <div class="brwrvr__item-card__signals__body">
                                <div class="bsig brw-signal bsig--primary">
                                    <span class="textual-display bsig__price bsig__price--displayprice">$529.00</span>
                                </div>
                            </div>
                        </div>
                    </li>
                    <li class="s-item s-item__pl-on-bottom">
                        <div class="brwrvr__item-card">
                            <div class="brwrvr__item-card__signals__body">
                                <div class="bsig brw-signal bsig--primary">
                                    <span class="textual-display bsig__price bsig__price--displayprice">$450.00</span>
                                </div>
                            </div>
                        </div>
                    </li>
                </ul>
            `;
            document.body.appendChild(page);

            // Using parent container approach
            const parentSelector = '.s-item';
            const priceSelector = '.bsig__price';
            
            const parentContainers = document.querySelectorAll(parentSelector);
            const extractedPrices = [];
            
            parentContainers.forEach(container => {
                const priceElement = container.querySelector(priceSelector);
                if (priceElement) {
                    extractedPrices.push(priceElement.textContent.trim());
                }
            });
            
            expect(extractedPrices).toEqual(['$529.00', '$450.00']);
        });
    });

    describe('Integration with existing extractTextSmart', () => {
        test('should maintain backward compatibility with existing behavior', () => {
            const div = document.createElement('div');
            div.textContent = 'Hello World';
            document.body.appendChild(div);

            // Without separator option - should work as before
            const result = TextExtractionUtils.extractTextSmart(div);
            expect(result).toBe('Hello World');
        });

        test('should use separator when option is provided', () => {
            const container = document.createElement('div');
            container.innerHTML = `
                <div>First</div>
                <div>Second</div>
                <div>Third</div>
            `;
            document.body.appendChild(container);

            // With separator option
            const result = TextExtractionUtils.extractTextSmart(container, { separator: ' | ' });
            expect(result).toBe('First | Second | Third');
        });
    });
});

describe('Sidebar/Navigation Filtering', () => {
    /**
     * Tests for automatic filtering of sidebar and navigation elements
     * This is crucial for eBay where the same CSS classes are used
     * in both product cards and sidebar filters
     */
    
    test('should identify elements inside aside tag as sidebar', () => {
        const aside = document.createElement('aside');
        aside.className = 'x-refine';
        const price = document.createElement('span');
        price.className = 'bsig__price';
        price.textContent = 'Digital Cameras';
        aside.appendChild(price);
        document.body.appendChild(aside);

        // Simulate the isInSidebarOrNavigation check
        const isInSidebar = (element) => {
            let current = element;
            while (current && current !== document.body) {
                const tagName = current.tagName?.toLowerCase() || '';
                if (tagName === 'aside' || tagName === 'nav') return true;
                current = current.parentElement;
            }
            return false;
        };

        expect(isInSidebar(price)).toBe(true);
    });

    test('should identify elements with refine/filter class as sidebar', () => {
        const sidebar = document.createElement('div');
        sidebar.className = 'x-refine srp-sidebar';
        const filter = document.createElement('span');
        filter.textContent = 'Brand';
        sidebar.appendChild(filter);
        document.body.appendChild(sidebar);

        const isInSidebar = (element) => {
            let current = element;
            while (current && current !== document.body) {
                const className = (current.className?.toString() || '').toLowerCase();
                if (className.includes('refine') || className.includes('sidebar') || className.includes('filter')) {
                    return true;
                }
                current = current.parentElement;
            }
            return false;
        };

        expect(isInSidebar(filter)).toBe(true);
    });

    test('should NOT identify product card elements as sidebar', () => {
        const productList = document.createElement('ul');
        productList.className = 'srp-results';
        const item = document.createElement('li');
        item.className = 's-item';
        const price = document.createElement('span');
        price.className = 'bsig__price';
        price.textContent = '$529.00';
        item.appendChild(price);
        productList.appendChild(item);
        document.body.appendChild(productList);

        const isInSidebar = (element) => {
            let current = element;
            while (current && current !== document.body) {
                const tagName = current.tagName?.toLowerCase() || '';
                const className = (current.className?.toString() || '').toLowerCase();
                if (tagName === 'aside' || tagName === 'nav') return true;
                if (className.includes('refine') || className.includes('sidebar') || className.includes('filter')) {
                    return true;
                }
                current = current.parentElement;
            }
            return false;
        };

        expect(isInSidebar(price)).toBe(false);
    });

    test('should filter sidebar elements when collecting matches', () => {
        // Clean body first to avoid pollution from other tests
        document.body.innerHTML = '';
        
        // Create a page with sidebar and product cards using same class
        const page = document.createElement('div');
        page.innerHTML = `
            <aside class="x-refine">
                <span class="bsig__price">Digital Cameras</span>
                <span class="bsig__price">Brand</span>
            </aside>
            <ul class="srp-results">
                <li class="s-item">
                    <span class="bsig__price">$529.00</span>
                </li>
                <li class="s-item">
                    <span class="bsig__price">$450.00</span>
                </li>
            </ul>
        `;
        document.body.appendChild(page);

        // Simulate filtering logic
        const allPrices = Array.from(document.querySelectorAll('.bsig__price'));
        expect(allPrices.length).toBe(4); // All elements

        const isInSidebar = (element) => {
            let current = element;
            while (current && current !== document.body) {
                const tagName = current.tagName?.toLowerCase() || '';
                if (tagName === 'aside' || tagName === 'nav') return true;
                current = current.parentElement;
            }
            return false;
        };

        const filteredPrices = allPrices.filter(el => !isInSidebar(el));
        expect(filteredPrices.length).toBe(2); // Only product prices
        expect(filteredPrices[0].textContent).toBe('$529.00');
        expect(filteredPrices[1].textContent).toBe('$450.00');
    });
});

describe('eBay JSON Export Validation', () => {
    test('should identify problematic data in export', () => {
        // Sample data from ebay_wrong.json showing the issues
        const wrongExportSamples = [
            {
                "brwrvr__item-card__image": "https://i.ebayimg.com/images/g/fqsAAeSw0U9pUrZV/s-l960.webp",
                "bsig__title__text": "Shop on eBay",
                "bsig__price": "Shop by category", // WRONG: should be a price
                "brwrvr__item-card__signals__body": "$479.99Free shipping", // WRONG: text is concatenated
                "bsig": "Shop on eBay"
            },
            {
                "brwrvr__item-card__image": "https://ir.ebaystatic.com/cr/v/c1/s_1x2.gif",
                "bsig__title__text": "New ListingNikon Z 50 20.9MP Excellent  Condition",
                "bsig__price": "Digital Cameras", // WRONG: should be a price
                "brwrvr__item-card__signals__body": "$450.00or Best Offer$11.42 shipping", // WRONG: text is concatenated
                "bsig": "$479.99"
            }
        ];

        // Test that we can identify non-price values in bsig__price column
        const nonPriceValues = wrongExportSamples
            .map(item => item['bsig__price'])
            .filter(price => !price.match(/^\$[\d,.]+$/));
        
        // All bsig__price values are wrong (not actual prices)
        expect(nonPriceValues).toEqual(['Shop by category', 'Digital Cameras']);

        // Test that signals__body text is improperly concatenated (no separators)
        const concatenatedText = wrongExportSamples[1]['brwrvr__item-card__signals__body'];
        expect(concatenatedText).toBe('$450.00or Best Offer$11.42 shipping');
        
        // Expected with proper separator
        const expectedWithSeparator = '$450.00 | or Best Offer | $11.42 shipping';
        expect(concatenatedText).not.toBe(expectedWithSeparator);
    });

    test('should define expected correct data format', () => {
        // What the correct export should look like
        const correctExportSample = {
            "brwrvr__item-card__image": "https://i.ebayimg.com/images/g/x-0AAOSw3GVlOZ02/s-l400.webp",
            "bsig__title__text": "Osmo Pocket 3 | Handheld Pocket Gimbal Camera 1-Inch CMOS & 4K/120fps",
            "bsig__price": "$529.00", // CORRECT: actual price
            "brwrvr__item-card__signals__body": "$529.00 | Free shipping | 75 sold", // CORRECT: separated
        };

        // Validate price format
        expect(correctExportSample['bsig__price']).toMatch(/^\$[\d,.]+$/);
        
        // Validate signals body is properly separated
        expect(correctExportSample['brwrvr__item-card__signals__body']).toContain(' | ');
    });
});
