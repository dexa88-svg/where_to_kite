import { recommendKiteSize } from "../core/kiteSize.js";

export function formatSpotLine(spot, weightKg) {
  if (spot.error) {
    return `❌ ${spot.name} — ${spot.error}`;
  }

  const { size, warning } = recommendKiteSize(spot.forecastNow.speedMs, weightKg);
  const status = spot.suitable ? "✅ подходит" : "⚠️ не идеально";

  const lines = [
    `${status} ${spot.name} (${spot.distanceKm} км)`,
    `Ветер: ${spot.forecastNow.speedMs} м/с (порывы до ${spot.forecastNow.gustMs ?? "?"}), ${spot.forecastNow.dirCompass}`,
    `Кайт: ~${size} м²`,
  ];
  if (warning) lines.push(`⚠️ ${warning}`);

  return lines.join("\n");
}

export function formatResults(spots, weightKg) {
  return spots.map((spot) => formatSpotLine(spot, weightKg)).join("\n\n");
}

function formatTime(isoTime) {
  return isoTime.slice(11, 16); // "HH:MM" из локального времени спота
}

export function formatSpotDayLine(spot, weightKg) {
  if (spot.error) {
    return `❌ ${spot.name} — ${spot.error}`;
  }

  const w = spot.bestWindow;
  const { size, warning } = recommendKiteSize(w.speedMs, weightKg);
  const status = spot.suitable ? "✅ подходит" : "⚠️ не идеально";

  const lines = [
    `${status} ${spot.name} (${spot.distanceKm} км)`,
    `Лучшее время: ~${formatTime(w.time)}`,
    `Ветер: ${w.speedMs} м/с (порывы до ${w.gustMs ?? "?"}), ${w.dirCompass}`,
    `Кайт: ~${size} м²`,
  ];
  if (warning) lines.push(`⚠️ ${warning}`);

  return lines.join("\n");
}

export function formatDayResults(spots, weightKg) {
  return spots.map((spot) => formatSpotDayLine(spot, weightKg)).join("\n\n");
}
