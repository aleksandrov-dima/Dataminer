/**
 * Unit tests for Region Selection - HTML Table Support
 * Testing table detection and extraction in region mode
 */

const { JSDOM } = require('jsdom');

describe('Region Selection - HTML Table Support', () => {
    let dom;
    let document;
    let window;
    let contentScript;

    // Helper to create content script instance with required methods
    function createContentScript() {
        return {
            state: { fields: [] },
            lastPreviewRows: [],
            
            findTableInRegion(elementsInRegion, commonAncestor) {
                // Strategy 1: Check if any element in region IS a table or is inside a table
                for (const el of elementsInRegion) {
                    if (el.tagName === 'TABLE') {
                        return el;
                    }
                    const parentTable = el.closest('table');
                    if (parentTable) {
                        return parentTable;
                    }
                }
                
                // Strategy 2: Walk up from commonAncestor to find table
                let current = commonAncestor;
                while (current && current !== document.body) {
                    if (current.tagName === 'TABLE') {
                        return current;
                    }
                    current = current.parentElement;
                }
                
                // Strategy 3: Check if LCA contains a table
                const tableInside = commonAncestor.querySelector('table');
                if (tableInside) {
                    return tableInside;
                }
                
                return null;
            },
            
            extractFromHtmlTable(table, rect) {
                // 1. Get header cells (from thead or first row)
                let headerCells = [];
                const thead = table.querySelector('thead');
                if (thead) {
                    headerCells = Array.from(thead.querySelectorAll('th'));
                    if (headerCells.length === 0) {
                        headerCells = Array.from(thead.querySelectorAll('td'));
                    }
                }
                
                // 2. Get data rows (from tbody or table directly)
                let dataRows = [];
                const tbodies = table.querySelectorAll('tbody');
                if (tbodies.length > 0) {
                    for (const tbody of tbodies) {
                        dataRows.push(...Array.from(tbody.querySelectorAll('tr')));
                    }
                } else {
                    dataRows = Array.from(table.querySelectorAll('tr')).filter(tr => {
                        return !tr.closest('thead') && !tr.closest('tfoot');
                    });
                }
                
                // 3. Filter by rect if provided
                if (rect) {
                    dataRows = dataRows.filter(tr => {
                        const trRect = tr.getBoundingClientRect();
                        if (trRect.height === 0) return false;
                        const centerY = trRect.top + trRect.height / 2;
                        return centerY >= rect.top && centerY <= rect.bottom;
                    });
                }
                
                if (dataRows.length === 0) {
                    return { rows: [], fields: [] };
                }
                
                // 4. Determine column count
                const firstDataRow = dataRows[0];
                const firstRowCells = firstDataRow.querySelectorAll('td, th');
                const colCount = Math.max(headerCells.length, firstRowCells.length);
                
                if (colCount === 0) {
                    return { rows: [], fields: [] };
                }
                
                // 5. Build columns/fields
                const columns = [];
                const fields = [];
                
                for (let i = 0; i < colCount; i++) {
                    const headerText = headerCells[i]?.textContent?.trim() || '';
                    const fieldName = headerText || `Column ${i + 1}`;
                    const fieldId = `table_col_${i}`;
                    
                    columns.push({
                        index: i,
                        path: `td:nth-child(${i + 1})`,
                        fieldId: fieldId,
                        fieldName: fieldName
                    });
                    
                    fields.push({
                        id: fieldId,
                        name: fieldName,
                        selector: `td:nth-child(${i + 1})`,
                        dataType: 'text'
                    });
                }
                
                // 6. Build rows data
                const rows = [];
                for (const tr of dataRows) {
                    const cells = tr.querySelectorAll('td, th');
                    const row = {};
                    
                    for (const col of columns) {
                        const cell = cells[col.index];
                        row[col.fieldName] = cell?.textContent?.trim() || '';
                    }
                    
                    rows.push(row);
                }
                
                return { rows, fields };
            },
            
            getDataType(element) {
                if (element.tagName === 'IMG') return 'src';
                if (element.tagName === 'A' && element.href) return 'href';
                return 'text';
            },
            
            getPreviewValue(element, dataType) {
                if (dataType === 'src') return element.src || '';
                if (dataType === 'href') return element.href || '';
                return element.textContent?.trim() || '';
            }
        };
    }

    beforeEach(() => {
        const html = `
            <!DOCTYPE html>
            <html>
            <head></head>
            <body>
                <div id="container"></div>
            </body>
            </html>
        `;
        
        dom = new JSDOM(html, { runScripts: 'outside-only' });
        document = dom.window.document;
        window = dom.window;
        
        global.document = document;
        global.window = window;
        
        contentScript = createContentScript();
    });

    afterEach(() => {
        dom.window.close();
    });

    describe('findTableInRegion', () => {
        test('should find table when table element is in region', () => {
            const container = document.getElementById('container');
            container.innerHTML = `
                <table id="testTable">
                    <thead><tr><th>A</th><th>B</th></tr></thead>
                    <tbody><tr><td>1</td><td>2</td></tr></tbody>
                </table>
            `;
            
            const table = document.getElementById('testTable');
            const elementsInRegion = [table];
            const commonAncestor = container;
            
            const result = contentScript.findTableInRegion(elementsInRegion, commonAncestor);
            expect(result).toBe(table);
        });

        test('should find table when td element is in region', () => {
            const container = document.getElementById('container');
            container.innerHTML = `
                <table id="testTable">
                    <tbody><tr><td id="cell">1</td></tr></tbody>
                </table>
            `;
            
            const cell = document.getElementById('cell');
            const table = document.getElementById('testTable');
            const elementsInRegion = [cell];
            const commonAncestor = cell;
            
            const result = contentScript.findTableInRegion(elementsInRegion, commonAncestor);
            expect(result).toBe(table);
        });

        test('should find table inside commonAncestor', () => {
            const container = document.getElementById('container');
            container.innerHTML = `
                <div id="wrapper">
                    <table id="testTable">
                        <tbody><tr><td>1</td></tr></tbody>
                    </table>
                </div>
            `;
            
            const wrapper = document.getElementById('wrapper');
            const table = document.getElementById('testTable');
            const elementsInRegion = [wrapper];
            const commonAncestor = wrapper;
            
            const result = contentScript.findTableInRegion(elementsInRegion, commonAncestor);
            expect(result).toBe(table);
        });

        test('should return null when no table in region', () => {
            const container = document.getElementById('container');
            container.innerHTML = `
                <div id="noTable">
                    <p>No table here</p>
                </div>
            `;
            
            const div = document.getElementById('noTable');
            const elementsInRegion = [div];
            const commonAncestor = div;
            
            const result = contentScript.findTableInRegion(elementsInRegion, commonAncestor);
            expect(result).toBeNull();
        });
    });

    describe('extractFromHtmlTable - with thead', () => {
        test('should extract headers from thead th elements', () => {
            const container = document.getElementById('container');
            container.innerHTML = `
                <table id="testTable">
                    <thead>
                        <tr><th>Name</th><th>Age</th><th>City</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>Alice</td><td>30</td><td>NYC</td></tr>
                        <tr><td>Bob</td><td>25</td><td>LA</td></tr>
                    </tbody>
                </table>
            `;
            
            const table = document.getElementById('testTable');
            const { rows, fields } = contentScript.extractFromHtmlTable(table, null);
            
            expect(fields.length).toBe(3);
            expect(fields[0].name).toBe('Name');
            expect(fields[1].name).toBe('Age');
            expect(fields[2].name).toBe('City');
            
            expect(rows.length).toBe(2);
            expect(rows[0]['Name']).toBe('Alice');
            expect(rows[0]['Age']).toBe('30');
            expect(rows[0]['City']).toBe('NYC');
            expect(rows[1]['Name']).toBe('Bob');
        });

        test('should generate field IDs correctly', () => {
            const container = document.getElementById('container');
            container.innerHTML = `
                <table id="testTable">
                    <thead><tr><th>A</th><th>B</th></tr></thead>
                    <tbody><tr><td>1</td><td>2</td></tr></tbody>
                </table>
            `;
            
            const table = document.getElementById('testTable');
            const { fields } = contentScript.extractFromHtmlTable(table, null);
            
            expect(fields[0].id).toBe('table_col_0');
            expect(fields[1].id).toBe('table_col_1');
        });
    });

    describe('extractFromHtmlTable - without thead', () => {
        test('should use Column N names when no thead', () => {
            const container = document.getElementById('container');
            container.innerHTML = `
                <table id="testTable">
                    <tbody>
                        <tr><td>Alice</td><td>30</td></tr>
                        <tr><td>Bob</td><td>25</td></tr>
                    </tbody>
                </table>
            `;
            
            const table = document.getElementById('testTable');
            const { rows, fields } = contentScript.extractFromHtmlTable(table, null);
            
            expect(fields.length).toBe(2);
            expect(fields[0].name).toBe('Column 1');
            expect(fields[1].name).toBe('Column 2');
            
            expect(rows.length).toBe(2);
            expect(rows[0]['Column 1']).toBe('Alice');
            expect(rows[0]['Column 2']).toBe('30');
        });

        test('should handle table with only tr (no tbody)', () => {
            const container = document.getElementById('container');
            container.innerHTML = `
                <table id="testTable">
                    <tr><td>Row1</td><td>Data1</td></tr>
                    <tr><td>Row2</td><td>Data2</td></tr>
                </table>
            `;
            
            const table = document.getElementById('testTable');
            const { rows, fields } = contentScript.extractFromHtmlTable(table, null);
            
            expect(fields.length).toBe(2);
            expect(rows.length).toBe(2);
            expect(rows[0]['Column 1']).toBe('Row1');
        });
    });

    describe('extractFromHtmlTable - multiple tbody', () => {
        test('should combine rows from multiple tbody elements', () => {
            const container = document.getElementById('container');
            container.innerHTML = `
                <table id="testTable">
                    <thead><tr><th>Col</th></tr></thead>
                    <tbody>
                        <tr><td>A</td></tr>
                        <tr><td>B</td></tr>
                    </tbody>
                    <tbody>
                        <tr><td>C</td></tr>
                    </tbody>
                </table>
            `;
            
            const table = document.getElementById('testTable');
            const { rows } = contentScript.extractFromHtmlTable(table, null);
            
            expect(rows.length).toBe(3);
            expect(rows[0]['Col']).toBe('A');
            expect(rows[1]['Col']).toBe('B');
            expect(rows[2]['Col']).toBe('C');
        });
    });

    describe('extractFromHtmlTable - empty/edge cases', () => {
        test('should return empty when table has no data rows', () => {
            const container = document.getElementById('container');
            container.innerHTML = `
                <table id="testTable">
                    <thead><tr><th>A</th></tr></thead>
                    <tbody></tbody>
                </table>
            `;
            
            const table = document.getElementById('testTable');
            const { rows, fields } = contentScript.extractFromHtmlTable(table, null);
            
            expect(rows.length).toBe(0);
            expect(fields.length).toBe(0);
        });

        test('should handle empty cells', () => {
            const container = document.getElementById('container');
            container.innerHTML = `
                <table id="testTable">
                    <thead><tr><th>A</th><th>B</th></tr></thead>
                    <tbody>
                        <tr><td>1</td><td></td></tr>
                    </tbody>
                </table>
            `;
            
            const table = document.getElementById('testTable');
            const { rows } = contentScript.extractFromHtmlTable(table, null);
            
            expect(rows[0]['A']).toBe('1');
            expect(rows[0]['B']).toBe('');
        });

        test('should handle rows with fewer cells than headers', () => {
            const container = document.getElementById('container');
            container.innerHTML = `
                <table id="testTable">
                    <thead><tr><th>A</th><th>B</th><th>C</th></tr></thead>
                    <tbody>
                        <tr><td>1</td><td>2</td></tr>
                    </tbody>
                </table>
            `;
            
            const table = document.getElementById('testTable');
            const { rows, fields } = contentScript.extractFromHtmlTable(table, null);
            
            expect(fields.length).toBe(3);
            expect(rows[0]['A']).toBe('1');
            expect(rows[0]['B']).toBe('2');
            expect(rows[0]['C']).toBe('');
        });
    });

    describe('extractFromHtmlTable - with tfoot', () => {
        test('should exclude tfoot rows', () => {
            const container = document.getElementById('container');
            container.innerHTML = `
                <table id="testTable">
                    <thead><tr><th>Col</th></tr></thead>
                    <tbody>
                        <tr><td>Data</td></tr>
                    </tbody>
                    <tfoot>
                        <tr><td>Footer</td></tr>
                    </tfoot>
                </table>
            `;
            
            const table = document.getElementById('testTable');
            const { rows } = contentScript.extractFromHtmlTable(table, null);
            
            expect(rows.length).toBe(1);
            expect(rows[0]['Col']).toBe('Data');
        });
    });

    describe('Integration - full flow simulation', () => {
        test('should detect table and extract data in region selection flow', () => {
            const container = document.getElementById('container');
            container.innerHTML = `
                <div id="page">
                    <h1>Title</h1>
                    <table id="dataTable">
                        <thead>
                            <tr><th>Product</th><th>Price</th></tr>
                        </thead>
                        <tbody>
                            <tr><td>Apple</td><td>$1</td></tr>
                            <tr><td>Banana</td><td>$2</td></tr>
                        </tbody>
                    </table>
                </div>
            `;
            
            // Simulate region selection that includes table cells
            const td = document.querySelector('#dataTable td');
            const elementsInRegion = [td];
            const commonAncestor = td;
            
            // Step 1: Find table
            const table = contentScript.findTableInRegion(elementsInRegion, commonAncestor);
            expect(table).not.toBeNull();
            expect(table.id).toBe('dataTable');
            
            // Step 2: Extract data
            const { rows, fields } = contentScript.extractFromHtmlTable(table, null);
            
            expect(fields.length).toBe(2);
            expect(fields[0].name).toBe('Product');
            expect(fields[1].name).toBe('Price');
            
            expect(rows.length).toBe(2);
            expect(rows[0]['Product']).toBe('Apple');
            expect(rows[0]['Price']).toBe('$1');
            expect(rows[1]['Product']).toBe('Banana');
            expect(rows[1]['Price']).toBe('$2');
        });
    });
});
