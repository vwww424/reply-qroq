import { DEFAULT_BANNED, DEFAULT_STYLES, mergeSettings } from './defaults.js';
import { parseBannedList } from './checks.js';

const $ = (id) => document.getElementById(id);
const FIELDS = [
  'apiKey', 'reasoningEffort', 'temperature', 'replyLanguage', 'variants', 'length', 'maxChars',
  'showTranslation', 'lowercase', 'replaceDashes', 'allowEmoji', 'allowHashtags',
  'persona', 'voiceExamples', 'extraRules', 'defaultStyleId', 'bannedWords', 'patternChecks',
  'stageGrammar', 'languageTool', 'stageCritic', 'minScore', 'maxRounds',
  'autoInsert', 'hideSensitiveWarning', 'history',
];
const NUMERIC = new Set(['temperature', 'variants', 'maxChars', 'minScore', 'maxRounds']);
const STAGES = ['context', 'generate', 'grammar', 'critic'];

let s;

async function load() {
  const { settings } = await chrome.storage.local.get('settings');
  s = mergeSettings(settings);
  render();
}

function render() {
  for (const f of FIELDS) {
    const el = $(f);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!s[f];
    else if (f !== 'defaultStyleId') el.value = s[f] ?? '';
  }
  STAGES.forEach((k) => ($(`m_${k}`).value = s.models[k] || ''));
  renderStyles();
  updateLabels();
}

function updateLabels() {
  $('tempVal').textContent = $('temperature').value;
  $('minScoreVal').textContent = $('minScore').value;
  $('bannedCount').textContent = `${parseBannedList($('bannedWords').value).length} слів/фраз`;
}

function renderStyles() {
  const box = $('styles');
  box.innerHTML = '';
  s.styles.forEach((st, i) => {
    const d = document.createElement('div');
    d.className = 'style';
    d.innerHTML = `<div class="row">
        <input class="emoji" value="" placeholder="🙂" />
        <input class="name" value="" placeholder="Назва" />
        <button class="ghost up" type="button" title="Вище">↑</button>
        <button class="ghost danger del" type="button">Видалити</button>
      </div>
      <textarea class="prompt" rows="2" placeholder="Інструкція для моделі: як писати в цьому стилі"></textarea>`;
    d.querySelector('.emoji').value = st.emoji || '';
    d.querySelector('.name').value = st.name || '';
    d.querySelector('.prompt').value = st.prompt || '';
    d.querySelector('.emoji').oninput = (e) => ((st.emoji = e.target.value), save());
    d.querySelector('.name').oninput = (e) => ((st.name = e.target.value), save(), fillDefaultStyle());
    d.querySelector('.prompt').oninput = (e) => ((st.prompt = e.target.value), save());
    d.querySelector('.del').onclick = () => {
      if (s.styles.length <= 1) return;
      s.styles.splice(i, 1);
      renderStyles();
      save();
    };
    d.querySelector('.up').onclick = () => {
      if (!i) return;
      [s.styles[i - 1], s.styles[i]] = [s.styles[i], s.styles[i - 1]];
      renderStyles();
      save();
    };
    box.appendChild(d);
  });
  fillDefaultStyle();
}

function fillDefaultStyle() {
  const sel = $('defaultStyleId');
  sel.innerHTML = s.styles.map((st) => `<option value="${st.id}">${st.emoji || ''} ${st.name}</option>`).join('');
  sel.value = s.styles.some((st) => st.id === s.defaultStyleId) ? s.defaultStyleId : s.styles[0]?.id;
}

let t;
function save() {
  for (const f of FIELDS) {
    const el = $(f);
    if (!el) continue;
    s[f] = el.type === 'checkbox' ? el.checked : NUMERIC.has(f) ? Number(el.value) : el.value;
  }
  s.apiKey = s.apiKey.trim();
  STAGES.forEach((k) => (s.models[k] = $(`m_${k}`).value.trim() || s.models[k]));
  updateLabels();
  clearTimeout(t);
  t = setTimeout(async () => {
    await chrome.storage.local.set({ settings: s });
    $('saved').classList.add('show');
    setTimeout(() => $('saved').classList.remove('show'), 1200);
  }, 250);
}

document.addEventListener('input', (e) => {
  if (e.target.closest('#styles') || e.target.id === 'importFile') return;
  save();
});

$('toggleKey').onclick = () => ($('apiKey').type = $('apiKey').type === 'password' ? 'text' : 'password');

$('testKey').onclick = async () => {
  const st = $('keyStatus');
  st.className = 'muted';
  st.textContent = 'Перевіряю…';
  const r = await chrome.runtime.sendMessage({ type: 'listModels', override: { apiKey: $('apiKey').value.trim() } });
  if (r?.error) {
    st.className = 'bad';
    st.textContent = `✗ ${r.error}`;
    return;
  }
  const models = r.models || [];
  $('models').innerHTML = models.map((m) => `<option value="${m}"></option>`).join('');
  const missing = STAGES.map((k) => s.models[k]).filter((m) => !models.includes(m));
  st.className = 'ok';
  st.textContent = `✓ Ключ працює. Доступно моделей: ${models.length}.${missing.length ? ` Увага, недоступні: ${[...new Set(missing)].join(', ')}` : ''}`;
};

$('addStyle').onclick = () => {
  s.styles.push({ id: `custom-${Date.now()}`, name: 'Мій стиль', emoji: '✨', prompt: '' });
  renderStyles();
  save();
};
$('resetStyles').onclick = () => {
  if (!confirm('Скинути всі стилі до стандартних?')) return;
  s.styles = structuredClone(DEFAULT_STYLES);
  renderStyles();
  save();
};
$('resetBanned').onclick = () => {
  if (!confirm('Замінити список стандартним?')) return;
  $('bannedWords').value = DEFAULT_BANNED;
  save();
};

$('export').onclick = () => {
  const { apiKey, ...rest } = s;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(rest, null, 2)], { type: 'application/json' }));
  a.download = 'x-reply-writer-settings.json';
  a.click();
};
$('import').onclick = () => $('importFile').click();
$('importFile').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    s = mergeSettings({ ...data, apiKey: s.apiKey });
    await chrome.storage.local.set({ settings: s });
    render();
    alert('Імпортовано');
  } catch (err) {
    alert(`Помилка імпорту: ${err.message}`);
  }
};
$('clearHistory').onclick = async () => {
  if (!confirm('Очистити історію?')) return;
  await chrome.storage.local.set({ history: [] });
};

load();
