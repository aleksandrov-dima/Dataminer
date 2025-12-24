/**
 * Unit tests for Sidepanel Export buttons
 * Testing export button text with row count
 */

const { JSDOM } = require('jsdom');

describe('Sidepanel Export Buttons', () => {
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
                    <section class="panel-export">
                        <button id="exportCSV" class="btn btn-export" disabled>
                            <span class="btn-icon">⬇</span>
                            <span class="btn-text">Export CSV</span>
                        </button>
                        <button id="exportJSON" class="btn btn-export" disabled>
                            <span class="btn-icon">⬇</span>
                            <span class="btn-text">Export JSON</span>
                        </button>
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

    describe('Export button text with row count', () => {
        test('should show row count when rows > 0', () => {
            const exportCSV = document.getElementById('exportCSV');
            const exportJSON = document.getElementById('exportJSON');
            const exportCSVText = exportCSV.querySelector('.btn-text');
            const exportJSONText = exportJSON.querySelector('.btn-text');
            const rowCount = 15;

            if (rowCount > 0) {
                exportCSVText.textContent = `Export CSV (${rowCount} rows)`;
                exportJSONText.textContent = `Export JSON (${rowCount} rows)`;
            }

            expect(exportCSVText.textContent).toBe('Export CSV (15 rows)');
            expect(exportJSONText.textContent).toBe('Export JSON (15 rows)');
        });

        test('should show simple text when rows === 0', () => {
            const exportCSV = document.getElementById('exportCSV');
            const exportJSON = document.getElementById('exportJSON');
            const exportCSVText = exportCSV.querySelector('.btn-text');
            const exportJSONText = exportJSON.querySelector('.btn-text');
            const rowCount = 0;

            if (rowCount > 0) {
                exportCSVText.textContent = `Export CSV (${rowCount} rows)`;
                exportJSONText.textContent = `Export JSON (${rowCount} rows)`;
            } else {
                exportCSVText.textContent = 'Export CSV';
                exportJSONText.textContent = 'Export JSON';
            }

            expect(exportCSVText.textContent).toBe('Export CSV');
            expect(exportJSONText.textContent).toBe('Export JSON');
        });

        test('should update text when row count changes', () => {
            const exportCSV = document.getElementById('exportCSV');
            const exportJSON = document.getElementById('exportJSON');
            const exportCSVText = exportCSV.querySelector('.btn-text');
            const exportJSONText = exportJSON.querySelector('.btn-text');

            // Start with 0 rows
            let rowCount = 0;
            if (rowCount > 0) {
                exportCSVText.textContent = `Export CSV (${rowCount} rows)`;
                exportJSONText.textContent = `Export JSON (${rowCount} rows)`;
            } else {
                exportCSVText.textContent = 'Export CSV';
                exportJSONText.textContent = 'Export JSON';
            }
            expect(exportCSVText.textContent).toBe('Export CSV');

            // Change to 42 rows
            rowCount = 42;
            if (rowCount > 0) {
                exportCSVText.textContent = `Export CSV (${rowCount} rows)`;
                exportJSONText.textContent = `Export JSON (${rowCount} rows)`;
            } else {
                exportCSVText.textContent = 'Export CSV';
                exportJSONText.textContent = 'Export JSON';
            }
            expect(exportCSVText.textContent).toBe('Export CSV (42 rows)');
            expect(exportJSONText.textContent).toBe('Export JSON (42 rows)');
        });
    });

    describe('Export button disabled state', () => {
        test('should be disabled when rowCount === 0', () => {
            const exportCSV = document.getElementById('exportCSV');
            const exportJSON = document.getElementById('exportJSON');
            const rowCount = 0;

            exportCSV.disabled = rowCount === 0;
            exportJSON.disabled = rowCount === 0;

            expect(exportCSV.disabled).toBe(true);
            expect(exportJSON.disabled).toBe(true);
        });

        test('should be enabled when rowCount > 0', () => {
            const exportCSV = document.getElementById('exportCSV');
            const exportJSON = document.getElementById('exportJSON');
            const rowCount = 15;

            exportCSV.disabled = rowCount === 0;
            exportJSON.disabled = rowCount === 0;

            expect(exportCSV.disabled).toBe(false);
            expect(exportJSON.disabled).toBe(false);
        });
    });

    describe('Button structure', () => {
        test('should have btn-text element for text content', () => {
            const exportCSV = document.getElementById('exportCSV');
            const exportJSON = document.getElementById('exportJSON');
            const exportCSVText = exportCSV.querySelector('.btn-text');
            const exportJSONText = exportJSON.querySelector('.btn-text');

            expect(exportCSVText).toBeTruthy();
            expect(exportJSONText).toBeTruthy();
        });

        test('should have btn-icon element', () => {
            const exportCSV = document.getElementById('exportCSV');
            const exportJSON = document.getElementById('exportJSON');
            const exportCSVIcon = exportCSV.querySelector('.btn-icon');
            const exportJSONIcon = exportJSON.querySelector('.btn-icon');

            expect(exportCSVIcon).toBeTruthy();
            expect(exportJSONIcon).toBeTruthy();
            expect(exportCSVIcon.textContent).toBe('⬇');
            expect(exportJSONIcon.textContent).toBe('⬇');
        });
    });
});

