# Dataminer — Chrome Extension for Simple Web Scraping

**Dataminer v0.1.2** is a lightweight **Chrome/Edge (Chromium)** extension for extracting data from web pages using **on-page field selection** and exporting the result.

> 🎯 **Tested and working on**: Amazon, Wildberries, Ozon, AliExpress

## Key Features

- **On-page panel UI** — no popup workflow, everything happens on the page
- **Visual field selection** — click elements to add fields
- **Smart extraction** — handles nested elements, image containers, lazy-loaded content
- **Auto-detect data types** — text, links, images
- **Preview before export** — table preview with optional highlighting
- **Export** — CSV and JSON (downloaded via `chrome.downloads`)
- **Per-site state** — fields are saved per `origin`

## Installation (Developer Mode)

1. Open `chrome://extensions/` (or `edge://extensions/`)
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `Dataminer/extension` folder

## Usage

1. Open any website (e.g., Amazon, Wildberries, Ozon)
2. Click the extension icon to **toggle the on-page panel**
3. Click **Add field** to enter selection mode
4. Click elements on the page to add fields (each click adds a field immediately)
5. Switch to **Preview** to see a sample table
6. Click **Export CSV** / **Export JSON**

### Debug Mode

To enable detailed logging (useful for troubleshooting):

```javascript
// In browser Console:
localStorage.setItem('dataminer_debug', 'true');
// Then refresh the page
```

## What's New in v0.1.2

### 🔧 Fixes
- **Wildberries support** — parent container detection now works correctly
- **Image extraction** — auto-detects image containers (`div.product-card__img-wrap`)
- **Sibling elements** — finds fields in sibling containers
- **UI text visibility** — fixed on Ozon and other sites with custom styles

### ✨ Improvements
- Smart parent container detection (`findCommonParent`)
- Dynamic content waiting (lazy-load support)
- Better field naming (semantic class detection)
- Detailed debug logging

See [CHANGELOG.md](./CHANGELOG.md) for full details.

## Project Structure

```
Dataminer/
├── extension/
│   ├── manifest.json          # Extension manifest (v3)
│   ├── background.js          # Service worker
│   ├── content.js             # Main content script
│   ├── content.css            # Styles for selection UI
│   ├── popup.html/js/css      # Minimal popup
│   ├── services/
│   │   ├── ScrapingService.js # Extraction logic
│   │   └── ToastService.js    # Notifications
│   └── utils/
│       ├── TextExtractionUtils.js  # Smart text extraction
│       ├── OnPageUtils.js          # Shared utilities
│       ├── CSVUtils.js             # CSV export
│       └── JSONUtils.js            # JSON export
├── __tests__/
│   ├── amazon-parsing.test.js
│   ├── text-extraction.test.js
│   └── onpage-utils.test.js
└── CHANGELOG.md
```

## Development

- **Content script debugging**: Open DevTools on the page → Console
- **Background debugging**: `chrome://extensions/` → Dataminer → Service worker

### Running Tests

Requirements: **Node.js 16+**

```bash
cd Dataminer
npm install
npm test
```

Watch mode:

```bash
npm run test:watch
```

## Supported Sites

| Site | Status | Notes |
|------|--------|-------|
| Amazon | ✅ Working | Full support |
| Wildberries | ✅ Working | v0.1.2+ |
| Ozon | ✅ Working | v0.1.2+ |
| AliExpress | ✅ Working | v0.1.2+ |
| eBay | ⚠️ Not tested | Should work |

## Known Limitations

- **No pagination** — only extracts from current page
- **No infinite scroll** — does not auto-scroll
- **No cloud storage** — local export only

## Legal Notice

Use responsibly. Respect website Terms of Service and applicable laws.

## License

MIT
