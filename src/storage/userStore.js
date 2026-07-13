import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../logger.js";
import { config } from "../config.js";

const dbPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "db.json");
const adapter = new JSONFile(dbPath);
const db = new Low(adapter, { users: {} });

let ready = false;
async function ensureReady() {
  if (ready) return;
  await db.read();
  db.data ||= { users: {} };
  ready = true;
}

/**
 * Интерфейс хранилища. Реализация ниже — файл на диске (JSON).
 * ВАЖНО: на бесплатных тарифах хостинга (например Railway без volume)
 * диск эфемерный — данные переживут рестарт процесса, но не переживут redeploy.
 * Для полной надёжности позже смени adapter на настоящую БД (Postgres/Redis) —
 * остальной код бота трогать не придётся, интерфейс тот же.
 */
export const userStore = {
  /** @returns {Promise<string|null>} "ru"|"en", или null если ещё не определён */
  async getLanguage(chatId) {
    await ensureReady();
    return db.data.users[chatId]?.lang ?? null;
  },

  async setLanguage(chatId, lang) {
    await ensureReady();
    db.data.users[chatId] ??= {};
    db.data.users[chatId].lang = lang;
    await persist();
  },

  async getWeight(chatId) {
    await ensureReady();
    return db.data.users[chatId]?.weightKg ?? null;
  },

  async setWeight(chatId, weightKg) {
    await ensureReady();
    db.data.users[chatId] ??= {};
    db.data.users[chatId].weightKg = weightKg;
    await persist();
  },

  /** @returns {Promise<{lat:number, lon:number, updatedAt:string}|null>} */
  async getLocation(chatId) {
    await ensureReady();
    return db.data.users[chatId]?.location ?? null;
  },

  async setLocation(chatId, lat, lon) {
    await ensureReady();
    db.data.users[chatId] ??= {};
    db.data.users[chatId].location = { lat, lon, updatedAt: new Date().toISOString() };
    await persist();
  },

  /**
   * Проверяет и, при наличии места, расходует дневную квоту вызовов Gemini —
   * одновременно общую на весь бот (config.geminiDailyGlobalLimit) и персональную
   * на одного пользователя (config.geminiDailyPerUserLimit). Нужно потому, что
   * бесплатный тариф Gemini API общий на весь ключ/проект, а не на пользователя:
   * без этой проверки один активный человек может занять всю дневную квоту.
   * Счётчики сбрасываются раз в календарные сутки (UTC).
   *
   * @returns {Promise<boolean>} true — квота есть и уже учтена, можно звать Gemini;
   *   false — квота исчерпана, вызывающий код должен использовать офлайн-фолбэк.
   */
  async tryConsumeGeminiQuota(chatId) {
    await ensureReady();
    const today = new Date().toISOString().slice(0, 10);

    if (db.data.geminiUsage?.date !== today) {
      db.data.geminiUsage = { date: today, global: 0, users: {} };
    }
    const usage = db.data.geminiUsage;
    const userCount = usage.users[chatId] ?? 0;

    if (usage.global >= config.geminiDailyGlobalLimit) return false;
    if (userCount >= config.geminiDailyPerUserLimit) return false;

    usage.global += 1;
    usage.users[chatId] = userCount + 1;
    await persist();
    return true;
  },
};

async function persist() {
  try {
    await db.write();
  } catch (err) {
    // Не роняем бота, если диск недоступен для записи (например read-only FS) —
    // просто настройка не сохранится между рестартами, но текущая сессия продолжит работать.
    logger.error("Не удалось сохранить данные пользователя на диск", { error: err.message });
  }
}
