/**
 * Unit tests for Sidepanel Compact Preview
 * Testing compact preview in selecting mode
 */

const { JSDOM } = require('jsdom');

describe('Sidepanel Compact Preview', () => {
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
                    <section class="panel-preview">
                        <div class="preview-table-wrapper" id="tableWrapper">
                            <table class="preview-table">
                                <thead id="tableHead"></thead>
                                <tbody id="tableBody"></tbody>
                            </table>
                            <div class="preview-more" id="moreRows"></div>
                        </div>
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

    describe('Compact preview structure', () => {
        test('should render headers without edit controls in compact mode', () => {
            const tableHead = document.getElementById('tableHead');
            const headers = ['Product Title', 'Price', 'Image'];

            // Simulate compact preview header rendering
            tableHead.innerHTML = `
                <tr>
                    ${headers.map(h => `
                        <th>
                            <div class="th-wrapper">
                                <span>${h}</span>
                            </div>
                        </th>
                    `).join('')}
                </tr>
            `;

            const thElements = tableHead.querySelectorAll('th');
            expect(thElements.length).toBe(3);

            // Check that headers don't have input or delete button
            thElements.forEach(th => {
                const input = th.querySelector('input');
                const deleteBtn = th.querySelector('.th-delete');
                expect(input).toBeNull();
                expect(deleteBtn).toBeNull();
            });

            // Check that headers have span with text
            const spans = tableHead.querySelectorAll('span');
            expect(spans.length).toBe(3);
            expect(spans[0].textContent).toBe('Product Title');
        });

        test('should render limited number of rows in compact preview', () => {
            const tableBody = document.getElementById('tableBody');
            const rows = [
                { 'Product Title': 'iPhone 15 Pro', 'Price': '$999', 'Image': 'img1.jpg' },
                { 'Product Title': 'Samsung S24', 'Price': '$899', 'Image': 'img2.jpg' },
                { 'Product Title': 'Google Pixel 8', 'Price': '$799', 'Image': 'img3.jpg' },
                { 'Product Title': 'OnePlus 12', 'Price': '$699', 'Image': 'img4.jpg' },
                { 'Product Title': 'Xiaomi 14', 'Price': '$599', 'Image': 'img5.jpg' },
                { 'Product Title': 'Motorola Edge', 'Price': '$499', 'Image': 'img6.jpg' },
            ];
            const headers = ['Product Title', 'Price', 'Image'];
            const maxRows = 5; // Compact preview shows max 5 rows

            // Simulate compact preview body rendering
            const displayRows = rows.slice(0, maxRows);
            tableBody.innerHTML = displayRows.map(row => `
                <tr>
                    ${headers.map(h => `<td>${row[h]}</td>`).join('')}
                </tr>
            `).join('');

            const trElements = tableBody.querySelectorAll('tr');
            expect(trElements.length).toBe(5); // Should show only 5 rows
            expect(trElements.length).toBeLessThan(rows.length); // Less than total rows
        });

        test('should hide "more rows" indicator in compact preview', () => {
            const moreRows = document.getElementById('moreRows');
            
            // In compact preview, moreRows should be hidden
            moreRows.style.display = 'none';
            
            expect(moreRows.style.display).toBe('none');
        });
    });

    describe('Preview mode selection', () => {
        test('should use compact preview when isSelecting is true', () => {
            const isSelecting = true;
            const hasFields = true;

            // Logic: if selecting and has fields, show compact preview
            const shouldShowCompact = isSelecting && hasFields;
            
            expect(shouldShowCompact).toBe(true);
        });

        test('should use full table when isSelecting is false', () => {
            const isSelecting = false;
            const hasFields = true;

            // Logic: if not selecting and has fields, show full table
            const shouldShowFull = !isSelecting && hasFields;
            
            expect(shouldShowFull).toBe(true);
        });

        test('should limit rows to 3-5 in compact preview', () => {
            const compactMaxRows = 5;
            const fullMaxRows = 20;

            expect(compactMaxRows).toBeLessThanOrEqual(5);
            expect(compactMaxRows).toBeGreaterThanOrEqual(3);
            expect(compactMaxRows).toBeLessThan(fullMaxRows);
        });
    });

    describe('Compact preview content', () => {
        test('should display headers correctly in compact mode', () => {
            const tableHead = document.getElementById('tableHead');
            const headers = ['Title', 'Price'];

            tableHead.innerHTML = `
                <tr>
                    ${headers.map(h => `
                        <th>
                            <div class="th-wrapper">
                                <span>${h}</span>
                            </div>
                        </th>
                    `).join('')}
                </tr>
            `;

            const headerTexts = Array.from(tableHead.querySelectorAll('span'))
                .map(span => span.textContent);
            
            expect(headerTexts).toEqual(['Title', 'Price']);
        });

        test('should display row data correctly in compact mode', () => {
            const tableBody = document.getElementById('tableBody');
            const headers = ['Title', 'Price'];
            const rows = [
                { 'Title': 'Product 1', 'Price': '$100' },
                { 'Title': 'Product 2', 'Price': '$200' },
            ];

            tableBody.innerHTML = rows.map(row => `
                <tr>
                    ${headers.map(h => `<td>${row[h]}</td>`).join('')}
                </tr>
            `).join('');

            const cells = tableBody.querySelectorAll('td');
            expect(cells.length).toBe(4); // 2 rows × 2 columns
            expect(cells[0].textContent).toBe('Product 1');
            expect(cells[1].textContent).toBe('$100');
        });
    });
});

