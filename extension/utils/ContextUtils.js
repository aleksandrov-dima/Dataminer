// ContextUtils: Helpers for choosing correct elements when selectors are too generic.
// Example: Amazon `.a-color-base` exists in many places; we need to pick the right one
// within the repeating product container.

class ContextUtils {
    static normalizeText(text) {
        return String(text || '')
            .replace(/\u00a0/g, ' ') // nbsp
            .replace(/\s+/g, ' ')
            .trim();
    }

    static looksLikePrice(text) {
        const t = this.normalizeText(text).toLowerCase();
        if (!t) return false;

        // Currency markers: $, €, £, ₽ or currency codes.
        const hasCurrency = /(\$|€|£|₽|\brub\b|\busd\b|\beur\b|\bgbp\b|\bchf\b|\bjpy\b)/i.test(t);
        // Number-like with separators.
        const hasNumber = /\d[\d\s.,]*\d|\d/.test(t);

        // Amazon often shows "RUB 3,690.00" or "$19.99"
        return hasCurrency && hasNumber;
    }

    static getClassSet(el) {
        const cls = (el?.className?.toString() || '').split(/\s+/).filter(Boolean);
        return new Set(cls.map(c => c.toLowerCase()));
    }

    /**
     * Infer a repeating container selector for a chosen element.
     * We prefer semantic repeating wrappers (Amazon uses data-component-type="s-search-result").
     *
     * Returns a CSS selector string or null.
     */
    static inferRepeatingContainerSelector(element) {
        if (!element) return null;

        // List of container patterns to try, in priority order
        // Each pattern: { selector, minCount, validate? }
        const patterns = [
            // Amazon patterns
            { selector: '[data-component-type="s-search-result"]', minCount: 2 },
            { selector: '[data-asin]:not([data-asin=""])', minCount: 2 },
            { selector: '.s-result-item.s-asin', minCount: 2 },
            { selector: '.s-result-item', minCount: 2 },
            
            // eBay patterns
            { selector: '.s-item', minCount: 2 },
            { selector: '[data-viewport]', minCount: 2 },
            { selector: '.brwrvr__item-card', minCount: 2 },
            
            // Wildberries patterns (2024+ structure)
            // Main card container with data attribute
            { selector: 'article.product-card[data-nm-id]', minCount: 2 },
            { selector: 'article.product-card', minCount: 2 },
            { selector: '[data-nm-id]', minCount: 2 },
            { selector: '.product-card', minCount: 2 },
            // Card wrapper
            { selector: '.product-card__wrapper', minCount: 2 },
            
            // Generic patterns
            { selector: 'article.product', minCount: 2 },
            { selector: 'li.product', minCount: 2 },
            { selector: '[data-product-id]', minCount: 2 },
            { selector: '[data-item-id]', minCount: 2 },
            { selector: '.product-item', minCount: 2 },
            { selector: '.product-card', minCount: 2 },
            { selector: '.item-card', minCount: 2 },
            { selector: 'article', minCount: 3 },
            { selector: 'li', minCount: 5 }
        ];

        // Get document from element (works in both browser and JSDOM)
        const doc = element.ownerDocument || document;
        
        // Try each pattern with closest()
        for (const pattern of patterns) {
            try {
                const container = element.closest?.(pattern.selector);
                if (container) {
                    // Build the selector for this type of container
                    const tag = (container.tagName || 'div').toLowerCase();
                    let containerSelector = pattern.selector;
                    
                    // For simple class/tag patterns, add the tag
                    if (containerSelector.startsWith('.') || containerSelector.startsWith('[')) {
                        containerSelector = `${tag}${containerSelector}`;
                    }
                    
                    // Verify this selector finds multiple containers on the page
                    const allContainers = doc.querySelectorAll(containerSelector);
                    if (allContainers && allContainers.length >= pattern.minCount) {
                        return containerSelector;
                    }
                }
            } catch (e) {}
        }

        // Fallback: walk up the tree looking for repeating siblings
        const maxDepth = 15;
        let current = element;
        let depth = 0;
        const docBody = doc.body;

        while (current && current !== docBody && depth < maxDepth) {
            const parent = current.parentElement;
            if (!parent) break;
            
            const tag = (current.tagName || '').toLowerCase();
            if (!tag || tag === 'html' || tag === 'body' || tag === 'a') {
                current = parent;
                depth++;
                continue;
            }

            // Check if this element has siblings with same structure
            const className = this.getSignificantClass(current);
            if (className) {
                const siblingSelector = `${tag}.${className}`;
                try {
                    const siblings = parent.querySelectorAll(`:scope > ${siblingSelector}`);
                    if (siblings.length >= 2) {
                        // Verify at page level
                        const pageCount = doc.querySelectorAll(siblingSelector).length;
                        if (pageCount >= 2) {
                            return siblingSelector;
                        }
                    }
                } catch (e) {}
            }

            current = parent;
            depth++;
        }

        return null;
    }
    
    /**
     * Get the most significant class from an element (for container detection)
     */
    static getSignificantClass(element) {
        const className = (element.className?.toString() || '');
        const classes = className.split(/\s+/).filter(c => 
            c.length > 2 && 
            c.length < 30 &&
            !/^[a-z0-9]{15,}$/i.test(c) && // Skip hash-like
            !c.startsWith('sg-col') // Skip grid classes
        );
        
        // Prefer semantic classes
        const semantic = classes.find(c => {
            const lower = c.toLowerCase();
            return lower.includes('item') || lower.includes('card') || 
                   lower.includes('product') || lower.includes('result') ||
                   lower.includes('listing');
        });
        
        return semantic || classes[0] || null;
    }

    /**
     * Pick the best element from candidates based on a sample (the originally selected element).
     * If sample looks like a price, strongly prefer candidates that also look like a price.
     */
    static pickBestMatch(candidates, sample, textUtils = null, options = {}) {
        if (!Array.isArray(candidates) || candidates.length === 0) return null;
        if (candidates.length === 1) return candidates[0];

        const sampleText = this.normalizeText(sample?.sampleText || '');
        const sampleTag = (sample?.sampleTag || '').toUpperCase();
        const sampleClasses = new Set((sample?.sampleClasses || []).map(c => String(c || '').toLowerCase()));
        const sampleIsPrice = this.looksLikePrice(sampleText);
        const preferPriceIfAny = options?.preferPriceIfAny === true;

        const scoreOne = (el) => {
            if (!el) return -1e9;

            let score = 0;

            // Prefer same tag
            if (sampleTag && el.tagName === sampleTag) score += 5;

            // Prefer shared classes (works well when user clicked a specific styled element)
            if (sampleClasses.size > 0) {
                const elClasses = this.getClassSet(el);
                let shared = 0;
                for (const c of sampleClasses) if (elClasses.has(c)) shared++;
                score += shared * 3;
            }

            // Prefer exact / similar text
            const elText = textUtils?.extractTextSmart
                ? this.normalizeText(textUtils.extractTextSmart(el, { autoSeparate: true }))
                : this.normalizeText(el.textContent);

            if (sampleText && elText === sampleText) score += 50;

            // If sample is price: hard filter/boost
            if (sampleIsPrice) {
                const candIsPrice = this.looksLikePrice(elText);
                if (!candIsPrice) score -= 200;
                else score += 30;
            } else if (preferPriceIfAny) {
                // For very generic selectors (e.g. Amazon a-color-base) we can prefer price-like values
                // even if sampleText is missing (e.g. restored state).
                const candIsPrice = this.looksLikePrice(elText);
                if (candIsPrice) score += 25;
                else score -= 25;
            }

            // Prefer shorter, “atomic” values for generic selectors.
            const len = elText.length;
            if (len > 0 && len <= 40) score += 5;
            if (len > 120) score -= 10;

            // Use TextExtractionUtils relevance if available
            if (textUtils?.getRelevanceScore) {
                score += (textUtils.getRelevanceScore(el) || 0);
            }

            return score;
        };

        let best = candidates[0];
        let bestScore = scoreOne(best);

        for (let i = 1; i < candidates.length; i++) {
            const s = scoreOne(candidates[i]);
            if (s > bestScore) {
                bestScore = s;
                best = candidates[i];
            }
        }

        return best;
    }
}

// UMD export for compatibility with browser and Node.js (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ContextUtils;
} else if (typeof window !== 'undefined') {
    window.ContextUtils = ContextUtils;
}

