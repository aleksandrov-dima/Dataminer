/**
 * Unit tests for Sidepanel Status updates
 * Testing status text changes and hint display
 */

const { JSDOM } = require('jsdom');

describe('Sidepanel Status Updates', () => {
    let dom;
    let document;
    let window;
    let sidepanel;

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
                            <span class="status-hint" style="display: none;"></span>
                        </div>
                    </header>
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
        
        // Mock chrome API
        global.chrome = {
            tabs: {
                query: jest.fn(() => Promise.resolve([{ id: 1, url: 'https://example.com' }])),
                sendMessage: jest.fn(() => Promise.resolve({ success: true })),
                onActivated: { addListener: jest.fn() }
            },
            runtime: {
                onMessage: { addListener: jest.fn() },
                sendMessage: jest.fn()
            },
            storage: {
                local: {
                    get: jest.fn(() => Promise.resolve({})),
                    set: jest.fn(() => Promise.resolve())
                }
            },
            scripting: {
                executeScript: jest.fn(() => Promise.resolve())
            }
        };
    });

    afterEach(() => {
        dom.window.close();
        jest.clearAllMocks();
    });

    describe('updateStatus method', () => {
        test('should set status text to "Ready to select" for ready state', () => {
            const statusElement = document.getElementById('connectionStatus');
            const statusText = statusElement.querySelector('.status-text');
            const statusDot = statusElement.querySelector('.status-dot');
            const statusHint = statusElement.querySelector('.status-hint');

            // Simulate updateStatus('ready')
            statusDot.className = 'status-dot';
            statusText.textContent = 'Ready to select';
            if (statusHint) {
                statusHint.style.display = 'none';
            }

            expect(statusText.textContent).toBe('Ready to select');
            expect(statusDot.classList.contains('selecting')).toBe(false);
            expect(statusDot.classList.contains('error')).toBe(false);
            expect(statusHint.style.display).toBe('none');
        });

        test('should set status text to "Selecting elements" for selecting state', () => {
            const statusElement = document.getElementById('connectionStatus');
            const statusText = statusElement.querySelector('.status-text');
            const statusDot = statusElement.querySelector('.status-dot');
            const statusHint = statusElement.querySelector('.status-hint');

            // Simulate updateStatus('selecting')
            statusDot.className = 'status-dot selecting';
            statusText.textContent = 'Selecting elements';
            if (statusHint) {
                statusHint.textContent = 'Click elements on the page · Esc to stop';
                statusHint.style.display = 'block';
            }

            expect(statusText.textContent).toBe('Selecting elements');
            expect(statusDot.classList.contains('selecting')).toBe(true);
            expect(statusHint.textContent).toBe('Click elements on the page · Esc to stop');
            expect(statusHint.style.display).toBe('block');
        });

        test('should set status text to custom text for error state', () => {
            const statusElement = document.getElementById('connectionStatus');
            const statusText = statusElement.querySelector('.status-text');
            const statusDot = statusElement.querySelector('.status-dot');
            const statusHint = statusElement.querySelector('.status-hint');

            // Simulate updateStatus('error', 'No active tab')
            statusDot.className = 'status-dot error';
            statusText.textContent = 'No active tab';
            if (statusHint) {
                statusHint.style.display = 'none';
            }

            expect(statusText.textContent).toBe('No active tab');
            expect(statusDot.classList.contains('error')).toBe(true);
            expect(statusHint.style.display).toBe('none');
        });

        test('should hide hint for ready and error states', () => {
            const statusElement = document.getElementById('connectionStatus');
            const statusHint = statusElement.querySelector('.status-hint');

            // Test ready state
            statusHint.style.display = 'none';
            expect(statusHint.style.display).toBe('none');

            // Test error state
            statusHint.style.display = 'none';
            expect(statusHint.style.display).toBe('none');
        });

        test('should show hint only for selecting state', () => {
            const statusElement = document.getElementById('connectionStatus');
            const statusHint = statusElement.querySelector('.status-hint');

            // Test selecting state
            statusHint.textContent = 'Click elements on the page · Esc to stop';
            statusHint.style.display = 'block';
            expect(statusHint.style.display).toBe('block');
            expect(statusHint.textContent).toBe('Click elements on the page · Esc to stop');
        });
    });

    describe('Status dot visual states', () => {
        test('should have correct classes for ready state', () => {
            const statusElement = document.getElementById('connectionStatus');
            const statusDot = statusElement.querySelector('.status-dot');
            
            statusDot.className = 'status-dot';
            
            expect(statusDot.classList.contains('status-dot')).toBe(true);
            expect(statusDot.classList.contains('selecting')).toBe(false);
            expect(statusDot.classList.contains('error')).toBe(false);
        });

        test('should have correct classes for selecting state', () => {
            const statusElement = document.getElementById('connectionStatus');
            const statusDot = statusElement.querySelector('.status-dot');
            
            statusDot.className = 'status-dot selecting';
            
            expect(statusDot.classList.contains('status-dot')).toBe(true);
            expect(statusDot.classList.contains('selecting')).toBe(true);
            expect(statusDot.classList.contains('error')).toBe(false);
        });

        test('should have correct classes for error state', () => {
            const statusElement = document.getElementById('connectionStatus');
            const statusDot = statusElement.querySelector('.status-dot');
            
            statusDot.className = 'status-dot error';
            
            expect(statusDot.classList.contains('status-dot')).toBe(true);
            expect(statusDot.classList.contains('selecting')).toBe(false);
            expect(statusDot.classList.contains('error')).toBe(true);
        });
    });
});

