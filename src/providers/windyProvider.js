import { fetchWithRetry } from "./httpClient.js";
import { config } from "../config.js";

const URL_ = "https://api.windy.com/api/point-forecast/v2";

function degToCompass(deg) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(deg / 45) % 8;
  return dirs[idx];
}

function uvToSpeedDirection(u, v) {
  const speed = Math.sqrt(u * u + v * v);
  let dir = (Math.atan2(-u, -v) * 180) / Math.PI;
  if (dir < 0) dir += 360;
  return { speed, dir };
}

/**
 * Тот же контракт, что и openMeteoProvider — взаимозаменяемы.
 * @returns {Promise<Array<{time: string, speedMs: number, gustMs: number|null, dirDeg: number, dirCompass: string}>>}
 */
export async function getWindForecast(lat, lon) {
  const res = await fetchWithRetry(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lat,
      lon,
      model: "gfs",
      parameters: ["wind"],
      key: config.windyApiKey,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Windy API вернул ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const uKey = "wind_u-surface";
  const vKey = "wind_v-surface";
  if (!data[uKey] || !data[vKey] || !data.ts) {
    throw new Error("Неожиданный формат ответа Windy API");
  }

  return data.ts.map((ts, i) => {
    const { speed, dir } = uvToSpeedDirection(data[uKey][i], data[vKey][i]);
    return {
      time: new Date(ts).toISOString(),
      speedMs: Math.round(speed * 10) / 10,
      gustMs: null,
      dirDeg: Math.round(dir),
      dirCompass: degToCompass(dir),
    };
  });
}
