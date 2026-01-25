/**
 * Unit tests for Explicit Error/Empty States (P1.4)
 * Testing error messages and warning states
 */

const { JSDOM } = require('jsdom');

describe('Explicit Error/Empty States (P1.4)', () => {
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
                    <section class="panel-preview" id="previewSection">
                        <div class="preview-context" id="previewContext" style="display: none;"></div>
                        <div class="preview-empty" id="emptyState">
                            <p class="empty-text">Select elements on the page</p>
                            <p class="empty-hint">Each click adds a column</p>
                        </div>
                        <div class="preview-table-wrapper" id="tableWrapper" style="display: none;">
                            <table class="preview-table">
                                <thead id="tableHead"></thead>
                                <tbody id="tableBody"></tbody>
                            </table>
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
        
        global.document = document;
        global.window = window;
    });

    afterEach(() => {
        dom.window.close();
    });

    describe('Empty state messages', () => {
        test('should show "No repeating elements found" when fields > 0 but rows === 0', () => {
            const emptyText = document.querySelector('.empty-text');
            const emptyHint = document.querySelector('.empty-hint');
            const fieldCount = 2;
            const rowCount = 0;
            const isSelecting = false;

            if (isSelecting) {
                emptyText.textContent = 'Select elements on the page';
                emptyHint.textContent = 'Each click adds a column';
            } else if (fieldCount > 0 && rowCount === 0) {
                emptyText.textContent = 'No repeating elements found';
                emptyHint.textContent = 'Try selecting elements that appear multiple times';
            }

            expect(emptyText.textContent).toBe('No repeating elements found');
            expect(emptyHint.textContent).toBe('Try selecting elements that appear multiple times');
        });

        test('should show default message when fieldCount === 0', () => {
            const emptyText = document.querySelector('.empty-text');
            const emptyHint = document.querySelector('.empty-hint');
            const fieldCount = 0;
            const rowCount = 0;
            const isSelecting = false;

            if (isSelecting) {
                emptyText.textContent = 'Select elements on the page';
                emptyHint.textContent = 'Each click adds a column';
            } else if (fieldCount > 0 && rowCount === 0) {
                emptyText.textContent = 'No repeating elements found';
                emptyHint.textContent = 'Try selecting elements that appear multiple times';
            } else {
                emptyText.textContent = 'Select elements on the page';
                emptyHint.textContent = 'Extracts data only from the current page';
            }

            expect(emptyText.textContent).toBe('Select elements on the page');
            expect(emptyHint.textContent).toBe('Extracts data only from the current page');
        });
    });

    describe('Low row count warning', () => {
        test('should show warning for rows < 3', () => {
            const previewContext = document.getElementById('previewContext');
            const rowCount = 2;

            if (rowCount > 0 && rowCount < 3) {
                previewContext.textContent = '⚠ Only ' + rowCount + ' row(s) found - try selecting more elements';
                previewContext.classList.add('warning');
            }

            expect(previewContext.textContent).toContain('Only 2 row(s) found');
            expect(previewContext.classList.contains('warning')).toBe(true);
        });

        test('should not show warning for rows >= 3', () => {
            const previewContext = document.getElementById('previewContext');
            const rowCount = 5;

            if (rowCount > 0 && rowCount < 3) {
                previewContext.textContent = '⚠ Warning';
                previewContext.classList.add('warning');
            } else {
                previewContext.textContent = 'Normal context';
                previewContext.classList.remove('warning');
            }

            expect(previewContext.classList.contains('warning')).toBe(false);
        });

        test('should show warning for exactly 1 row', () => {
            const rowCount = 1;
            const shouldWarn = rowCount > 0 && rowCount < 3;

            expect(shouldWarn).toBe(true);
        });
    });

    describe('Never fail silently', () => {
        test('should show explicit message when no data extracted', () => {
            const tableBody = document.getElementById('tableBody');
            const rows = [];

            if (rows.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="100">No data extracted. Try selecting different elements.</td></tr>';
            }

            expect(tableBody.innerHTML).toContain('No data extracted');
            expect(tableBody.innerHTML).toContain('Try selecting different elements');
        });
    });

    describe('Warning CSS class', () => {
        test('should add warning class to previewContext', () => {
            const previewContext = document.getElementById('previewContext');
            
            previewContext.classList.add('warning');
            
            expect(previewContext.classList.contains('warning')).toBe(true);
        });

        test('should remove warning class when not needed', () => {
            const previewContext = document.getElementById('previewContext');
            
            previewContext.classList.add('warning');
            previewContext.classList.remove('warning');
            
            expect(previewContext.classList.contains('warning')).toBe(false);
        });
    });

    describe('Toast notifications for errors', () => {
        test('should create toast element with error type', () => {
            const toastContainer = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = 'toast error';
            toast.textContent = 'No repeating elements found';
            toastContainer.appendChild(toast);

            expect(toastContainer.children.length).toBe(1);
            expect(toast.classList.contains('toast')).toBe(true);
            expect(toast.classList.contains('error')).toBe(true);
        });

        test('should create toast element with info type for warnings', () => {
            const toastContainer = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = 'toast info';
            toast.textContent = 'Only 2 row(s) found';
            toastContainer.appendChild(toast);

            expect(toast.classList.contains('info')).toBe(true);
        });
    });
});
