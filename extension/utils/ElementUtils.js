// ElementUtils: shared logic for content script + Jest (no test hooks).
// UMD-style export: attaches to window in browser; exports via module.exports in Node/Jest.

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DataScrapingToolElementUtils = factory();
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    function inferDataType(element) {
        if (!element) return 'textContent';
        const tag = (element.tagName || '').toUpperCase();
        if (tag === 'A') return 'href';
        if (tag === 'IMG') return 'src';
        
        // Check if this is a container with an image inside
        try {
            const img = element.querySelector ? element.querySelector('img') : null;
            if (img) {
                // Check if the container's class suggests it's an image wrapper
                const className = (element.className || '').toString().toLowerCase();
                if (className.includes('img') || className.includes('image') || 
                    className.includes('photo') || className.includes('picture') ||
                    className.includes('thumb') || className.includes('preview')) {
                    return 'src';
                }
                // Also check if the container has very little text (mostly image)
                const text = (element.textContent || '').trim();
                if (text.length < 10) {
                    return 'src';
                }
            }
        } catch (e) {}
        
        return 'textContent';
    }

    function extractTextFromNode(el) {
        if (!el) return '';
        
        // Use TextExtractionUtils if available (improved logic)
        if (typeof window !== 'undefined' && window.TextExtractionUtils) {
            return window.TextExtractionUtils.extractTextSmart(el, {
                preferVisible: true,
                maxDepth: 5,
                excludeSelectors: ['script', 'style', 'noscript', 'svg']
            });
        }
        
        // Fallback: legacy logic
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
        
        // Find img element (or the element itself if it's an img)
        const img = (el.tagName === 'IMG') ? el : el.querySelector?.('img');
        if (!img) return '';
        
        // Check all possible image attributes
        // (modern sites use different attributes for lazy loading)
        const possibleAttrs = [
            'src',           // Standard
            'data-src',      // Lazy loading
            'data-src-pb',   // Product Box pattern
            'data-lazy-src', // Lazy loading pattern
            'data-original', // Original image pattern
            'data-srcset',   // Responsive images
            'srcset'         // HTML5 responsive
        ];
        
        // Check each attribute
        for (const attr of possibleAttrs) {
            let value = null;
            
            if (attr === 'src') {
                // For src use direct access (can be blob:)
                value = img.src;
            } else {
                value = img.getAttribute?.(attr);
            }
            
            if (value && value.trim().length > 0) {
                // For srcset - take first URL
                if (attr === 'srcset' || attr === 'data-srcset') {
                    const firstUrl = value.split(',')[0].trim().split(' ')[0];
                    if (firstUrl) return firstUrl.trim();
                }
                return value.trim();
            }
        }
        
        return '';
    }

    return {
        inferDataType,
        extractTextFromNode,
        extractHrefFromNode,
        extractSrcFromNode
    };
});


