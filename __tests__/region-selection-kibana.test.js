/**
 * Unit tests for Region Selection - Kibana Table Support
 * Testing table extraction from Kibana-style HTML structure
 */

const { JSDOM } = require('jsdom');

describe('Region Selection - Kibana Table', () => {
    let dom;
    let document;
    let window;
    let contentScript;

    // Simplified Kibana table HTML based on real kibana_table.html structure
    const kibanaTableHtml = `
        <table class="kbn-table table" data-test-subj="docTable">
            <thead>
                <tr data-test-subj="docTableHeader" class="kbnDocTableHeader">
                    <th style="width: 24px;"></th>
                    <th data-test-subj="docTableHeaderField">
                        <span data-test-subj="docTableHeader-@timestamp">Time</span>
                    </th>
                    <th data-test-subj="docTableHeaderField">
                        <span data-test-subj="docTableHeader-__document__">Document</span>
                    </th>
                </tr>
            </thead>
            <tbody>
                <tr data-test-subj="docTableRow" class="kbnDocTable__row">
                    <td class="kbnDocTableCell__toggleDetails">
                        <button type="button" aria-label="Toggle row details">▶</button>
                    </td>
                    <td class="eui-textNoWrap kbnDocTableCell--extraWidth" data-test-subj="docTableField">
                        <div class="truncate-by-height">2026-02-02 21:39:29.545</div>
                        <span class="kbnDocTableCell__filter">
                            <button aria-label="Filter">+</button>
                            <button aria-label="Filter out">-</button>
                        </span>
                    </td>
                    <td class="eui-textBreakAll eui-textBreakWord" data-test-subj="docTableField">
                        <dl class="source truncate-by-height">
                            <dt>@timestamp:</dt><dd class="rowFormatter__value">2026-02-02 21:39:29.545</dd>
                            <dt>beat.hostname:</dt><dd class="rowFormatter__value">dev-kad-docker1.kadlab.local</dd>
                            <dt>beat.name:</dt><dd class="rowFormatter__value">dev-kad-docker1.kadlab.local</dd>
                            <dt>system.network.name:</dt><dd class="rowFormatter__value">docker0</dd>
                            <dt>type:</dt><dd class="rowFormatter__value">metricsets</dd>
                        </dl>
                    </td>
                </tr>
                <tr data-test-subj="docTableRow" class="kbnDocTable__row">
                    <td class="kbnDocTableCell__toggleDetails">
                        <button type="button" aria-label="Toggle row details">▶</button>
                    </td>
                    <td class="eui-textNoWrap kbnDocTableCell--extraWidth" data-test-subj="docTableField">
                        <div class="truncate-by-height">2026-02-02 21:38:15.123</div>
                        <span class="kbnDocTableCell__filter">
                            <button aria-label="Filter">+</button>
                            <button aria-label="Filter out">-</button>
                        </span>
                    </td>
                    <td class="eui-textBreakAll eui-textBreakWord" data-test-subj="docTableField">
                        <dl class="source truncate-by-height">
                            <dt>@timestamp:</dt><dd class="rowFormatter__value">2026-02-02 21:38:15.123</dd>
                            <dt>beat.hostname:</dt><dd class="rowFormatter__value">server2.example.com</dd>
                            <dt>message:</dt><dd class="rowFormatter__value">Connection established successfully</dd>
                            <dt>level:</dt><dd class="rowFormatter__value">INFO</dd>
                        </dl>
                    </td>
                </tr>
            </tbody>
        </table>
    `;

    // Helper to create content script instance with required methods
    function createContentScript() {
        return {
            state: { fields: [] },
            lastPreviewRows: [],
            
            findTableInRegion(elementsInRegion, commonAncestor) {
                for (const el of elementsInRegion) {
                    if (el.tagName === 'TABLE') {
                        return el;
                    }
                    const parentTable = el.closest('table');
                    if (parentTable) {
                        return parentTable;
                    }
                }
                
                let current = commonAncestor;
                while (current && current !== document.body) {
                    if (current.tagName === 'TABLE') {
                        return current;
                    }
                    current = current.parentElement;
                }
                
                const tableInside = commonAncestor.querySelector('table');
                if (tableInside) {
                    return tableInside;
                }
                
                return null;
            },
            
            extractFromHtmlTable(table, rect) {
                // 1. Get header cells
                let headerCells = [];
                const thead = table.querySelector('thead');
                if (thead) {
                    headerCells = Array.from(thead.querySelectorAll('th'));
                }
                
                // 2. Get data rows
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
                
                if (dataRows.length === 0) {
                    return { rows: [], fields: [] };
                }
                
                // 3. Determine column count
                const firstDataRow = dataRows[0];
                const firstRowCells = firstDataRow.querySelectorAll('td, th');
                const colCount = Math.max(headerCells.length, firstRowCells.length);
                
                if (colCount === 0) {
                    return { rows: [], fields: [] };
                }
                
                // 4. Build columns/fields - extract header text properly
                const columns = [];
                const fields = [];
                
                for (let i = 0; i < colCount; i++) {
                    // Extract header text - look for meaningful text, not button labels
                    let headerText = '';
                    if (headerCells[i]) {
                        // Try to find span with data-test-subj first (Kibana specific)
                        const testSubjSpan = headerCells[i].querySelector('[data-test-subj^="docTableHeader-"]');
                        if (testSubjSpan) {
                            headerText = testSubjSpan.textContent.trim();
                        } else {
                            headerText = headerCells[i].textContent.trim();
                        }
                    }
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
                
                // 5. Build rows data - extract FULL text from cells
                const rows = [];
                for (const tr of dataRows) {
                    const cells = tr.querySelectorAll('td, th');
                    const row = {};
                    
                    for (const col of columns) {
                        const cell = cells[col.index];
                        if (cell) {
                            // Extract full text - normalize whitespace
                            let text = cell.textContent || '';
                            text = text.replace(/\n/g, ' ').replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
                            row[col.fieldName] = text;
                        } else {
                            row[col.fieldName] = '';
                        }
                    }
                    
                    rows.push(row);
                }
                
                return { rows, fields };
            }
        };
    }

    beforeEach(() => {
        const html = `
            <!DOCTYPE html>
            <html>
            <head></head>
            <body>
                <div id="container">${kibanaTableHtml}</div>
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

    describe('Kibana table detection', () => {
        test('should find Kibana table in region', () => {
            const table = document.querySelector('table');
            const td = document.querySelector('td');
            
            const result = contentScript.findTableInRegion([td], td);
            expect(result).toBe(table);
        });
    });

    describe('Kibana table extraction', () => {
        test('should extract correct column names from Kibana headers', () => {
            const table = document.querySelector('table');
            const { fields } = contentScript.extractFromHtmlTable(table, null);
            
            expect(fields.length).toBe(3);
            // First column is empty toggle button column
            expect(fields[0].name).toBe('Column 1'); // Empty header
            expect(fields[1].name).toBe('Time');
            expect(fields[2].name).toBe('Document');
        });

        test('should extract all rows from Kibana table', () => {
            const table = document.querySelector('table');
            const { rows } = contentScript.extractFromHtmlTable(table, null);
            
            expect(rows.length).toBe(2);
        });

        test('should extract Time column with date value', () => {
            const table = document.querySelector('table');
            const { rows } = contentScript.extractFromHtmlTable(table, null);
            
            // Time column should contain the date
            expect(rows[0]['Time']).toContain('2026-02-02 21:39:29.545');
            expect(rows[1]['Time']).toContain('2026-02-02 21:38:15.123');
        });

        test('should extract Document column with FULL content (not truncated)', () => {
            const table = document.querySelector('table');
            const { rows } = contentScript.extractFromHtmlTable(table, null);
            
            // Document should contain all the dt:dd pairs
            const doc1 = rows[0]['Document'];
            const doc2 = rows[1]['Document'];
            
            // Row 1: should contain multiple fields
            expect(doc1).toContain('@timestamp:');
            expect(doc1).toContain('2026-02-02 21:39:29.545');
            expect(doc1).toContain('beat.hostname:');
            expect(doc1).toContain('dev-kad-docker1.kadlab.local');
            expect(doc1).toContain('system.network.name:');
            expect(doc1).toContain('docker0');
            expect(doc1).toContain('type:');
            expect(doc1).toContain('metricsets');
            
            // Row 2: should contain different content
            expect(doc2).toContain('server2.example.com');
            expect(doc2).toContain('message:');
            expect(doc2).toContain('Connection established successfully');
            expect(doc2).toContain('level:');
            expect(doc2).toContain('INFO');
        });

        test('Document content should NOT be truncated to 80 characters', () => {
            const table = document.querySelector('table');
            const { rows } = contentScript.extractFromHtmlTable(table, null);
            
            const doc = rows[0]['Document'];
            
            // The full document text is much longer than 80 chars
            expect(doc.length).toBeGreaterThan(80);
            
            // Should NOT end with "..." (truncation marker)
            expect(doc).not.toMatch(/\.\.\.$/);
        });
    });

    describe('Full integration flow', () => {
        test('should extract complete data from Kibana table for export', () => {
            const table = document.querySelector('table');
            const { rows, fields } = contentScript.extractFromHtmlTable(table, null);
            
            // Simulate what export would do
            const exportData = rows.map(row => {
                const exportRow = {};
                fields.forEach(f => {
                    exportRow[f.name] = row[f.name] || '';
                });
                return exportRow;
            });
            
            expect(exportData.length).toBe(2);
            
            // Check first row export
            expect(exportData[0]['Time']).toContain('2026-02-02 21:39:29.545');
            expect(exportData[0]['Document']).toContain('dev-kad-docker1.kadlab.local');
            expect(exportData[0]['Document']).toContain('metricsets');
            
            // Check second row export  
            expect(exportData[1]['Time']).toContain('2026-02-02 21:38:15.123');
            expect(exportData[1]['Document']).toContain('Connection established successfully');
        });

        test('should produce correct CSV export format', () => {
            const table = document.querySelector('table');
            const { rows, fields } = contentScript.extractFromHtmlTable(table, null);
            
            // Simulate CSV generation
            const csvRows = rows.map(row => {
                return fields.map(f => {
                    const val = row[f.name] || '';
                    // CSV escape: wrap in quotes if contains comma/quote/newline
                    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                        return '"' + val.replace(/"/g, '""') + '"';
                    }
                    return val;
                }).join(',');
            });
            
            // Header row
            const headerRow = fields.map(f => f.name).join(',');
            const csv = [headerRow, ...csvRows].join('\n');
            
            // CSV should contain headers
            expect(csv).toContain('Column 1,Time,Document');
            
            // CSV should contain full Document content (not just timestamp)
            expect(csv).toContain('beat.hostname:');
            expect(csv).toContain('dev-kad-docker1.kadlab.local');
            expect(csv).toContain('metricsets');
            expect(csv).toContain('Connection established successfully');
        });

        test('should produce correct JSON export format', () => {
            const table = document.querySelector('table');
            const { rows, fields } = contentScript.extractFromHtmlTable(table, null);
            
            // Simulate JSON export
            const jsonExport = rows.map(row => {
                const exportRow = {};
                fields.forEach(f => {
                    exportRow[f.name] = row[f.name] || '';
                });
                return exportRow;
            });
            
            const json = JSON.stringify(jsonExport, null, 2);
            
            // JSON should be valid
            expect(() => JSON.parse(json)).not.toThrow();
            
            const parsed = JSON.parse(json);
            
            // Check structure
            expect(parsed).toBeInstanceOf(Array);
            expect(parsed.length).toBe(2);
            
            // Check first row has full Document content
            expect(parsed[0]['Document']).toBeDefined();
            expect(parsed[0]['Document'].length).toBeGreaterThan(80);
            expect(parsed[0]['Document']).toContain('beat.hostname:');
            expect(parsed[0]['Document']).toContain('dev-kad-docker1.kadlab.local');
            expect(parsed[0]['Document']).toContain('type:');
            expect(parsed[0]['Document']).toContain('metricsets');
            
            // Document should NOT be just the timestamp
            expect(parsed[0]['Document']).not.toBe('2026-02-02 21:39:29.545');
        });
    });

    describe('Edge cases', () => {
        test('Time column should contain button labels but still have the date', () => {
            // In real Kibana, Time column has filter buttons (+/-) that add extra text
            const table = document.querySelector('table');
            const { rows } = contentScript.extractFromHtmlTable(table, null);
            
            // Time may contain button labels like "+" and "-" but must contain the date
            expect(rows[0]['Time']).toContain('2026-02-02 21:39:29.545');
        });

        test('Document column should contain all key-value pairs', () => {
            const table = document.querySelector('table');
            const { rows } = contentScript.extractFromHtmlTable(table, null);
            
            const doc1 = rows[0]['Document'];
            
            // Should have ALL fields from the dl/dt/dd structure
            const expectedFields = [
                '@timestamp:', 'beat.hostname:', 'beat.name:', 
                'system.network.name:', 'type:'
            ];
            
            for (const field of expectedFields) {
                expect(doc1).toContain(field);
            }
        });
    });
});
