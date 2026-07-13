import { recommendKiteSize } from "../core/kiteSize.js";
import { t, DEFAULT_LANG } from "../i18n/index.js";

const MS_TO_KNOTS = 1.9438444924;

function msToKnots(speedMs) {
  return Math.round(speedMs * MS_TO_KNOTS);
}

function formatWindSpeed(speedMs, gustMs, lang) {
  const ms = t("unit_ms", lang);
  const kt = t("unit_kt", lang);
  const gustPrefix = t("gust_prefix", lang);
  const gustPart =
    gustMs != null
      ? ` (${gustPrefix} ${gustMs} ${ms} / ${msToKnots(gustMs)} ${kt})`
      : ` (${gustPrefix} ? ${ms})`;
  return `${speedMs} ${ms} / ${msToKnots(speedMs)} ${kt}${gustPart}`;
}

function warningText(warningCode, lang) {
  if (!warningCode) return null;
  return t(`warning_${warningCode}`, lang);
}

export function formatSpotLine(spot, weightKg, lang = DEFAULT_LANG) {
  if (spot.error) {
    return `❌ ${spot.name} — ${spot.error}`;
  }

  const { size, warning } = recommendKiteSize(spot.forecastNow.speedMs, weightKg);
  const status = spot.suitable ? t("status_suitable", lang) : t("status_not_suitable", lang);

  const lines = [
    `${status} ${spot.name} (${spot.distanceKm} ${t("unit_km", lang)})`,
    `${t("wind_label", lang)}: ${formatWindSpeed(spot.forecastNow.speedMs, spot.forecastNow.gustMs, lang)}, ${spot.forecastNow.dirCompass}`,
    `${t("kite_label", lang)}: ~${size} ${t("unit_sqm", lang)}`,
  ];
  const warningMsg = warningText(warning, lang);
  if (warningMsg) lines.push(`⚠️ ${warningMsg}`);

  return lines.join("\n");
}

export function formatResults(spots, weightKg, lang = DEFAULT_LANG) {
  return spots.map((spot) => formatSpotLine(spot, weightKg, lang)).join("\n\n");
}

function formatTime(isoTime) {
  return isoTime.slice(11, 16); // "HH:MM" из локального времени спота
}

export function formatSpotDayLine(spot, weightKg, lang = DEFAULT_LANG) {
  if (spot.error) {
    return `❌ ${spot.name} — ${spot.error}`;
  }

  const w = spot.bestWindow;
  const { size, warning } = recommendKiteSize(w.speedMs, weightKg);
  const status = spot.suitable ? t("status_suitable", lang) : t("status_not_suitable", lang);

  const lines = [
    `${status} ${spot.name} (${spot.distanceKm} ${t("unit_km", lang)})`,
    `${t("best_time_label", lang)}: ~${formatTime(w.time)}`,
    `${t("wind_label", lang)}: ${formatWindSpeed(w.speedMs, w.gustMs, lang)}, ${w.dirCompass}`,
    `${t("kite_label", lang)}: ~${size} ${t("unit_sqm", lang)}`,
  ];
  const warningMsg = warningText(warning, lang);
  if (warningMsg) lines.push(`⚠️ ${warningMsg}`);

  return lines.join("\n");
}

export function formatDayResults(spots, weightKg, lang = DEFAULT_LANG) {
  return spots.map((spot) => formatSpotDayLine(spot, weightKg, lang)).join("\n\n");
}
