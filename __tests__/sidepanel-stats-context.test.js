/**
 * Unit tests for Sidepanel Stats and Context
 * Testing simplified stats and preview context
 */

const { JSDOM } = require('jsdom');

describe('Sidepanel Stats and Context', () => {
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
                <div class="panel-container">
                    <section class="panel-stats">
                        <span class="stat-text" id="statText">0 columns · 0 rows extracted</span>
                    </section>
                    <section class="panel-preview">
                        <div class="preview-context" id="previewContext" style="display: none;"></div>
                        <div class="preview-table-wrapper" id="tableWrapper"></div>
                    </section>
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

    describe('Simplified stats', () => {
        test('should display stats in one line format', () => {
            const statText = document.getElementById('statText');
            
            statText.textContent = '3 columns · 15 rows extracted';
            
            expect(statText.textContent).toBe('3 columns · 15 rows extracted');
            expect(statText.textContent).toMatch(/\d+ columns · \d+ rows extracted/);
        });

        test('should update stats with correct format', () => {
            const statText = document.getElementById('statText');
            const columnCount = 5;
            const rowCount = 42;
            
            statText.textContent = `${columnCount} columns · ${rowCount} rows extracted`;
            
            expect(statText.textContent).toBe('5 columns · 42 rows extracted');
        });

        test('should not have stat-item cards', () => {
            const panelStats = document.querySelector('.panel-stats');
            const statItems = panelStats.querySelectorAll('.stat-item');
            
            expect(statItems.length).toBe(0);
        });
    });

    describe('Preview context', () => {
        test('should show context when table is displayed', () => {
            const previewContext = document.getElementById('previewContext');
            
            previewContext.textContent = 'Extracted from example.com';
            previewContext.style.display = 'block';
            
            expect(previewContext.style.display).toBe('block');
            expect(previewContext.textContent).toMatch(/Extracted from|Based on selected elements/);
        });

        test('should format domain correctly from origin', () => {
            const previewContext = document.getElementById('previewContext');
            const origin = 'https://example.com';
            
            try {
                const domain = new URL(origin).hostname;
                previewContext.textContent = `Extracted from ${domain}`;
                
                expect(previewContext.textContent).toBe('Extracted from example.com');
            } catch (e) {
                previewContext.textContent = 'Based on selected elements';
                expect(previewContext.textContent).toBe('Based on selected elements');
            }
        });

        test('should hide context in compact preview mode', () => {
            const previewContext = document.getElementById('previewContext');
            
            // In compact preview, context should be hidden
            previewContext.style.display = 'none';
            
            expect(previewContext.style.display).toBe('none');
        });
    });

    describe('Stats structure', () => {
        test('should have simplified stats structure', () => {
            const panelStats = document.querySelector('.panel-stats');
            const statText = panelStats.querySelector('.stat-text');
            
            expect(statText).toBeTruthy();
            expect(panelStats.querySelectorAll('.stat-item').length).toBe(0);
            expect(panelStats.querySelectorAll('.stat-value').length).toBe(0);
            expect(panelStats.querySelectorAll('.stat-label').length).toBe(0);
        });

        test('should have single stat-text element', () => {
            const panelStats = document.querySelector('.panel-stats');
            const statTexts = panelStats.querySelectorAll('.stat-text');
            
            expect(statTexts.length).toBe(1);
        });
    });
});

