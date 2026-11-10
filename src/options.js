import { DEFAULT_BANNED, DEFAULT_STYLES, mergeSettings } from './defaults.js';
import { parseBannedList } from './checks.js';

const $ = (id) => document.getElementById(id);
const FIELDS = [
  'keyFallback', 'reasoningEffort', 'temperature', 'replyLanguage', 'variants', 'length', 'maxChars',
  'showTranslation', 'lowercase', 'replaceDashes', 'allowEmoji', 'allowHashtags',
  'persona', 'voiceExamples', 'extraRules', 'defaultStyleId', 'bannedWords', 'patternChecks',
  'stageContext', 'stageGrammar', 'languageTool', 'stageCritic', 'minScore', 'maxRounds',
  'autoInsert', 'hideSensitiveWarning', 'history',
];
const NUMERIC = new Set(['temperature', 'variants', 'maxChars', 'minScore', 'maxRounds']);
const STAGES = ['context', 'generate', 'grammar', 'critic'];
const STAGE_INFO = {
  context: { n: 1, title: 'Контекст поста', flag: 'stageContext', desc: 'Розбирає пост: суть, тон, підтекст, слабкі місця, переклад. Без нього генерація бачить лише сирий текст.' },
  generate: { n: 2, title: 'Генерація реплаїв', flag: null, desc: 'Пише варіанти у вибраному стилі з твоїм голосом і забороною ШІ-слів.' },
  grammar: { n: 3, title: 'Перевірка грамотності', flag: 'stageGrammar', desc: 'Виправляє орфографію, пунктуацію, русизми й суржик, не змінюючи зміст.' },
  critic: { n: 4, title: 'Оцінка: чіпляє / авторське', flag: 'stageCritic', desc: 'Оцінює, чи тригерить автора, чи звучить по-людськи, чи не загальник. Слабкі варіанти переписуються.' },
};

function renderStages() {
  $('stages').innerHTML = STAGES.map((k) => {
    const i = STAGE_INFO[k];
    return `<div class="stage" id="st_${k}">
      <div class="top"><b>API ${i.n}. ${i.title}</b>
        ${i.flag ? `<label class="chk" style="margin:0"><input id="${i.flag}" type="checkbox" /> увімкнено</label>` : '<span class="req">обов\'язкове</span>'}</div>
      <div class="desc">${i.desc}</div>
      <div class="row">
        <input id="k_${k}" type="password" placeholder="gsk_... ключ для API ${i.n}" autocomplete="off" />
        <button class="ghost" type="button" data-eye="${k}">👁</button>
        <button type="button" data-test="${k}">Перевірити</button>
      </div>
      <label>Модель <input id="m_${k}" list="models" /></label>
      <div class="stat muted" id="ks_${k}"></div>
    </div>`;
  }).join('');
}
renderStages();

function updateStageLook() {
  for (const k of STAGES) {
    const flag = STAGE_INFO[k].flag;
    const hasKey = $(`k_${k}`).value.trim() || ($('keyFallback').checked && $('k_generate').value.trim());
    const enabled = !flag || $(flag).checked;
    $(`st_${k}`).classList.toggle('off', !enabled || !hasKey);
    const stat = $(`ks_${k}`);
    if (stat.dataset.tested) continue;
    stat.className = 'stat muted';
    stat.textContent = !enabled ? 'Вимкнено: етап буде пропущено' : !hasKey ? (flag ? 'Немає ключа: етап буде пропущено' : 'Без цього ключа розширення не працює') : '';
  }
}

document.addEventListener('click', async (e) => {
  const eye = e.target.closest('[data-eye]');
  if (eye) {
    const inp = $(`k_${eye.dataset.eye}`);
    inp.type = inp.type === 'password' ? 'text' : 'password';
    return;
  }
  const btn = e.target.closest('[data-test]');
  if (!btn) return;
  const k = btn.dataset.test;
  const st = $(`ks_${k}`);
  const key = $(`k_${k}`).value.trim() || ($('keyFallback').checked ? $('k_generate').value.trim() : '');
  st.dataset.tested = '1';
  st.className = 'stat muted';
  st.textContent = 'Перевіряю…';
  const r = await chrome.runtime.sendMessage({ type: 'listModels', apiKey: key });
  if (r?.error) {
    st.className = 'stat bad';
    st.textContent = `✗ ${r.error}`;
    return;
  }
  const models = r.models || [];
  $('models').innerHTML = models.map((m) => `<option value="${m}"></option>`).join('');
  const model = $(`m_${k}`).value.trim();
  st.className = models.includes(model) ? 'stat ok' : 'stat bad';
  st.textContent = models.includes(model)
    ? `✓ Ключ працює, модель ${model} доступна`
    : `Ключ працює, але моделі «${model}» немає. Обери зі списку (${models.length} доступно).`;
});

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
  STAGES.forEach((k) => {
    $(`m_${k}`).value = s.models[k] || '';
    $(`k_${k}`).value = s.keys[k] || '';
  });
  renderStyles();
  updateLabels();
}

function updateLabels() {
  updateStageLook();
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
  STAGES.forEach((k) => {
    s.models[k] = $(`m_${k}`).value.trim() || s.models[k];
    s.keys[k] = $(`k_${k}`).value.trim();
  });
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
  const m = e.target.id.match(/^[km]_(\w+)$/);
  if (m) delete $(`ks_${m[1]}`).dataset.tested;
  save();
});

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
  const { keys, ...rest } = s;
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
    const { keys: _ignored, apiKey: _old, ...data } = JSON.parse(await file.text());
    s = mergeSettings({ ...data, keys: s.keys });
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
