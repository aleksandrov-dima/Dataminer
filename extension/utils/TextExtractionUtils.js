// TextExtractionUtils: Умное извлечение текста из DOM элементов
// Решает проблему с вложенными элементами и улучшает релевантность данных

class TextExtractionUtils {
    /**
     * Умное извлечение текста с учётом вложенности и видимости
     * @param {HTMLElement} element - Элемент для извлечения
     * @param {Object} options - Опции извлечения
     * @returns {string} Извлечённый текст
     */
    static extractTextSmart(element, options = {}) {
        if (!element) return '';
        
        const {
            preferVisible = true,
            maxDepth = 5,
            excludeSelectors = ['script', 'style', 'noscript', 'svg']
        } = options;
        
        // Стратегия 1: Прямой textContent (только text nodes, без children)
        const directText = this.getDirectTextContent(element);
        if (directText && directText.length > 0) {
            return directText;
        }
        
        // Стратегия 2: Найти наиболее релевантный дочерний элемент
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
        
        // Стратегия 3: Fallback - весь textContent
        const allText = element.textContent?.trim() || '';
        return allText;
    }
    
    /**
     * Получить только прямые text nodes (без вложенных элементов)
     * Полезно для случаев типа: <h2>Заголовок<span>Подзаголовок</span></h2>
     * Вернёт только "Заголовок", без "Подзаголовок"
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
     * Найти наиболее релевантный элемент с текстом
     * Учитывает: видимость, семантику классов, позицию в дереве
     */
    static findBestTextElement(parent, options = {}) {
        if (!parent) return null;
        
        const { preferVisible = true, maxDepth = 5, excludeSelectors = [] } = options;
        
        // Получить всех потомков до определённой глубины
        const candidates = this.getDescendants(parent, maxDepth, excludeSelectors);
        
        if (candidates.length === 0) return null;
        
        // Фильтр 1: Только элементы с прямым текстом
        const withText = candidates.filter(el => {
            const text = this.getDirectTextContent(el);
            return text && text.length > 0;
        });
        
        if (withText.length === 0) return null;
        
        // Фильтр 2: Видимые элементы (опционально)
        const filtered = preferVisible 
            ? withText.filter(el => this.isElementVisible(el))
            : withText;
        
        if (filtered.length === 0) {
            // Если после фильтра по видимости ничего не осталось, вернём без фильтра
            return withText.length > 0 ? this.selectBestCandidate(withText) : null;
        }
        
        // Выбрать лучшего кандидата на основе релевантности
        return this.selectBestCandidate(filtered);
    }
    
    /**
     * Выбрать лучшего кандидата из списка на основе оценки релевантности
     */
    static selectBestCandidate(candidates) {
        if (candidates.length === 0) return null;
        if (candidates.length === 1) return candidates[0];
        
        // Сортировка по релевантности
        const sorted = candidates.sort((a, b) => {
            const scoreA = this.getRelevanceScore(a);
            const scoreB = this.getRelevanceScore(b);
            return scoreB - scoreA;
        });
        
        return sorted[0];
    }
    
    /**
     * Получить потомков до определённой глубины
     * Исключает технические элементы (script, style, etc.)
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
     * Оценка релевантности элемента на основе классов, атрибутов и тегов
     * Высокий score = более вероятно, что это нужный текст
     */
    static getRelevanceScore(element) {
        if (!element) return 0;
        
        const className = (element.className?.toString() || '').toLowerCase();
        const id = (element.id || '').toLowerCase();
        const tagName = element.tagName.toLowerCase();
        
        let score = 0;
        
        // Высокий приоритет (семантические классы для маркетплейсов)
        const highPriority = [
            'title', 'name', 'brand', 'price', 'heading',
            'product-title', 'item-title', 'product-name',
            'товар', 'название', 'бренд', 'цена'
        ];
        highPriority.forEach(keyword => {
            if (className.includes(keyword) || id.includes(keyword)) score += 10;
        });
        
        // Семантические HTML тэги
        const semanticTags = {
            'h1': 10, 'h2': 9, 'h3': 8, 'h4': 7, 'h5': 6, 'h6': 5,
            'strong': 7, 'b': 7, 'em': 5, 'mark': 6,
            'span': 3, 'div': 2, 'p': 5
        };
        if (semanticTags[tagName]) {
            score += semanticTags[tagName];
        }
        
        // Средний приоритет
        const mediumPriority = [
            'text', 'description', 'label', 'caption', 'subtitle',
            'content', 'info', 'details'
        ];
        mediumPriority.forEach(keyword => {
            if (className.includes(keyword) || id.includes(keyword)) score += 5;
        });
        
        // Бонус за уникальные семантические классы
        // (не общие типа 'a-', 'css-', 'js-')
        const classes = className.split(/\s+/).filter(c => c.length > 0);
        const hasSemanticClass = classes.some(c => {
            return !c.match(/^(a-|css-|js-|_|-|style)/) && c.length > 3;
        });
        if (hasSemanticClass) score += 3;
        
        // Бонус за data-атрибуты (часто используются для важных элементов)
        if (element.hasAttribute && (
            element.hasAttribute('data-title') ||
            element.hasAttribute('data-name') ||
            element.hasAttribute('data-label')
        )) {
            score += 5;
        }
        
        // Штрафы за элементы, которые вероятно не содержат основной контент
        const penalties = [
            'hidden', 'invisible', 'collapsed', 'tooltip', 'hint',
            'popup', 'modal', 'overlay', 'badge', 'icon', 'button',
            'скрытый', 'спрятанный'
        ];
        penalties.forEach(keyword => {
            if (className.includes(keyword) || id.includes(keyword)) score -= 10;
        });
        
        // Штраф за слишком короткий текст (вероятно не основной контент)
        const text = this.getDirectTextContent(element);
        if (text && text.length < 3) {
            score -= 5;
        }
        
        // Бонус за текст разумной длины (3-200 символов)
        if (text && text.length >= 3 && text.length <= 200) {
            score += 2;
        }
        
        return score;
    }
    
    /**
     * Проверка видимости элемента
     * Использует getBoundingClientRect и getComputedStyle
     */
    static isElementVisible(element) {
        if (!element) return false;
        
        try {
            // Проверка 1: Размеры
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return false;
            
            // Проверка 2: CSS стили
            const style = getComputedStyle(element);
            if (style.display === 'none') return false;
            if (style.visibility === 'hidden') return false;
            if (style.opacity === '0') return false;
            
            // Проверка 3: Родители не скрыты
            // (только для первого уровня, чтобы не тормозить)
            if (element.parentElement) {
                const parentStyle = getComputedStyle(element.parentElement);
                if (parentStyle.display === 'none') return false;
            }
            
            return true;
        } catch (e) {
            // Если не можем проверить - считаем видимым
            return true;
        }
    }
}

// UMD export для совместимости с браузером и Node.js (тесты)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TextExtractionUtils;
} else if (typeof window !== 'undefined') {
    window.TextExtractionUtils = TextExtractionUtils;
}
