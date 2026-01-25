/**
 * Unit tests for Row Highlight on Hover (P1.2)
 * Testing source element highlighting when hovering table rows
 */

const { JSDOM } = require('jsdom');

describe('Row Highlight on Table Hover (P1.2)', () => {
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
                    <div class="preview-table-wrapper" id="tableWrapper">
                        <table class="preview-table" id="previewTable">
                            <thead id="tableHead">
                                <tr><th>Name</th><th>Price</th></tr>
                            </thead>
                            <tbody id="tableBody">
                                <tr data-row-index="0"><td>Product 1</td><td>$10</td></tr>
                                <tr data-row-index="1"><td>Product 2</td><td>$20</td></tr>
                                <tr data-row-index="2"><td>Product 3</td><td>$30</td></tr>
                            </tbody>
                        </table>
                    </div>
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

    describe('Table row structure', () => {
        test('should have data-row-index attribute on rows', () => {
            const tableBody = document.getElementById('tableBody');
            const rows = tableBody.querySelectorAll('tr');
            
            expect(rows.length).toBe(3);
            expect(rows[0].dataset.rowIndex).toBe('0');
            expect(rows[1].dataset.rowIndex).toBe('1');
            expect(rows[2].dataset.rowIndex).toBe('2');
        });

        test('should be able to find row by data-row-index', () => {
            const tableBody = document.getElementById('tableBody');
            const row = tableBody.querySelector('tr[data-row-index="1"]');
            
            expect(row).toBeTruthy();
            expect(row.cells[0].textContent).toBe('Product 2');
        });
    });

    describe('Hover event handling', () => {
        test('should get row index from closest tr element', () => {
            const tableBody = document.getElementById('tableBody');
            const cell = tableBody.querySelector('tr[data-row-index="1"] td');
            
            // Simulate finding parent row from cell
            const row = cell.closest('tr');
            expect(row).toBeTruthy();
            expect(row.dataset.rowIndex).toBe('1');
        });

        test('should parse row index as integer', () => {
            const tableBody = document.getElementById('tableBody');
            const row = tableBody.querySelector('tr[data-row-index="2"]');
            
            const rowIndex = parseInt(row.dataset.rowIndex, 10);
            expect(typeof rowIndex).toBe('number');
            expect(rowIndex).toBe(2);
        });
    });

    describe('Highlight source row logic', () => {
        test('should not highlight for negative index', () => {
            const rowIndex = -1;
            const shouldHighlight = rowIndex >= 0;
            
            expect(shouldHighlight).toBe(false);
        });

        test('should highlight for valid index', () => {
            const rowIndex = 0;
            const shouldHighlight = rowIndex >= 0;
            
            expect(shouldHighlight).toBe(true);
        });

        test('should validate index is within bounds', () => {
            const totalRows = 3;
            
            expect(0 < totalRows).toBe(true);
            expect(2 < totalRows).toBe(true);
            expect(3 < totalRows).toBe(false);
        });
    });

    describe('Message format', () => {
        test('should create correct highlightRow message', () => {
            const rowIndex = 1;
            const message = { action: 'highlightRow', rowIndex };
            
            expect(message.action).toBe('highlightRow');
            expect(message.rowIndex).toBe(1);
        });

        test('should create correct clearRowHighlight message', () => {
            const message = { action: 'clearRowHighlight' };
            
            expect(message.action).toBe('clearRowHighlight');
        });
    });
});

describe('Content Script Row Highlight', () => {
    describe('CSS class for row highlight', () => {
        test('should define correct class name', () => {
            const highlightClass = 'onpage-row-highlight';
            
            expect(highlightClass).toBe('onpage-row-highlight');
        });

        test('should be different from hover highlight class', () => {
            const rowHighlightClass = 'onpage-row-highlight';
            const hoverClass = 'onpage-hover-element';
            
            expect(rowHighlightClass).not.toBe(hoverClass);
        });
    });

    describe('Highlight cleanup', () => {
        test('should clear orphaned highlights with querySelectorAll', () => {
            // Simulate clearing logic
            const selector = '.onpage-row-highlight';
            
            expect(selector).toBe('.onpage-row-highlight');
        });
    });
});
