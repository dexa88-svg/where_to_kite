import { fetchWithRetry } from "./httpClient.js";
import { config } from "../config.js";

const BASE_URL = "https://api.open-meteo.com/v1/forecast";

function degToCompass(deg) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(deg / 45) % 8;
  return dirs[idx];
}

/**
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<Array<{time: string, speedMs: number, gustMs: number, dirDeg: number, dirCompass: string}>>}
 */
export async function getWindForecast(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    hourly: "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
    wind_speed_unit: "ms",
    forecast_days: "3",
    timezone: "auto",
  });

  // Позволяет указать конкретную модель прогноза (например knmi_harmonie_arome_netherlands —
  // та же модель HARMONIE-AROME, что использует SoarCast.nl для нидерландских спотов).
  // По умолчанию Open-Meteo сам выбирает лучшую модель для координат (best_match).
  if (config.weatherModel && config.weatherModel !== "best_match") {
    params.set("models", config.weatherModel);
  }

  const res = await fetchWithRetry(`${BASE_URL}?${params}`);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Open-Meteo вернул ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const h = data.hourly;
  if (!h?.time) throw new Error("Неожиданный формат ответа Open-Meteo");

  return h.time.map((t, i) => ({
    time: t,
    speedMs: round1(h.wind_speed_10m[i]),
    gustMs: round1(h.wind_gusts_10m[i]),
    dirDeg: Math.round(h.wind_direction_10m[i]),
    dirCompass: degToCompass(h.wind_direction_10m[i]),
  }));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
