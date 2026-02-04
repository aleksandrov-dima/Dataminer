# Data Scraping Tool — Chrome Extension for Simple Web Scraping

**Data Scraping Tool v1.0.2** is a lightweight **Chrome/Edge (Chromium)** extension for extracting data from web pages using **visual field selection** and exporting the result.

> 🎯 **Tested and working on**: Amazon, Wildberries, Ozon, AliExpress, Kibana (Discover tables)

## Key Features

- **Side Panel Architecture** — panel opens beside the page, not over it (cleaner UX)
- **Two selection modes** — **Elements** (click to add fields) or **Region** (drag rectangle over cards/table)
- **HTML table support** — automatic detection and extraction from semantic `<table>` (Kibana, etc.)
- **Visual field selection** — click elements on the page to add fields
- **Smart extraction** — handles nested elements, image containers, lazy-loaded content
- **Auto-detect data types** — automatically detects text, links, and images
- **Live preview** — real-time table preview while selecting fields
- **Tooltip preview** — see data preview when hovering elements during selection
- **Export** — CSV and JSON (downloaded via `chrome.downloads`)
- **Per-site state** — fields are saved per `origin`
- **Auto-select mode** — automatically enters selection mode when panel opens with 0 fields
- **Keyboard shortcuts** — `Esc` to stop selection, `Ctrl+E`/`Cmd+E` for quick export

## Installation (Developer Mode)

1. Open `chrome://extensions/` (or `edge://extensions/`)
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `Dataminer/extension` folder (note: folder name unchanged for compatibility)

## Usage

1. Open any website (e.g., Amazon, Wildberries, Ozon, Kibana)
2. Click the extension icon — **Side Panel** opens automatically
3. If no fields exist, **selection mode activates automatically** (auto-select)
4. Choose selection mode:
   - **Elements** — click elements on the page to add fields (each click adds a field)
   - **Region** — drag a rectangle over one or more cards, or over an HTML table
5. Selection auto-stops after 2 seconds of inactivity (Elements) or on mouse release (Region)
6. Click **Export CSV** / **Export JSON** to download data
7. Use **Fields** tab to rename fields or export directly (quick export buttons always visible)

### Debug Mode

To enable detailed logging (useful for troubleshooting):

```javascript
// In browser Console:
localStorage.setItem('data-scraping-tool_debug', 'true');
// Then refresh the page
```

## What's New in v1.0.2

### ✨ Region Selection & HTML Tables
- **Region mode** — drag a rectangle over cards or tables to extract data
- **HTML table support** — automatic detection of semantic `<table>` elements
- **Kibana Discover** — full extraction of Time and Document columns (no truncation)
- **Mode toggle** — switch between Elements and Region selection

### 🎨 Previous: v0.2.0 Architecture Changes
- **Side Panel Architecture** — panel opens beside page instead of overlaying (Chrome sidePanel API)
- **Removed backend code** — extension is now fully client-side (simplified architecture)
- **Code refactoring** — `OnPageUtils` renamed to `ElementUtils`, improved structure

### ✨ UI/UX Improvements
- **New spider-themed icons** — dark icons for toolbar, white icons for panel
- **Tooltip with data preview** — shows data preview when hovering elements during selection
- **Auto-select mode** — automatically enters selection mode when panel opens with 0 fields
- **Auto-stop & auto-preview** — selection stops after 2s inactivity and switches to preview
- **Quick export** — export buttons always visible on Fields tab with live row counter

### 🔧 Code Quality
- **English comments** — all Russian comments translated to English
- **Improved error handling** — better stability and error recovery
- **Enhanced extraction** — improved selector fallback and parent container validation

### 🧪 Testing
- Added unit tests for `ElementUtils` and `TextExtractionUtils`
- Added Amazon parsing tests
- Improved test stability

See [CHANGELOG.md](./CHANGELOG.md) for full details.

## Project Structure

```
Data Scraping Tool/
├── extension/                 # Extension source code
│   ├── manifest.json          # Extension manifest (v3, v0.2.0)
│   ├── background.js          # Service worker (handles downloads, side panel)
│   ├── content.js             # Main content script (selection & extraction)
│   ├── content.css            # Styles for selection UI
│   ├── sidepanel.html         # Side panel HTML
│   ├── sidepanel.js           # Side panel logic
│   ├── sidepanel.css          # Side panel styles
│   ├── services/
│   │   ├── ScrapingService.js # Extraction logic
│   │   └── ToastService.js    # Notifications
│   ├── utils/
│   │   ├── TextExtractionUtils.js  # Smart text extraction
│   │   ├── ElementUtils.js         # DOM utilities (renamed from OnPageUtils)
│   │   ├── CSVUtils.js             # CSV export
│   │   └── JSONUtils.js            # JSON export
│   └── icons/                 # Extension icons (spider theme)
├── __tests__/                 # Unit tests
│   ├── amazon-parsing.test.js
│   ├── region-selection-kibana.test.js  # Kibana table extraction
│   ├── region-selection-table.test.js  # HTML table support
│   ├── region-selection-wb.test.js     # Wildberries region mode
│   ├── text-extraction.test.js
│   └── element-utils.test.js
├── Icons/                     # Source icon files (SVG, PSD, etc.)
├── generate-icons.js          # Script to generate extension icons
├── minify-extension.js        # Script to minify extension for production
├── package.json               # NPM dependencies and scripts
├── jest.setup.js              # Jest configuration
├── CHANGELOG.md               # Detailed changelog
└── README.md                  # This file
```

## Development

### Prerequisites
- **Node.js 16+** (for running tests and build scripts)
- Chrome/Edge browser with Developer mode enabled

### Setup

```bash
cd Dataminer  # Note: folder name unchanged for compatibility
npm install
```

### Build Scripts

```bash
# Generate extension icons from source
npm run build:icons

# Minify extension for production (creates extension-minified/)
npm run build:minify
```

### Running Tests

```bash
# Run all tests
npm test

# Watch mode (runs tests on file changes)
npm run test:watch
```

### Debugging

- **Content script debugging**: Open DevTools on the page → Console
- **Side Panel debugging**: Right-click on side panel → Inspect
- **Background debugging**: `chrome://extensions/` → Data Scraping Tool → Service worker

### Debug Mode

Enable detailed logging in browser Console:

```javascript
localStorage.setItem('data-scraping-tool_debug', 'true');
// Then refresh the page
```

## Supported Sites

| Site | Status | Notes |
|------|--------|-------|
| Amazon | ✅ Working | Full support, tested |
| Wildberries | ✅ Working | Full support with improved container detection |
| Ozon | ✅ Working | Full support |
| AliExpress | ✅ Working | Full support |
| Kibana (Discover) | ✅ Working | Region mode, HTML table extraction (Time, Document columns) |
| eBay | ⚠️ Not tested | Should work with standard selectors |

## Known Limitations

- **No pagination** — only extracts from current page
- **No infinite scroll** — does not auto-scroll to load more content
- **No cloud storage** — local export only (CSV/JSON files)
- **Side Panel requires Chrome 114+** — older versions will not support side panel feature

## Legal Notice

Use responsibly. Respect website Terms of Service and applicable laws.

## License

MIT
