import { config } from "./config.js";

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[config.logLevel] ?? LEVELS.info;

function log(level, msg, meta) {
  if (LEVELS[level] > currentLevel) return;
  const entry = {
    time: new Date().toISOString(),
    level,
    msg,
    ...(meta ? { meta } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  error: (msg, meta) => log("error", msg, meta),
  warn: (msg, meta) => log("warn", msg, meta),
  info: (msg, meta) => log("info", msg, meta),
  debug: (msg, meta) => log("debug", msg, meta),
};
