/**
 * Unit tests for ElementUtils
 */

const { JSDOM } = require('jsdom');

// Load ElementUtils
const ElementUtils = require('../extension/utils/ElementUtils.js');

describe('ElementUtils', () => {
    let dom;
    let document;

    beforeEach(() => {
        dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
        document = dom.window.document;
        global.document = document;
        global.window = dom.window;
    });

    afterEach(() => {
        dom.window.close();
    });

    describe('inferDataType', () => {
        test('should return href for anchor elements', () => {
            const a = document.createElement('a');
            a.href = 'https://example.com';
            
            const result = ElementUtils.inferDataType(a);
            expect(result).toBe('href');
        });

        test('should return src for img elements', () => {
            const img = document.createElement('img');
            img.src = 'https://example.com/image.jpg';
            
            const result = ElementUtils.inferDataType(img);
            expect(result).toBe('src');
        });

        test('should return src for div with img class containing image', () => {
            const div = document.createElement('div');
            div.className = 'product-card__img-wrap';
            const img = document.createElement('img');
            img.src = 'https://example.com/image.jpg';
            div.appendChild(img);
            document.body.appendChild(div);
            
            const result = ElementUtils.inferDataType(div);
            expect(result).toBe('src');
        });

        test('should return textContent for regular div', () => {
            const div = document.createElement('div');
            div.textContent = 'Hello';
            
            const result = ElementUtils.inferDataType(div);
            expect(result).toBe('textContent');
        });

        test('should return textContent for null element', () => {
            const result = ElementUtils.inferDataType(null);
            expect(result).toBe('textContent');
        });
    });

    describe('extractTextFromNode', () => {
        test('should extract text from element', () => {
            const span = document.createElement('span');
            span.textContent = 'Hello World';
            
            const result = ElementUtils.extractTextFromNode(span);
            expect(result).toBe('Hello World');
        });

        test('should extract aria-label when text is empty', () => {
            const button = document.createElement('button');
            button.setAttribute('aria-label', 'Click me');
            
            const result = ElementUtils.extractTextFromNode(button);
            expect(result).toBe('Click me');
        });

        test('should return empty string for null', () => {
            const result = ElementUtils.extractTextFromNode(null);
            expect(result).toBe('');
        });
    });

    describe('extractHrefFromNode', () => {
        test('should extract href from anchor', () => {
            const a = document.createElement('a');
            a.href = 'https://example.com/page';
            
            const result = ElementUtils.extractHrefFromNode(a);
            expect(result).toContain('example.com');
        });

        test('should find anchor inside container', () => {
            const div = document.createElement('div');
            const a = document.createElement('a');
            a.href = 'https://example.com/page';
            div.appendChild(a);
            document.body.appendChild(div);
            
            const result = ElementUtils.extractHrefFromNode(div);
            expect(result).toContain('example.com');
        });

        test('should return empty string for element without link', () => {
            const div = document.createElement('div');
            
            const result = ElementUtils.extractHrefFromNode(div);
            expect(result).toBe('');
        });
    });

    describe('extractSrcFromNode', () => {
        test('should extract src from img', () => {
            const img = document.createElement('img');
            img.src = 'https://example.com/image.jpg';
            
            const result = ElementUtils.extractSrcFromNode(img);
            expect(result).toContain('image.jpg');
        });

        test('should extract data-src for lazy-loaded images', () => {
            const img = document.createElement('img');
            img.setAttribute('data-src', 'https://example.com/lazy.jpg');
            document.body.appendChild(img);
            
            const result = ElementUtils.extractSrcFromNode(img);
            expect(result).toContain('lazy.jpg');
        });

        test('should find img inside container', () => {
            const div = document.createElement('div');
            const img = document.createElement('img');
            img.src = 'https://example.com/image.jpg';
            div.appendChild(img);
            document.body.appendChild(div);
            
            const result = ElementUtils.extractSrcFromNode(div);
            expect(result).toContain('image.jpg');
        });

        test('should extract data-src-pb attribute', () => {
            const img = document.createElement('img');
            img.setAttribute('data-src-pb', 'https://example.com/product.jpg');
            document.body.appendChild(img);
            
            const result = ElementUtils.extractSrcFromNode(img);
            expect(result).toContain('product.jpg');
        });

        test('should return empty string for element without image', () => {
            const div = document.createElement('div');
            
            const result = ElementUtils.extractSrcFromNode(div);
            expect(result).toBe('');
        });
    });
});



