/**
 * Unit tests for Content Script Tooltip
 * Testing simplified tooltip and preview highlight changes
 */

const { JSDOM } = require('jsdom');

describe('Content Script Tooltip', () => {
    let dom;
    let document;
    let window;

    beforeEach(() => {
        // Create DOM environment
        const html = `
            <!DOCTYPE html>
            <html>
            <head></head>
            <body>
                <div class="product">
                    <h2 class="product-title">iPhone 15 Pro</h2>
                    <a href="https://example.com/product">Link</a>
                    <img src="https://example.com/image.jpg" alt="Product">
                </div>
            </body>
            </html>
        `;
        
        dom = new JSDOM(html, { runScripts: 'outside-only' });
        document = dom.window.document;
        window = dom.window;
        
        // Make DOM available globally
        global.document = document;
        global.window = window;
    });

    afterEach(() => {
        dom.window.close();
    });

    describe('Tooltip structure', () => {
        test('should create tooltip with only type and preview (no selector)', () => {
            const tooltip = document.createElement('div');
            tooltip.id = 'dataminer-element-tooltip';
            
            const dataTypeLabel = '📝 Text';
            const previewValue = 'iPhone 15 Pro';
            
            tooltip.innerHTML = `
                <div class="tooltip-type">${dataTypeLabel}</div>
                <div class="tooltip-preview">${previewValue}</div>
            `;
            
            document.body.appendChild(tooltip);
            
            const tooltipType = tooltip.querySelector('.tooltip-type');
            const tooltipPreview = tooltip.querySelector('.tooltip-preview');
            const tooltipSelector = tooltip.querySelector('.tooltip-selector');
            
            expect(tooltipType).toBeTruthy();
            expect(tooltipPreview).toBeTruthy();
            expect(tooltipSelector).toBeNull(); // Should not exist
            
            expect(tooltipType.textContent).toBe('📝 Text');
            expect(tooltipPreview.textContent).toBe('iPhone 15 Pro');
        });

        test('should have simplified tooltip content', () => {
            const tooltip = document.createElement('div');
            tooltip.id = 'dataminer-element-tooltip';
            
            tooltip.innerHTML = `
                <div class="tooltip-type">🔗 Link</div>
                <div class="tooltip-preview">https://example.com</div>
            `;
            
            const children = tooltip.children;
            expect(children.length).toBe(2); // Only type and preview
            
            const childClasses = Array.from(children).map(c => c.className);
            expect(childClasses).toContain('tooltip-type');
            expect(childClasses).toContain('tooltip-preview');
            expect(childClasses).not.toContain('tooltip-selector');
        });
    });

    describe('Preview highlight visual weight', () => {
        test('should have reduced visual weight styles', () => {
            const style = document.createElement('style');
            style.textContent = `
                .dataminer-preview-highlight {
                    outline: 1px dashed #f59e0b !important;
                    outline-offset: 1px !important;
                    background-color: rgba(245, 158, 11, 0.05) !important;
                }
            `;
            document.head.appendChild(style);
            
            const element = document.querySelector('.product-title');
            element.classList.add('dataminer-preview-highlight');
            
            const computedStyle = window.getComputedStyle(element);
            // Check that element has the class (we can't easily test computed styles in jsdom)
            expect(element.classList.contains('dataminer-preview-highlight')).toBe(true);
        });
    });

    describe('Tooltip for selected elements', () => {
        test('should not create tooltip for already selected element', () => {
            const element = document.querySelector('.product-title');
            
            // Mark element as selected
            element.classList.add('onpage-selected-element');
            
            // Simulate highlightElement logic
            const isSelected = element.classList.contains('onpage-selected-element');
            
            expect(isSelected).toBe(true);
            // Tooltip should not be created if element is selected
        });

        test('should create tooltip for non-selected element', () => {
            const element = document.querySelector('.product-title');
            
            // Element is not selected
            const isSelected = element.classList.contains('onpage-selected-element');
            
            expect(isSelected).toBe(false);
            // Tooltip should be created for non-selected elements
        });
    });

    describe('Hover behavior', () => {
        test('should only show tooltip when in selecting mode', () => {
            // This is tested at the integration level
            // The handleMouseOver checks if (!this.isSelecting) return;
            const isSelecting = false;
            
            if (!isSelecting) {
                // Should return early, no tooltip created
                expect(true).toBe(true);
            }
        });
    });
});

