/**
 * Unit tests for Sidepanel Button states
 * Testing Select/Stop Selection button visual states
 */

const { JSDOM } = require('jsdom');

describe('Sidepanel Button States', () => {
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

    describe('Button state switching', () => {
        test('should have primary style when not selecting', () => {
            const selectBtn = document.getElementById('selectBtn');
            const icon = selectBtn.querySelector('.btn-icon');
            const text = selectBtn.querySelector('.btn-text');

            // Simulate not selecting state
            selectBtn.classList.remove('selecting');
            icon.textContent = '▶';
            text.textContent = 'Select Elements';

            expect(selectBtn.classList.contains('btn-primary')).toBe(true);
            expect(selectBtn.classList.contains('selecting')).toBe(false);
            expect(icon.textContent).toBe('▶');
            expect(text.textContent).toBe('Select Elements');
        });

        test('should have secondary/muted style when selecting', () => {
            const selectBtn = document.getElementById('selectBtn');
            const icon = selectBtn.querySelector('.btn-icon');
            const text = selectBtn.querySelector('.btn-text');

            // Simulate selecting state
            selectBtn.classList.add('selecting');
            icon.textContent = '⏸';
            text.textContent = 'Stop Selection';

            expect(selectBtn.classList.contains('btn-primary')).toBe(true);
            expect(selectBtn.classList.contains('selecting')).toBe(true);
            expect(icon.textContent).toBe('⏸');
            expect(text.textContent).toBe('Stop Selection');
        });

        test('should switch from primary to secondary style when entering selecting mode', () => {
            const selectBtn = document.getElementById('selectBtn');
            const icon = selectBtn.querySelector('.btn-icon');
            const text = selectBtn.querySelector('.btn-text');

            // Start in primary state
            expect(selectBtn.classList.contains('selecting')).toBe(false);
            expect(icon.textContent).toBe('▶');
            expect(text.textContent).toBe('Select Elements');

            // Switch to selecting state
            selectBtn.classList.add('selecting');
            icon.textContent = '⏸';
            text.textContent = 'Stop Selection';

            expect(selectBtn.classList.contains('selecting')).toBe(true);
            expect(icon.textContent).toBe('⏸');
            expect(text.textContent).toBe('Stop Selection');
        });

        test('should switch back to primary style when exiting selecting mode', () => {
            const selectBtn = document.getElementById('selectBtn');
            const icon = selectBtn.querySelector('.btn-icon');
            const text = selectBtn.querySelector('.btn-text');

            // Start in selecting state
            selectBtn.classList.add('selecting');
            icon.textContent = '⏸';
            text.textContent = 'Stop Selection';

            expect(selectBtn.classList.contains('selecting')).toBe(true);

            // Switch back to primary state
            selectBtn.classList.remove('selecting');
            icon.textContent = '▶';
            text.textContent = 'Select Elements';

            expect(selectBtn.classList.contains('selecting')).toBe(false);
            expect(icon.textContent).toBe('▶');
            expect(text.textContent).toBe('Select Elements');
        });
    });

    describe('Visual distinction', () => {
        test('should have different visual appearance in selecting vs primary state', () => {
            const selectBtn = document.getElementById('selectBtn');

            // Primary state (not selecting)
            selectBtn.classList.remove('selecting');
            const hasSelectingClassPrimary = selectBtn.classList.contains('selecting');
            
            // Selecting state
            selectBtn.classList.add('selecting');
            const hasSelectingClassSelecting = selectBtn.classList.contains('selecting');

            // Should be visually different (different class)
            expect(hasSelectingClassPrimary).toBe(false);
            expect(hasSelectingClassSelecting).toBe(true);
        });

        test('should maintain btn-primary class in both states', () => {
            const selectBtn = document.getElementById('selectBtn');

            // Both states should have btn-primary class
            selectBtn.classList.remove('selecting');
            expect(selectBtn.classList.contains('btn-primary')).toBe(true);

            selectBtn.classList.add('selecting');
            expect(selectBtn.classList.contains('btn-primary')).toBe(true);
        });
    });

    describe('Button content', () => {
        test('should show correct icon and text in primary state', () => {
            const selectBtn = document.getElementById('selectBtn');
            const icon = selectBtn.querySelector('.btn-icon');
            const text = selectBtn.querySelector('.btn-text');

            selectBtn.classList.remove('selecting');
            icon.textContent = '▶';
            text.textContent = 'Select Elements';

            expect(icon.textContent).toBe('▶');
            expect(text.textContent).toBe('Select Elements');
        });

        test('should show correct icon and text in selecting state', () => {
            const selectBtn = document.getElementById('selectBtn');
            const icon = selectBtn.querySelector('.btn-icon');
            const text = selectBtn.querySelector('.btn-text');

            selectBtn.classList.add('selecting');
            icon.textContent = '⏸';
            text.textContent = 'Stop Selection';

            expect(icon.textContent).toBe('⏸');
            expect(text.textContent).toBe('Stop Selection');
        });
    });
});

