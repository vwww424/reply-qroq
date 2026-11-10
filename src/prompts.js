import { LENGTHS, LANG_NAMES } from './defaults.js';

export function langName(code) {
  return LANG_NAMES[code] || code || 'українська';
}

export function postToText(post) {
  const lines = [];
  if (post.thread?.length) {
    lines.push('Попередні пости в гілці (для контексту):');
    post.thread.forEach((t) => lines.push(`- ${t.author}: ${t.text}`));
    lines.push('');
  }
  lines.push(`Автор: ${post.authorName || ''} ${post.authorHandle || ''}`.trim());
  lines.push(`Текст поста:\n"""${post.text || '(без тексту)'}"""`);
  if (post.truncated) lines.push('(текст у стрічці обрізаний — "Показати більше")');
  if (post.quoted) lines.push(`Цитує пост ${post.quoted.author || ''}:\n"""${post.quoted.text}"""`);
  if (post.images?.length) lines.push(`Зображення (alt): ${post.images.join(' | ')}`);
  if (post.hasMedia && !post.images?.length) lines.push('(у пості є фото/відео без опису)');
  if (post.card) lines.push(`Картка посилання: ${post.card}`);
  return lines.join('\n');
}

// ---------- 1. Контекст ----------
export const CONTEXT_SYSTEM = `Ти аналітик постів у X (Twitter). Твоє завдання — зрозуміти пост так, як його розуміє досвідчений користувач твіттера: підтекст, іронію, на кого це націлено.
Поверни тільки JSON такої форми:
{
  "post_language": "код мови поста: uk | en | ru | pl | de | ...",
  "summary_uk": "1-2 речення українською: про що пост і що автор насправді хоче сказати",
  "translation_uk": "переклад поста українською, якщо пост не українською, інакше порожній рядок",
  "topic": "тема в 2-4 словах",
  "tone": "тон поста (серйозний, іронія, хвастощі, скарга, байт, новина...)",
  "author_intent": "навіщо автор це написав",
  "key_claims": ["конкретні тези/цифри/твердження з поста"],
  "weak_spots": ["що в пості можна оскаржити, де перебільшення, що він не врахував"],
  "reply_angles": ["3-5 конкретних кутів для сильної відповіді саме на цей пост"],
  "sensitive": false,
  "sensitive_reason": "якщо тема трагічна/смерть/війна-втрати — коротко чому, щоб не жартувати"
}`;

// ---------- 2. Генерація ----------
export function generateSystem(settings, style, lang, count) {
  const max = Math.min(LENGTHS[settings.length]?.max || 200, Number(settings.maxChars) || 280);
  const banned = settings._bannedList.join(', ');
  const parts = [];
  parts.push(
    'Ти пишеш відповіді (реплаї) в X/Twitter від імені конкретної живої людини. Ти не асистент, не бренд і не коуч. Твоя мета — відповідь, яку захочеться лайкнути або на яку автор захоче відповісти.'
  );
  if (settings.persona?.trim()) parts.push(`Про людину, від імені якої пишеш:\n${settings.persona.trim()}`);
  if (settings.voiceExamples?.trim()) {
    parts.push(
      `Приклади того, як ця людина пише (копіюй манеру, ритм і лексику, але НЕ зміст):\n${settings.voiceExamples.trim()}`
    );
  }
  parts.push(`СТИЛЬ ВІДПОВІДІ: ${style.name}. ${style.prompt}`);
  parts.push(`Як писати:
- Одна чітка думка на відповідь. Своя позиція, а не переказ поста.
- Чіпляйся за конкретну деталь поста (цифру, слово, твердження). Відповідь, яку можна вставити під будь-який інший пост, — провал.
- Без вступів, без компліментів автору, без "погоджуюсь", без підсумків і моралі в кінці.
- Жива розмовна мова, як у месенджері: короткі речення, можна неповні, легкий сленг. Без канцеляриту і пафосу.
- Без довгого тире (—), без конструкції "не просто X, а Y", без трьох прикметників підряд, без питань-закликів типу "а ви що думаєте?".
- Не вигадуй статистику, цитати, імена чи особисті історії. Якщо потрібен приклад — загальновідомий або гіпотетичний.
- Без образ, погроз і дискримінації: гострота через думку, а не через хамство.
- Довжина: до ${max} символів. Коротше — краще.
- ${settings.allowEmoji ? 'Емодзі можна, але максимум одне і лише якщо доречне.' : 'Без емодзі.'} ${settings.allowHashtags ? '' : 'Без хештегів.'}
- ${settings.lowercase ? 'Пиши з маленької літери і без крапки в кінці, як більшість людей у твіттері.' : 'Звичайна пунктуація.'}
- Мова відповіді: ${langName(lang)}.${lang === 'uk' ? ' Сучасна жива українська без русизмів, суржику і кальок з англійської.' : ''}`);
  if (settings.extraRules?.trim()) parts.push(`Додаткові правила від користувача:\n${settings.extraRules.trim()}`);
  parts.push(`ЗАБОРОНЕНІ слова та фрази — не використовуй їх у жодній формі, а також їхні переклади і синоніми-штампи: ${banned}`);
  const ukField = lang !== 'uk' ? ', "uk": "переклад цієї відповіді українською"' : '';
  parts.push(`Поверни тільки JSON:
{"replies": [{"text": "текст відповіді", "angle": "коротко українською: яка думка/кут"${ukField}}]}
Рівно ${count} варіант(и), кожен з іншим кутом.`);
  return parts.join('\n\n');
}

export function generateUser(post, ctx, { hint, feedback, refine } = {}) {
  const parts = [postToText(post)];
  if (ctx) {
    parts.push(
      `Аналіз поста:\n${JSON.stringify(
        {
          summary: ctx.summary_uk,
          tone: ctx.tone,
          intent: ctx.author_intent,
          key_claims: ctx.key_claims,
          weak_spots: ctx.weak_spots,
          angles: ctx.reply_angles,
          sensitive: ctx.sensitive ? ctx.sensitive_reason || true : false,
        },
        null,
        1
      )}`
    );
  }
  if (hint?.trim()) parts.push(`Побажання користувача до відповіді: ${hint.trim()}`);
  if (refine) {
    parts.push(`Ось чернетка відповіді:\n"""${refine.text}"""\nПерепиши її так: ${refine.instruction}. Збережи головну думку, якщо інструкція не каже інакше.`);
  }
  if (feedback?.length) {
    parts.push(
      `Попередні варіанти відхилив редактор. Не повторюй їх і виправ помилки:\n${feedback
        .map((f) => `- "${f.text}" → ${f.problem}`)
        .join('\n')}`
    );
  }
  return parts.join('\n\n');
}

// ---------- 3. Граматика ----------
export function grammarSystem(lang, bannedSample) {
  return `Ти прискіпливий коректор. Мова текстів: ${langName(lang)}.
Виправ ЛИШЕ: орфографію, пунктуацію, граматику, узгодження слів${
    lang === 'uk' ? ', русизми, суржик, кальки з російської та англійської, російські літери (ы, э, ъ, ё)' : ''
  }.
НЕ змінюй зміст, тон, сленг, грубуватість, іронію і довжину. Не додавай нових думок, не роби текст "красивішим" чи офіційнішим. Розмовні слова і навмисна недбалість (маленька літера, без крапки) — це стиль, не помилка.
Якщо в тексті є довге тире (—), заміни його на кому, крапку або дефіс. Якщо є слова-штампи ШІ (${bannedSample}...) — заміни простими розмовними.
Тобі можуть дати підказки від автоматичного спелчекера LanguageTool — вони бувають хибними, перевір кожну сам.
Поверни тільки JSON:
{"items": [{"i": номер, "text": "виправлений текст", "fixes": ["було → стало", ...]}]}
Якщо помилок немає — поверни текст без змін і порожній fixes.`;
}

export function grammarUser(items) {
  return items
    .map((it) => {
      let s = `#${it.i}: """${it.text}"""`;
      if (it.lt?.length) s += `\nLanguageTool: ${it.lt.join('; ')}`;
      if (it.violations?.length) s += `\nЛокальна перевірка знайшла: ${it.violations.map((v) => v.msg).join('; ')}`;
      return s;
    })
    .join('\n\n');
}

// ---------- 4. Критик ----------
export const CRITIC_SYSTEM = `Ти суворий редактор X/Twitter, який ненавидить ШІ-слоп. Тобі дають пост і кілька варіантів відповіді на нього.
Оціни кожен варіант від 0 до 10:
- relevance: чи відповідає саме на цей пост, чи чіпляється за конкретику, чи зрозумів автора правильно (а не загальник).
- human: чи звучить як жива людина, а не ШІ. Мінус за: компліменти автору, канцелярит, пафос, "не просто X, а Y", довге тире, рівний "вилизаний" ритм, мораль у кінці, штампи.
- hook: чи має своя позиція/гостроту, чи захочеться автору або читачам відповісти, лайкнути, посперечатися.
- risk: ризик образи, токсичності, бану або що це виглядає як троль (0 = безпечно, 10 = дуже ризиковано).
Також:
- generic: true, якщо відповідь можна вставити під будь-який інший пост на цю тему.
- triggers_author: true, якщо відповідь реально зачепить автора (він захоче відповісти).
- ai_tells: конкретні фрагменти, що видають ШІ (може бути порожньо).
- verdict: "ok" | "weak" | "reject".
- comment: 1 коротке речення українською — головна проблема або чому це добре.
Будь суворим: 9-10 — лише справді сильні, людяні відповіді.
Поверни тільки JSON:
{"items": [{"i": номер, "relevance": 0, "human": 0, "hook": 0, "risk": 0, "generic": false, "triggers_author": false, "ai_tells": [], "verdict": "ok", "comment": ""}]}`;

export function criticUser(post, ctx, items) {
  return `${postToText(post)}${ctx?.summary_uk ? `\n\nСуть поста: ${ctx.summary_uk}` : ''}

Варіанти відповіді:
${items.map((it) => `#${it.i}: """${it.text}"""`).join('\n')}`;
}
