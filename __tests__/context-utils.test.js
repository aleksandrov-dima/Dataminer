/**
 * Unit tests for ContextUtils (generic selector disambiguation)
 */

const { JSDOM } = require('jsdom');
const ContextUtils = require('../extension/utils/ContextUtils.js');

describe('ContextUtils', () => {
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

    describe('looksLikePrice', () => {
        test('should detect RUB prices', () => {
            expect(ContextUtils.looksLikePrice('RUB 3,690.00')).toBe(true);
            expect(ContextUtils.looksLikePrice('RUB\u00a03,690.00')).toBe(true);
        });

        test('should detect $ prices', () => {
            expect(ContextUtils.looksLikePrice('$19.99')).toBe(true);
            expect(ContextUtils.looksLikePrice('$ 19.99')).toBe(true);
        });

        test('should not treat plain numbers as prices', () => {
            expect(ContextUtils.looksLikePrice('4.4')).toBe(false);
            expect(ContextUtils.looksLikePrice('2585')).toBe(false);
        });

        test('should not treat words as prices', () => {
            expect(ContextUtils.looksLikePrice('Main content')).toBe(false);
            expect(ContextUtils.looksLikePrice('Results')).toBe(false);
        });
    });

    describe('inferRepeatingContainerSelector', () => {
        test('should prefer data-component-type container (Amazon search result)', () => {
            document.body.innerHTML = `
                <div data-component-type="s-search-result" data-asin="A1"><span class="a-color-base">RUB 1,000.00</span></div>
                <div data-component-type="s-search-result" data-asin="A2"><span class="a-color-base">RUB 2,000.00</span></div>
            `;

            const priceEl = document.querySelector('div[data-asin="A1"] span.a-color-base');
            const sel = ContextUtils.inferRepeatingContainerSelector(priceEl);
            expect(sel).toBe('div[data-component-type="s-search-result"]');
            expect(document.querySelectorAll(sel).length).toBe(2);
        });

        test('should skip inner data-component-type widgets and return outer search-result container', () => {
            document.body.innerHTML = `
                <div data-component-type="s-search-result" data-asin="A1">
                    <span data-component-type="s-product-image">
                        <span class="a-color-base">RUB 1,000.00</span>
                    </span>
                </div>
                <div data-component-type="s-search-result" data-asin="A2">
                    <span data-component-type="s-client-side-analytics">
                        <span class="a-color-base">RUB 2,000.00</span>
                    </span>
                </div>
            `;

            const priceEl = document.querySelector('div[data-asin="A1"] span.a-color-base');
            const sel = ContextUtils.inferRepeatingContainerSelector(priceEl);
            expect(sel).toBe('div[data-component-type="s-search-result"]');
            expect(document.querySelectorAll(sel).length).toBe(2);
        });

        test('should find outer container via closest even with deep nesting', () => {
            document.body.innerHTML = `
                <div data-component-type="s-search-result" data-asin="A1">
                    <div><div><div><div><div><div><div><div><div><div><div><div><div><div>
                        <span class="a-color-base">RUB 1,000.00</span>
                    </div></div></div></div></div></div></div></div></div></div></div></div></div></div>
                </div>
                <div data-component-type="s-search-result" data-asin="A2">
                    <div><div><div><div><div><div><div><div><div><div><div><div><div><div>
                        <span class="a-color-base">RUB 2,000.00</span>
                    </div></div></div></div></div></div></div></div></div></div></div></div></div></div>
                </div>
            `;

            const priceEl = document.querySelector('div[data-asin="A1"] span.a-color-base');
            const sel = ContextUtils.inferRepeatingContainerSelector(priceEl);
            expect(sel).toBe('div[data-component-type="s-search-result"]');
            expect(document.querySelectorAll(sel).length).toBe(2);
        });

        test('should fallback to data-asin presence when component type not present', () => {
            document.body.innerHTML = `
                <div data-asin="A1"><span class="a-color-base">RUB 1,000.00</span></div>
                <div data-asin="A2"><span class="a-color-base">RUB 2,000.00</span></div>
            `;

            const priceEl = document.querySelector('div[data-asin="A1"] span.a-color-base');
            const sel = ContextUtils.inferRepeatingContainerSelector(priceEl);
            // Pattern now uses :not([data-asin=""]) to filter empty values
            expect(sel).toBe('div[data-asin]:not([data-asin=""])');
            expect(document.querySelectorAll(sel).length).toBe(2);
        });
    });

    describe('pickBestMatch', () => {
        test('should pick price-like candidate when sample is price and selector is generic', () => {
            document.body.innerHTML = `
                <div data-component-type="s-search-result">
                    <span class="a-color-base a-text-normal">Some title</span>
                    <span class="a-color-base">4.4</span>
                    <span class="a-color-base">RUB 3,690.00</span>
                </div>
            `;

            const container = document.querySelector('div[data-component-type="s-search-result"]');
            const candidates = Array.from(container.querySelectorAll('span.a-color-base'));

            const best = ContextUtils.pickBestMatch(candidates, {
                sampleText: 'RUB 3,690.00',
                sampleTag: 'SPAN',
                sampleClasses: ['a-color-base']
            }, null);

            expect(best).not.toBeNull();
            expect(ContextUtils.normalizeText(best.textContent)).toBe('RUB 3,690.00');
        });

        test('should prefer price-like candidate when preferPriceIfAny is enabled (no sampleText)', () => {
            document.body.innerHTML = `
                <div data-component-type="s-search-result">
                    <span class="a-color-base">4.4</span>
                    <span class="a-color-base">RUB 3,690.00</span>
                </div>
            `;

            const container = document.querySelector('div[data-component-type="s-search-result"]');
            const candidates = Array.from(container.querySelectorAll('span.a-color-base'));

            const best = ContextUtils.pickBestMatch(candidates, {
                sampleText: '',
                sampleTag: 'SPAN',
                sampleClasses: ['a-color-base']
            }, null, { preferPriceIfAny: true });

            expect(best).not.toBeNull();
            expect(ContextUtils.normalizeText(best.textContent)).toBe('RUB 3,690.00');
        });
    });
});

