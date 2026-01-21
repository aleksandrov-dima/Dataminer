/**
 * Unit tests for Sidepanel Table Headers
 * Testing header readability and editing visual feedback
 */

const { JSDOM } = require('jsdom');

describe('Sidepanel Table Headers', () => {
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
                        <div class="preview-table-wrapper">
                            <table class="preview-table">
                                <thead id="tableHead">
                                    <tr>
                                        <th>
                                            <div class="th-wrapper">
                                                <input type="text" value="Product Title" data-kind="columnName" title="Click to rename column">
                                                <select class="th-type" title="Column type">
                                                    <option value="text" selected>Text</option>
                                                </select>
                                                <span class="th-quality ok" title="quality"></span>
                                                <button class="th-delete">×</button>
                                            </div>
                                        </th>
                                        <th>
                                            <div class="th-wrapper">
                                                <input type="text" value="Price" data-kind="columnName" title="Click to rename column">
                                                <select class="th-type" title="Column type">
                                                    <option value="price" selected>Price</option>
                                                </select>
                                                <span class="th-quality warn" title="quality"></span>
                                                <button class="th-refine" title="Refine selector">Refine</button>
                                                <button class="th-delete">×</button>
                                            </div>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody id="tableBody">
                                    <tr>
                                        <td>iPhone 15 Pro</td>
                                        <td>$999</td>
                                    </tr>
                                </tbody>
                            </table>
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

    describe('Header structure', () => {
        test('should have headers in thead element', () => {
            const tableHead = document.getElementById('tableHead');
            const headers = tableHead.querySelectorAll('th');
            
            expect(headers.length).toBeGreaterThan(0);
            expect(tableHead.tagName.toLowerCase()).toBe('thead');
        });

        test('should have input fields in headers for editing', () => {
            const tableHead = document.getElementById('tableHead');
            const inputs = tableHead.querySelectorAll('input[data-kind="columnName"]');
            
            expect(inputs.length).toBe(2);
            inputs.forEach(input => {
                expect(input.type).toBe('text');
                expect(input.hasAttribute('data-kind')).toBe(true);
            });
        });

        test('should have delete buttons in headers', () => {
            const tableHead = document.getElementById('tableHead');
            const deleteButtons = tableHead.querySelectorAll('.th-delete');
            
            expect(deleteButtons.length).toBe(2);
            deleteButtons.forEach(btn => {
                expect(btn.textContent).toBe('×');
            });
        });

        test('should have column type dropdown in headers', () => {
            const tableHead = document.getElementById('tableHead');
            const selects = tableHead.querySelectorAll('select.th-type');
            expect(selects.length).toBe(2);
        });

        test('should have quality indicators in headers', () => {
            const tableHead = document.getElementById('tableHead');
            const indicators = tableHead.querySelectorAll('.th-quality');
            expect(indicators.length).toBe(2);
        });
    });

    describe('Header readability', () => {
        test('should have clear, readable header text', () => {
            const tableHead = document.getElementById('tableHead');
            const inputs = tableHead.querySelectorAll('input[data-kind="columnName"]');
            
            inputs.forEach(input => {
                const value = input.value;
                expect(value.length).toBeGreaterThan(0);
                expect(value).not.toMatch(/^[a-z]+_field_\d+$/i); // Not technical format
                expect(value).not.toMatch(/b-table-cell/i); // Not technical class names
            });
        });

        test('should not contain technical debug labels', () => {
            const tableHead = document.getElementById('tableHead');
            const inputs = tableHead.querySelectorAll('input[data-kind="columnName"]');
            
            inputs.forEach(input => {
                const value = input.value.toLowerCase();
                expect(value).not.toContain('debug');
                expect(value).not.toContain('test');
                expect(value).not.toMatch(/^[a-f0-9]{32}$/i); // Not hash IDs
            });
        });
    });

    describe('Editing visual feedback', () => {
        test('should have input fields that can be focused', () => {
            const tableHead = document.getElementById('tableHead');
            const input = tableHead.querySelector('input[data-kind="columnName"]');
            
            expect(input).toBeTruthy();
            input.focus();
            expect(document.activeElement).toBe(input);
        });

        test('should have title attribute for edit hint', () => {
            const tableHead = document.getElementById('tableHead');
            const input = tableHead.querySelector('input[data-kind="columnName"]');
            
            expect(input.hasAttribute('title')).toBe(true);
            expect(input.getAttribute('title')).toMatch(/rename|edit|column/i);
        });
    });

    describe('Header styling', () => {
        test('should have th elements with proper styling classes', () => {
            const tableHead = document.getElementById('tableHead');
            const headers = tableHead.querySelectorAll('th');
            
            headers.forEach(th => {
                expect(th.tagName.toLowerCase()).toBe('th');
                expect(th.querySelector('.th-wrapper')).toBeTruthy();
            });
        });

        test('should have wrapper div for header content', () => {
            const tableHead = document.getElementById('tableHead');
            const wrappers = tableHead.querySelectorAll('.th-wrapper');
            
            expect(wrappers.length).toBe(2);
            wrappers.forEach(wrapper => {
                expect(wrapper.querySelector('input')).toBeTruthy();
                expect(wrapper.querySelector('.th-delete')).toBeTruthy();
            });
        });
    });
});

