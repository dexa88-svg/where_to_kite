import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findBestWindowForDay,
  findExtraSpots,
  nowHourResolver,
  offsetHourResolver,
} from "./spotFinder.js";
import { pickHourOffset } from "../providers/windProvider.js";

const spot = {
  goodWindDirections: ["W", "SW"],
  minWindMs: 6,
  maxWindMs: 14,
};

function entry(time, speedMs, dirCompass) {
  return { time, speedMs, gustMs: speedMs + 2, dirDeg: 0, dirCompass };
}

test("выбирает час ближе к середине рабочего диапазона ветра", () => {
  const forecast = [
    entry("2026-07-13T09:00", 5, "W"), // текущий час (для определения "сегодня")
    entry("2026-07-13T10:00", 4, "W"), // слишком слабо
    entry("2026-07-13T14:00", 10, "W"), // ровно середина (6..14 -> mid=10) — ожидаем этот
    entry("2026-07-13T18:00", 13, "W"), // близко к максимуму
  ];
  const best = findBestWindowForDay(forecast, spot, "today");
  assert.equal(best.time, "2026-07-13T14:00");
  assert.equal(best.suitable, true);
});

test("игнорирует часы вне запрошенного дня", () => {
  const forecast = [
    entry("2026-07-13T09:00", 2, "W"), // очень слабо, далеко от середины диапазона
    entry("2026-07-13T14:00", 10, "W"), // сегодня, ровно середина — ожидаем этот
    entry("2026-07-14T10:00", 10, "W"), // завтра, тоже идеально — не должен попасть в "today"
  ];
  const best = findBestWindowForDay(forecast, spot, "today");
  assert.equal(best.time, "2026-07-13T14:00");
});

test("день 'tomorrow' смотрит на следующие сутки от текущего часа", () => {
  const forecast = [
    entry("2026-07-13T09:00", 5, "W"),
    entry("2026-07-14T10:00", 8, "W"),
    entry("2026-07-14T15:00", 10, "W"), // ожидаем этот — ближе к середине диапазона
  ];
  const best = findBestWindowForDay(forecast, spot, "tomorrow");
  assert.equal(best.time, "2026-07-14T15:00");
});

test("если ничего не подходит, всё равно возвращает ближайший по силе вариант с suitable:false", () => {
  const forecast = [
    entry("2026-07-13T09:00", 1, "W"),
    entry("2026-07-13T12:00", 25, "W"), // сильно превышает maxWindMs
    entry("2026-07-13T15:00", 20, "E"), // неверное направление
  ];
  const best = findBestWindowForDay(forecast, spot, "today");
  assert.equal(best.suitable, false);
});

test("возвращает null, если запрошенного дня нет в прогнозе", () => {
  const forecast = [entry("2026-07-13T09:00", 5, "W")];
  const best = findBestWindowForDay(forecast, spot, "tomorrow");
  assert.equal(best, null);
});

// --- findExtraSpots (TOP4 / "показать ещё") ---

const userLocation = { lat: 52.0, lon: 4.5 };

const spotSweet = {
  id: "sweet",
  name: "Sweet Spot",
  lat: 52.05, // ~5.5 км от userLocation
  lon: 4.5,
  goodWindDirections: ["W"],
  minWindMs: 4,
  maxWindMs: 20,
};

const spotTooWindy = {
  id: "windy",
  name: "Too Windy",
  lat: 52.06,
  lon: 4.52,
  goodWindDirections: ["W"],
  minWindMs: 4,
  maxWindMs: 25,
};

const spotWrongDir = {
  id: "wrongdir",
  name: "Wrong Direction",
  lat: 52.04,
  lon: 4.48,
  goodWindDirections: ["E"],
  minWindMs: 4,
  maxWindMs: 20,
};

const spotFar = {
  id: "far",
  name: "Far Away",
  lat: 53.0, // ~111 км от userLocation — вне радиуса 50 км
  lon: 4.5,
  goodWindDirections: ["W"],
  minWindMs: 4,
  maxWindMs: 20,
};

function forecastFor(speedMs, dirCompass) {
  return [{ time: "2026-07-16T12:00", speedMs, gustMs: speedMs + 2, dirCompass }];
}

test("findExtraSpots: фильтрует по direction+speed и мин. кайту 6м2, сортирует по близости к sweet spot 8-10м2, не выходит за 50км", async () => {
  const calls = [];
  const getForecast = async (lat, lon) => {
    calls.push(`${lat},${lon}`);
    if (lat === spotSweet.lat) return forecastFor(13, "W"); // подходит, кайт = 9м2 — ровно sweet spot
    if (lat === spotTooWindy.lat) return forecastFor(21, "W"); // подходит по direction+speed, но кайт 5м2 < 6 — отсекается
    if (lat === spotWrongDir.lat) return forecastFor(9, "W"); // направление не совпадает (спот ждёт "E") — отсекается
    throw new Error(`неожиданный запрос прогноза для доп. спота: ${lat},${lon}`);
  };

  const result = await findExtraSpots(userLocation, [spotSweet, spotTooWindy, spotWrongDir, spotFar], {
    weightKg: 75,
    resolveHour: nowHourResolver(),
    count: 3,
    getForecast,
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, "sweet");
  assert.equal(result[0].kiteSize, 9);
  // spotFar вне радиуса 50 км — прогноз для него вообще не должен запрашиваться
  assert.ok(!calls.some((c) => c.startsWith("53")));
});

test("findExtraSpots: не повторяет id из excludeIds (уже показанные в TOP3/TOP4)", async () => {
  const getForecast = async () => forecastFor(13, "W");
  const result = await findExtraSpots(userLocation, [spotSweet], {
    weightKg: 75,
    resolveHour: nowHourResolver(),
    excludeIds: ["sweet"],
    getForecast,
  });
  assert.deepEqual(result, []);
});

test("findExtraSpots: с offsetHourResolver смотрит на прогноз на нужный час вперёд", async () => {
  const now = Date.now();
  const getForecast = async () => [
    { time: new Date(now - 3600_000).toISOString(), speedMs: 21, gustMs: 23, dirCompass: "W" }, // сейчас — слишком сильно
    { time: new Date(now + 2 * 3600_000).toISOString(), speedMs: 13, gustMs: 15, dirCompass: "W" }, // через 2ч — sweet spot
  ];

  const result = await findExtraSpots(userLocation, [spotSweet], {
    weightKg: 75,
    resolveHour: offsetHourResolver(2),
    getForecast,
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].kiteSize, 9);
});

test("pickHourOffset: выбирает точку прогноза ближе всего к now+offset", () => {
  const now = Date.now();
  const forecast = [
    { time: new Date(now - 3600_000).toISOString(), speedMs: 5, dirCompass: "W" },
    { time: new Date(now + 2 * 3600_000).toISOString(), speedMs: 8, dirCompass: "W" },
    { time: new Date(now + 5 * 3600_000).toISOString(), speedMs: 10, dirCompass: "W" },
  ];
  const picked = pickHourOffset(forecast, 2 * 3600_000);
  assert.equal(picked.speedMs, 8);
});
