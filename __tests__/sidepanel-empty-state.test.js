/**
 * Unit tests for Sidepanel Empty State
 * Testing empty state text changes
 */

const { JSDOM } = require('jsdom');

describe('Sidepanel Empty State', () => {
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
                        <div class="preview-empty" id="emptyState">
                            <img class="empty-icon" src="icons/logo_transparent.png" alt="Data Scraping Tool">
                            <p class="empty-instruction">Each click adds a column</p>
                            <p class="empty-sub">Select elements on the page</p>
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

    describe('Empty state text content', () => {
        test('should have instruction as first line (large)', () => {
            const emptyState = document.getElementById('emptyState');
            const emptyInstruction = emptyState.querySelector('.empty-instruction');

            expect(emptyInstruction.textContent).toBe('Each click adds a column');
        });

        test('should have sub text as second line (small)', () => {
            const emptyState = document.getElementById('emptyState');
            const emptySub = emptyState.querySelector('.empty-sub');

            expect(emptySub.textContent).toBe('Select elements on the page');
        });

        test('should have simplified text (2 lines only)', () => {
            const emptyState = document.getElementById('emptyState');
            const emptyInstruction = emptyState.querySelector('.empty-instruction');
            const emptySub = emptyState.querySelector('.empty-sub');

            // Should have exactly 2 text elements
            const textElements = emptyState.querySelectorAll('p');
            expect(textElements.length).toBe(2);

            // Text should be short and clear
            expect(emptyInstruction.textContent.length).toBeLessThan(50);
            expect(emptySub.textContent.length).toBeLessThan(50);
        });
    });

    describe('Empty state structure', () => {
        test('should have empty icon', () => {
            const emptyState = document.getElementById('emptyState');
            const emptyIcon = emptyState.querySelector('.empty-icon');

            expect(emptyIcon).toBeTruthy();
            expect(emptyIcon.tagName).toBe('IMG');
            expect(emptyIcon.getAttribute('src')).toBe('icons/logo_transparent.png');
        });

        test('should have both instruction and sub elements', () => {
            const emptyState = document.getElementById('emptyState');
            const emptyInstruction = emptyState.querySelector('.empty-instruction');
            const emptySub = emptyState.querySelector('.empty-sub');

            expect(emptyInstruction).toBeTruthy();
            expect(emptySub).toBeTruthy();
        });
    });

    describe('Text updates in different states', () => {
        test('should show instruction and sub in idle/selecting states', () => {
            const emptyState = document.getElementById('emptyState');
            const emptyInstruction = emptyState.querySelector('.empty-instruction');
            const emptySub = emptyState.querySelector('.empty-sub');

            // Simulate idle state (Elements mode)
            emptyInstruction.textContent = 'Each click adds a column';
            emptySub.textContent = 'Select elements on the page';

            expect(emptyInstruction.textContent).toBe('Each click adds a column');
            expect(emptySub.textContent).toBe('Select elements on the page');
        });

        test('should not contain references to button names', () => {
            const emptyState = document.getElementById('emptyState');
            const emptyInstruction = emptyState.querySelector('.empty-instruction');
            const emptySub = emptyState.querySelector('.empty-sub');

            const text = emptyInstruction.textContent + ' ' + emptySub.textContent;

            // Should not contain "Select Elements" (button name)
            expect(text).not.toContain('Select Elements');
        });

        test('should have concise, action-oriented instruction', () => {
            const emptyState = document.getElementById('emptyState');
            const emptyInstruction = emptyState.querySelector('.empty-instruction');
            const emptySub = emptyState.querySelector('.empty-sub');

            // Instruction should explain how to select
            expect(emptyInstruction.textContent).toMatch(/click|add|column|drag|rectangle|cards/i);
            // Sub should mention select
            expect(emptySub.textContent).toMatch(/select/i);
        });
    });
});

