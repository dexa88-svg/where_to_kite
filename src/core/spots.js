import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";

const VALID_DIRECTIONS = new Set(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
const VALID_LEVELS = new Set(["beginner", "intermediate", "advanced"]);
const VALID_TYPES = new Set(["flat", "wave"]);

function validateSpot(spot, index) {
  const errors = [];
  const req = (field, check, msg) => {
    if (!check) errors.push(`spots[${index}] (${spot.id ?? "?"}).${field}: ${msg}`);
  };

  req("id", typeof spot.id === "string" && spot.id.length > 0, "должен быть непустой строкой");
  req("name", typeof spot.name === "string" && spot.name.length > 0, "должен быть непустой строкой");
  req("lat", Number.isFinite(spot.lat) && spot.lat >= -90 && spot.lat <= 90, "должен быть числом от -90 до 90");
  req("lon", Number.isFinite(spot.lon) && spot.lon >= -180 && spot.lon <= 180, "должен быть числом от -180 до 180");
  req("level", VALID_LEVELS.has(spot.level), `должен быть одним из: ${[...VALID_LEVELS].join(", ")}`);
  req("type", VALID_TYPES.has(spot.type), `должен быть одним из: ${[...VALID_TYPES].join(", ")}`);
  req(
    "goodWindDirections",
    Array.isArray(spot.goodWindDirections) &&
      spot.goodWindDirections.length > 0 &&
      spot.goodWindDirections.every((d) => VALID_DIRECTIONS.has(d)),
    `должен быть непустым массивом из: ${[...VALID_DIRECTIONS].join(", ")}`
  );
  req(
    "minWindMs/maxWindMs",
    Number.isFinite(spot.minWindMs) &&
      Number.isFinite(spot.maxWindMs) &&
      spot.minWindMs >= 0 &&
      spot.maxWindMs > spot.minWindMs,
    "minWindMs должен быть >= 0 и меньше maxWindMs"
  );

  return errors;
}

/**
 * Читает spots.json, валидирует каждую запись. Бросает исключение со списком
 * всех найденных ошибок сразу (удобнее чем чинить по одной).
 * @param {string} [customPath] - опциональный путь к другому файлу спотов
 */
export function loadSpots(customPath) {
  const defaultPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "spots.json");
  const filePath = customPath || defaultPath;

  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    throw new Error(`Не удалось прочитать файл спотов ${filePath}: ${err.message}`);
  }

  let spots;
  try {
    spots = JSON.parse(raw);
  } catch (err) {
    throw new Error(`spots.json содержит невалидный JSON: ${err.message}`);
  }

  if (!Array.isArray(spots)) {
    throw new Error("spots.json должен быть массивом");
  }

  const allErrors = spots.flatMap(validateSpot);
  if (allErrors.length > 0) {
    throw new Error(`Ошибки валидации spots.json:\n${allErrors.join("\n")}`);
  }

  const ids = spots.map((s) => s.id);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (duplicates.length > 0) {
    throw new Error(`Дублирующиеся id спотов: ${[...new Set(duplicates)].join(", ")}`);
  }

  return spots;
}
