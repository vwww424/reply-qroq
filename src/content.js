(() => {
  if (window.__trhLoaded) return;
  window.__trhLoaded = true;

  const STAGES = [
    ['context', 'Контекст поста'],
    ['generate', 'Генерація реплаїв'],
    ['grammar', 'Перевірка грамотності'],
    ['critic', 'Оцінка: чіпляє / авторське'],
  ];
  const REFINES = [
    ['Коротше', 'зроби значно коротше, залиш тільки суть'],
    ['Гостріше', 'зроби гостріше і сміливіше, більш провокаційно, але без хамства'],
    ['Смішніше', 'додай гумору або іронії'],
    ['Простіше', 'зроби простішою розмовною мовою, як пишуть друзям'],
    ['Інший кут', 'та сама тема, але зовсім інша думка/кут'],
  ];
  const ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.5-10.5a2.12 2.12 0 0 0-3-3L5 17v3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M13.5 7.5l3 3" stroke="currentColor" stroke-width="1.8"/><path d="M19 15l.7 1.6 1.6.7-1.6.7L19 19.6l-.7-1.6-1.6-.7 1.6-.7z" fill="currentColor"/></svg>`;

  let settings = null;
  const loadSettings = async () => {
    try {
      settings = await chrome.runtime.sendMessage({ type: 'getSettings' });
    } catch {
      /* контекст розширення перезавантажено */
    }
  };
  loadSettings();
  chrome.storage.onChanged.addListener((ch) => ch.settings && loadSettings());

  // ---------- Витягування поста з DOM ----------
  const textOf = (el) => {
    if (!el) return '';
    let out = '';
    const walk = (n) => {
      if (n.nodeType === Node.TEXT_NODE) out += n.nodeValue;
      else if (n.nodeName === 'IMG') out += n.alt || '';
      else if (n.nodeName === 'BR') out += '\n';
      else n.childNodes.forEach(walk);
    };
    walk(el);
    return out.replace(/\n{3,}/g, '\n\n').trim();
  };

  // цитований твіт — вкладений блок role=link зі своїм User-Name
  const quoteContainer = (article) =>
    [...article.querySelectorAll('div[role="link"]')].find((d) => d.querySelector('[data-testid="User-Name"]'));

  const parseUser = (el) => {
    const t = textOf(el).replace(/\s+/g, ' ');
    const m = t.match(/@[A-Za-z0-9_]{1,15}/);
    return { name: (m ? t.slice(0, m.index) : t.split('·')[0]).trim(), handle: m ? m[0] : '' };
  };

  function extractPost(article) {
    const quote = quoteContainer(article);
    const inQuote = (el) => quote && quote.contains(el);
    const userEl = [...article.querySelectorAll('[data-testid="User-Name"]')].find((e) => !inQuote(e));
    const textEl = [...article.querySelectorAll('[data-testid="tweetText"]')].find((e) => !inQuote(e));
    const user = parseUser(userEl);
    const images = [...article.querySelectorAll('[data-testid="tweetPhoto"] img')]
      .filter((i) => !inQuote(i))
      .map((i) => i.alt)
      .filter((a) => a && !/^(image|зображення|изображение)$/i.test(a.trim()));
    const timeLink = [...article.querySelectorAll('a[href*="/status/"]')].find((a) => a.querySelector('time') && !inQuote(a));
    const post = {
      authorName: user.name,
      authorHandle: user.handle,
      text: textOf(textEl),
      truncated: !!article.querySelector('[data-testid="tweet-text-show-more-link"]'),
      images,
      hasMedia: !!article.querySelector('[data-testid="tweetPhoto"], [data-testid="videoPlayer"], video'),
      card: textOf(article.querySelector('[data-testid="card.wrapper"]')).slice(0, 300),
      url: timeLink ? timeLink.href : location.href,
    };
    if (quote) {
      post.quoted = {
        author: parseUser(quote.querySelector('[data-testid="User-Name"]')).handle,
        text: textOf(quote.querySelector('[data-testid="tweetText"]')),
      };
    }
    // на сторінці гілки беремо 2 пости над поточним
    if (/\/status\//.test(location.pathname)) {
      const all = [...document.querySelectorAll('article[data-testid="tweet"]')];
      const idx = all.indexOf(article);
      if (idx > 0) {
        post.thread = all
          .slice(Math.max(0, idx - 2), idx)
          .map((a) => ({
            author: parseUser(a.querySelector('[data-testid="User-Name"]')).handle,
            text: textOf(a.querySelector('[data-testid="tweetText"]')).slice(0, 500),
          }))
          .filter((t) => t.text);
      }
    }
    return post;
  }

  // ---------- Вставка в поле реплаю ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(fn, timeout = 4000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const v = fn();
      if (v) return v;
      await sleep(80);
    }
    return null;
  }
  const editableIn = (el) =>
    el && (el.isContentEditable ? el : el.querySelector('[contenteditable="true"]') || el.closest('[contenteditable="true"]'));

  async function insertReply(article, text) {
    article.querySelector('[data-testid="reply"]')?.click();
    let box = await waitFor(() => editableIn(document.querySelector('[role="dialog"] [data-testid="tweetTextarea_0"]')), 3500);
    if (!box) box = editableIn(document.querySelector('[data-testid="tweetTextarea_0"]'));
    if (!box) return false;
    box.focus();
    await sleep(60);
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(box);
    sel.removeAllRanges();
    sel.addRange(range); // замінюємо все, що вже було в полі
    document.execCommand('insertText', false, text);
    await sleep(120);
    if (!box.textContent.includes(text.slice(0, 15))) {
      // запасний шлях для Draft.js
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      await sleep(120);
    }
    return box.textContent.includes(text.slice(0, 15));
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  // ---------- Кнопка біля поста ----------
  function injectButton(article) {
    if (article.querySelector('.trh-btn')) return;
    const bar = [...article.querySelectorAll('[role="group"]')].reverse().find((g) => g.querySelector('[data-testid="reply"]'));
    if (!bar) return;
    const wrap = document.createElement('div');
    wrap.className = 'trh-wrap';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'trh-btn';
    btn.title = 'Написати реплай (Groq)';
    btn.innerHTML = ICON;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      panel.toggle(article, btn);
    });
    wrap.appendChild(btn);
    bar.appendChild(wrap);
  }

  let scheduled = false;
  const scan = () => {
    scheduled = false;
    document.querySelectorAll('article[data-testid="tweet"]').forEach(injectButton);
  };
  new MutationObserver(() => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(scan);
    }
  }).observe(document.body, { childList: true, subtree: true });
  scan();

  // ---------- Панель ----------
  const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .p { position: fixed; z-index: 2147483000; width: 420px; max-width: calc(100vw - 16px); display: flex; flex-direction: column;
       background: #0f1419; color: #e7e9ea; border: 1px solid #2f3336; border-radius: 16px;
       box-shadow: 0 12px 40px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.03);
       font: 14px/1.4 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; overflow: hidden; }
  .hd { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #2f3336; }
  .hd b { flex: 1; font-size: 15px; }
  .ib { background: none; border: 0; color: #71767b; cursor: pointer; font-size: 16px; padding: 4px 6px; border-radius: 8px; }
  .ib:hover { background: #1d1f23; color: #e7e9ea; }
  .body { overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { border: 1px solid #2f3336; background: transparent; color: #e7e9ea; border-radius: 999px; padding: 5px 10px; cursor: pointer; font: inherit; font-size: 13px; }
  .chip:hover { background: #16181c; }
  .chip.on { background: #1d9bf0; border-color: #1d9bf0; color: #fff; }
  .hint { width: 100%; background: #000; border: 1px solid #2f3336; color: #e7e9ea; border-radius: 10px; padding: 8px 10px; font: inherit; font-size: 13px; }
  .hint:focus, textarea:focus { outline: none; border-color: #1d9bf0; }
  .go { background: #e7e9ea; color: #0f1419; border: 0; border-radius: 999px; padding: 9px 14px; font: inherit; font-weight: 700; cursor: pointer; }
  .go:hover { background: #d7dbdc; } .go:disabled { opacity: .5; cursor: default; }
  .row { display: flex; gap: 8px; align-items: center; }
  .row .go { flex: 1; }
  .steps { display: flex; flex-direction: column; gap: 4px; font-size: 13px; background: #16181c; border-radius: 12px; padding: 8px 10px; }
  .st { display: flex; gap: 8px; align-items: baseline; color: #71767b; }
  .st .ic { width: 16px; text-align: center; }
  .st.run { color: #e7e9ea; } .st.done { color: #00ba7c; } .st.error { color: #f4212e; } .st.wait { color: #ffd400; }
  .st .nt { color: #71767b; font-size: 12px; margin-left: auto; text-align: right; max-width: 55%; }
  .spin { display: inline-block; animation: s 1s linear infinite; } @keyframes s { to { transform: rotate(360deg); } }
  .ctx { font-size: 13px; background: #16181c; border-radius: 12px; padding: 8px 10px; color: #c5c8cb; }
  .ctx summary { cursor: pointer; color: #e7e9ea; font-weight: 600; }
  .ctx p { margin: 6px 0 0; }
  .warn { background: #3a1d00; color: #ffb35c; border-radius: 10px; padding: 8px 10px; font-size: 13px; }
  .err { background: #3b0a0e; color: #ff7a85; border-radius: 10px; padding: 8px 10px; font-size: 13px; }
  .err a { color: #fff; }
  .card { border: 1px solid #2f3336; border-radius: 14px; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
  .card.best { border-color: #1d9bf0; }
  textarea { width: 100%; resize: vertical; min-height: 64px; background: #000; color: #e7e9ea; border: 1px solid #2f3336; border-radius: 10px; padding: 8px 10px; font: inherit; font-size: 15px; line-height: 1.4; }
  .meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12px; color: #71767b; }
  .badge { border-radius: 6px; padding: 2px 6px; background: #1d1f23; color: #c5c8cb; }
  .score { font-weight: 700; color: #fff; }
  .g { background: #00391f; color: #3ee59a; } .m { background: #3a3000; color: #ffd400; } .b { background: #3b0a0e; color: #ff7a85; }
  .cnt { margin-left: auto; } .cnt.over { color: #f4212e; font-weight: 700; }
  .angle { font-size: 12px; color: #8b98a5; }
  .tr { font-size: 13px; color: #c5c8cb; border-left: 2px solid #2f3336; padding-left: 8px; }
  .issues { font-size: 12px; color: #ffb35c; margin: 0; padding-left: 16px; }
  .fixes { font-size: 12px; color: #8b98a5; }
  .fixes summary { cursor: pointer; }
  .acts { display: flex; flex-wrap: wrap; gap: 6px; }
  .a { border: 1px solid #2f3336; background: transparent; color: #e7e9ea; border-radius: 999px; padding: 4px 10px; font: inherit; font-size: 12px; cursor: pointer; }
  .a:hover { background: #16181c; } .a.pri { background: #1d9bf0; border-color: #1d9bf0; color: #fff; font-weight: 700; }
  .a:disabled { opacity: .5; cursor: default; }
  .toast { position: fixed; z-index: 2147483001; bottom: 24px; left: 50%; transform: translateX(-50%); background: #1d9bf0; color: #fff;
           padding: 10px 16px; border-radius: 999px; font: 14px -apple-system, "Segoe UI", Roboto, sans-serif; box-shadow: 0 6px 20px rgba(0,0,0,.4); }
  `;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const tweetLength = (t) => {
    let n = 0;
    for (const ch of t.replace(/https?:\/\/\S+/g, () => ((n += 23), ''))) n += /\p{Extended_Pictographic}/u.test(ch) ? 2 : 1;
    return n;
  };
  const cls = (v) => (v >= 7 ? 'g' : v >= 5 ? 'm' : 'b');

  const panel = (() => {
    const host = document.createElement('div');
    host.id = 'trh-host';
    const root = host.attachShadow({ mode: 'open' });
    const styleEl = document.createElement('style');
    styleEl.textContent = CSS;
    root.appendChild(styleEl);
    let attached = false;
    const states = new WeakMap(); // article -> {styleId, hint, result, error, steps}
    let cur = null; // {article, btn, el, port}

    const attach = () => {
      if (!attached || !host.isConnected) {
        document.documentElement.appendChild(host);
        attached = true;
      }
    };

    function toast(msg) {
      attach();
      const t = document.createElement('div');
      t.className = 'toast';
      t.textContent = msg;
      root.appendChild(t);
      setTimeout(() => t.remove(), 2600);
    }

    function stateFor(article) {
      if (!states.has(article)) {
        states.set(article, { styleId: settings?.defaultStyleId, hint: '', result: null, error: null, steps: {}, busy: false });
      }
      return states.get(article);
    }

    function position(el, btn) {
      const r = btn.getBoundingClientRect();
      const w = Math.min(420, innerWidth - 16);
      el.style.left = `${Math.max(8, Math.min(r.right - w, innerWidth - w - 8))}px`;
      const below = innerHeight - r.bottom - 14;
      if (below >= 380 || below >= r.top) {
        el.style.top = `${r.bottom + 6}px`;
        el.style.bottom = '';
        el.style.maxHeight = `${below}px`;
      } else {
        el.style.bottom = `${innerHeight - r.top + 6}px`;
        el.style.top = '';
        el.style.maxHeight = `${r.top - 14}px`;
      }
    }

    function close() {
      if (!cur) return;
      cur.el.remove();
      cur = null;
    }

    async function toggle(article, btn) {
      if (cur && cur.article === article) return close();
      close();
      if (!settings) await loadSettings();
      if (!settings) return toast('Розширення оновилось — перезавантаж сторінку');
      attach();
      const el = document.createElement('div');
      el.className = 'p';
      root.appendChild(el);
      cur = { article, btn, el };
      render();
      position(el, btn);
    }

    function render() {
      if (!cur) return;
      const st = stateFor(cur.article);
      const styles = settings.styles || [];
      if (!styles.find((s) => s.id === st.styleId)) st.styleId = styles[0]?.id;
      const res = st.result;
      const ctx = res?.context;
      const stepsHtml =
        st.busy || Object.keys(st.steps).length
          ? `<div class="steps">${STAGES.map(([id, label]) => {
              const s = st.steps[id] || {};
              const ic = { run: '<span class="spin">◌</span>', done: '✓', error: '✗', skip: '–', wait: '⏳' }[s.status] || '○';
              return `<div class="st ${s.status || ''}"><span class="ic">${ic}</span><span>${label}</span><span class="nt">${esc(s.note || '')}</span></div>`;
            }).join('')}</div>`
          : '';
      const noKey = !settings.apiKey
        ? `<div class="err">Немає API ключа Groq. <a href="#" data-act="opts">Відкрити налаштування</a> (ключ безкоштовно: console.groq.com/keys)</div>`
        : '';
      cur.el.innerHTML = `
        <div class="hd"><b>✍️ Реплай</b>
          <button class="ib" data-act="opts" title="Налаштування">⚙</button>
          <button class="ib" data-act="close" title="Закрити (Esc)">✕</button></div>
        <div class="body">
          ${noKey}
          <div class="chips">${styles
            .map((s) => `<button class="chip ${s.id === st.styleId ? 'on' : ''}" data-style="${esc(s.id)}" title="${esc(s.prompt)}">${esc(s.emoji || '')} ${esc(s.name)}</button>`)
            .join('')}</div>
          <input class="hint" placeholder="Підказка (необов'язково): напр. «зачепи цифру 40%»" value="${esc(st.hint)}">
          <div class="row"><button class="go" data-act="go" ${st.busy ? 'disabled' : ''}>${st.busy ? 'Генерую…' : res ? '↻ Згенерувати ще' : 'Згенерувати'}</button></div>
          ${stepsHtml}
          ${st.error ? `<div class="err">${esc(st.error)}${st.errorCode === 'no_key' || st.errorCode === 'bad_key' ? ' <a href="#" data-act="opts">Налаштування</a>' : ''}</div>` : ''}
          ${
            ctx
              ? `<details class="ctx"${res.replies?.length ? '' : ' open'}><summary>Про що пост${ctx.topic ? `: ${esc(ctx.topic)}` : ''}</summary>
                 <p>${esc(ctx.summary_uk || '')}</p>
                 ${ctx.translation_uk ? `<p><b>Переклад:</b> ${esc(ctx.translation_uk)}</p>` : ''}
                 ${ctx.tone ? `<p><b>Тон:</b> ${esc(ctx.tone)}</p>` : ''}</details>`
              : ''
          }
          ${ctx?.sensitive && !settings.hideSensitiveWarning ? `<div class="warn">⚠️ Чутлива тема${ctx.sensitive_reason ? `: ${esc(ctx.sensitive_reason)}` : ''}. Подумай двічі перед байтом чи жартом.</div>` : ''}
          ${(res?.replies || []).map((r, i) => card(r, i, res)).join('')}
        </div>`;
      bind();
    }

    function card(r, i, res) {
      const c = r.critic;
      const max = Number(settings.maxChars) || 280;
      const len = tweetLength(r.text);
      const issues = [...(r.violations || []).map((v) => v.msg), ...(c?.aiTells || []).map((t) => `Звучить як ШІ: «${t}»`)];
      return `<div class="card ${i === 0 ? 'best' : ''}" data-i="${i}">
        <textarea data-i="${i}" rows="3">${esc(r.text)}</textarea>
        <div class="meta">
          <span class="badge score ${cls(r.score)}" title="Загальна оцінка">${r.score}/10</span>
          ${
            c
              ? `<span class="badge ${cls(c.relevance)}" title="Релевантність посту">🎯 ${c.relevance}</span>
                 <span class="badge ${cls(c.human)}" title="Людяність (не ШІ)">🧠 ${c.human}</span>
                 <span class="badge ${cls(c.hook)}" title="Чіпляє / тригерить">🔥 ${c.hook}</span>
                 ${c.triggers ? '<span class="badge g" title="Критик вважає, що автор захоче відповісти">тригерить автора</span>' : ''}
                 ${c.generic ? '<span class="badge b">загальник</span>' : ''}
                 ${c.risk >= 6 ? `<span class="badge b" title="Ризик токсичності/бану">⚠ ризик ${c.risk}</span>` : ''}`
              : ''
          }
          <span class="cnt ${len > max ? 'over' : ''}">${len}/${max}</span>
        </div>
        ${r.angle ? `<div class="angle">💭 ${esc(r.angle)}</div>` : ''}
        ${c?.comment ? `<div class="angle">🧐 ${esc(c.comment)}</div>` : ''}
        ${settings.showTranslation && r.uk ? `<div class="tr">🇺🇦 ${esc(r.uk)}</div>` : ''}
        ${issues.length ? `<ul class="issues">${issues.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${r.fixes?.length ? `<details class="fixes"><summary>✓ Граматика: ${r.fixes.length} правк(и)</summary>${r.fixes.map((f) => `<div>${esc(f)}</div>`).join('')}</details>` : ''}
        <div class="acts">
          <button class="a pri" data-act="insert" data-i="${i}">Вставити в реплай</button>
          <button class="a" data-act="copy" data-i="${i}">Копіювати</button>
          ${REFINES.map(([label], k) => `<button class="a" data-act="refine" data-k="${k}" data-i="${i}">${label}</button>`).join('')}
        </div>
      </div>`;
    }

    function bind() {
      const el = cur.el;
      const st = stateFor(cur.article);
      el.querySelector('.hint').addEventListener('input', (e) => (st.hint = e.target.value));
      el.querySelector('.hint').addEventListener('keydown', (e) => {
        e.stopPropagation(); // гарячі клавіші X не мають спрацьовувати
        if (e.key === 'Enter' && !st.busy) generate();
      });
      el.querySelectorAll('textarea').forEach((ta) => {
        ta.addEventListener('keydown', (e) => e.stopPropagation());
        ta.addEventListener('input', () => {
          const r = st.result.replies[+ta.dataset.i];
          r.text = ta.value;
          const cnt = ta.parentElement.querySelector('.cnt');
          const max = Number(settings.maxChars) || 280;
          const len = tweetLength(ta.value);
          cnt.textContent = `${len}/${max}`;
          cnt.classList.toggle('over', len > max);
        });
      });
      el.addEventListener('click', onClick);
    }

    async function onClick(e) {
      const t = e.target.closest('[data-act],[data-style]');
      if (!t || !cur) return;
      e.preventDefault();
      const st = stateFor(cur.article);
      if (t.dataset.style) {
        st.styleId = t.dataset.style;
        return render();
      }
      const r = st.result?.replies?.[+t.dataset.i];
      switch (t.dataset.act) {
        case 'close':
          return close();
        case 'opts':
          return chrome.runtime.sendMessage({ type: 'openOptions' });
        case 'go':
          return generate();
        case 'copy':
          if (await copy(r.text)) toast('Скопійовано');
          saveHistory(cur.article, r, 'copy');
          return;
        case 'insert':
          return doInsert(cur.article, r);
        case 'refine':
          return generate({ text: r.text, instruction: REFINES[+t.dataset.k][1] });
      }
    }

    async function doInsert(article, r) {
      close();
      const ok = await insertReply(article, r.text);
      if (ok) toast('Вставлено — перевір і відправ');
      else {
        await copy(r.text);
        toast('Не вдалося вставити — текст скопійовано, встав Ctrl+V');
      }
      saveHistory(article, r, 'insert');
    }

    function saveHistory(article, r, action) {
      const post = extractPost(article);
      chrome.runtime
        .sendMessage({
          type: 'saveHistory',
          entry: { action, reply: r.text, score: r.score, author: post.authorHandle, post: (post.text || '').slice(0, 200), url: post.url },
        })
        .catch(() => {});
    }

    function generate(refine) {
      const article = cur.article;
      const st = stateFor(article);
      if (st.busy) return;
      let post;
      try {
        post = extractPost(article);
      } catch (e) {
        st.error = `Не вдалося прочитати пост: ${e.message}`;
        return render();
      }
      if (!post.text && !post.quoted && !post.images.length && !post.card) {
        st.error = 'У пості не знайдено тексту.';
        return render();
      }
      st.busy = true;
      st.error = null;
      st.steps = {};
      const prevResult = st.result;
      render();

      let port;
      try {
        port = chrome.runtime.connect({ name: 'trh' });
      } catch {
        st.busy = false;
        st.error = 'Розширення оновилось — перезавантаж сторінку.';
        return render();
      }
      const finish = () => {
        st.busy = false;
        try {
          port.disconnect();
        } catch {}
        if (cur?.article === article) render();
      };
      port.onMessage.addListener(async (m) => {
        if (m.type === 'progress') {
          st.steps[m.stage] = { status: m.status, note: m.note };
          if (cur?.article === article) render();
        } else if (m.type === 'result') {
          if (refine && prevResult) {
            // рефайн: нові варіанти зверху, старі лишаються нижче
            st.result = { ...m.result, replies: [...m.result.replies, ...prevResult.replies].slice(0, 8) };
          } else st.result = m.result;
          finish();
          if (settings.autoInsert && !refine && st.result.replies[0]) {
            if (cur?.article === article) await doInsert(article, st.result.replies[0]);
          }
        } else if (m.type === 'error') {
          st.error = m.message;
          st.errorCode = m.code;
          st.result = prevResult;
          finish();
        }
      });
      port.onDisconnect.addListener(() => {
        if (st.busy) {
          st.busy = false;
          st.error = st.error || "З'єднання з розширенням обірвалось. Спробуй ще раз.";
          if (cur?.article === article) render();
        }
      });
      port.postMessage({
        type: 'generate',
        post,
        styleId: st.styleId,
        hint: st.hint,
        refine,
        context: prevResult?.context || null,
      });
    }

    document.addEventListener('keydown', (e) => e.key === 'Escape' && cur && close());
    document.addEventListener(
      'mousedown',
      (e) => {
        if (!cur) return;
        const path = e.composedPath();
        if (path.includes(host) || path.includes(cur.btn)) return;
        close();
      },
      true
    );
    addEventListener('resize', () => cur && position(cur.el, cur.btn));
    addEventListener('scroll', () => {
      if (!cur) return;
      if (!cur.btn.isConnected) return close();
      position(cur.el, cur.btn);
    }, { passive: true });

    return { toggle, close, toast };
  })();
})();
