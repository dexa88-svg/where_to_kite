import { fetchWithRetry } from "../providers/httpClient.js";
import { config } from "../config.js";
import { logger } from "../logger.js";

const GEMINI_URL = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const SYSTEM_INSTRUCTION =
  "Ты разбираешь вопрос кайтсёрфера про то, когда и куда поехать кататься. " +
  'Верни ТОЛЬКО JSON без пояснений: {"day": "today" | "tomorrow", "isKiteQuestion": true | false}. ' +
  '"day" — на какой день спрашивают (по умолчанию "today", если не указано). ' +
  '"isKiteQuestion" — false, если сообщение вообще не про катание/споты/ветер (тогда day можно не учитывать).';

const KITE_WORDS = [
  // русские
  "кайт", "спот", "катат", "ветер", "погод", "ехать", "поехать",
  // английские — бот отвечает и на английском, офлайн-фолбэк должен понимать оба языка
  "kite", "spot", "wind", "weather", "ride", "riding", "where",
];

/**
 * Дешёвая офлайн-проверка без обращения к Gemini: есть ли в тексте хоть одно
 * ключевое слово по теме катания. Используется, чтобы не тратить квоту Gemini
 * на сообщения, которые почти наверняка не по теме (приветствия, "спасибо" и т.п.).
 */
export function hasKiteKeyword(text) {
  const t = text.toLowerCase();
  return KITE_WORDS.some((w) => t.includes(w));
}

// Слова-филлеры, с которых часто начинается короткий уточняющий вопрос про день
// ("а завтра?", "what about tomorrow?") — отбрасываем их перед сравнением.
const DAY_FILLER_RE =
  /^(and|what about|how about|as for|а|ну а|что насчёт|что насчет|как насчёт|как насчет)\s+/i;

/**
 * Распознаёт короткие сообщения, которые целиком состоят из указания на день
 * (+ опциональный вопросительный филлер), например: "tomorrow", "tomorrow?",
 * "today", "and tomorrow?", "а завтра?", "как насчёт сегодня". Такие сообщения
 * не содержат кайт-ключевых слов, но в контексте этого бота почти всегда
 * означают "куда поехать кататься {день}?" — поэтому распознаём их отдельно,
 * не тратя на них Gemini и не отправляя пользователя в "не понял".
 *
 * @param {string} text
 * @returns {"today"|"tomorrow"|null}
 */
export function matchDayOnly(text) {
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/[?!.,]+$/g, "")
    .trim()
    .replace(DAY_FILLER_RE, "")
    .trim();

  if (cleaned === "today" || cleaned === "сегодня") return "today";
  if (cleaned === "tomorrow" || cleaned === "завтра") return "tomorrow";
  return null;
}

/**
 * Простой офлайн-фолбэк без LLM: ищем ключевые слова.
 * Используется если GEMINI_API_KEY не задан, запрос к Gemini не удался,
 * или на сообщение не хватило дневной квоты Gemini (см. userStore.tryConsumeGeminiQuota).
 */
function parseIntentFallback(text) {
  const t = text.toLowerCase();
  const isKiteQuestion = hasKiteKeyword(t);
  const day = t.includes("завтра") || t.includes("tomorrow") ? "tomorrow" : "today";
  return { day, isKiteQuestion };
}

/**
 * @param {string} text - сообщение пользователя
 * @param {{allowGemini?: boolean}} [opts] - allowGemini=false принудительно использует
 *   офлайн-фолбэк без обращения к Gemini (например, если дневная квота исчерпана)
 * @returns {Promise<{day: "today"|"tomorrow", isKiteQuestion: boolean}>}
 */
export async function parseIntent(text, { allowGemini = true } = {}) {
  if (!config.geminiApiKey || !allowGemini) {
    return parseIntentFallback(text);
  }

  try {
    const res = await fetchWithRetry(
      GEMINI_URL(config.geminiModel),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": config.geminiApiKey,
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0,
          },
        }),
      },
      1 // одна ретрай-попытка, чтобы не тормозить ответ бота при сбое Gemini
    );

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new Error(`Gemini API вернул ${res.status}: ${bodyText.slice(0, 300)}`);
    }

    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error("Пустой ответ Gemini");

    const parsed = JSON.parse(raw);
    if (!["today", "tomorrow"].includes(parsed.day)) parsed.day = "today";
    return { day: parsed.day, isKiteQuestion: Boolean(parsed.isKiteQuestion) };
  } catch (err) {
    logger.warn("Gemini intent parsing не удался, использую офлайн-фолбэк", {
      error: err.message,
    });
    return parseIntentFallback(text);
  }
}
