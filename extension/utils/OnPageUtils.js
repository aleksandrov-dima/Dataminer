// OnPageUtils: shared logic for content script + Jest (no test hooks).
// UMD-style export: attaches to window in browser; exports via module.exports in Node/Jest.

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DataminerOnPageUtils = factory();
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    function inferDataType(element) {
        if (!element) return 'textContent';
        const tag = (element.tagName || '').toUpperCase();
        if (tag === 'A') return 'href';
        if (tag === 'IMG') return 'src';
        return 'textContent';
    }

    function extractTextFromNode(el) {
        if (!el) return '';
        let txt = (el.textContent || el.innerText || '').trim();
        if (!txt && el.getAttribute) {
            txt = (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('alt') || '').trim();
        }
        return txt;
    }

    function extractHrefFromNode(el) {
        if (!el) return '';
        const a = (el.tagName === 'A' && (el.href || el.getAttribute?.('href'))) ? el : el.querySelector?.('a[href]');
        return (a && (a.href || a.getAttribute?.('href'))) ? (a.href || a.getAttribute('href') || '').trim() : '';
    }

    function extractSrcFromNode(el) {
        if (!el) return '';
        const img = (el.tagName === 'IMG') ? el : el.querySelector?.('img');
        if (!img) return '';
        const src =
            img.src ||
            img.getAttribute?.('src') ||
            img.getAttribute?.('data-src') ||
            img.getAttribute?.('data-original') ||
            '';
        return (src || '').trim();
    }

    return {
        inferDataType,
        extractTextFromNode,
        extractHrefFromNode,
        extractSrcFromNode
    };
});

