import { config } from "../config.js";

const lastRequestAt = new Map(); // chatId -> timestamp

/**
 * grammy middleware: не даёт одному чату дёргать бота (и внешний API) чаще,
 * чем раз в config.rateLimitMs. Без этого один нажатый-и-удерживаемый палец
 * на кнопке геолокации может вызвать шквал запросов к Open-Meteo/Windy.
 */
export async function rateLimit(ctx, next) {
  const chatId = ctx.chat?.id;
  if (!chatId) return next();

  const now = Date.now();
  const last = lastRequestAt.get(chatId) ?? 0;
  const elapsed = now - last;

  if (elapsed < config.rateLimitMs) {
    const waitSec = Math.ceil((config.rateLimitMs - elapsed) / 1000);
    await ctx.reply(`Подожди ${waitSec} сек. перед следующим запросом 🙏`);
    return;
  }

  lastRequestAt.set(chatId, now);
  return next();
}
