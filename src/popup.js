const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

document.getElementById('opts').onclick = () => chrome.runtime.openOptionsPage();

(async () => {
  const { settings = {}, history = [] } = await chrome.storage.local.get(['settings', 'history']);
  const status = document.getElementById('status');
  const s = settings;
  const k = s.keys || {};
  const parts = [
    ['1 контекст', k.context && s.stageContext !== false],
    ['2 генерація', k.generate || s.apiKey],
    ['3 граматика', k.grammar && s.stageGrammar !== false],
    ['4 оцінка', k.critic && s.stageCritic !== false],
  ].map(([n, on]) => `<span class="${on || (s.keyFallback && k.generate) ? 'ok' : 'muted'}">● ${n}</span>`);
  status.innerHTML = (k.generate || s.apiKey)
    ? `${parts.join(' ')}<br><span class="muted">Відкрий x.com і натисни ✎ біля поста.</span>`
    : `<span class="bad">● Немає ключа генерації.</span> <span class="muted">Додай його в налаштуваннях.</span>`;

  const list = document.getElementById('list');
  if (!history.length) {
    list.innerHTML = '<div class="empty">Тут з\'являться вставлені й скопійовані реплаї</div>';
    return;
  }
  list.innerHTML = history
    .slice(0, 30)
    .map(
      (h, i) => `<div class="item">
        <div class="muted">${esc(h.author)}: ${esc((h.post || '').slice(0, 90))}${(h.post || '').length > 90 ? '…' : ''}</div>
        <div class="reply">${esc(h.reply)}</div>
        <div class="meta">
          <span>${new Date(h.ts).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })}</span>
          ${h.score != null ? `<span>${h.score}/10</span>` : ''}
          ${h.url ? `<a href="${esc(h.url)}" target="_blank">пост ↗</a>` : ''}
          <button class="ghost" data-i="${i}">Копіювати</button>
        </div></div>`
    )
    .join('');
  list.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    await navigator.clipboard.writeText(history[+b.dataset.i].reply);
    b.textContent = '✓';
  });
})();
