// TextExtractionUtils: Smart text extraction from DOM elements
// Solves the problem with nested elements and improves data relevance

class TextExtractionUtils {
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
            excludeSelectors = ['script', 'style', 'noscript', 'svg']
        } = options;
        
        // Strategy 1: Direct textContent (only text nodes, without children)
        const directText = this.getDirectTextContent(element);
        if (directText && directText.length > 0) {
            return directText;
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
                return childText;
            }
        }
        
        // Strategy 3: Fallback - full textContent
        const allText = element.textContent?.trim() || '';
        return allText;
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
