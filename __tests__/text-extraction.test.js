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

    describe('P1.1: Text normalization', () => {
        test('should normalize text by removing newlines', () => {
            const div = document.createElement('div');
            div.textContent = 'Line 1\nLine 2\nLine 3';
            document.body.appendChild(div);

            const result = TextExtractionUtils.extractTextSmart(div);
            expect(result).not.toContain('\n');
            expect(result).toContain('Line 1');
            expect(result).toContain('Line 2');
            expect(result).toContain('Line 3');
        });

        test('should normalize text by removing tabs', () => {
            const div = document.createElement('div');
            div.textContent = 'Column1\tColumn2\tColumn3';
            document.body.appendChild(div);

            const result = TextExtractionUtils.extractTextSmart(div);
            expect(result).not.toContain('\t');
            expect(result).toContain('Column1');
            expect(result).toContain('Column2');
            expect(result).toContain('Column3');
        });

        test('should normalize multiple spaces to single space', () => {
            const div = document.createElement('div');
            div.textContent = 'Text    with     multiple      spaces';
            document.body.appendChild(div);

            const result = TextExtractionUtils.extractTextSmart(div);
            expect(result).not.toMatch(/\s{2,}/); // No multiple spaces
            expect(result).toContain('Text with multiple spaces');
        });

        test('should trim whitespace from start and end', () => {
            const div = document.createElement('div');
            div.textContent = '   Trimmed text   ';
            document.body.appendChild(div);

            const result = TextExtractionUtils.extractTextSmart(div);
            expect(result).toBe('Trimmed text');
            expect(result).not.toMatch(/^\s+/);
            expect(result).not.toMatch(/\s+$/);
        });

        test('should normalize text with all normalization issues', () => {
            const div = document.createElement('div');
            div.textContent = '  \n\n  Text\twith\n\nmultiple   \t\tspaces  \n\n  ';
            document.body.appendChild(div);

            const result = TextExtractionUtils.extractTextSmart(div);
            expect(result).toBe('Text with multiple spaces');
            expect(result).not.toContain('\n');
            expect(result).not.toContain('\t');
            expect(result).not.toMatch(/\s{2,}/);
        });

        test('normalizeText should handle empty string', () => {
            const result = TextExtractionUtils.normalizeText('');
            expect(result).toBe('');
        });

        test('normalizeText should handle null', () => {
            const result = TextExtractionUtils.normalizeText(null);
            expect(result).toBe('');
        });

        test('normalizeText should handle undefined', () => {
            const result = TextExtractionUtils.normalizeText(undefined);
            expect(result).toBe('');
        });

        test('normalizeText should handle non-string input', () => {
            const result = TextExtractionUtils.normalizeText(123);
            expect(result).toBe('');
        });

        test('normalizeText should normalize complex text', () => {
            const input = '  Hello\n\n\tWorld\t\t  \n\nTest   ';
            const result = TextExtractionUtils.normalizeText(input);
            expect(result).toBe('Hello World Test');
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
