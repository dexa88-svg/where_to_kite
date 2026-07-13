import "dotenv/config";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Не задана обязательная переменная окружения: ${name}. Проверь .env`);
  }
  return value;
}

function intEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`Переменная ${name} должна быть числом, получено: "${raw}"`);
  }
  return n;
}

const provider = (process.env.WIND_PROVIDER || "openmeteo").toLowerCase();
if (!["openmeteo", "windy"].includes(provider)) {
  throw new Error(`WIND_PROVIDER должен быть "openmeteo" или "windy", получено: "${provider}"`);
}
if (provider === "windy" && !process.env.WINDY_API_KEY) {
  throw new Error('WIND_PROVIDER=windy требует WINDY_API_KEY в .env');
}

export const config = Object.freeze({
  botToken: requireEnv("BOT_TOKEN"),
  windProvider: provider,
  windyApiKey: process.env.WINDY_API_KEY || null,
  // Актуально только для windProvider=openmeteo. См. .env.example для списка моделей.
  weatherModel: process.env.WEATHER_MODEL || "best_match",

  // Бесплатный Gemini API (Google AI Studio) для разбора свободных текстовых вопросов
  // ("куда поехать сегодня?"). Без ключа бот понимает только команды и геолокацию.
  geminiApiKey: process.env.GEMINI_API_KEY || null,
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",

  // Бесплатный тариф Gemini API общий на весь ключ/проект (обычно ~1000-1500 запросов
  // в сутки), а не на пользователя. При росте базы пользователей один активный человек
  // может незаметно "съесть" всю дневную квоту. Эти два лимита защищают от этого:
  // - geminiDailyGlobalLimit — общий потолок вызовов Gemini в сутки на весь бот
  //   (держим с запасом ниже реального лимита Google, см. .env.example).
  // - geminiDailyPerUserLimit — потолок на одного пользователя в сутки.
  // При достижении любого из них бот не падает и не блокирует пользователя —
  // просто тихо переключается на офлайн-разбор по ключевым словам (см. intentParser.js).
  geminiDailyGlobalLimit: intEnv("GEMINI_DAILY_GLOBAL_LIMIT", 700),
  geminiDailyPerUserLimit: intEnv("GEMINI_DAILY_PER_USER_LIMIT", 8),

  searchRadiusKm: intEnv("SEARCH_RADIUS_KM", 150),
  maxSpotsToCheck: intEnv("MAX_SPOTS_TO_CHECK", 8), // ограничивает число запросов к API за один вопрос пользователя
  cacheTtlMs: intEnv("CACHE_TTL_MINUTES", 15) * 60 * 1000,
  rateLimitMs: intEnv("RATE_LIMIT_SECONDS", 5) * 1000,
  defaultWeightKg: intEnv("DEFAULT_WEIGHT_KG", 75),
  logLevel: process.env.LOG_LEVEL || "info",

  httpTimeoutMs: 8000,
  httpRetries: 2,
});
