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

test("сильный порыв относительно среднего ветра -> предупреждение о порывистости", () => {
  const { warning } = recommendKiteSize(6, 75, 10.3); // как в примере из бота: 6 м/с, порывы 10.3 м/с
  assert.equal(warning, "gusty");
});

test("умеренная порывистость -> без предупреждения", () => {
  const { warning } = recommendKiteSize(10, 75, 12); // gustFactor 1.2, ниже порога
  assert.equal(warning, null);
});

test("нет данных о порывах -> без предупреждения о порывистости", () => {
  const { warning } = recommendKiteSize(10, 75);
  assert.equal(warning, null);
});

test("предупреждение no_wind/strong_wind в приоритете над gusty", () => {
  const weak = recommendKiteSize(2, 75, 5); // очень слабый ветер, но formally gustFactor высокий
  assert.equal(weak.warning, "no_wind");

  const strong = recommendKiteSize(25, 75, 40);
  assert.equal(strong.warning, "strong_wind");
});

test("размер кайта не меняется от наличия порывов — только warning", () => {
  const withoutGust = recommendKiteSize(6, 75).size;
  const withGust = recommendKiteSize(6, 75, 10.3).size;
  assert.equal(withGust, withoutGust);
});
