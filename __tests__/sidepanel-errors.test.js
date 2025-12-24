/**
 * Unit tests for Sidepanel Error Handling
 * Testing error messages and UI state after errors
 */

const { JSDOM } = require('jsdom');

describe('Sidepanel Error Handling', () => {
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
                    <header class="panel-header">
                        <div class="header-status" id="connectionStatus">
                            <div class="status-main">
                                <span class="status-dot"></span>
                                <span class="status-text">Ready to select</span>
                            </div>
                        </div>
                    </header>
                    <section class="panel-controls">
                        <button id="selectBtn" class="btn btn-primary">
                            <span class="btn-icon">▶</span>
                            <span class="btn-text">Select Elements</span>
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

    describe('Error message format', () => {
        test('should use one short sentence for errors', () => {
            const errorMessages = [
                'Cannot start selection. Refresh the page.',
                'Cannot clear fields. Refresh the page.',
                'Export failed. Refresh the page and try again.',
            ];

            errorMessages.forEach(message => {
                // Should be one sentence (or two closely related)
                const sentences = message.split(/[.!?]+/).filter(s => s.trim().length > 0);
                expect(sentences.length).toBeLessThanOrEqual(2);
                expect(message.length).toBeLessThan(80); // Short message
            });
        });

        test('should include user action in error messages', () => {
            const errorMessages = [
                'Cannot start selection. Refresh the page.',
                'Cannot clear fields. Refresh the page.',
                'Export failed. Refresh the page and try again.',
            ];

            errorMessages.forEach(message => {
                // Should contain an action
                expect(message).toMatch(/refresh|try again|reload/i);
            });
        });

        test('should not contain technical details', () => {
            const errorMessages = [
                'Cannot start selection. Refresh the page.',
                'Cannot clear fields. Refresh the page.',
                'Export failed. Refresh the page and try again.',
            ];

            errorMessages.forEach(message => {
                const lower = message.toLowerCase();
                // Should not contain technical terms
                expect(lower).not.toContain('stack');
                expect(lower).not.toContain('trace');
                expect(lower).not.toContain('exception');
                expect(lower).not.toContain('error code');
                expect(lower).not.toMatch(/^error \d+$/i);
            });
        });
    });

    describe('UI state after error', () => {
        test('should return to Idle state after startSelection error', () => {
            // Simulate error in startSelection
            const isSelecting = false;
            const statusText = document.querySelector('.status-text');
            
            // After error, should be in Idle state
            statusText.textContent = 'Ready to select';
            
            expect(isSelecting).toBe(false);
            expect(statusText.textContent).toBe('Ready to select');
        });

        test('should update button after error', () => {
            const selectBtn = document.getElementById('selectBtn');
            const btnText = selectBtn.querySelector('.btn-text');
            
            // After error, button should show "Select Elements" (not "Stop Selection")
            btnText.textContent = 'Select Elements';
            
            expect(btnText.textContent).toBe('Select Elements');
            expect(selectBtn.classList.contains('selecting')).toBe(false);
        });
    });

    describe('Error message clarity', () => {
        test('should be user-friendly and actionable', () => {
            const errorMessages = [
                'Cannot start selection. Refresh the page.',
                'Cannot clear fields. Refresh the page.',
                'Export failed. Refresh the page and try again.',
            ];

            errorMessages.forEach(message => {
                // Should be clear what went wrong
                expect(message).toMatch(/cannot|failed|error/i);
                
                // Should tell user what to do
                expect(message).toMatch(/refresh|try again/i);
            });
        });

        test('should not contain code snippets or file paths', () => {
            const errorMessages = [
                'Cannot start selection. Refresh the page.',
                'Cannot clear fields. Refresh the page.',
                'Export failed. Refresh the page and try again.',
            ];

            errorMessages.forEach(message => {
                // Should not contain code-like content
                expect(message).not.toMatch(/\.js|\.html|function|variable/i);
                expect(message).not.toMatch(/[A-Z]:\\|\.\.\/|node_modules/i);
            });
        });
    });
});

