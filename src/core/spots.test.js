import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { loadSpots } from "./spots.js";

function writeTempSpots(spots) {
  const file = path.join(os.tmpdir(), `spots-test-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(file, JSON.stringify(spots));
  return file;
}

test("валидный спот загружается без ошибок", () => {
  const file = writeTempSpots([
    {
      id: "a",
      name: "Spot A",
      lat: 60,
      lon: 30,
      level: "beginner",
      type: "flat",
      goodWindDirections: ["W"],
      minWindMs: 5,
      maxWindMs: 15,
    },
  ]);
  const spots = loadSpots(file);
  assert.equal(spots.length, 1);
});

test("невалидные координаты бросают ошибку", () => {
  const file = writeTempSpots([
    {
      id: "a",
      name: "Spot A",
      lat: 999,
      lon: 30,
      level: "beginner",
      type: "flat",
      goodWindDirections: ["W"],
      minWindMs: 5,
      maxWindMs: 15,
    },
  ]);
  assert.throws(() => loadSpots(file), /lat/);
});

test("дублирующиеся id бросают ошибку", () => {
  const spot = {
    id: "dup",
    name: "Spot",
    lat: 60,
    lon: 30,
    level: "beginner",
    type: "flat",
    goodWindDirections: ["W"],
    minWindMs: 5,
    maxWindMs: 15,
  };
  const file = writeTempSpots([spot, spot]);
  assert.throws(() => loadSpots(file), /Дублирующиеся/);
});

test("minWindMs >= maxWindMs бросает ошибку", () => {
  const file = writeTempSpots([
    {
      id: "a",
      name: "Spot A",
      lat: 60,
      lon: 30,
      level: "beginner",
      type: "flat",
      goodWindDirections: ["W"],
      minWindMs: 15,
      maxWindMs: 5,
    },
  ]);
  assert.throws(() => loadSpots(file), /minWindMs/);
});
