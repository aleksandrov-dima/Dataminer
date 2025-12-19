// Dataminer popup: only toggles on-page panel

async function toggleOnPagePanel() {
    const statusEl = document.getElementById('statusMessage');

    const setStatus = (msg, type = 'info') => {
        if (!statusEl) return;
        statusEl.textContent = msg;
        statusEl.className = `status-message ${type}`;

        setTimeout(() => {
            statusEl.textContent = '';
            statusEl.className = 'status-message';
        }, 2500);
    };

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) {
            setStatus('No active tab', 'error');
            return;
        }

        if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://'))) {
            setStatus('Cannot open panel on Chrome internal pages', 'error');
            return;
        }

        // content.js подключён через manifest, но иногда вкладка может быть ещё не готова
        try {
            await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
        } catch (e) {
            // Keep the same dependency order as in manifest.json:
            // TextExtractionUtils -> OnPageUtils -> content.js
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['utils/TextExtractionUtils.js', 'utils/OnPageUtils.js', 'content.js']
            });
            await new Promise(r => setTimeout(r, 150));
        }

        const res = await chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
        setStatus(res && res.open ? 'Panel opened' : 'Panel closed', 'success');
    } catch (e) {
        console.log('togglePanel error', e);
        setStatus('Failed to toggle panel. Refresh the page and try again.', 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('openPanelBtn');
    if (btn) btn.addEventListener('click', toggleOnPagePanel);
});
