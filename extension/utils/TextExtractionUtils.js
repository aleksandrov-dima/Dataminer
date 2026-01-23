// TextExtractionUtils: Smart text extraction from DOM elements
// Solves the problem with nested elements and improves data relevance

class TextExtractionUtils {
    /**
     * Normalize text: trim, remove \n and \t, normalize multiple spaces
     * P1.1: Text normalization
     * @param {string} text - Text to normalize
     * @returns {string} Normalized text
     */
    static normalizeText(text) {
        if (!text || typeof text !== 'string') return '';
        
        return text
            .replace(/\n/g, ' ')  // Remove newlines
            .replace(/\t/g, ' ')  // Remove tabs
            .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
            .trim();              // Trim whitespace
    }

    /**
     * Smart text extraction considering nesting and visibility
     * @param {HTMLElement} element - Element to extract from
     * @param {Object} options - Extraction options
     * @returns {string} Extracted text
     */
    static extractTextSmart(element, options = {}) {
        if (!element) return '';
        
        const {
            preferVisible = true,
            maxDepth = 5,
            excludeSelectors = ['script', 'style', 'noscript', 'svg'],
            separator = null, // If provided, use extractTextWithSeparator
            autoSeparate = true, // Auto-detect when to use separator for block elements
            normalize = true // P1.1: Normalize text by default
        } = options;
        
        // If separator is explicitly provided, use extractTextWithSeparator
        if (separator !== null) {
            const result = this.extractTextWithSeparator(element, { separator, excludeSelectors });
            return normalize ? this.normalizeText(result) : result;
        }
        
        // Strategy 1: Direct textContent (only text nodes, without children)
        const directText = this.getDirectTextContent(element);
        if (directText && directText.length > 0) {
            return normalize ? this.normalizeText(directText) : directText;
        }
        
        // Strategy 1.5: Auto-detect block container that needs separator
        // If element has multiple block-level children, join their texts with separator
        if (autoSeparate) {
            const blockChildren = this.getBlockChildren(element, excludeSelectors);
            if (blockChildren.length > 1) {
                // Element has multiple block children - use separator to prevent text merging
                const result = this.extractTextWithSeparator(element, { 
                    separator: ' | ', 
                    excludeSelectors 
                });
                return normalize ? this.normalizeText(result) : result;
            }
        }
        
        // Strategy 2: Find the most relevant child element
        const bestChild = this.findBestTextElement(element, {
            preferVisible,
            maxDepth,
            excludeSelectors
        });
        
        if (bestChild) {
            const childText = bestChild.textContent?.trim() || '';
            if (childText.length > 0) {
                return normalize ? this.normalizeText(childText) : childText;
            }
        }
        
        // Strategy 3: Fallback - full textContent
        const allText = element.textContent?.trim() || '';
        return normalize ? this.normalizeText(allText) : allText;
    }
    
    /**
     * Get block-level child elements (div, p, section, article, li, etc.)
     * Used to detect containers that should have their children's text separated
     */
    static getBlockChildren(element, excludeSelectors = []) {
        if (!element || !element.children) return [];
        
        const excludeSet = new Set(excludeSelectors.map(s => s.toLowerCase()));
        const blockTags = new Set(['div', 'p', 'section', 'article', 'li', 'ul', 'ol', 'header', 'footer', 'aside', 'nav', 'main']);
        
        return Array.from(element.children).filter(child => {
            const tagName = child.tagName?.toLowerCase();
            if (!tagName || excludeSet.has(tagName)) return false;
            
            // Check if it's a block-level element
            if (blockTags.has(tagName)) return true;
            
            // Also check for elements that behave as blocks (have display: block or flex)
            try {
                const style = typeof getComputedStyle !== 'undefined' ? getComputedStyle(child) : null;
                if (style) {
                    const display = style.display;
                    return display === 'block' || display === 'flex' || display === 'grid';
                }
            } catch (e) {
                // If can't check style, rely on tag name only
            }
            
            return false;
        });
    }
    
    /**
     * Extract text from element with separators between child elements
     * Useful for containers like:
     * <div class="signals-body">
     *   <div>$529.00</div>
     *   <div>Free shipping</div>
     *   <div>75 sold</div>
     * </div>
     * Will return: "$529.00 | Free shipping | 75 sold"
     * 
     * @param {HTMLElement} element - Element to extract from
     * @param {Object} options - Extraction options
     * @returns {string} Extracted text with separators
     */
    static extractTextWithSeparator(element, options = {}) {
        if (!element) return '';
        
        const {
            separator = ' | ',
            excludeSelectors = ['script', 'style', 'noscript', 'svg'],
            minDepth = 1, // Minimum depth to look for separable children
            normalize = true // P1.1: Normalize text by default
        } = options;
        
        const excludeSet = new Set(excludeSelectors.map(s => s.toLowerCase()));
        
        // Check if element has child elements (not just text nodes)
        const childElements = Array.from(element.children || []).filter(child => {
            const tagName = child.tagName?.toLowerCase();
            return tagName && !excludeSet.has(tagName);
        });
        
        // If no child elements, return direct text content
        if (childElements.length === 0) {
            const result = element.textContent?.trim() || '';
            return normalize ? this.normalizeText(result) : result;
        }
        
        // If only one child element, recursively check it
        if (childElements.length === 1) {
            return this.extractTextWithSeparator(childElements[0], options);
        }
        
        // Multiple child elements - extract text from each and join with separator
        const texts = [];
        
        for (const child of childElements) {
            // Get text from child (recursively if needed)
            const childText = this.getTextFromElement(child, excludeSet);
            if (childText && childText.length > 0) {
                texts.push(normalize ? this.normalizeText(childText) : childText);
            }
        }
        
        // Join non-empty texts with separator
        const result = texts.join(separator);
        return normalize ? this.normalizeText(result) : result;
    }
    
    /**
     * Helper method to get text from an element, handling nested structures
     * @param {HTMLElement} element - Element to extract from
     * @param {Set} excludeSet - Set of tag names to exclude
     * @returns {string} Extracted text
     */
    static getTextFromElement(element, excludeSet) {
        if (!element) return '';
        
        const tagName = element.tagName?.toLowerCase();
        if (excludeSet.has(tagName)) return '';
        
        // Get text content (this naturally concatenates all nested text)
        return element.textContent?.trim() || '';
    }
    
    /**
     * Get only direct text nodes (without nested elements)
     * Useful for cases like: <h2>Title<span>Subtitle</span></h2>
     * Will return only "Title", without "Subtitle"
     */
    static getDirectTextContent(element) {
        if (!element || !element.childNodes) return '';
        
        const textNodes = Array.from(element.childNodes)
            .filter(node => node.nodeType === Node.TEXT_NODE)
            .map(node => node.textContent.trim())
            .filter(text => text.length > 0);
        
        return textNodes.join(' ').trim();
    }
    
    /**
     * Find the most relevant element with text
     * Considers: visibility, class semantics, position in tree
     */
    static findBestTextElement(parent, options = {}) {
        if (!parent) return null;
        
        const { preferVisible = true, maxDepth = 5, excludeSelectors = [] } = options;
        
        // Get all descendants up to a certain depth
        const candidates = this.getDescendants(parent, maxDepth, excludeSelectors);
        
        if (candidates.length === 0) return null;
        
        // Filter 1: Only elements with direct text
        const withText = candidates.filter(el => {
            const text = this.getDirectTextContent(el);
            return text && text.length > 0;
        });
        
        if (withText.length === 0) return null;
        
        // Filter 2: Visible elements (optional)
        const filtered = preferVisible 
            ? withText.filter(el => this.isElementVisible(el))
            : withText;
        
        if (filtered.length === 0) {
            // If nothing left after visibility filter, return without filter
            return withText.length > 0 ? this.selectBestCandidate(withText) : null;
        }
        
        // Select best candidate based on relevance
        return this.selectBestCandidate(filtered);
    }
    
    /**
     * Select best candidate from list based on relevance score
     */
    static selectBestCandidate(candidates) {
        if (candidates.length === 0) return null;
        if (candidates.length === 1) return candidates[0];
        
        // Sort by relevance
        const sorted = candidates.sort((a, b) => {
            const scoreA = this.getRelevanceScore(a);
            const scoreB = this.getRelevanceScore(b);
            return scoreB - scoreA;
        });
        
        return sorted[0];
    }
    
    /**
     * Get descendants up to a certain depth
     * Excludes technical elements (script, style, etc.)
     */
    static getDescendants(element, maxDepth, excludeSelectors = []) {
        const result = [];
        const excludeSet = new Set(excludeSelectors.map(s => s.toLowerCase()));
        
        const traverse = (el, depth) => {
            if (depth > maxDepth) return;
            
            if (!el.children) return;
            
            Array.from(el.children).forEach(child => {
                const tagName = child.tagName.toLowerCase();
                if (!excludeSet.has(tagName)) {
                    result.push(child);
                    traverse(child, depth + 1);
                }
            });
        };
        
        traverse(element, 0);
        return result;
    }
    
    /**
     * Relevance score for element based on classes, attributes and tags
     * High score = more likely this is the needed text
     */
    static getRelevanceScore(element) {
        if (!element) return 0;
        
        const className = (element.className?.toString() || '').toLowerCase();
        const id = (element.id || '').toLowerCase();
        const tagName = element.tagName.toLowerCase();
        
        let score = 0;
        
        // High priority (semantic classes for marketplaces)
        const highPriority = [
            'title', 'name', 'brand', 'price', 'heading',
            'product-title', 'item-title', 'product-name',
            'товар', 'название', 'бренд', 'цена'
        ];
        highPriority.forEach(keyword => {
            if (className.includes(keyword) || id.includes(keyword)) score += 10;
        });
        
        // Semantic HTML tags
        const semanticTags = {
            'h1': 10, 'h2': 9, 'h3': 8, 'h4': 7, 'h5': 6, 'h6': 5,
            'strong': 7, 'b': 7, 'em': 5, 'mark': 6,
            'span': 3, 'div': 2, 'p': 5
        };
        if (semanticTags[tagName]) {
            score += semanticTags[tagName];
        }
        
        // Medium priority
        const mediumPriority = [
            'text', 'description', 'label', 'caption', 'subtitle',
            'content', 'info', 'details'
        ];
        mediumPriority.forEach(keyword => {
            if (className.includes(keyword) || id.includes(keyword)) score += 5;
        });
        
        // Bonus for unique semantic classes
        // (not generic like 'a-', 'css-', 'js-')
        const classes = className.split(/\s+/).filter(c => c.length > 0);
        const hasSemanticClass = classes.some(c => {
            return !c.match(/^(a-|css-|js-|_|-|style)/) && c.length > 3;
        });
        if (hasSemanticClass) score += 3;
        
        // Bonus for data attributes (often used for important elements)
        if (element.hasAttribute && (
            element.hasAttribute('data-title') ||
            element.hasAttribute('data-name') ||
            element.hasAttribute('data-label')
        )) {
            score += 5;
        }
        
        // Penalties for elements that probably don't contain main content
        const penalties = [
            'hidden', 'invisible', 'collapsed', 'tooltip', 'hint',
            'popup', 'modal', 'overlay', 'badge', 'icon', 'button',
            'скрытый', 'спрятанный'
        ];
        penalties.forEach(keyword => {
            if (className.includes(keyword) || id.includes(keyword)) score -= 10;
        });
        
        // Penalty for too short text (probably not main content)
        const text = this.getDirectTextContent(element);
        if (text && text.length < 3) {
            score -= 5;
        }
        
        // Bonus for reasonable text length (3-200 characters)
        if (text && text.length >= 3 && text.length <= 200) {
            score += 2;
        }
        
        return score;
    }
    
    /**
     * Check element visibility
     * Uses getBoundingClientRect and getComputedStyle
     */
    static isElementVisible(element) {
        if (!element) return false;
        
        try {
            // Check 1: Dimensions
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return false;
            
            // Check 2: CSS styles
            const style = getComputedStyle(element);
            if (style.display === 'none') return false;
            if (style.visibility === 'hidden') return false;
            if (style.opacity === '0') return false;
            
            // Check 3: Parents are not hidden
            // (only first level to avoid performance issues)
            if (element.parentElement) {
                const parentStyle = getComputedStyle(element.parentElement);
                if (parentStyle.display === 'none') return false;
            }
            
            return true;
        } catch (e) {
            // If can't check - consider visible
            return true;
        }
    }
}

// UMD export for compatibility with browser and Node.js (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TextExtractionUtils;
} else if (typeof window !== 'undefined') {
    window.TextExtractionUtils = TextExtractionUtils;
}
