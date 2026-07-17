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

// Порог отношения "порыв / устойчивый ветер", начиная с которого предупреждаем
// об порывистости отдельно от базового расчёта размера (см. recommendKiteSize).
// Размер кайта по-прежнему считаем от устойчивого ветра — это то, на чём реально
// катаешься большую часть сессии, депауэр бара покрывает умеренные порывы.
// Но если порывы намного сильнее среднего, кайт, подобранный под средний ветер,
// может ощутимо перепауэрить райдера в момент порыва — об этом и предупреждаем.
const GUSTY_FACTOR_THRESHOLD = 1.4;

function roundToCommonSize(size) {
  return COMMON_SIZES.reduce((prev, curr) =>
    Math.abs(curr - size) < Math.abs(prev - size) ? curr : prev
  );
}

/**
 * @param {number} windSpeedMs - средняя (устойчивая) скорость ветра, м/с
 * @param {number} riderWeightKg - вес райдера, кг
 * @param {number|null} [gustMs] - скорость порывов, м/с (если доступна) — используется
 *   только для предупреждения о порывистости, на сам размер кайта не влияет
 * @returns {{size: number, warning: string|null}}
 */
export function recommendKiteSize(windSpeedMs, riderWeightKg, gustMs = null) {
  if (!Number.isFinite(windSpeedMs) || windSpeedMs < 0) {
    throw new TypeError(`windSpeedMs должен быть неотрицательным числом, получено: ${windSpeedMs}`);
  }
  if (!Number.isFinite(riderWeightKg) || riderWeightKg <= 0) {
    throw new TypeError(`riderWeightKg должен быть положительным числом, получено: ${riderWeightKg}`);
  }

  const entry = BASE_TABLE.find((e) => windSpeedMs <= e.maxWindMs);
  const scaled = entry.size * (riderWeightKg / 75);
  const size = roundToCommonSize(scaled);

  // Возвращаем код предупреждения, а не готовый текст — локализация текста
  // происходит в bot/format.js (см. src/i18n), чтобы эта функция оставалась
  // независимой от языка пользователя.
  let warning = null;
  if (windSpeedMs < 4) warning = "no_wind";
  if (windSpeedMs > 22) warning = "strong_wind";
  if (!warning && Number.isFinite(gustMs) && windSpeedMs > 0) {
    const gustFactor = gustMs / windSpeedMs;
    if (gustFactor >= GUSTY_FACTOR_THRESHOLD) warning = "gusty";
  }

  return { size, warning };
}
