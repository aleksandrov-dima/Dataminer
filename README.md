# Dataminer — Chrome Extension for Simple Web Scraping

Dataminer is a lightweight **Chrome/Edge (Chromium)** extension for extracting data from web pages using **on-page field selection** and exporting the result.

The UI is **English-only** for now (localization will be added later).

## Key features

- **On-page panel UI** (no main popup workflow)
- **Visual field selection**: click elements on the page to add fields
- **Preview before export** (table preview + optional highlight)
- **Export**: CSV and JSON (downloaded via `chrome.downloads` without navigating away)
- **Per-site state**: fields are saved per `origin`

## Installation (developer mode)

1. Open `chrome://extensions/` (or `edge://extensions/`).
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `Dataminer/extension` folder.

Detailed guide (RU): see [`ИНСТРУКЦИЯ_ПО_ЗАПУСКУ.md`](./ИНСТРУКЦИЯ_ПО_ЗАПУСКУ.md).

## Usage

1. Open any website.
2. Click the extension icon to **toggle the on-page panel**.
3. Click **Add field** to enter selecting mode.
4. Click elements on the page to add fields (each click adds a field immediately).
5. Switch to **Preview** to see a sample table.
6. Click **Export CSV** / **Export JSON**.

## Project structure

```
Dataminer/
├── extension/
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── content.css
│   ├── popup.html
│   ├── popup.js
│   ├── popup.css
│   ├── services/
│   │   ├── ScrapingService.js
│   │   └── ToastService.js
│   ├── utils/
│   │   ├── CSVUtils.js
│   │   ├── JSONUtils.js
│   │   └── OnPageUtils.js
│   └── icons/
├── __tests__/
│   └── amazon-parsing.test.js
├── Test/
│   └── Amazon.com _ apple.html
└── ИНСТРУКЦИЯ_ПО_ЗАПУСКУ.md
```

## Development

- **On-page panel / content script**: open DevTools on the page → Console
- **Background service worker**: `chrome://extensions/` → Dataminer → Service worker

## Tests

Requirements: **Node.js 14+**.

```bash
cd Dataminer
npm install
npm test
```

For watch mode:

```bash
npm run test:watch
```

## Legal notice

Use responsibly. Respect website Terms of Service and applicable laws.

## License

MIT
