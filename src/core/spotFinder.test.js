import { test } from "node:test";
import assert from "node:assert/strict";
import { findBestWindowForDay } from "./spotFinder.js";

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
