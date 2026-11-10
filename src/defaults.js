// Дефолтні налаштування. Один модуль для background та сторінки налаштувань.

export const DEFAULT_STYLES = [
  {
    id: 'bait',
    name: 'Байт',
    emoji: '🎣',
    prompt:
      'Контроверсійна, але захищувана позиція, на яку автору чи читачам захочеться заперечити. Сміливе коротке твердження без пояснень на три абзаци. Під байтом має бути реальна думка, а не тролінг заради тролінгу.',
  },
  {
    id: 'opinion',
    name: 'Своя думка',
    emoji: '💡',
    prompt:
      'Чітка власна позиція щодо поста плюс один конкретний аргумент або приклад. Ніяких "з одного боку, з іншого". Обери сторону.',
  },
  {
    id: 'disagree',
    name: 'Незгода',
    emoji: '⚔️',
    prompt:
      'Аргументовано не погоджуйся з головною тезою або з конкретною деталлю поста. Покажи слабке місце. Спокійно і впевнено, без хамства.',
  },
  {
    id: 'irony',
    name: 'Іронія',
    emoji: '😏',
    prompt:
      'Суха іронія або сарказм, що підсвічує абсурд чи суперечність у пості. Коротко. Жарт має бути зрозумілим без пояснень.',
  },
  {
    id: 'question',
    name: 'Гостре питання',
    emoji: '❓',
    prompt:
      'Одне незручне конкретне питання, що б\'є в слабке місце тези і на яке автору захочеться відповісти. Не "а що ви думаєте?".',
  },
  {
    id: 'addon',
    name: 'Доповнення',
    emoji: '➕',
    prompt:
      'Додай те, чого в пості немає: неочевидний наслідок, контрприклад, практичну деталь, інший кут. Як людина, яка реально в темі.',
  },
  {
    id: 'support',
    name: 'Підтримка з кутом',
    emoji: '🤝',
    prompt:
      'Погодься, але не порожньо: додай свою причину, досвід або підсилення, якого автор не сказав. Без "повністю згоден".',
  },
  {
    id: 'joke',
    name: 'Жарт',
    emoji: '😂',
    prompt:
      'Коротка смішна відповідь: мемна інтонація, гра слів або несподіване порівняння. Максимально коротко.',
  },
];

// Зібрано з публічних списків "AI words" (Pangram, SlopDetector, Twick, Diglot, jodiecook.com ban list)
// плюс типові кальки, які LLM видають українською. Рядок з "*" = будь-яке закінчення.
export const DEFAULT_BANNED = `// --- English ---
delve*
tapestry
testament
moreover
furthermore
foster*
pivotal
realm
underscore*
intricate
meticulous*
navigat*
landscape
ever-evolving
ever-changing
game-changer
game changer
leverag*
harness*
unlock*
unleash*
elevat*
embark*
journey
robust
seamless*
crucial
paramount
comprehensive
multifaceted
nuanced
holistic
synergy
paradigm
transformative
revolutioniz*
cutting-edge
groundbreaking
vibrant
bustling
captivating
compelling
profound
resonat*
showcase*
commendable
noteworthy
notably
indeed
ultimately
in conclusion
in summary
it's worth noting
it is important to note
important to remember
at the end of the day
in today's world
in today's fast-paced
plays a crucial role
dive into
deep dive
let's dive
buckle up
great question
great point
great insight
hope this helps
food for thought
shed light
beacon
symphony
labyrinth
interplay
kaleidoscope
embrace
empower*
streamline*
spearhead*
bolster*
myriad
plethora
amidst
whilst
couldn't agree more
could not agree more
spot on
well said
love this
so true
thanks for sharing
this resonates
absolutely
certainly
// --- Українською ---
занур*
заглиб*
гобелен*
мозаїк*
свідченням того
є свідченням
варто зазначити
варто відзначити
варто підкреслити
важливо зазначити
важливо пам'ятати
важливо розуміти
слід зазначити
слід пам'ятати
необхідно підкреслити
підкреслює
відіграє ключову роль
відіграє важливу роль
відіграє вирішальну роль
ключову роль
ключовий аспект
у сучасному світі
в сучасному світі
у наш час
в епоху
в еру
у світі, де
динамічному світі
постійно змінюваному
стрімко змінюваному
безумовно
безсумнівно
без сумніву
надзвичайно важлив*
неймовірн*
вражаюч*
інноваційн*
революційн*
трансформаці*
трансформаційн*
змінює правила гри
змінив правила гри
гейм-чейнджер*
комплексний підхід
цілісний підхід
багатогранн*
всеосяжн*
бездоганн*
безшовн*
безперешкодн*
розкрити потенціал
розкриває потенціал
розблокува*
сприяє
сприяти
сприяння
потужний інструмент
першорядне значення
ландшафт
подорож
підсумовуючи
на завершення
у підсумку
в підсумку
чудовий пост
чудова думка
цікава думка
влучно сказано
влучне зауваження
повністю погоджуюс*
повністю згоден
повністю згодна
не можу не погодитис*
дякую, що поділил*
дякую за пост
гарне питання
чудове питання
надихає
надихаюч*
давайте розберемос*
давайте поговоримо
у світлі
резонує
знаходить відгук
яскравий приклад
синергі*
парадигм*
нюансован*
оптимізува*
маяк
симфоні*
лабіринт*
калейдоскоп*
`;

export const DEFAULT_SETTINGS = {
  apiKey: '',
  apiBase: 'https://api.groq.com/openai/v1',
  models: {
    context: 'openai/gpt-oss-20b',
    generate: 'openai/gpt-oss-120b',
    grammar: 'openai/gpt-oss-120b',
    critic: 'llama-3.3-70b-versatile',
  },
  reasoningEffort: 'low',
  temperature: 0.95,

  replyLanguage: 'uk', // uk | en | auto (мова поста)
  showTranslation: true,
  variants: 3,
  length: 'medium', // short | medium | long
  maxChars: 280,
  lowercase: false,
  allowEmoji: false,
  allowHashtags: false,
  replaceDashes: true,

  persona: '',
  voiceExamples: '',
  extraRules: '',

  styles: DEFAULT_STYLES,
  defaultStyleId: 'opinion',

  bannedWords: DEFAULT_BANNED,
  patternChecks: true,

  stageGrammar: true,
  stageCritic: true,
  languageTool: true,
  minScore: 6.5,
  maxRounds: 2,

  autoInsert: false,
  hideSensitiveWarning: false,
  history: true,
};

export const LENGTHS = {
  short: { label: 'Коротко', max: 120 },
  medium: { label: 'Середньо', max: 200 },
  long: { label: 'Довго', max: 280 },
};

export const LANG_NAMES = {
  uk: 'українська',
  en: 'English',
  pl: 'польська',
  de: 'німецька',
  es: 'іспанська',
  fr: 'французька',
  ru: 'українська', // на російський пост все одно відповідаємо українською
};

export function mergeSettings(stored = {}) {
  const s = { ...DEFAULT_SETTINGS, ...stored };
  s.models = { ...DEFAULT_SETTINGS.models, ...(stored.models || {}) };
  if (!Array.isArray(s.styles) || !s.styles.length) s.styles = DEFAULT_STYLES;
  return s;
}
