const fs = require('fs');
const path = require('path');
const { minify: minifyJS } = require('terser');
const cssnano = require('cssnano');
const { minify: minifyHTMLFunc } = require('html-minifier-terser');

const EXTENSION_DIR = path.join(__dirname, 'extension');
const OUTPUT_DIR = path.join(__dirname, 'extension-minified');

// Создаем выходную директорию
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Создаем поддиректории
const subdirs = ['services', 'utils', 'icons'];
subdirs.forEach(dir => {
    const dirPath = path.join(OUTPUT_DIR, dir);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
});

// Файлы для минификации
const jsFiles = [
    'background.js',
    'content.js',
    'sidepanel.js',
    'services/ScrapingService.js',
    'services/ToastService.js',
    'utils/ContextUtils.js',
    'utils/CSVUtils.js',
    'utils/ElementUtils.js',
    'utils/JSONUtils.js',
    'utils/TextExtractionUtils.js'
];

const cssFiles = [
    'content.css',
    'sidepanel.css'
];

const htmlFiles = [
    'sidepanel.html'
];

// Файлы для копирования без изменений
const copyFiles = [
    'manifest.json'
];

// Иконки для копирования
const iconFiles = [
    'icons/data-scraping-tool-16.png',
    'icons/data-scraping-tool-32.png',
    'icons/data-scraping-tool-48.png',
    'icons/data-scraping-tool-128.png',
    'icons/data-scraping-tool-256.png',
    'icons/data-scraping-tool-512.png',
    'icons/icon.svg',
    'icons/logo_transparent.png',
    'icons/Logo.jpg',
    'icons/logo.png',
    'icons/spider.png'
];

// Функция для рекурсивного копирования директории
function copyDirectory(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
            copyDirectory(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// Копирование папки локализации (_locales)
function copyLocales() {
    const srcLocales = path.join(EXTENSION_DIR, '_locales');
    const destLocales = path.join(OUTPUT_DIR, '_locales');
    
    if (fs.existsSync(srcLocales)) {
        copyDirectory(srcLocales, destLocales);
        console.log('✓ Скопирована папка _locales (без изменений)');
    } else {
        console.warn('⚠ Папка _locales не найдена');
    }
}

async function minifyJavaScript(filePath) {
    const fullPath = path.join(EXTENSION_DIR, filePath);
    const code = fs.readFileSync(fullPath, 'utf8');
    
    const result = await minifyJS(code, {
        compress: {
            drop_console: false, // Оставляем console для отладки
            drop_debugger: true,
            pure_funcs: []
        },
        mangle: {
            reserved: ['chrome', 'window', 'document', 'DataScrapingToolContentScript', 'DataScrapingToolElementUtils', 'TextExtractionUtils']
        },
        format: {
            comments: false
        }
    });
    
    const outputPath = path.join(OUTPUT_DIR, filePath);
    fs.writeFileSync(outputPath, result.code);
    console.log(`✓ Минифицирован: ${filePath}`);
}

async function minifyCSS(filePath) {
    const fullPath = path.join(EXTENSION_DIR, filePath);
    const css = fs.readFileSync(fullPath, 'utf8');
    
    const processor = cssnano();
    const result = await processor.process(css, {
        from: fullPath,
        to: path.join(OUTPUT_DIR, filePath)
    });
    
    const outputPath = path.join(OUTPUT_DIR, filePath);
    fs.writeFileSync(outputPath, result.css);
    console.log(`✓ Минифицирован: ${filePath}`);
}

async function minifyHTML(filePath) {
    const fullPath = path.join(EXTENSION_DIR, filePath);
    const html = fs.readFileSync(fullPath, 'utf8');
    
    const result = await minifyHTMLFunc(html, {
        collapseWhitespace: true,
        removeComments: true,
        removeRedundantAttributes: true,
        removeScriptTypeAttributes: true,
        removeStyleLinkTypeAttributes: true,
        useShortDoctype: true,
        minifyCSS: false, // CSS уже минифицирован отдельно
        minifyJS: false   // JS уже минифицирован отдельно
    });
    
    const outputPath = path.join(OUTPUT_DIR, filePath);
    fs.writeFileSync(outputPath, result);
    console.log(`✓ Минифицирован: ${filePath}`);
}

function copyFile(filePath) {
    const sourcePath = path.join(EXTENSION_DIR, filePath);
    const destPath = path.join(OUTPUT_DIR, filePath);
    
    // Создаем директорию если нужно
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }
    
    fs.copyFileSync(sourcePath, destPath);
    console.log(`✓ Скопирован: ${filePath}`);
}

async function main() {
    console.log('Начинаю минификацию расширения...\n');
    
    try {
        // Минифицируем JavaScript файлы
        console.log('Минификация JavaScript файлов...');
        for (const file of jsFiles) {
            await minifyJavaScript(file);
        }
        
        // Минифицируем CSS файлы
        console.log('\nМинификация CSS файлов...');
        for (const file of cssFiles) {
            await minifyCSS(file);
        }
        
        // Минифицируем HTML файлы
        console.log('\nМинификация HTML файлов...');
        for (const file of htmlFiles) {
            await minifyHTML(file);
        }
        
        // Копируем файлы без изменений
        console.log('\nКопирование файлов...');
        for (const file of copyFiles) {
            copyFile(file);
        }
        
        // Копируем иконки
        console.log('\nКопирование иконок...');
        for (const file of iconFiles) {
            if (fs.existsSync(path.join(EXTENSION_DIR, file))) {
                copyFile(file);
            }
        }
        
        // Копируем папку локализации
        console.log('\nКопирование локализации...');
        copyLocales();
        
        console.log('\n✓ Минификация завершена!');
        console.log(`Результат сохранен в: ${OUTPUT_DIR}`);
        
        // Подсчитываем размеры
        let originalSize = 0;
        let minifiedSize = 0;
        
        const getAllFiles = (dir, baseDir = dir) => {
            let files = [];
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    files = files.concat(getAllFiles(fullPath, baseDir));
                } else {
                    files.push(fullPath);
                }
            }
            return files;
        };
        
        const originalFiles = getAllFiles(EXTENSION_DIR);
        const minifiedFiles = getAllFiles(OUTPUT_DIR);
        
        originalFiles.forEach(file => {
            if (!file.includes('icons')) {
                originalSize += fs.statSync(file).size;
            }
        });
        
        minifiedFiles.forEach(file => {
            if (!file.includes('icons')) {
                minifiedSize += fs.statSync(file).size;
            }
        });
        
        const savings = ((1 - minifiedSize / originalSize) * 100).toFixed(2);
        console.log(`\nРазмер оригинальных файлов: ${(originalSize / 1024).toFixed(2)} KB`);
        console.log(`Размер минифицированных файлов: ${(minifiedSize / 1024).toFixed(2)} KB`);
        console.log(`Экономия: ${savings}%`);
        
    } catch (error) {
        console.error('Ошибка при минификации:', error);
        process.exit(1);
    }
}

main();

