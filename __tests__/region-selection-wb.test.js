/**
 * Unit tests for Region Selection on Wildberries-like structure
 * Tests the full flow: findElementsInRegion → findCommonAncestor → detectRepeatingRows → detectColumns
 */

const { JSDOM } = require('jsdom');

// Mock getBoundingClientRect for JSDOM
function mockBoundingRect(element, rect) {
    element.getBoundingClientRect = () => rect;
}

describe('Region Selection on Wildberries HTML', () => {
    let dom;
    let document;
    let window;
    let contentScript;

    // Wildberries-like HTML structure with 4 product cards
    const WB_HTML = `
        <!DOCTYPE html>
        <html>
        <head></head>
        <body>
            <div class="product-card-list">
                <article class="product-card" data-nm-id="721240717">
                    <div class="product-card__wrapper">
                        <a class="product-card__link" href="/catalog/721240717/detail.aspx">
                            <span class="product-card__name">Xiaomi Смартфон</span>
                        </a>
                        <div class="product-card__img-wrap">
                            <img class="j-thumbnail" src="https://images.wb.ru/img1.webp">
                        </div>
                        <div class="product-card__price price">
                            <ins class="price__lower-price">6 987 ₽</ins>
                            <del class="price__old-price">8 999 ₽</del>
                        </div>
                        <span class="product-card__brand">Xiaomi</span>
                        <div class="product-card__rating">
                            <span class="address-rate-mini">4.8</span>
                        </div>
                    </div>
                </article>
                <article class="product-card" data-nm-id="721240718">
                    <div class="product-card__wrapper">
                        <a class="product-card__link" href="/catalog/721240718/detail.aspx">
                            <span class="product-card__name">Samsung Galaxy</span>
                        </a>
                        <div class="product-card__img-wrap">
                            <img class="j-thumbnail" src="https://images.wb.ru/img2.webp">
                        </div>
                        <div class="product-card__price price">
                            <ins class="price__lower-price">12 999 ₽</ins>
                            <del class="price__old-price">15 999 ₽</del>
                        </div>
                        <span class="product-card__brand">Samsung</span>
                        <div class="product-card__rating">
                            <span class="address-rate-mini">4.7</span>
                        </div>
                    </div>
                </article>
                <article class="product-card" data-nm-id="721240719">
                    <div class="product-card__wrapper">
                        <a class="product-card__link" href="/catalog/721240719/detail.aspx">
                            <span class="product-card__name">Apple iPhone</span>
                        </a>
                        <div class="product-card__img-wrap">
                            <img class="j-thumbnail" src="https://images.wb.ru/img3.webp">
                        </div>
                        <div class="product-card__price price">
                            <ins class="price__lower-price">89 999 ₽</ins>
                            <del class="price__old-price">99 999 ₽</del>
                        </div>
                        <span class="product-card__brand">Apple</span>
                        <div class="product-card__rating">
                            <span class="address-rate-mini">4.9</span>
                        </div>
                    </div>
                </article>
                <article class="product-card" data-nm-id="721240720">
                    <div class="product-card__wrapper">
                        <a class="product-card__link" href="/catalog/721240720/detail.aspx">
                            <span class="product-card__name">Huawei P50</span>
                        </a>
                        <div class="product-card__img-wrap">
                            <img class="j-thumbnail" src="https://images.wb.ru/img4.webp">
                        </div>
                        <div class="product-card__price price">
                            <ins class="price__lower-price">45 999 ₽</ins>
                            <del class="price__old-price">55 999 ₽</del>
                        </div>
                        <span class="product-card__brand">Huawei</span>
                        <div class="product-card__rating">
                            <span class="address-rate-mini">4.6</span>
                        </div>
                    </div>
                </article>
            </div>
        </body>
        </html>
    `;

    beforeEach(() => {
        dom = new JSDOM(WB_HTML, { runScripts: 'outside-only' });
        document = dom.window.document;
        window = dom.window;
        
        global.document = document;
        global.window = window;

        // Create mock content script instance with necessary methods
        contentScript = {
            getElementClassName(element) {
                if (!element || !element.className) return '';
                return element.className.toString().trim();
            },

            getDataType(element) {
                if (!element) return 'text';
                if (element.tagName === 'IMG') return 'src';
                if (element.tagName === 'A' || element.closest('a')) return 'href';
                return 'text';
            },

            getPreviewValue(element, dataType) {
                if (!element) return '';
                if (dataType === 'src') {
                    return element.src || element.getAttribute('src') || '';
                }
                if (dataType === 'href') {
                    const a = element.tagName === 'A' ? element : element.closest('a');
                    return a ? a.href || a.getAttribute('href') || '' : '';
                }
                return element.textContent?.trim() || '';
            },

            findElementsInRegion(rect) {
                const elements = [];
                const allElements = document.body.querySelectorAll('*');
                
                for (const el of allElements) {
                    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'BR', 'HR'].includes(el.tagName)) continue;
                    if (el.id && el.id.startsWith('data-scraping')) continue;
                    
                    const elRect = el.getBoundingClientRect();
                    if (elRect.width < 10 || elRect.height < 10) continue;
                    
                    const centerX = elRect.left + elRect.width / 2;
                    const centerY = elRect.top + elRect.height / 2;
                    
                    if (centerX >= rect.left && centerX <= rect.right &&
                        centerY >= rect.top && centerY <= rect.bottom) {
                        elements.push(el);
                    }
                }
                
                return elements;
            },

            findCommonAncestor(elements) {
                if (elements.length === 0) return null;
                if (elements.length === 1) return elements[0].parentElement;
                
                const ancestors = new Set();
                let el = elements[0];
                while (el && el !== document.body) {
                    ancestors.add(el);
                    el = el.parentElement;
                }
                ancestors.add(document.body);
                
                for (const ancestor of ancestors) {
                    let containsAll = true;
                    for (let i = 1; i < elements.length; i++) {
                        if (!ancestor.contains(elements[i])) {
                            containsAll = false;
                            break;
                        }
                    }
                    if (containsAll) {
                        return ancestor;
                    }
                }
                
                return document.body;
            },

            getElementStructureKey(element) {
                const tag = element.tagName.toLowerCase();
                const className = this.getElementClassName(element);
                const firstClass = className ? className.split(/\s+/)[0] : '';
                return `${tag}|${firstClass}`;
            },

            detectRepeatingRows(container, rect) {
                const candidates = new Map();
                
                const collectCandidates = (parent, depth = 0) => {
                    if (depth > 5) return;
                    
                    for (const child of parent.children) {
                        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'BR', 'HR'].includes(child.tagName)) continue;
                        if (child.id && child.id.startsWith('data-scraping')) continue;
                        
                        const childRect = child.getBoundingClientRect();
                        if (childRect.width < 10 || childRect.height < 10) continue;
                        
                        const centerX = childRect.left + childRect.width / 2;
                        const centerY = childRect.top + childRect.height / 2;
                        const isInside = centerX >= rect.left && centerX <= rect.right &&
                                        centerY >= rect.top && centerY <= rect.bottom;
                        
                        if (!isInside) continue;
                        
                        const key = this.getElementStructureKey(child);
                        if (!candidates.has(key)) {
                            candidates.set(key, []);
                        }
                        candidates.get(key).push(child);
                        
                        collectCandidates(child, depth + 1);
                    }
                };
                
                collectCandidates(container);
                
                let bestGroup = [];
                let bestKey = '';
                let bestScore = 0;
                
                for (const [key, elements] of candidates) {
                    if (elements.length < 2) continue;
                    
                    const noNesting = elements.every((el, i) => 
                        elements.every((other, j) => i === j || !el.contains(other) && !other.contains(el))
                    );
                    
                    if (!noNesting) continue;
                    
                    const avgSize = elements.reduce((sum, el) => {
                        const r = el.getBoundingClientRect();
                        return sum + r.width * r.height;
                    }, 0) / elements.length;
                    
                    const sizeScore = avgSize > 1000 ? 1 : 0.5;
                    const countScore = elements.length;
                    const score = countScore * sizeScore;
                    
                    if (score > bestScore) {
                        bestGroup = elements;
                        bestKey = key;
                        bestScore = score;
                    }
                }
                
                let rowSelector = '';
                if (bestGroup.length > 0) {
                    const first = bestGroup[0];
                    rowSelector = first.tagName.toLowerCase();
                    const className = this.getElementClassName(first);
                    if (className) {
                        const mainClass = className.split(/\s+/)[0];
                        if (mainClass && !mainClass.includes(':')) {
                            rowSelector += '.' + mainClass;
                        }
                    }
                }
                
                return { rows: bestGroup, rowSelector };
            },

            findAtomicElements(container) {
                const atomic = [];
                
                const walk = (el) => {
                    const rect = el.getBoundingClientRect();
                    if (rect.width === 0 || rect.height === 0) return;
                    
                    const hasDirectText = Array.from(el.childNodes).some(
                        node => node.nodeType === 3 && node.textContent.trim().length > 0 // Node.TEXT_NODE = 3
                    );
                    const isMedia = ['IMG', 'VIDEO', 'AUDIO', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
                    const isLink = el.tagName === 'A' && el.getAttribute('href');
                    
                    if (hasDirectText || isMedia || isLink) {
                        atomic.push(el);
                    }
                    
                    for (const child of el.children) {
                        walk(child);
                    }
                };
                
                for (const child of container.children) {
                    walk(child);
                }
                
                return atomic;
            },

            getRelativePath(element, ancestor) {
                const path = [];
                let current = element;
                
                while (current && current !== ancestor) {
                    const tag = current.tagName.toLowerCase();
                    const parent = current.parentElement;
                    
                    if (parent) {
                        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
                        const index = siblings.indexOf(current);
                        
                        if (siblings.length > 1) {
                            path.unshift(`${tag}:nth-of-type(${index + 1})`);
                        } else {
                            path.unshift(tag);
                        }
                    }
                    
                    current = parent;
                }
                
                return path.join(' > ');
            },

            detectColumns(rows) {
                if (rows.length === 0) return { columns: [], fields: [] };
                
                const pathCounts = new Map();
                const pathElements = new Map();
                
                for (const row of rows.slice(0, Math.min(10, rows.length))) {
                    const atomicElements = this.findAtomicElements(row);
                    
                    for (const el of atomicElements) {
                        const path = this.getRelativePath(el, row);
                        pathCounts.set(path, (pathCounts.get(path) || 0) + 1);
                        if (!pathElements.has(path)) {
                            pathElements.set(path, el);
                        }
                    }
                }
                
                const threshold = Math.max(1, Math.floor(rows.length * 0.5)); // 50% for tests
                const validPaths = [];
                
                for (const [path, count] of pathCounts) {
                    if (count >= threshold) {
                        validPaths.push({
                            path,
                            count,
                            sample: pathElements.get(path)
                        });
                    }
                }
                
                // Sort by path (simulating left-to-right)
                validPaths.sort((a, b) => a.path.localeCompare(b.path));
                
                const fields = validPaths.map((col, index) => {
                    const dataType = this.getDataType(col.sample);
                    return {
                        id: 'region_col_' + index,
                        name: `Column ${index + 1}`,
                        selector: col.path,
                        dataType: dataType
                    };
                });
                
                return { columns: validPaths, fields };
            },

            buildRowsFromRegion(rowElements, columns) {
                const rows = [];
                
                for (const rowEl of rowElements) {
                    const row = {};
                    
                    for (const col of columns) {
                        let cellEl = null;
                        try {
                            cellEl = rowEl.querySelector(col.path.replace(/:nth-of-type\(\d+\)/g, ''));
                        } catch (e) {}
                        
                        if (cellEl) {
                            const dataType = this.getDataType(cellEl);
                            row[col.path] = this.getPreviewValue(cellEl, dataType);
                        } else {
                            row[col.path] = '';
                        }
                    }
                    
                    rows.push(row);
                }
                
                const renamedRows = rows.map(row => {
                    const newRow = {};
                    columns.forEach((col, index) => {
                        const fieldName = `Column ${index + 1}`;
                        newRow[fieldName] = row[col.path] || '';
                    });
                    return newRow;
                });
                
                return renamedRows;
            },

            findSimilarSiblings(element) {
                if (!element || !element.parentElement) return [element];
                
                const parent = element.parentElement;
                const key = this.getElementStructureKey(element);
                const siblings = [];
                
                for (const child of parent.children) {
                    const childKey = this.getElementStructureKey(child);
                    if (childKey === key) {
                        siblings.push(child);
                    }
                }
                
                if (siblings.length >= 2) {
                    return siblings;
                }
                
                // Try parent's siblings
                if (parent.parentElement && parent !== document.body) {
                    const parentKey = this.getElementStructureKey(parent);
                    const parentSiblings = [];
                    
                    for (const uncle of parent.parentElement.children) {
                        const uncleKey = this.getElementStructureKey(uncle);
                        if (uncleKey === parentKey) {
                            parentSiblings.push(uncle);
                        }
                    }
                    
                    if (parentSiblings.length >= 2) {
                        return parentSiblings;
                    }
                }
                
                return [element];
            },

            expandToAllSimilarElements(detectedRows, rowSelector) {
                if (!rowSelector || detectedRows.length === 0) return detectedRows;
                
                try {
                    const allMatching = document.querySelectorAll(rowSelector);
                    const filtered = Array.from(allMatching).filter(el => {
                        const rect = el.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0;
                    });
                    return filtered.length > detectedRows.length ? filtered : detectedRows;
                } catch (e) {
                    return detectedRows;
                }
            }
        };

        // Mock getBoundingClientRect for all elements
        // Layout: 4 cards in a row, each 200x400 pixels
        const cards = document.querySelectorAll('article.product-card');
        cards.forEach((card, index) => {
            const left = 10 + index * 220;
            mockBoundingRect(card, { left, top: 10, right: left + 200, bottom: 410, width: 200, height: 400 });
            
            // Mock child elements
            card.querySelectorAll('*').forEach(child => {
                const cardRect = card.getBoundingClientRect();
                mockBoundingRect(child, { 
                    left: cardRect.left + 10, 
                    top: cardRect.top + 10, 
                    right: cardRect.right - 10, 
                    bottom: cardRect.bottom - 10, 
                    width: 180, 
                    height: 50 
                });
            });
        });

        // Mock container
        const container = document.querySelector('.product-card-list');
        if (container) {
            mockBoundingRect(container, { left: 0, top: 0, right: 900, bottom: 420, width: 900, height: 420 });
        }
    });

    afterEach(() => {
        dom.window.close();
    });

    describe('findElementsInRegion', () => {
        test('should find product cards when selecting full area', () => {
            const rect = { left: 0, top: 0, right: 900, bottom: 500, width: 900, height: 500 };
            const elements = contentScript.findElementsInRegion(rect);
            
            expect(elements.length).toBeGreaterThan(0);
            
            // Should include article elements
            const articles = elements.filter(el => el.tagName === 'ARTICLE');
            expect(articles.length).toBe(4);
        });

        test('should find elements when selecting 2 cards', () => {
            // Select first 2 cards (x: 0-450)
            const rect = { left: 0, top: 0, right: 450, bottom: 500, width: 450, height: 500 };
            const elements = contentScript.findElementsInRegion(rect);
            
            const articles = elements.filter(el => el.tagName === 'ARTICLE');
            expect(articles.length).toBe(2);
        });
    });

    describe('findCommonAncestor', () => {
        test('should find product-card-list as common ancestor', () => {
            const cards = Array.from(document.querySelectorAll('article.product-card'));
            const ancestor = contentScript.findCommonAncestor(cards);
            
            expect(ancestor).toBeTruthy();
            expect(ancestor.classList.contains('product-card-list')).toBe(true);
        });

        test('should find article as ancestor for elements inside one card', () => {
            const card = document.querySelector('article.product-card');
            const elements = Array.from(card.querySelectorAll('span, img'));
            const ancestor = contentScript.findCommonAncestor(elements);
            
            // Ancestor should be article or its child
            expect(ancestor).toBeTruthy();
        });
    });

    describe('detectRepeatingRows', () => {
        test('should detect article.product-card as repeating rows', () => {
            const container = document.querySelector('.product-card-list');
            const rect = { left: 0, top: 0, right: 900, bottom: 500, width: 900, height: 500 };
            
            const { rows, rowSelector } = contentScript.detectRepeatingRows(container, rect);
            
            expect(rows.length).toBe(4);
            expect(rowSelector).toBe('article.product-card');
        });

        test('should return elements that are not nested', () => {
            const container = document.querySelector('.product-card-list');
            const rect = { left: 0, top: 0, right: 900, bottom: 500, width: 900, height: 500 };
            
            const { rows } = contentScript.detectRepeatingRows(container, rect);
            
            // Verify no nesting
            rows.forEach((row, i) => {
                rows.forEach((other, j) => {
                    if (i !== j) {
                        expect(row.contains(other)).toBe(false);
                        expect(other.contains(row)).toBe(false);
                    }
                });
            });
        });
    });

    describe('getElementStructureKey', () => {
        test('should return correct key for product card', () => {
            const card = document.querySelector('article.product-card');
            const key = contentScript.getElementStructureKey(card);
            
            expect(key).toBe('article|product-card');
        });

        test('should return correct key for price element', () => {
            const price = document.querySelector('.price__lower-price');
            const key = contentScript.getElementStructureKey(price);
            
            expect(key).toBe('ins|price__lower-price');
        });
    });

    describe('detectColumns', () => {
        test('should detect columns from product cards', () => {
            const rows = Array.from(document.querySelectorAll('article.product-card'));
            const { columns, fields } = contentScript.detectColumns(rows);
            
            expect(columns.length).toBeGreaterThan(0);
            expect(fields.length).toBe(columns.length);
        });

        test('should detect image column', () => {
            const rows = Array.from(document.querySelectorAll('article.product-card'));
            const { fields } = contentScript.detectColumns(rows);
            
            const imageField = fields.find(f => f.dataType === 'src');
            expect(imageField).toBeTruthy();
        });
    });

    describe('buildRowsFromRegion', () => {
        test('should build rows with extracted data', () => {
            const rowElements = Array.from(document.querySelectorAll('article.product-card'));
            const { columns } = contentScript.detectColumns(rowElements);
            
            const rows = contentScript.buildRowsFromRegion(rowElements, columns);
            
            expect(rows.length).toBe(4);
            expect(Object.keys(rows[0]).length).toBeGreaterThan(0);
        });
    });

    describe('findSimilarSiblings', () => {
        test('should find all similar article siblings when selecting one card', () => {
            const singleCard = document.querySelector('article.product-card');
            const siblings = contentScript.findSimilarSiblings(singleCard);
            
            // Should find all 4 cards
            expect(siblings.length).toBe(4);
            siblings.forEach(sibling => {
                expect(sibling.tagName).toBe('ARTICLE');
                expect(sibling.classList.contains('product-card')).toBe(true);
            });
        });

        test('should return single element if no similar siblings', () => {
            const uniqueElement = document.querySelector('.product-card-list');
            const siblings = contentScript.findSimilarSiblings(uniqueElement);
            
            // Only one product-card-list exists
            expect(siblings.length).toBe(1);
        });

        test('should find siblings by structure key', () => {
            const price = document.querySelector('.price__lower-price');
            const siblings = contentScript.findSimilarSiblings(price);
            
            // All ins.price__lower-price elements in same parent
            expect(siblings.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('Full region selection flow', () => {
        test('should extract data from WB-like product list', () => {
            // Simulate region selection
            const rect = { left: 0, top: 0, right: 900, bottom: 500, width: 900, height: 500 };
            
            // Step 1: Find elements
            const elementsInRegion = contentScript.findElementsInRegion(rect);
            expect(elementsInRegion.length).toBeGreaterThan(0);
            
            // Step 2: Find common ancestor
            const commonAncestor = contentScript.findCommonAncestor(elementsInRegion);
            expect(commonAncestor).toBeTruthy();
            
            // Step 3: Detect rows
            const { rows: detectedRows, rowSelector } = contentScript.detectRepeatingRows(commonAncestor, rect);
            expect(detectedRows.length).toBe(4);
            expect(rowSelector).toBe('article.product-card');
            
            // Step 4: Detect columns
            const { columns, fields } = contentScript.detectColumns(detectedRows);
            expect(columns.length).toBeGreaterThan(0);
            
            // Step 5: Build data
            const rows = contentScript.buildRowsFromRegion(detectedRows, columns);
            expect(rows.length).toBe(4);
            
            // Verify data content
            console.log('Extracted rows:', JSON.stringify(rows, null, 2));
        });

        test('should expand single card selection to all similar cards', () => {
            // Select only ONE card (small rect that covers just the first card)
            const singleCard = document.querySelector('article.product-card');
            const cardRect = singleCard.getBoundingClientRect();
            
            // Use findSimilarSiblings to expand single selection
            const expanded = contentScript.findSimilarSiblings(singleCard);
            expect(expanded.length).toBe(4); // Should find all 4 cards
            
            // Verify expandToAllSimilarElements works with single element
            const rowSelector = 'article.product-card';
            const allCards = contentScript.expandToAllSimilarElements([singleCard], rowSelector);
            expect(allCards.length).toBe(4);
            
            // Verify columns and rows can be built
            const { columns, fields } = contentScript.detectColumns(allCards);
            expect(columns.length).toBeGreaterThan(0);
            
            const rows = contentScript.buildRowsFromRegion(allCards, columns);
            expect(rows.length).toBe(4);
        });
    });
});
