import { chatJson, languageTool } from './api.js';
import { checkText, compileBanned, parseBannedList, sanitize } from './checks.js';
import {
  CONTEXT_SYSTEM,
  CRITIC_SYSTEM,
  criticUser,
  generateSystem,
  generateUser,
  grammarSystem,
  grammarUser,
  postToText,
} from './prompts.js';
import { keyFor, stageOff } from './defaults.js';

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const num = (v) => clamp(Number(v) || 0, 0, 10);

function replyLang(settings, ctx, post) {
  if (settings.replyLanguage !== 'auto') return settings.replyLanguage || 'uk';
  let l = String(ctx?.post_language || '').toLowerCase().slice(0, 2);
  // без етапу контексту — груба евристика за алфавітом
  if (!l) l = /[a-z]/i.test(post?.text || '') && !/[а-яіїєґ]/i.test(post?.text || '') ? 'en' : 'uk';
  return l === 'ru' ? 'uk' : l;
}

function score(it) {
  const bad = it.violations.filter((v) => v.type !== 'length').length;
  const tooLong = it.violations.some((v) => v.type === 'length');
  let s;
  if (it.critic) {
    const c = it.critic;
    s = 0.35 * c.relevance + 0.35 * c.human + 0.3 * c.hook;
    if (c.generic) s -= 2;
    if (c.risk >= 7) s -= 1.5;
  } else {
    s = 7;
  }
  s -= bad * 1.5 + (tooLong ? 1 : 0);
  return Math.round(clamp(s, 0, 10) * 10) / 10;
}

/**
 * 4 етапи: контекст → генерація → граматика → критик (з повтором слабких варіантів).
 * emit({stage, status: 'run'|'done'|'skip'|'error'|'wait', note})
 */
export async function runPipeline({ settings, post, styleId, hint, refine, context }, emit) {
  const bannedList = parseBannedList(settings.bannedWords);
  const compiled = compileBanned(bannedList);
  settings = { ...settings, _bannedList: bannedList };
  const style = settings.styles.find((s) => s.id === styleId) || settings.styles[0];
  const waitNote = (stage) => (ms) => emit({ stage, status: 'wait', note: `ліміт Groq, чекаю ${Math.ceil(ms / 1000)}с` });
  const off = Object.fromEntries(['context', 'grammar', 'critic'].map((k) => [k, stageOff(settings, k)]));

  // 1. Контекст (опційно: без нього генерація бачить лише сирий пост)
  let ctx = context;
  if (ctx) {
    emit({ stage: 'context', status: 'skip', note: 'вже проаналізовано' });
  } else if (off.context) {
    ctx = null;
    emit({ stage: 'context', status: 'skip', note: off.context });
  } else {
    emit({ stage: 'context', status: 'run' });
    try {
      ctx = await chatJson({
        settings,
        apiKey: keyFor(settings, 'context'),
        model: settings.models.context,
        system: CONTEXT_SYSTEM,
        user: postToText(post),
        temperature: 0.2,
        maxTokens: 1800,
        onWait: waitNote('context'),
      });
      emit({ stage: 'context', status: 'done', note: ctx.topic || '' });
    } catch (e) {
      ctx = null;
      emit({ stage: 'context', status: 'error', note: `${e.message} — продовжую без нього` });
    }
  }
  const lang = replyLang(settings, ctx, post);
  const count = refine ? 2 : clamp(Number(settings.variants) || 3, 1, 5);
  const rounds = refine || off.critic ? 1 : clamp(Number(settings.maxRounds) || 1, 1, 3);
  const minScore = Number(settings.minScore) || 6.5;

  let pool = [];
  let feedback = [];
  for (let round = 1; round <= rounds; round++) {
    // 2. Генерація
    emit({ stage: 'generate', status: 'run', note: round > 1 ? `раунд ${round}: переписую слабкі` : '' });
    const gen = await chatJson({
      settings,
      apiKey: keyFor(settings, 'generate'),
      model: settings.models.generate,
      system: generateSystem(settings, style, lang, count),
      user: generateUser(post, ctx, { hint, feedback, refine }),
      temperature: Number(settings.temperature) || 0.9,
      maxTokens: 3500,
      onWait: waitNote('generate'),
    });
    const items = (gen.replies || gen.items || [])
      .filter((r) => r && typeof r.text === 'string' && r.text.trim())
      .slice(0, count)
      .map((r, idx) => ({
        i: idx + 1,
        text: sanitize(r.text, settings),
        original: r.text,
        angle: r.angle || '',
        uk: lang !== 'uk' ? r.uk || '' : '',
        fixes: [],
        lt: [],
        round,
      }));
    if (!items.length) throw new Error('Модель не повернула жодної відповіді. Спробуй ще раз або іншу модель.');
    items.forEach((it) => (it.violations = checkText(it.text, settings, compiled)));
    emit({ stage: 'generate', status: 'done', note: `${items.length} варіант(и)` });

    // 3. Граматика
    if (!off.grammar) {
      emit({ stage: 'grammar', status: 'run' });
      if (settings.languageTool) {
        await Promise.all(items.map(async (it) => (it.lt = await languageTool(it.text, lang))));
      }
      try {
        const g = await chatJson({
          settings,
          apiKey: keyFor(settings, 'grammar'),
          model: settings.models.grammar,
          system: grammarSystem(lang, bannedList.slice(0, 12).join(', ')),
          user: grammarUser(items),
          temperature: 0.1,
          maxTokens: 2500,
          onWait: waitNote('grammar'),
        });
        for (const gi of g.items || []) {
          const it = items.find((x) => x.i === Number(gi.i));
          if (!it || typeof gi.text !== 'string' || !gi.text.trim()) continue;
          const fixed = sanitize(gi.text, settings);
          const ratio = fixed.length / Math.max(it.text.length, 1);
          // коректор інколи переписує текст цілком — таке ігноруємо
          if (ratio < 0.6 || ratio > 1.5) continue;
          if (fixed !== it.text) {
            it.fixes = (Array.isArray(gi.fixes) ? gi.fixes : []).filter((f) => typeof f === 'string' && f.trim()).slice(0, 6);
            if (!it.fixes.length) it.fixes = ['дрібні правки'];
            it.text = fixed;
          }
        }
        items.forEach((it) => (it.violations = checkText(it.text, settings, compiled)));
        const n = items.filter((it) => it.fixes.length).length;
        emit({ stage: 'grammar', status: 'done', note: n ? `виправлено у ${n}` : 'помилок не знайдено' });
      } catch (e) {
        emit({ stage: 'grammar', status: 'error', note: e.message });
      }
    } else {
      emit({ stage: 'grammar', status: 'skip', note: off.grammar });
    }

    // 4. Критик
    if (!off.critic) {
      emit({ stage: 'critic', status: 'run' });
      try {
        const c = await chatJson({
          settings,
          apiKey: keyFor(settings, 'critic'),
          model: settings.models.critic,
          system: CRITIC_SYSTEM,
          user: criticUser(post, ctx, items),
          temperature: 0.1,
          maxTokens: 2000,
          onWait: waitNote('critic'),
        });
        for (const ci of c.items || []) {
          const it = items.find((x) => x.i === Number(ci.i));
          if (!it) continue;
          it.critic = {
            relevance: num(ci.relevance),
            human: num(ci.human),
            hook: num(ci.hook),
            risk: num(ci.risk),
            generic: !!ci.generic,
            triggers: !!ci.triggers_author,
            aiTells: Array.isArray(ci.ai_tells) ? ci.ai_tells.filter((x) => typeof x === 'string').slice(0, 4) : [],
            verdict: ci.verdict || '',
            comment: ci.comment || '',
          };
        }
      } catch (e) {
        emit({ stage: 'critic', status: 'error', note: e.message });
      }
    } else {
      emit({ stage: 'critic', status: 'skip', note: off.critic });
    }

    items.forEach((it) => (it.score = score(it)));
    const seen = new Set(pool.map((p) => p.text));
    pool = [...pool, ...items.filter((it) => !seen.has(it.text))].sort((a, b) => b.score - a.score);
    const good = pool.filter((it) => it.score >= minScore).length;
    if (!off.critic && items.some((it) => it.critic)) {
      emit({ stage: 'critic', status: 'done', note: `найкраща оцінка ${pool[0].score}/10` });
    }

    if (good >= Math.ceil(count / 2) || round === rounds) break;
    feedback = items
      .filter((it) => it.score < minScore)
      .map((it) => ({
        text: it.text,
        problem:
          [it.critic?.comment, it.critic?.generic && 'загальник, підходить під будь-який пост', ...it.violations.map((v) => v.msg)]
            .filter(Boolean)
            .join('; ') || 'слабко',
      }));
  }

  return {
    context: ctx,
    lang,
    style: style.name,
    replies: pool.slice(0, count).map(({ original, ...r }) => r),
  };
}
