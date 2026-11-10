// E2E: справжній Chrome + розширення + макет x.com + мок Groq.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../..');
const EXT = path.join(os.tmpdir(), 'trh-ext');
const OUT = path.join(os.tmpdir(), 'trh-e2e-out');
fs.rmSync(EXT, { recursive: true, force: true });
fs.cpSync(SRC, EXT, { recursive: true, filter: (p) => !/(^|[\/])(\.git|node_modules|test)([\/]|$)/.test(path.relative(SRC, p)) });
const mf = JSON.parse(fs.readFileSync(`${EXT}/manifest.json`));
mf.host_permissions.push('http://127.0.0.1/*');
fs.writeFileSync(`${EXT}/manifest.json`, JSON.stringify(mf));
fs.mkdirSync(OUT, { recursive: true });

const calls = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const j = JSON.parse(body || '{}');
    const sys = j.messages?.[0]?.content || '';
    let out;
    if (sys.includes('аналітик')) {
      calls.push('context:' + req.headers.authorization.slice(7));
      out = { post_language: 'en', summary_uk: 'Автор каже, що 90% стартапів провалюються через погану команду, а не продукт.', translation_uk: '90% стартапів помирають через команду. Продукт — другорядне.', topic: 'стартапи і команди', tone: 'впевнене твердження', key_claims: ['90%'], weak_spots: ['цифра з повітря'], reply_angles: ['поставити під сумнів цифру'], sensitive: false };
    } else if (sys.includes('пишеш відповіді')) {
      calls.push('generate:' + req.headers.authorization.slice(7));
      out = { replies: [
        { text: '90% звідки? Половина "поганих команд" просто будувала те, що нікому не треба', angle: 'сумнів у цифрі' },
        { text: 'Це не просто команда, а ціла культура — варто зазначити #startup', angle: 'слоп для перевірки' },
        { text: 'команда погана рівно до того моменту, поки продукт не почав продаватись', angle: 'іронія' },
      ] };
    } else if (sys.includes('коректор')) {
      calls.push('grammar:' + req.headers.authorization.slice(7));
      out = { items: [{ i: 3, text: 'Команда погана рівно до моменту, поки продукт не почав продаватися', fixes: ['продаватись → продаватися', 'до того моменту → до моменту'] }] };
    } else if (sys.includes('редактор')) {
      calls.push('critic:' + req.headers.authorization.slice(7));
      out = { items: [
        { i: 1, relevance: 9, human: 9, hook: 8, risk: 2, generic: false, triggers_author: true, ai_tells: [], verdict: 'ok', comment: 'Б\'є в цифру, звучить живо' },
        { i: 2, relevance: 4, human: 2, hook: 3, risk: 1, generic: true, triggers_author: false, ai_tells: ['не просто команда, а ціла культура'], verdict: 'reject', comment: 'Шаблон ШІ' },
        { i: 3, relevance: 8, human: 8, hook: 7, risk: 2, generic: false, triggers_author: false, ai_tells: [], verdict: 'ok', comment: 'Іронія по суті' },
      ] };
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }));
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

const X_HTML = fs.readFileSync(path.join(HERE, 'x-mock.html'), 'utf8');
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/usr/local/bin/google-chrome',
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox', '--window-size=1280,900'],
  defaultViewport: { width: 1280, height: 900 },
});
const swTarget = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'));console.log('sw', swTarget.url());
const extPage = await browser.newPage(); await extPage.goto('chrome-extension://' + new URL(swTarget.url()).host + '/src/popup.html'); const sw = extPage;
const extId = new URL(swTarget.url()).host;
await sw.evaluate(async (port) => {
  for (let i = 0; i < 50; i++) {
    const { settings } = await chrome.storage.local.get('settings');
    if (settings) {
      await chrome.storage.local.set({ settings: { ...settings, keys: { context: 'k1', generate: 'k2', grammar: 'k3', critic: 'k4' }, apiBase: `http://127.0.0.1:${port}`, languageTool: false } });
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('no settings');
}, PORT);
for (const p of await browser.pages()) if (p.url().includes('options.html')) await p.close();

const page = await browser.newPage();
await page.setRequestInterception(true);
page.on('request', (r) => (r.url().startsWith('https://x.com/') ? r.respond({ status: 200, contentType: 'text/html', body: X_HTML }) : r.continue()));
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('https://x.com/home');
await page.waitForSelector('.trh-btn', { timeout: 5000 });
console.log('buttons injected:', await page.$$eval('.trh-btn', (b) => b.length));
await page.click('article:nth-of-type(1) .trh-btn');
const shadow = async (fn, ...a) => page.evaluate((f, ...a) => new Function('root', ...a.map((_, i) => 'a' + i), f)(document.getElementById('trh-host').shadowRoot, ...a), fn.toString().replace(/^[^{]*{|}$/g, ''), ...a);
await page.waitForFunction(() => document.getElementById('trh-host')?.shadowRoot.querySelector('.chip'));
await page.screenshot({ path: `${OUT}/1-panel.png` });
// вибрати стиль "Байт" і згенерувати
await page.evaluate(() => {
  const r = document.getElementById('trh-host').shadowRoot;
  r.querySelector('[data-style="bait"]').click();
});
await page.evaluate(() => document.getElementById('trh-host').shadowRoot.querySelector('[data-act="go"]').click());
await page.waitForFunction(() => document.getElementById('trh-host').shadowRoot.querySelectorAll('.card').length === 3, { timeout: 15000 });
await page.screenshot({ path: `${OUT}/2-results.png` });
const cards = await page.evaluate(() =>
  [...document.getElementById('trh-host').shadowRoot.querySelectorAll('.card')].map((c) => ({
    text: c.querySelector('textarea').value,
    score: c.querySelector('.score').textContent,
    issues: [...c.querySelectorAll('.issues li')].map((l) => l.textContent),
    fixes: c.querySelector('.fixes summary')?.textContent || '',
  }))
);
console.log('calls:', calls.join(' → '));
if (calls.join() !== 'context:k1,generate:k2,grammar:k3,critic:k4') throw new Error('each stage must use its own key');
console.log(JSON.stringify(cards, null, 1));
// вставити найкращий
await page.evaluate(() => document.getElementById('trh-host').shadowRoot.querySelector('[data-act="insert"]').click());
await page.waitForFunction(() => document.querySelector('[role="dialog"] [data-testid="tweetTextarea_0"]')?.textContent.length > 5, { timeout: 5000 });
await new Promise((r) => setTimeout(r, 1200)); // дати редактору перемалюватись
const inserted = await page.$eval('[role="dialog"] [data-testid="tweetTextarea_0"]', (e) => e.textContent.replace(/\u00a0/g, ' '));
console.log('inserted:', inserted);
if (inserted !== cards[0].text) throw new Error(`reply must be inserted exactly once, got: ${inserted}`);
await page.screenshot({ path: `${OUT}/3-inserted.png` });
await new Promise(r=>setTimeout(r,800)); const hist = await sw.evaluate(async () => (await chrome.storage.local.get('history')).history);
console.log('history entries:', hist?.length, hist?.[0]?.author);
if (hist?.[0]?.author !== '@startupguru') throw new Error('author not parsed');

// Сценарій B: лише ключ генерації — решта етапів пропускаються, реплаї все одно є.
calls.length = 0;
await sw.evaluate(async () => {
  const { settings } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({ settings: { ...settings, keys: { context: '', generate: 'k2', grammar: '', critic: '' } } });
});
await page.keyboard.press('Escape');
await page.evaluate(() => document.querySelector('[role="dialog"]')?.remove());
await page.click('article:nth-of-type(2) .trh-btn');
await page.waitForFunction(() => document.getElementById('trh-host')?.shadowRoot.querySelector('[data-act="go"]'));
await page.evaluate(() => document.getElementById('trh-host').shadowRoot.querySelector('[data-act="go"]').click());
await page.waitForFunction(() => document.getElementById('trh-host').shadowRoot.querySelectorAll('.card').length > 0, { timeout: 15000 });
const steps = await page.evaluate(() =>
  [...document.getElementById('trh-host').shadowRoot.querySelectorAll('.st')].map((s) => `${s.className.replace('st ', '')}:${s.querySelector('.nt').textContent}`)
);
console.log('only-generate calls:', calls.join(), '| steps:', steps.join(' | '));
if (calls.join() !== 'generate:k2') throw new Error('optional stages must be skipped without keys');
await page.screenshot({ path: `${OUT}/5-only-generate.png` });

const opt = await browser.newPage();
await opt.goto(`chrome-extension://${extId}/src/options.html`);
await opt.waitForSelector('.stage');
await opt.screenshot({ path: `${OUT}/4-options.png`, fullPage: false });
await browser.close();
server.close();
