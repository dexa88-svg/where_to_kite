import { test } from "node:test";
import assert from "node:assert/strict";
import { recommendKiteSize } from "./kiteSize.js";

test("слабый ветер + средний вес -> большой кайт", () => {
  const { size } = recommendKiteSize(5, 75);
  assert.ok(size >= 14, `ожидал большой кайт, получил ${size}`);
});

test("сильный ветер + средний вес -> маленький кайт", () => {
  const { size } = recommendKiteSize(20, 75);
  assert.ok(size <= 6, `ожидал маленький кайт, получил ${size}`);
});

test("больше вес -> кайт больше при том же ветре", () => {
  const light = recommendKiteSize(10, 60).size;
  const heavy = recommendKiteSize(10, 100).size;
  assert.ok(heavy >= light, `тяжёлый райдер должен получить кайт не меньше: ${heavy} < ${light}`);
});

test("очень слабый ветер даёт предупреждение", () => {
  const { warning } = recommendKiteSize(2, 75);
  assert.ok(warning, "должно быть предупреждение об отсутствии ветра");
});

test("отрицательная скорость ветра — ошибка валидации", () => {
  assert.throws(() => recommendKiteSize(-5, 75), TypeError);
});

test("нулевой/отрицательный вес — ошибка валидации", () => {
  assert.throws(() => recommendKiteSize(10, 0), TypeError);
  assert.throws(() => recommendKiteSize(10, -70), TypeError);
});
