import http from "http";
import { Bot } from "grammy";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { loadSpots } from "./core/spots.js";
import { registerCommands } from "./bot/commands.js";
import { rateLimit } from "./bot/rateLimit.js";

// Падаем сразу и с понятной ошибкой, если база спотов битая — лучше на старте, чем в рантайме
const spots = loadSpots();
logger.info("База спотов загружена", { count: spots.length, provider: config.windProvider });

const bot = new Bot(config.botToken);

bot.use(rateLimit);
registerCommands(bot, spots);

// Единая точка отлова ошибок из обработчиков — бот не падает целиком из-за ошибки в одном чате
bot.catch((err) => {
  logger.error("Необработанная ошибка в обработчике бота", {
    chatId: err.ctx?.chat?.id,
    error: err.error?.message ?? String(err.error),
  });
});

// Подстраховка на уровне процесса — логируем и продолжаем работу вместо тихого краша
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", { reason: String(reason) });
});
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", { error: err.message, stack: err.stack });
  // Намеренно не завершаем процесс — платформа (Railway) перезапустит при реальном крахе,
  // а на разовую ошибку в одном апдейте бот не должен ложиться целиком.
});

// Простой health-check — polling-боту порт не обязателен, но многие PaaS (включая Railway)
// считают сервис "живым" по открытому порту, плюс удобно для мониторинга.
const port = process.env.PORT || 3000;
const healthServer = http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
  })
  .listen(port, () => logger.info("Health-check сервер запущен", { port }));

async function shutdown(signal) {
  logger.info("Получен сигнал остановки, завершаю работу", { signal });
  healthServer.close();
  await bot.stop();
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

bot.start({
  onStart: () => logger.info("Бот запущен", { provider: config.windProvider }),
});
