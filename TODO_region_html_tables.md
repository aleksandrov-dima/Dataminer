# TODO: Поддержка HTML-таблиц в режиме Region

**Цель:** Режим Region должен корректно извлекать данные из таблиц (Kibana, и др.) с явными тегами `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<td>`, `<th>`.

**Источники идей:** Web Scraper (webscraper.io), tabletojson, table-scraper, стандарт HTML.

---

## Этап 1: Определение таблицы в области выбора

**Идея:** Web Scraper — при выборе области автоматически определять таблицу. tabletojson — парсит `table` и `thead`/`tbody`.

- [x] **1.1** Добавить `findTableInRegion(elementsInRegion, commonAncestor)` — искать среди элементов или их предков элемент `<table>`
- [x] **1.2** ~~Добавить `findTableAncestor(commonAncestor)`~~ — объединено в 1.1
- [x] **1.3** Вызывать в `processSelectedRegion` после `findCommonAncestor`; если таблица найдена — переходить к Этапу 2

**Файл:** `extension/content.js` (в `processSelectedRegion`)

---

## Этап 2: Извлечение из HTML-таблицы (`<table>`)

**Идея:** tabletojson / table-scraper — `thead th` для заголовков, `tbody tr` для строк, `td` по индексу. Web Scraper — семантические таблицы с `thead`/`tbody` определяются автоматически.

- [x] **2.1** Добавить `extractFromHtmlTable(table, rect)`:
  - строки: `table.querySelectorAll('tbody tr')` (если `tbody` нет — `table.querySelectorAll('tr')` с исключением `thead tr`)
  - фильтр по `rect` (если нужно): только строки, центр которых в области
- [x] **2.2** Заголовки колонок:
  - если есть `thead`: `table.querySelectorAll('thead th')` — имена колонок из `textContent`
  - если нет — `Column 1`, `Column 2` … по количеству `td` в первой строке
- [x] **2.3** Формат колонок: `{ path: 'td:nth-child(i)', fieldId, fieldName }` — индекс по `td`, не сложный DOM путь

**Файл:** `extension/content.js` (новый метод)

---

## Этап 3: Интеграция с buildRowsFromRegion

**Идея:** Использовать тот же формат `rows`, `fields`, что и для карточек.

- [x] **3.1** `extractFromHtmlTable` возвращает `{ rows: object[], fields: [...] }` — уже готовые данные
- [x] **3.2** ~~buildRowsFromRegion~~ — не нужно, `extractFromHtmlTable` сам строит `rows` с данными по `cells[index]`
- [x] **3.3** ~~buildRowsFromTable~~ — объединено в `extractFromHtmlTable`

**Файл:** `extension/content.js` (buildRowsFromRegion или новый метод)

---

## Этап 4: Порядок проверок в processSelectedRegion

**Идея:** Сначала — таблицы (явная семантика), потом — карточки.

- [x] **4.1** После `findCommonAncestor`:
  1. Проверить `findTableInRegion` → если `table` — вызвать `extractFromHtmlTable`
  2. Иначе — текущая логика (карточки, `detectRepeatingRows`)
- [x] **4.2** При успехе `extractFromHtmlTable` — вызвать `notifySidePanel` с `rows`, `fields`; `return` — не вызывать `detectRepeatingRows` и `detectColumns`

**Файл:** `extension/content.js` (processSelectedRegion)

---

## Этап 5: Поддержка div-based таблиц (ARIA / Kibana)

**Идея:** Kibana/EUI — `role="grid"`, `role="row"`, `role="gridcell"`, `role="columnheader"`.

- [ ] **5.1** Добавить `findGridInRegion(elementsInRegion)` — искать `[role="grid"]`, `[role="table"]`
- [ ] **5.2** Добавить `extractFromAriaGrid(grid, rect)`
- [ ] **5.3** Вставить проверку в `processSelectedRegion`

**Файл:** `extension/content.js`

**Статус:** ⏸️ ОТЛОЖЕНО — Kibana использует стандартный `<table>`, ARIA grid не требуется для текущего кейса.

---

## Этап 6: Тесты

- [x] **6.1** Тест: простая HTML-таблица — 14 тестов в `__tests__/region-selection-table.test.js`
- [x] **6.2** Тест: таблица без `thead` — колонки `Column 1`, `Column 2` ✅
- [ ] **6.3** Тест: div-based grid с `role="grid"` (если реализован Этап 5) — **отложено**
- [ ] **6.4** Интеграционный тест на `Test/kibana_table.html` — **требует реального браузера**

**Файл:** `__tests__/region-selection-table.test.js` ✅ (14 тестов)

---

## Этап 7: Обработка edge cases (по таблицам)

**Идея:** tabletojson — rowspan, colspan, дубликаты заголовков; Web Scraper — таблицы без thead.

- [x] **7.1** Таблица без `tbody` (только `tr` внутри `table`) — реализовано и протестировано
- [x] **7.2** Несколько `tbody` — объединение всех `tbody tr` реализовано и протестировано
- [ ] **7.3** (Опционально) rowspan/colspan — при необходимости, позже

---

## Оценка

| Этап | Сложность | Время |
|------|-----------|-------|
| 1. Определение таблицы | Низкая | ~30 мин |
| 2. extractFromHtmlTable | Средняя | ~1–2 ч |
| 3. Интеграция | Низкая | ~30 мин |
| 4. Порядок проверок | Низкая | ~20 мин |
| 5. ARIA grid | Средняя | ~1 ч |
| 6. Тесты | Низкая | ~1 ч |
| 7. Edge cases | Низкая | ~30 мин |

**MVP (Этапы 1–4, 6):** ✅ ВЫПОЛНЕНО  
**Полная (с 5, 7):** Этап 5 (ARIA) отложен — Kibana использует `<table>`

---

## Статус: ЗАВЕРШЕНО ✅

**Дата:** 29.01.2026

**Реализовано:**
- `findTableInRegion(elementsInRegion, commonAncestor)` — поиск таблицы в области
- `extractFromHtmlTable(table, rect)` — извлечение данных из HTML-таблицы
- Интеграция в `processSelectedRegion` — приоритет таблиц перед карточками
- 14 unit-тестов в `__tests__/region-selection-table.test.js`
- Все 246 тестов проходят

---

## Ссылки

- Web Scraper table selector: https://webscraper.io/documentation/selectors/table-selector
- tabletojson: https://github.com/maugenst/tabletojson
- table-scraper: https://github.com/maxthyen/table-scraper
- HTML table spec: https://html.spec.whatwg.org/multipage/tables.html
