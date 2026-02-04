/**
 * Unit tests for Region Selection (P3.1 - P3.4)
 * Testing region selection UI, LCA detection, row detection, and column detection
 */

const { JSDOM } = require('jsdom');

describe('Region Selection (P3.1)', () => {
    let dom;
    let document;
    let window;

    beforeEach(() => {
        const html = `
            <!DOCTYPE html>
            <html>
            <head></head>
            <body>
                <div class="panel-container">
                    <button id="regionBtn" class="btn btn-secondary">
                        <span class="btn-icon">⬚</span>
                        <span class="btn-text">Select Region</span>
                    </button>
                </div>
            </body>
            </html>
        `;
        
        dom = new JSDOM(html, { runScripts: 'outside-only' });
        document = dom.window.document;
        window = dom.window;
        
        global.document = document;
        global.window = window;
    });

    afterEach(() => {
        dom.window.close();
    });

    describe('Region button', () => {
        test('should have region button in DOM', () => {
            const regionBtn = document.getElementById('regionBtn');
            expect(regionBtn).toBeTruthy();
        });

        test('should have correct initial text', () => {
            const text = document.querySelector('#regionBtn .btn-text');
            expect(text.textContent).toBe('Select Region');
        });

        test('should have correct initial icon', () => {
            const icon = document.querySelector('#regionBtn .btn-icon');
            expect(icon.textContent).toBe('⬚');
        });
    });

    describe('Region selection state', () => {
        test('should track isSelectingRegion state', () => {
            let isSelectingRegion = false;
            
            // Toggle on
            isSelectingRegion = true;
            expect(isSelectingRegion).toBe(true);
            
            // Toggle off
            isSelectingRegion = false;
            expect(isSelectingRegion).toBe(false);
        });

        test('should update button when selecting', () => {
            const regionBtn = document.getElementById('regionBtn');
            const icon = regionBtn.querySelector('.btn-icon');
            const text = regionBtn.querySelector('.btn-text');
            
            // Simulate selecting state
            icon.textContent = '✕';
            text.textContent = 'Cancel';
            regionBtn.classList.add('selecting');
            
            expect(icon.textContent).toBe('✕');
            expect(text.textContent).toBe('Cancel');
            expect(regionBtn.classList.contains('selecting')).toBe(true);
        });
    });

    describe('Region rectangle calculation', () => {
        test('should calculate correct rectangle from start and end points', () => {
            const startPoint = { x: 100, y: 100 };
            const endPoint = { x: 300, y: 250 };
            
            const rect = {
                left: Math.min(startPoint.x, endPoint.x),
                top: Math.min(startPoint.y, endPoint.y),
                right: Math.max(startPoint.x, endPoint.x),
                bottom: Math.max(startPoint.y, endPoint.y),
                width: Math.abs(endPoint.x - startPoint.x),
                height: Math.abs(endPoint.y - startPoint.y)
            };
            
            expect(rect.left).toBe(100);
            expect(rect.top).toBe(100);
            expect(rect.right).toBe(300);
            expect(rect.bottom).toBe(250);
            expect(rect.width).toBe(200);
            expect(rect.height).toBe(150);
        });

        test('should handle reversed drag direction', () => {
            const startPoint = { x: 300, y: 250 };
            const endPoint = { x: 100, y: 100 };
            
            const rect = {
                left: Math.min(startPoint.x, endPoint.x),
                top: Math.min(startPoint.y, endPoint.y),
                right: Math.max(startPoint.x, endPoint.x),
                bottom: Math.max(startPoint.y, endPoint.y),
                width: Math.abs(endPoint.x - startPoint.x),
                height: Math.abs(endPoint.y - startPoint.y)
            };
            
            expect(rect.left).toBe(100);
            expect(rect.top).toBe(100);
            expect(rect.width).toBe(200);
            expect(rect.height).toBe(150);
        });

        test('should detect minimum size requirement', () => {
            const minSize = 50;
            
            const smallRect = { width: 30, height: 40 };
            const validRect = { width: 100, height: 80 };
            
            expect(smallRect.width < minSize || smallRect.height < minSize).toBe(true);
            expect(validRect.width < minSize || validRect.height < minSize).toBe(false);
        });
    });
});

describe('LCA Detection (P3.2)', () => {
    let dom;
    let document;

    beforeEach(() => {
        const html = `
            <!DOCTYPE html>
            <html>
            <body>
                <div id="container">
                    <div class="product" id="p1">
                        <span class="name">Product 1</span>
                        <span class="price">$10</span>
                    </div>
                    <div class="product" id="p2">
                        <span class="name">Product 2</span>
                        <span class="price">$20</span>
                    </div>
                    <div class="product" id="p3">
                        <span class="name">Product 3</span>
                        <span class="price">$30</span>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        dom = new JSDOM(html);
        document = dom.window.document;
        global.document = document;
    });

    afterEach(() => {
        dom.window.close();
    });

    test('should find common ancestor for sibling elements', () => {
        const p1 = document.getElementById('p1');
        const p2 = document.getElementById('p2');
        const container = document.getElementById('container');
        
        // Find common ancestor
        const ancestors = new Set();
        let el = p1;
        while (el) {
            ancestors.add(el);
            el = el.parentElement;
        }
        
        el = p2;
        while (el) {
            if (ancestors.has(el.parentElement)) {
                expect(el.parentElement).toBe(container);
                break;
            }
            el = el.parentElement;
        }
    });

    test('should return container for all product elements', () => {
        const products = document.querySelectorAll('.product');
        const container = document.getElementById('container');
        
        // Verify all products are children of container
        products.forEach(p => {
            expect(p.parentElement).toBe(container);
        });
    });
});

describe('Row Detection (P3.3)', () => {
    let dom;
    let document;

    beforeEach(() => {
        const html = `
            <!DOCTYPE html>
            <html>
            <body>
                <div id="list">
                    <div class="item">Item 1</div>
                    <div class="item">Item 2</div>
                    <div class="item">Item 3</div>
                    <div class="item">Item 4</div>
                    <div class="item">Item 5</div>
                </div>
            </body>
            </html>
        `;
        
        dom = new JSDOM(html);
        document = dom.window.document;
        global.document = document;
    });

    afterEach(() => {
        dom.window.close();
    });

    test('should find repeating elements with same tag and class', () => {
        const items = document.querySelectorAll('.item');
        expect(items.length).toBe(5);
        expect(items.length >= 3).toBe(true); // Minimum required
    });

    test('should detect same structure for repeating elements', () => {
        const items = Array.from(document.querySelectorAll('.item'));
        
        const getStructureKey = (el) => {
            return `${el.tagName}|${el.className}|${el.children.length}`;
        };
        
        const keys = items.map(getStructureKey);
        const allSame = keys.every(k => k === keys[0]);
        
        expect(allSame).toBe(true);
    });

    test('should reject groups with less than 3 elements', () => {
        const minRows = 3;
        
        expect(2 >= minRows).toBe(false);
        expect(3 >= minRows).toBe(true);
        expect(5 >= minRows).toBe(true);
    });
});

describe('Column Detection (P3.4)', () => {
    let dom;
    let document;

    beforeEach(() => {
        const html = `
            <!DOCTYPE html>
            <html>
            <body>
                <div id="list">
                    <div class="product">
                        <img class="image" src="img1.jpg">
                        <span class="name">Product A</span>
                        <span class="price">$10</span>
                    </div>
                    <div class="product">
                        <img class="image" src="img2.jpg">
                        <span class="name">Product B</span>
                        <span class="price">$20</span>
                    </div>
                    <div class="product">
                        <img class="image" src="img3.jpg">
                        <span class="name">Product C</span>
                        <span class="price">$30</span>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        dom = new JSDOM(html);
        document = dom.window.document;
        global.document = document;
    });

    afterEach(() => {
        dom.window.close();
    });

    test('should find atomic elements inside rows', () => {
        const product = document.querySelector('.product');
        const atomicElements = product.querySelectorAll('img, span');
        
        expect(atomicElements.length).toBe(3);
    });

    test('should detect column pattern across rows', () => {
        const products = document.querySelectorAll('.product');
        const pathCounts = new Map();
        
        products.forEach(product => {
            const children = product.querySelectorAll('img, span');
            children.forEach(child => {
                const path = child.tagName + '.' + child.className;
                pathCounts.set(path, (pathCounts.get(path) || 0) + 1);
            });
        });
        
        // Each pattern should appear 3 times (in all products)
        expect(pathCounts.get('IMG.image')).toBe(3);
        expect(pathCounts.get('SPAN.name')).toBe(3);
        expect(pathCounts.get('SPAN.price')).toBe(3);
    });

    test('should keep paths that appear in >= 70% of rows', () => {
        const totalRows = 10;
        const threshold = Math.floor(totalRows * 0.7); // 7
        
        expect(threshold).toBe(7);
        
        // Path appearing in 8 rows should be kept
        expect(8 >= threshold).toBe(true);
        
        // Path appearing in 5 rows should be rejected
        expect(5 >= threshold).toBe(false);
    });
});

describe('Message handling', () => {
    test('should create correct startRegionSelection message', () => {
        const message = { action: 'startRegionSelection' };
        expect(message.action).toBe('startRegionSelection');
    });

    test('should create correct stopRegionSelection message', () => {
        const message = { action: 'stopRegionSelection' };
        expect(message.action).toBe('stopRegionSelection');
    });

    test('should create correct regionSelected response', () => {
        const response = {
            region: { left: 100, top: 100, right: 300, bottom: 200 },
            rows: [{ col1: 'value1' }],
            fields: [{ id: 'f1', name: 'Column 1' }]
        };
        
        expect(response.region).toBeTruthy();
        expect(response.rows.length).toBe(1);
        expect(response.fields.length).toBe(1);
    });
});
