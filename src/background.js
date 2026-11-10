import { listModels } from './api.js';
import { mergeSettings } from './defaults.js';
import { runPipeline } from './pipeline.js';

async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return mergeSettings(settings);
}

chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get('settings');
  const merged = mergeSettings(settings);
  await chrome.storage.local.set({ settings: merged });
  if (!merged.keys.generate) chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case 'getSettings':
        return getSettings();
      case 'listModels':
        return { models: await listModels(await getSettings(), (msg.apiKey || '').trim()) };
      case 'openOptions':
        chrome.runtime.openOptionsPage();
        return true;
      case 'saveHistory': {
        const s = await getSettings();
        if (!s.history) return true;
        const { history = [] } = await chrome.storage.local.get('history');
        history.unshift({ ...msg.entry, ts: Date.now() });
        await chrome.storage.local.set({ history: history.slice(0, 100) });
        return true;
      }
      default:
        return null;
    }
  })()
    .then((r) => sendResponse(r))
    .catch((e) => sendResponse({ error: e.message }));
  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'trh') return;
  let alive = true;
  port.onDisconnect.addListener(() => (alive = false));
  const send = (m) => {
    if (!alive) return;
    try {
      port.postMessage(m);
    } catch {
      alive = false;
    }
  };
  port.onMessage.addListener(async (msg) => {
    if (msg?.type !== 'generate') return;
    try {
      const settings = await getSettings();
      const result = await runPipeline({ settings, ...msg }, (p) => send({ type: 'progress', ...p }));
      send({ type: 'result', result });
    } catch (e) {
      send({ type: 'error', message: e.message || String(e), code: e.code });
    }
  });
});
