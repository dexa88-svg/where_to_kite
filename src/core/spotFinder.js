import { getWindForecast, pickCurrentHour, pickHourOffset } from "../providers/windProvider.js";
import { recommendKiteSize } from "./kiteSize.js";
import { config } from "../config.js";
import { logger } from "../logger.js";

// Параметры для "TOP4" и "показать ещё" — доп. споты в фиксированном радиусе 50 км,
// не зависящем от config.searchRadiusKm (тот обычно шире, 150 км по умолчанию).
const EXTRA_RADIUS_KM = 50;
const EXTRA_MAX_TO_CHECK = 15; // в плотных регионах (напр. побережье NL) в 50км может быть много спотов
const SWEET_SPOT_KITE_SIZE = 9; // середина диапазона 8–10 м² — "комфортный" кайт
const MIN_KITE_SIZE = 6; // если ветер настолько силён, что нужен кайт меньше — не предлагаем

// Сколько запросов прогноза выполняем одновременно. Open-Meteo (бесплатный тариф)
// отдаёт 429 "Too many concurrent requests", если долбить его большим Promise.all
// сразу по всем найденным спотам — особенно заметно после добавления TOP4/"показать
// ещё", которые опрашивают ещё до 15 спотов в 50 км вдобавок к основным maxSpotsToCheck.
// 5 всё ещё оказалось слишком много (429 продолжались в проде) — снизили до 2,
// это дороже по времени (лишние секунды на сборку TOP3/TOP4), но надёжнее.
const FORECAST_CONCURRENCY = 2;

/** Как Promise.all(items.map(fn)), но не больше `concurrency` одновременных вызовов fn */
async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearbySpots(userLocation, allSpots, radiusKm, maxToCheck) {
  return allSpots
    .map((spot) => ({
      ...spot,
      distanceKm: Math.round(
        haversineKm(userLocation.lat, userLocation.lon, spot.lat, spot.lon)
      ),
    }))
    .filter((spot) => spot.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, maxToCheck);
}

function shiftDate(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Ищет лучший (ближайший к середине рабочего диапазона ветра) час в пределах
 * дневного времени (7:00–21:00) на указанный день для конкретного спота.
 * Если на весь день нет подходящих по направлению+силе часов, возвращает
 * ближайший по силе ветра — с suitable: false, чтобы бот честно предупредил.
 *
 * @param {Array} forecast - почасовой прогноз (из getWindForecast)
 * @param {object} spot
 * @param {"today"|"tomorrow"} day
 * @returns {object|null} час прогноза + флаги пригодности, либо null если день вне горизонта прогноза
 */
export function findBestWindowForDay(forecast, spot, day) {
  if (forecast.length === 0) return null;
  // Open-Meteo всегда отдаёт прогноз начиная с текущего часа локального времени точки,
  // поэтому первая запись — это и есть "сегодня" независимо от часового пояса сервера.
  const currentDate = forecast[0].time.slice(0, 10);
  const targetDate = day === "tomorrow" ? shiftDate(currentDate, 1) : currentDate;

  const dayEntries = forecast.filter((e) => e.time.slice(0, 10) === targetDate);
  if (dayEntries.length === 0) return null; // день за пределами горизонта прогноза (обычно 3 дня)

  const daylightEntries = dayEntries.filter((e) => {
    const hour = Number(e.time.slice(11, 13));
    return hour >= 7 && hour <= 21;
  });
  const pool = daylightEntries.length > 0 ? daylightEntries : dayEntries;

  const mid = (spot.minWindMs + spot.maxWindMs) / 2;
  const scored = pool.map((e) => {
    const directionMatch = spot.goodWindDirections.includes(e.dirCompass);
    const speedInRange = e.speedMs >= spot.minWindMs && e.speedMs <= spot.maxWindMs;
    return {
      ...e,
      suitable: directionMatch && speedInRange,
      directionMatch,
      speedInRange,
      distanceFromMid: Math.abs(e.speedMs - mid),
    };
  });

  const suitable = scored.filter((e) => e.suitable);
  const pickFrom = suitable.length > 0 ? suitable : scored;
  return pickFrom.sort((a, b) => a.distanceFromMid - b.distanceFromMid)[0];
}

/**
 * Как findBestSpots, но подбирает лучшее время в течение указанного дня,
 * а не только текущий час. Используется для вопросов вида "куда и во сколько".
 *
 * @param {{lat:number, lon:number}} userLocation
 * @param {Array} allSpots
 * @param {"today"|"tomorrow"} day
 * @param {{radiusKm?: number, maxToCheck?: number}} [opts]
 */
export async function findBestSpotsForDay(userLocation, allSpots, day, opts = {}) {
  const radiusKm = opts.radiusKm ?? config.searchRadiusKm;
  const maxToCheck = opts.maxToCheck ?? config.maxSpotsToCheck;
  const nearby = nearbySpots(userLocation, allSpots, radiusKm, maxToCheck);
  if (nearby.length === 0) return [];

  const results = await mapWithConcurrency(nearby, FORECAST_CONCURRENCY, async (spot) => {
    try {
      const forecast = await getWindForecast(spot.lat, spot.lon);
      const window = findBestWindowForDay(forecast, spot, day);
      if (!window) {
        return { ...spot, error: `прогноз на ${day === "tomorrow" ? "завтра" : "сегодня"} пока недоступен` };
      }
      return { ...spot, bestWindow: window, suitable: window.suitable };
    } catch (err) {
      logger.warn("Не удалось получить прогноз для спота", { spot: spot.id, error: err.message });
      return { ...spot, error: "прогноз временно недоступен" };
    }
  });

  return results.sort((a, b) => {
    if (!!b.suitable - !!a.suitable !== 0) return !!b.suitable - !!a.suitable;
    return a.distanceKm - b.distanceKm;
  });
}

/**
 * Найти ближайшие подходящие споты по геолокации пользователя.
 * Запрашивает прогноз только для ближайших config.maxSpotsToCheck спотов —
 * это защищает от лишних вызовов внешнего API, если база спотов большая.
 *
 * @param {{lat:number, lon:number}} userLocation
 * @param {Array} allSpots - провалидированный список спотов
 * @param {{radiusKm?: number, maxToCheck?: number}} [opts]
 */
export async function findBestSpots(userLocation, allSpots, opts = {}) {
  const radiusKm = opts.radiusKm ?? config.searchRadiusKm;
  const maxToCheck = opts.maxToCheck ?? config.maxSpotsToCheck;
  const nearby = nearbySpots(userLocation, allSpots, radiusKm, maxToCheck);

  if (nearby.length === 0) return [];

  const results = await mapWithConcurrency(nearby, FORECAST_CONCURRENCY, async (spot) => {
    try {
      const forecast = await getWindForecast(spot.lat, spot.lon);
      const now = pickCurrentHour(forecast);
      const directionMatch = spot.goodWindDirections.includes(now.dirCompass);
      const speedInRange = now.speedMs >= spot.minWindMs && now.speedMs <= spot.maxWindMs;

      return {
        ...spot,
        forecastNow: now,
        suitable: directionMatch && speedInRange,
        directionMatch,
        speedInRange,
      };
    } catch (err) {
      logger.warn("Не удалось получить прогноз для спота", { spot: spot.id, error: err.message });
      return { ...spot, error: "прогноз временно недоступен" };
    }
  });

  return results.sort((a, b) => {
    if (!!b.suitable - !!a.suitable !== 0) return !!b.suitable - !!a.suitable;
    return a.distanceKm - b.distanceKm;
  });
}

/**
 * Резолверы часа прогноза для findExtraSpots — инкапсулируют, "когда именно" смотреть
 * ветер для доп. спотов, чтобы commands.js не трогал windProvider напрямую.
 */
export function nowHourResolver() {
  return (forecast) => pickCurrentHour(forecast);
}

export function offsetHourResolver(hoursAhead) {
  return (forecast) => pickHourOffset(forecast, hoursAhead * 60 * 60 * 1000);
}

export function dayWindowResolver(day) {
  return (forecast, spot) => findBestWindowForDay(forecast, spot, day);
}

/**
 * Доп. споты сверх основного TOP3: ищем в фиксированном радиусе 50 км (независимо от
 * config.searchRadiusKm), требуем совпадение направления+силы ветра ("suitable") И
 * чтобы рекомендуемый кайт был не меньше MIN_KITE_SIZE — иначе ветер слишком силён.
 * Из прошедших фильтр выбираем ближайшие по размеру кайта к "комфортным" 8–10 м².
 *
 * Используется и для TOP4 (count=1, resolveHour = "сейчас"/окно дня), и для
 * "показать ещё" (count=3, resolveHour = "+2 часа от сейчас").
 *
 * @param {{lat:number, lon:number}} userLocation
 * @param {Array} allSpots
 * @param {object} opts
 * @param {string[]} [opts.excludeIds] - id спотов, уже показанных пользователю (не повторяем)
 * @param {number} opts.weightKg
 * @param {(forecast: Array, spot: object) => object} opts.resolveHour - выбирает час прогноза для спота
 * @param {number} [opts.count]
 * @param {number} [opts.radiusKm]
 * @param {number} [opts.maxToCheck]
 * @param {(lat:number, lon:number) => Promise<Array>} [opts.getForecast] - для тестов (по умолчанию getWindForecast)
 */
export async function findExtraSpots(userLocation, allSpots, opts) {
  const {
    excludeIds = [],
    weightKg,
    resolveHour,
    count = 1,
    radiusKm = EXTRA_RADIUS_KM,
    maxToCheck = EXTRA_MAX_TO_CHECK,
    getForecast = getWindForecast,
  } = opts;

  const excluded = new Set(excludeIds);
  const nearby = nearbySpots(userLocation, allSpots, radiusKm, maxToCheck).filter(
    (spot) => !excluded.has(spot.id)
  );
  if (nearby.length === 0) return [];

  const scored = await mapWithConcurrency(nearby, FORECAST_CONCURRENCY, async (spot) => {
    try {
      const forecast = await getForecast(spot.lat, spot.lon);
      const hour = resolveHour(forecast, spot);
      if (!hour) return null;

      const directionMatch = spot.goodWindDirections.includes(hour.dirCompass);
      const speedInRange = hour.speedMs >= spot.minWindMs && hour.speedMs <= spot.maxWindMs;
      const suitable = directionMatch && speedInRange;
      if (!suitable) return null;

      const { size } = recommendKiteSize(hour.speedMs, weightKg, hour.gustMs);
      if (size < MIN_KITE_SIZE) return null; // ветер слишком силён для комфортного кайта

      return {
        ...spot,
        forecastHour: hour,
        suitable: true,
        kiteSize: size,
        sizeDistance: Math.abs(size - SWEET_SPOT_KITE_SIZE),
      };
    } catch (err) {
      logger.warn("Не удалось получить прогноз для доп. спота", { spot: spot.id, error: err.message });
      return null;
    }
  });

  return scored
    .filter(Boolean)
    .sort((a, b) => a.sizeDistance - b.sizeDistance || a.distanceKm - b.distanceKm)
    .slice(0, count);
}
