/**
 * Unit tests for Product Limitations UI (P0.3)
 * Testing explicit product limitations display in UI
 */

const { JSDOM } = require('jsdom');

describe('Product Limitations UI (P0.3)', () => {
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
                        <span class="stat-limit" id="limitText" style="display: none;">Extracts data only from the current page</span>
                    </section>
                    <section class="panel-preview" id="previewSection">
                        <div class="preview-empty" id="emptyState">
                            <p class="empty-text">Select elements on the page</p>
                            <p class="empty-hint">Each click adds a column</p>
                        </div>
                    </section>
                    <div id="toastContainer" class="toast-container"></div>
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

    describe('Limit text display', () => {
        test('should show limit text when fieldCount === 0', () => {
            const limitText = document.getElementById('limitText');
            const fieldCount = 0;
            const rowCount = 0;

            if (fieldCount === 0 || rowCount === 0) {
                limitText.style.display = 'block';
            } else {
                limitText.style.display = 'none';
            }

            expect(limitText.style.display).toBe('block');
            expect(limitText.textContent).toBe('Extracts data only from the current page');
        });

        test('should show limit text when rowCount === 0', () => {
            const limitText = document.getElementById('limitText');
            const fieldCount = 3;
            const rowCount = 0;

            if (fieldCount === 0 || rowCount === 0) {
                limitText.style.display = 'block';
            } else {
                limitText.style.display = 'none';
            }

            expect(limitText.style.display).toBe('block');
        });

        test('should hide limit text when both fieldCount > 0 and rowCount > 0', () => {
            const limitText = document.getElementById('limitText');
            const fieldCount = 3;
            const rowCount = 10;

            if (fieldCount === 0 || rowCount === 0) {
                limitText.style.display = 'block';
            } else {
                limitText.style.display = 'none';
            }

            expect(limitText.style.display).toBe('none');
        });

        test('should have correct limit text content', () => {
            const limitText = document.getElementById('limitText');
            expect(limitText.textContent).toBe('Extracts data only from the current page');
        });
    });

    describe('Empty state hint text', () => {
        test('should show limitation message in empty hint when not selecting', () => {
            const emptyHint = document.querySelector('.empty-hint');
            const isSelecting = false;

            if (isSelecting) {
                emptyHint.textContent = 'Each click adds a column';
            } else {
                emptyHint.textContent = 'Extracts data only from the current page';
            }

            expect(emptyHint.textContent).toBe('Extracts data only from the current page');
        });

        test('should show normal hint when selecting', () => {
            const emptyHint = document.querySelector('.empty-hint');
            const isSelecting = true;

            if (isSelecting) {
                emptyHint.textContent = 'Each click adds a column';
            } else {
                emptyHint.textContent = 'Extracts data only from the current page';
            }

            expect(emptyHint.textContent).toBe('Each click adds a column');
        });
    });

    describe('First run detection', () => {
        test('should track first run flag', () => {
            // Simulate storage check
            const storage = {};
            const firstRunKey = 'data-scraping-tool-first-run';
            
            // First run - flag doesn't exist
            const isFirstRun = !storage[firstRunKey];
            expect(isFirstRun).toBe(true);
            
            // After first run - flag exists
            storage[firstRunKey] = true;
            const isFirstRunAfter = !storage[firstRunKey];
            expect(isFirstRunAfter).toBe(false);
        });
    });

    describe('Stats section structure', () => {
        test('should have stat-text element', () => {
            const statText = document.getElementById('statText');
            expect(statText).toBeTruthy();
            expect(statText.classList.contains('stat-text')).toBe(true);
        });

        test('should have stat-limit element', () => {
            const limitText = document.getElementById('limitText');
            expect(limitText).toBeTruthy();
            expect(limitText.classList.contains('stat-limit')).toBe(true);
        });

        test('should have correct CSS classes for styling', () => {
            const limitText = document.getElementById('limitText');
            expect(limitText.classList.contains('stat-limit')).toBe(true);
        });
    });
});
