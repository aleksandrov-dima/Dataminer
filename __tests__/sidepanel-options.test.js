/**
 * Unit tests for Sidepanel Export Options section
 */

const { JSDOM } = require('jsdom');

describe('Sidepanel Export Options', () => {
    let dom;
    let document;

    beforeEach(() => {
        const html = `
            <!DOCTYPE html>
            <html>
            <body>
                <section class="panel-options">
                    <label class="opt">
                        <input type="checkbox" id="optRemoveEmpty" checked>
                        <span>Remove empty rows</span>
                    </label>
                    <label class="opt">
                        <input type="checkbox" id="optDedup">
                        <span>Remove duplicate rows</span>
                    </label>
                    <label class="opt">
                        <input type="checkbox" id="optNormPrice">
                        <span>Export normalized prices</span>
                    </label>
                </section>
            </body>
            </html>
        `;

        dom = new JSDOM(html, { runScripts: 'outside-only' });
        document = dom.window.document;
        global.document = document;
        global.window = dom.window;
    });

    afterEach(() => {
        dom.window.close();
    });

    test('should have all option checkboxes', () => {
        expect(document.getElementById('optRemoveEmpty')).toBeTruthy();
        expect(document.getElementById('optDedup')).toBeTruthy();
        expect(document.getElementById('optNormPrice')).toBeTruthy();
    });

    test('remove empty rows should be checked by default', () => {
        const el = document.getElementById('optRemoveEmpty');
        expect(el.checked).toBe(true);
    });
});

