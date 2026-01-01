/**
 * Unit tests for TextExtractionUtils
 */

const { JSDOM } = require('jsdom');

// Load TextExtractionUtils
const TextExtractionUtils = require('../extension/utils/TextExtractionUtils.js');

describe('TextExtractionUtils', () => {
    let dom;
    let document;

    beforeEach(() => {
        dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
        document = dom.window.document;
        global.document = document;
        global.window = dom.window;
        global.Node = dom.window.Node;
        global.getComputedStyle = dom.window.getComputedStyle;
    });

    afterEach(() => {
        dom.window.close();
    });

    describe('extractTextSmart', () => {
        test('should extract direct text content', () => {
            const div = document.createElement('div');
            div.textContent = 'Hello World';
            document.body.appendChild(div);

            const result = TextExtractionUtils.extractTextSmart(div);
            expect(result).toBe('Hello World');
        });

        test('should extract text from nested span inside h2', () => {
            const h2 = document.createElement('h2');
            h2.className = 'a-size-mini';
            const span = document.createElement('span');
            span.textContent = 'Logitech';
            h2.appendChild(span);
            document.body.appendChild(h2);

            const result = TextExtractionUtils.extractTextSmart(h2);
            expect(result).toBe('Logitech');
        });

        test('should prefer semantic class elements', () => {
            const div = document.createElement('div');
            div.innerHTML = `
                <span class="hidden">Hidden text</span>
                <span class="product-title">Product Name</span>
            `;
            document.body.appendChild(div);

            const result = TextExtractionUtils.extractTextSmart(div);
            expect(result).toContain('Product Name');
        });

        test('should return empty string for null element', () => {
            const result = TextExtractionUtils.extractTextSmart(null);
            expect(result).toBe('');
        });

        test('should handle elements with only whitespace', () => {
            const div = document.createElement('div');
            div.textContent = '   ';
            document.body.appendChild(div);

            const result = TextExtractionUtils.extractTextSmart(div);
            expect(result).toBe('');
        });
    });

    describe('getDirectTextContent', () => {
        test('should get only direct text nodes', () => {
            const div = document.createElement('div');
            div.innerHTML = 'Direct text<span>Nested text</span>';
            document.body.appendChild(div);

            const result = TextExtractionUtils.getDirectTextContent(div);
            expect(result).toBe('Direct text');
        });

        test('should return empty for element with only child elements', () => {
            const div = document.createElement('div');
            div.innerHTML = '<span>Only nested</span>';
            document.body.appendChild(div);

            const result = TextExtractionUtils.getDirectTextContent(div);
            expect(result).toBe('');
        });
    });

    describe('extractTextWithSeparator', () => {
        test('should separate text from sibling elements', () => {
            const div = document.createElement('div');
            div.innerHTML = `
                <div>First</div>
                <div>Second</div>
                <div>Third</div>
            `;
            document.body.appendChild(div);

            const result = TextExtractionUtils.extractTextWithSeparator(div, { separator: ' | ' });
            expect(result).toBe('First | Second | Third');
        });

        test('should handle single child element', () => {
            const div = document.createElement('div');
            div.innerHTML = '<span>Only child</span>';
            document.body.appendChild(div);

            const result = TextExtractionUtils.extractTextWithSeparator(div, { separator: ' | ' });
            expect(result).toBe('Only child');
        });

        test('should return text for element without children', () => {
            const span = document.createElement('span');
            span.textContent = 'Plain text';
            document.body.appendChild(span);

            const result = TextExtractionUtils.extractTextWithSeparator(span, { separator: ' | ' });
            expect(result).toBe('Plain text');
        });

        test('should use custom separator', () => {
            const div = document.createElement('div');
            div.innerHTML = '<div>A</div><div>B</div>';
            document.body.appendChild(div);

            const result = TextExtractionUtils.extractTextWithSeparator(div, { separator: ', ' });
            expect(result).toBe('A, B');
        });

        test('should return empty string for null element', () => {
            const result = TextExtractionUtils.extractTextWithSeparator(null);
            expect(result).toBe('');
        });

        test('should skip empty child elements', () => {
            const div = document.createElement('div');
            div.innerHTML = '<div>First</div><div>   </div><div>Third</div>';
            document.body.appendChild(div);

            const result = TextExtractionUtils.extractTextWithSeparator(div, { separator: ' | ' });
            expect(result).toBe('First | Third');
        });
    });

    describe('getRelevanceScore', () => {
        test('should give high score to title class', () => {
            const span = document.createElement('span');
            span.className = 'product-title';
            span.textContent = 'Test';
            document.body.appendChild(span);

            const score = TextExtractionUtils.getRelevanceScore(span);
            expect(score).toBeGreaterThan(10);
        });

        test('should give high score to h1 tag', () => {
            const h1 = document.createElement('h1');
            h1.textContent = 'Heading';
            document.body.appendChild(h1);

            const score = TextExtractionUtils.getRelevanceScore(h1);
            expect(score).toBeGreaterThan(5);
        });

        test('should penalize hidden class', () => {
            // Create a visible span for comparison
            const visibleSpan = document.createElement('span');
            visibleSpan.className = 'product-title';
            visibleSpan.textContent = 'Test';
            document.body.appendChild(visibleSpan);
            
            // Create a hidden span
            const hiddenSpan = document.createElement('span');
            hiddenSpan.className = 'hidden';
            hiddenSpan.textContent = 'Test';
            document.body.appendChild(hiddenSpan);

            const visibleScore = TextExtractionUtils.getRelevanceScore(visibleSpan);
            const hiddenScore = TextExtractionUtils.getRelevanceScore(hiddenSpan);
            
            // Hidden should have lower score than visible
            expect(hiddenScore).toBeLessThan(visibleScore);
        });
    });
});
