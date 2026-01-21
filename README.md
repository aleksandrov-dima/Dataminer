# Data Scraping Tool — расширение Chrome/Edge для визуального извлечения данных

Это расширение (Manifest V3) позволяет **выбирать элементы на странице кликами** и получать **табличный предпросмотр** с экспортом в **CSV/JSON** через Side Panel.

**Текущая версия кода расширения:** `1.0.2` (см. `extension/manifest.json`).

## Возможности (по текущему коду)

- **Side Panel**: панель открывается рядом со страницей (Chrome/Edge Side Panel API).
- **Режим выбора**: кнопка **Select Elements** включает/выключает выбор.
- **Подсветка + tooltip** при наведении в режиме выбора (тип данных + превью значения).
- **Каждый клик добавляет колонку** (field) и обновляет предпросмотр.
- **Компактный предпросмотр в Selecting**: только заголовки и до 5 строк.
- **Полная таблица после Stop Selection**: до 20 строк, можно:
  - переименовать колонку (inline input),
  - удалить колонку (кнопка `×` в заголовке).
- **Clear All**: очищает все поля и показывает toast `All fields cleared`.
- **Экспорт**: `Export CSV` / `Export JSON` (скачивание через `chrome.downloads`, есть fallback через `<a download>`).
- **Сохранение состояния per-origin**: поля и настройки сохраняются для каждого `origin` в `chrome.storage.local`.
- **Горячие клавиши**:
  - `Esc` — остановить выбор (в режиме Selecting),
  - `Ctrl+E` / `Cmd+E` — экспорт CSV (когда есть строки в предпросмотре).

> Важно: **auto-select** и **auto-stop** (автозапуск выбора при 0 полях / автоостановка по таймеру) **в текущем коде не реализованы**. Переходы происходят только по действиям пользователя (кнопка/`Esc`).

## Установка (Developer Mode)

1. Откройте `chrome://extensions/` (или `edge://extensions/`).
2. Включите **Developer mode**.
3. Нажмите **Load unpacked**.
4. Выберите папку `Dataminer/extension`.

## Использование (flow: Select → Preview → Export)

1. Откройте сайт с выдачей/списком товаров (Amazon, Wildberries, Ozon, и т.д.).
2. Кликните по иконке расширения — откроется **Side Panel**.
3. Нажмите **Select Elements**.
4. Кликайте по элементам на странице (название/цена/картинка/ссылка) — каждый клик добавляет колонку.
5. Чтобы закончить, нажмите **Stop Selection** (или `Esc`).
6. При необходимости переименуйте/удалите колонки в заголовке таблицы.
7. Нажмите **Export CSV** или **Export JSON**.

## Права (permissions) и безопасность

См. `extension/manifest.json`:

- **permissions**: `activeTab`, `storage`, `scripting`, `downloads`, `sidePanel`
- **host_permissions**: `<all_urls>` (content script и выбор элементов работают на всех сайтах)

## Структура проекта (актуально)

```
Dataminer/
├── extension/
│   ├── manifest.json
│   ├── background.js              # service worker: side panel + downloadFile
│   ├── content.js                 # выбор элементов + предпросмотр + экспорт
│   ├── content.css
│   ├── sidepanel.html
│   ├── sidepanel.js               # UI side panel + управление режимами
│   ├── sidepanel.css
│   ├── utils/
│   │   ├── TextExtractionUtils.js # умное извлечение текста
│   │   ├── ContextUtils.js        # контекст для “слишком общих” селекторов
│   │   ├── ElementUtils.js        # inferDataType + extract* helpers
│   │   ├── CSVUtils.js            # (legacy) утилиты CSV
│   │   └── JSONUtils.js           # (legacy) утилиты JSON
│   └── services/
│       ├── ScrapingService.js     # (legacy/эксперимент) альтернативный scraping flow
│       └── ToastService.js        # (legacy) toast-виджет (в sidepanel сейчас свой)
├── __tests__/
├── CHANGELOG.md
├── generate-icons.js
├── minify-extension.js
├── package.json
└── README.md
```

## Разработка

### Требования

- **Node.js 16+** (для тестов и скриптов)
- Chrome/Edge (Chromium) с Developer mode

### Установка зависимостей

```bash
cd Dataminer
npm install
```

### Полезные команды

```bash
# Тесты
npm test
npm run test:watch

# Генерация иконок из SVG
npm run build:icons

# Минификация (создаёт папку extension-minified/)
npm run minify
```

### Отладка

- **Content script**: DevTools страницы → Console
- **Side Panel**: правый клик по панели → Inspect
- **Background (service worker)**: `chrome://extensions/` → расширение → Service worker

## Ограничения

- Нет автопереходов (auto-select/auto-stop) — только явное управление пользователем.
- Не делает автоскролл/пагинацию — извлекает только то, что уже есть на странице.
- Side Panel требует достаточно свежий Chromium (ориентир: Chrome/Edge 114+).

## Лицензия

MIT
