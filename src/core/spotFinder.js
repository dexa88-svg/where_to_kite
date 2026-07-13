import { getWindForecast, pickCurrentHour } from "../providers/windProvider.js";
import { config } from "../config.js";
import { logger } from "../logger.js";

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

  const results = await Promise.all(
    nearby.map(async (spot) => {
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
    })
  );

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

  const results = await Promise.all(
    nearby.map(async (spot) => {
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
    })
  );

  return results.sort((a, b) => {
    if (!!b.suitable - !!a.suitable !== 0) return !!b.suitable - !!a.suitable;
    return a.distanceKm - b.distanceKm;
  });
}
