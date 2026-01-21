# Тесты для Data Scraping Tool

## Требования

Для запуска тестов необходим **Node.js** (рекомендуется 16+; на 14+ обычно тоже работает, но зависит от окружения).

Если Node.js не установлен, см. файл `INSTALL.md` для инструкций по установке.

## Установка зависимостей

После установки Node.js выполните:

```bash
npm install
```

## Запуск тестов

```bash
npm test
```

## Описание тестов

### amazon-parsing.test.js

Тесты покрывают ключевые проблемы Amazon-парсинга и “слишком общих” селекторов:

- Фильтрация значений для общих классов (`a-color-base`, `a-size-base`) — не принимать рейтинги/служебный текст как “цену”.
- Контейнеры карточек (Amazon `data-component-type="s-search-result"` и т.п.).
- Сценарии “мультиколоночной” выборки (цена/картинка/название) на уровне DOM.

## Структура тестов

Тесты используют:
- **Jest** - фреймворк для тестирования
- **jsdom** - для создания DOM окружения из HTML файла
- Утилиты из `extension/utils/` (например `TextExtractionUtils`, `ContextUtils`, `ElementUtils`)

## Тестовые данные (fixtures)

В workspace есть папка `Test/` (на уровень выше `Dataminer/`) с HTML/JSON примерами:

- `Test/amazone_clocks.html` и JSON файлы `Test/amazone_ok_*.json`
- `Test/ebay.html` и JSON файлы `Test/ebay_wrong*.json`
- `Test/wildberris.html`

