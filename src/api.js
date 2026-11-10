export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function parseJson(raw) {
  if (raw == null) throw new Error('Порожня відповідь моделі');
  if (typeof raw === 'object') return raw;
  let s = String(raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(s);
  } catch {
    const a = s.indexOf('{');
    const b = s.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
    throw new Error('Модель повернула не JSON');
  }
}

function retryAfterMs(res, attempt) {
  const h = Number(res.headers.get('retry-after'));
  if (Number.isFinite(h) && h > 0) return Math.min(h * 1000, 30000);
  return Math.min(1500 * 2 ** attempt, 15000);
}

/**
 * Виклик Groq chat completions (OpenAI-сумісний). Повертає розпарсений JSON.
 * onWait(ms) — щоб показати в UI, що чекаємо через rate limit.
 */
export async function chatJson({ settings, model, system, user, temperature = 0.4, maxTokens = 2500, onWait }) {
  if (!settings.apiKey) throw new ApiError('Немає API ключа Groq. Додай його в налаштуваннях розширення.', 401, 'no_key');
  let useJsonMode = true;

  for (let attempt = 0; attempt < 5; attempt++) {
    const body = {
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature,
      max_completion_tokens: maxTokens,
    };
    if (useJsonMode) body.response_format = { type: 'json_object' };
    if (/gpt-oss/i.test(model)) {
      body.reasoning_effort = settings.reasoningEffort || 'low';
      body.include_reasoning = false;
    } else if (/qwen/i.test(model)) {
      body.reasoning_format = 'hidden';
    }

    let res;
    try {
      res = await fetch(`${settings.apiBase.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      if (attempt < 2) {
        await sleep(1000);
        continue;
      }
      throw new ApiError(`Мережева помилка: ${e.message}`, 0, 'network');
    }

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      try {
        return parseJson(content);
      } catch (e) {
        if (attempt < 2) continue;
        throw e;
      }
    }

    let err = {};
    try {
      err = (await res.json()).error || {};
    } catch {}

    if (res.status === 400 && err.code === 'json_validate_failed') {
      // модель видала майже-JSON — пробуємо врятувати, інакше повтор без json-режиму
      if (err.failed_generation) {
        try {
          return parseJson(err.failed_generation);
        } catch {}
      }
      useJsonMode = false;
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      const ms = retryAfterMs(res, attempt);
      onWait?.(ms);
      await sleep(ms);
      continue;
    }
    if (res.status === 401) throw new ApiError('Невірний API ключ Groq', 401, 'bad_key');
    if (res.status === 404 || err.code === 'model_not_found') {
      throw new ApiError(`Модель «${model}» недоступна. Обери іншу в налаштуваннях.`, res.status, 'model');
    }
    throw new ApiError(err.message || `Groq HTTP ${res.status}`, res.status, err.code);
  }
  throw new ApiError('Groq не відповідає (ліміти). Спробуй через хвилину.', 429, 'rate_limit');
}

export async function listModels(settings) {
  const res = await fetch(`${settings.apiBase.replace(/\/$/, '')}/models`, {
    headers: { Authorization: `Bearer ${settings.apiKey}` },
  });
  if (!res.ok) throw new ApiError(res.status === 401 ? 'Невірний API ключ' : `HTTP ${res.status}`, res.status);
  const data = await res.json();
  return (data.data || [])
    .filter((m) => m.active !== false && !/whisper|orpheus|prompt-guard|tts/i.test(m.id))
    .map((m) => m.id)
    .sort();
}

const LT_LANGS = { uk: 'uk-UA', en: 'en-US', pl: 'pl-PL', de: 'de-DE', es: 'es', fr: 'fr' };

/** Безкоштовний публічний LanguageTool — справжній спелчекер як підказка для LLM-коректора. */
export async function languageTool(text, lang) {
  const language = LT_LANGS[lang] || 'auto';
  try {
    const res = await fetch('https://api.languagetool.org/v2/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ text, language }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.matches || [])
      .filter((m) => !/WHITESPACE|UPPERCASE_SENTENCE_START|PUNCTUATION_PARAGRAPH_END/.test(m.rule?.id || ''))
      .slice(0, 8)
      .map((m) => {
        const frag = text.substr(m.offset, m.length);
        const reps = (m.replacements || []).slice(0, 3).map((r) => r.value).join(' / ');
        return `«${frag}»${reps ? ` → ${reps}` : ''} (${m.message})`;
      });
  } catch {
    return [];
  }
}
