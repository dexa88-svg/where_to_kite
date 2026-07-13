// Ориентировочная (не абсолютная!) таблица размеров кайта, калибровка под райдера 75 кг.
// При наличии своей таблицы школы/бренда — замени эти значения.
const BASE_TABLE = [
  { maxWindMs: 6, size: 17 },
  { maxWindMs: 8, size: 14 },
  { maxWindMs: 10, size: 12 },
  { maxWindMs: 12, size: 10 },
  { maxWindMs: 14, size: 9 },
  { maxWindMs: 16, size: 8 },
  { maxWindMs: 19, size: 6 },
  { maxWindMs: 23, size: 5 },
  { maxWindMs: Infinity, size: 4 },
];

const COMMON_SIZES = [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 17];

function roundToCommonSize(size) {
  return COMMON_SIZES.reduce((prev, curr) =>
    Math.abs(curr - size) < Math.abs(prev - size) ? curr : prev
  );
}

/**
 * @param {number} windSpeedMs - средняя скорость ветра, м/с
 * @param {number} riderWeightKg - вес райдера, кг
 * @returns {{size: number, warning: string|null}}
 */
export function recommendKiteSize(windSpeedMs, riderWeightKg) {
  if (!Number.isFinite(windSpeedMs) || windSpeedMs < 0) {
    throw new TypeError(`windSpeedMs должен быть неотрицательным числом, получено: ${windSpeedMs}`);
  }
  if (!Number.isFinite(riderWeightKg) || riderWeightKg <= 0) {
    throw new TypeError(`riderWeightKg должен быть положительным числом, получено: ${riderWeightKg}`);
  }

  const entry = BASE_TABLE.find((e) => windSpeedMs <= e.maxWindMs);
  const scaled = entry.size * (riderWeightKg / 75);
  const size = roundToCommonSize(scaled);

  let warning = null;
  if (windSpeedMs < 4) warning = "Ветра почти нет — кататься не получится.";
  if (windSpeedMs > 22) warning = "Очень сильный ветер — только для опытных райдеров, оцени риски.";

  return { size, warning };
}
