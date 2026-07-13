import { fetchWithRetry } from "./httpClient.js";

const URL_ = "https://nominatim.openstreetmap.org/reverse";

/**
 * Превращает координаты в читаемое название (город/посёлок, страна).
 * Nominatim (OpenStreetMap) — бесплатно, без ключа, но требует свой User-Agent
 * и не более 1 запроса/сек (см. их usage policy). Наш rate limit по чату (5 сек)
 * и то, что это вызывается раз на отправку геолокации, укладывается с запасом.
 *
 * @returns {Promise<string|null>} например "Заандам, Нидерланды", или null если не удалось
 */
export async function reverseGeocode(lat, lon) {
  const params = new URLSearchParams({
    format: "jsonv2",
    lat: String(lat),
    lon: String(lon),
    zoom: "10",
    "accept-language": "ru",
  });

  try {
    const res = await fetchWithRetry(
      `${URL_}?${params}`,
      { headers: { "User-Agent": "where_to_kite (personal Telegram bot)" } },
      1
    );
    if (!res.ok) return null;

    const data = await res.json();
    const a = data.address;
    if (!a) return null;

    const place = a.city || a.town || a.village || a.municipality || a.county;
    const country = a.country;
    return [place, country].filter(Boolean).join(", ") || null;
  } catch {
    return null; // геокодирование — просто приятный бонус, без него подтверждение работает по координатам
  }
}
