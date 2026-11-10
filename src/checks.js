// Локальні (без API) перевірки та очищення тексту реплаю.

const NOT_LETTER_BEFORE = '(?<![\\p{L}\\p{N}_])';
const NOT_LETTER_AFTER = '(?![\\p{L}\\p{N}_])';

export const normalizeApostrophes = (s) => s.replace(/[’ʼ`´‘]/g, "'");
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parseBannedList(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'));
}

export function compileBanned(words) {
  return words.map((word) => {
    const body = normalizeApostrophes(word.toLowerCase())
      .split('*')
      .map(escapeRe)
      .join('\\p{L}*')
      .replace(/\s+/g, '\\s+');
    return { word, re: new RegExp(NOT_LETTER_BEFORE + body + NOT_LETTER_AFTER, 'iu') };
  });
}

export const AI_PATTERNS = [
  { id: 'dash', re: /[—–]/u, msg: 'Довге тире (—) — класична ознака ШІ' },
  {
    id: 'not-just',
    re: /не\s+(просто|лише|тільки)\s+[^.!?]{1,60}?,\s*(а|але)\s/iu,
    msg: 'Конструкція «не просто X, а Y»',
  },
  {
    id: 'not-just-en',
    re: /\b(it'?s|this is|is)\s+not\s+(just|only|merely)\b[^.!?]{1,60}?\b(it'?s|but)\b/i,
    msg: 'Конструкція «not just X, it\'s Y»',
  },
  { id: 'ru-letters', re: /[ыэъёЫЭЪЁ]/u, msg: 'Російські літери (ы, э, ъ, ё)' },
  { id: 'hashtag', re: /(^|\s)#[\p{L}\d_]+/u, msg: 'Хештег', when: (s) => !s.allowHashtags },
  { id: 'emoji', re: /\p{Extended_Pictographic}/u, msg: 'Емодзі', when: (s) => !s.allowEmoji },
  { id: 'exclaim', re: /!{2,}/, msg: 'Кілька знаків оклику підряд' },
  {
    id: 'as-ai',
    re: /(мовна\s+модель|штучний\s+інтелект,?\s+я|як\s+ші\b|as an ai|language model)/iu,
    msg: 'Згадка про ШІ/модель',
  },
  {
    id: 'compliment-open',
    re: /^(чудов|класн|цікав\p{L}*\s+(думк|пост|тез)|влучн|гарн\p{L}*\s+(пост|думк)|great|love this|well said|spot on|so true)/iu,
    msg: 'Починається з компліменту/оцінки поста',
  },
  {
    id: 'cta-end',
    re: /(а\s+(ви|ти)\s+(що\s+)?(думаєте|думаєш|як\s+вважаєте)|what do you think|thoughts\?)\s*\??\s*$/iu,
    msg: 'Шаблонне питання наприкінці («а ви що думаєте?»)',
  },
];

export function checkText(text, settings, compiledBanned) {
  const violations = [];
  const norm = normalizeApostrophes(text);
  for (const { word, re } of compiledBanned) {
    const m = norm.match(re);
    if (m) violations.push({ type: 'banned', match: m[0], msg: `Заборонене слово: «${m[0]}»` });
  }
  if (settings.patternChecks !== false) {
    for (const p of AI_PATTERNS) {
      if (p.when && !p.when(settings)) continue;
      const m = norm.match(p.re);
      if (m) violations.push({ type: 'pattern', id: p.id, match: m[0].trim(), msg: p.msg });
    }
  }
  const max = Number(settings.maxChars) || 280;
  if (tweetLength(text) > max) {
    violations.push({ type: 'length', msg: `Задовго: ${tweetLength(text)}/${max}` });
  }
  return violations;
}

// X рахує емодзі як 2, а URL як 23 символи; для кирилиці/латиниці — 1.
export function tweetLength(text) {
  let len = 0;
  const noUrls = text.replace(/https?:\/\/\S+/g, () => {
    len += 23;
    return '';
  });
  for (const ch of noUrls) len += /\p{Extended_Pictographic}/u.test(ch) ? 2 : 1;
  return len;
}

export function sanitize(text, settings) {
  let t = String(text || '').trim();
  // зайві лапки навколо всього реплаю
  t = t.replace(/^["«“„'](.*)["»”“']$/su, '$1').trim();
  // X сам підставляє @автора, модель іноді дублює
  t = t.replace(/^(@\w+\s+)+/, '');
  if (settings.replaceDashes) {
    t = t.replace(/\s*[—–]\s*/g, ' - ');
  }
  if (!settings.allowHashtags) {
    t = t.replace(/(\s+#[\p{L}\d_]+)+\s*$/u, ''); // хвіст з хештегів
    t = t.replace(/(^|\s)#([\p{L}\d_]+)/gu, '$1$2');
  }
  if (!settings.allowEmoji) {
    t = t.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '');
  }
  t = t.replace(/[ \t]{2,}/g, ' ').replace(/ +([,.!?])/g, '$1').trim();
  if (settings.lowercase && t) {
    t = t[0].toLocaleLowerCase('uk') + t.slice(1);
    t = t.replace(/\.$/, '');
  }
  return t;
}
