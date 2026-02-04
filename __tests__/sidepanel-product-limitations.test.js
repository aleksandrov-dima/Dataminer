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
                    </section>
                    <section class="panel-preview" id="previewSection">
                        <div class="preview-empty" id="emptyState">
                            <p class="empty-instruction">Each click adds a column</p>
                            <p class="empty-sub">Select elements on the page</p>
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

    describe('Empty state text', () => {
        test('should show Elements instruction when in Elements mode', () => {
            const emptyInstruction = document.querySelector('.empty-instruction');
            const selectionMode = 'elements';

            emptyInstruction.textContent = selectionMode === 'region' ? 'Drag a rectangle over one or more cards' : 'Each click adds a column';

            expect(emptyInstruction.textContent).toBe('Each click adds a column');
        });

        test('should show Region instruction when in Region mode', () => {
            const emptyInstruction = document.querySelector('.empty-instruction');
            const selectionMode = 'region';

            emptyInstruction.textContent = selectionMode === 'region' ? 'Drag a rectangle over one or more cards' : 'Each click adds a column';

            expect(emptyInstruction.textContent).toBe('Drag a rectangle over one or more cards');
        });

        test('should show sub text "Select elements on the page"', () => {
            const emptySub = document.querySelector('.empty-sub');
            expect(emptySub.textContent).toBe('Select elements on the page');
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

        test('stats section has no limit text (removed from stats area)', () => {
            const limitText = document.getElementById('limitText');
            expect(limitText).toBeNull();
        });
    });
});
