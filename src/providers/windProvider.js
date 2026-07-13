import { config } from "../config.js";
import { logger } from "../logger.js";
import * as openMeteo from "./openMeteoProvider.js";
import * as windy from "./windyProvider.js";

const providers = {
  openmeteo: openMeteo,
  windy: windy,
};

const activeProvider = providers[config.windProvider];

// Простой in-memory кэш: округляем координаты, чтобы соседние запросы (тот же спот)
// не долбили API повторно. Экономит лимит Open-Meteo и ускоряет ответ бота.
const cache = new Map(); // key -> { data, expiresAt }

function cacheKey(lat, lon) {
  return `${lat.toFixed(2)}:${lon.toFixed(2)}`;
}

function getFromCache(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

function setCache(key, data) {
  cache.set(key, { data, expiresAt: Date.now() + config.cacheTtlMs });
}

// Периодическая уборка устаревших записей, чтобы карта не росла бесконечно
setInterval(() => {
  const now = Date.now();
  for (const [key, { expiresAt }] of cache) {
    if (now > expiresAt) cache.delete(key);
  }
}, config.cacheTtlMs).unref();

/**
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<Array>} почасовой прогноз ветра
 */
export async function getWindForecast(lat, lon) {
  const key = cacheKey(lat, lon);
  const cached = getFromCache(key);
  if (cached) {
    logger.debug("Прогноз из кэша", { key });
    return cached;
  }

  const data = await activeProvider.getWindForecast(lat, lon);
  setCache(key, data);
  return data;
}

/** Ближайшая к текущему моменту точка прогноза */
export function pickCurrentHour(forecast) {
  const now = Date.now();
  return forecast.reduce((closest, entry) => {
    const diff = Math.abs(new Date(entry.time).getTime() - now);
    const closestDiff = Math.abs(new Date(closest.time).getTime() - now);
    return diff < closestDiff ? entry : closest;
  }, forecast[0]);
}

export async function getCurrentWind(lat, lon) {
  const forecast = await getWindForecast(lat, lon);
  return pickCurrentHour(forecast);
}
