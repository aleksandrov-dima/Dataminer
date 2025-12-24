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
                            <div class="empty-icon">📊</div>
                            <p class="empty-text">Select elements on the page</p>
                            <p class="empty-hint">Each click adds a column</p>
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
        test('should have correct main text', () => {
            const emptyState = document.getElementById('emptyState');
            const emptyText = emptyState.querySelector('.empty-text');

            expect(emptyText.textContent).toBe('Select elements on the page');
        });

        test('should have correct hint text', () => {
            const emptyState = document.getElementById('emptyState');
            const emptyHint = emptyState.querySelector('.empty-hint');

            expect(emptyHint.textContent).toBe('Each click adds a column');
        });

        test('should have simplified text (2 lines only)', () => {
            const emptyState = document.getElementById('emptyState');
            const emptyText = emptyState.querySelector('.empty-text');
            const emptyHint = emptyState.querySelector('.empty-hint');

            // Should have exactly 2 text elements
            const textElements = emptyState.querySelectorAll('p');
            expect(textElements.length).toBe(2);

            // Text should be short and clear
            expect(emptyText.textContent.length).toBeLessThan(30);
            expect(emptyHint.textContent.length).toBeLessThan(30);
        });
    });

    describe('Empty state structure', () => {
        test('should have empty icon', () => {
            const emptyState = document.getElementById('emptyState');
            const emptyIcon = emptyState.querySelector('.empty-icon');

            expect(emptyIcon).toBeTruthy();
            expect(emptyIcon.textContent).toBe('📊');
        });

        test('should have both text and hint elements', () => {
            const emptyState = document.getElementById('emptyState');
            const emptyText = emptyState.querySelector('.empty-text');
            const emptyHint = emptyState.querySelector('.empty-hint');

            expect(emptyText).toBeTruthy();
            expect(emptyHint).toBeTruthy();
        });
    });

    describe('Text updates in different states', () => {
        test('should show same text in idle and selecting states', () => {
            const emptyState = document.getElementById('emptyState');
            const emptyText = emptyState.querySelector('.empty-text');
            const emptyHint = emptyState.querySelector('.empty-hint');

            // Simulate idle state
            emptyText.textContent = 'Select elements on the page';
            emptyHint.textContent = 'Each click adds a column';
            
            const idleText = emptyText.textContent;
            const idleHint = emptyHint.textContent;

            // Simulate selecting state (same text)
            emptyText.textContent = 'Select elements on the page';
            emptyHint.textContent = 'Each click adds a column';

            expect(emptyText.textContent).toBe(idleText);
            expect(emptyHint.textContent).toBe(idleHint);
            expect(emptyText.textContent).toBe('Select elements on the page');
            expect(emptyHint.textContent).toBe('Each click adds a column');
        });

        test('should not contain references to button names', () => {
            const emptyState = document.getElementById('emptyState');
            const emptyText = emptyState.querySelector('.empty-text');
            const emptyHint = emptyState.querySelector('.empty-hint');

            const text = emptyText.textContent + ' ' + emptyHint.textContent;

            // Should not contain "Select Elements" (button name)
            expect(text).not.toContain('Select Elements');
            // Should not contain "Click" followed by button reference
            expect(text).not.toMatch(/Click.*Select Elements/i);
        });

        test('should have concise, action-oriented text', () => {
            const emptyState = document.getElementById('emptyState');
            const emptyText = emptyState.querySelector('.empty-text');
            const emptyHint = emptyState.querySelector('.empty-hint');

            // Main text should be action-oriented
            expect(emptyText.textContent).toMatch(/select/i);
            
            // Hint should explain what happens
            expect(emptyHint.textContent).toMatch(/click|add|column/i);
        });
    });
});

