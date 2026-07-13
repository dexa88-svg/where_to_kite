import { InlineKeyboard } from "grammy";
import { findBestSpots, findBestSpotsForDay } from "../core/spotFinder.js";
import { userStore } from "../storage/userStore.js";
import { formatResults, formatDayResults } from "./format.js";
import { parseIntent, hasKiteKeyword } from "../nlp/intentParser.js";
import { reverseGeocode } from "../providers/geocodeProvider.js";
import { config } from "../config.js";
import { logger } from "../logger.js";

const MIN_WEIGHT = 20;
const MAX_WEIGHT = 200;
const COORD_PRECISION = 6; // ~11 см точности, с запасом хватает

function encodeLoc(lat, lon) {
  return `${lat.toFixed(COORD_PRECISION)},${lon.toFixed(COORD_PRECISION)}`;
}

/** Сохраняет подтверждённую локацию и сразу присылает ближайшие споты "на сейчас" */
async function confirmAndFindSpots(ctx, spots, lat, lon) {
  await userStore.setLocation(ctx.chat.id, lat, lon);
  const weight = (await userStore.getWeight(ctx.chat.id)) ?? config.defaultWeightKg;

  await ctx.reply("Смотрю прогноз по ближайшим спотам...");

  try {
    const ranked = await findBestSpots({ lat, lon }, spots);

    if (ranked.length === 0) {
      return ctx.reply(
        `Не нашёл спотов в базе рядом с тобой (радиус ${config.searchRadiusKm} км). Добавь споты в spots.json.`
      );
    }

    await ctx.reply(formatResults(ranked.slice(0, 3), weight));
    await ctx.reply(
      "Геолокацию запомнил — теперь можно просто спрашивать текстом: " +
        '"куда сегодня?" или "а завтра?"'
    );
  } catch (err) {
    logger.error("Ошибка обработки геолокации", { chatId: ctx.chat.id, error: err.message });
    await ctx.reply("Что-то пошло не так с прогнозом. Попробуй ещё раз через минуту.");
  }
}

export function registerCommands(bot, spots) {
  const WELCOME_TEXT =
    "👋 Привет! Я подбираю кайт-спот и размер кайта — по твоей геолокации и прогнозу ветра.\n\n" +
    "С чего начать:\n" +
    "1️⃣ /ves 75 — укажи свой вес (кг)\n" +
    "2️⃣ Пришли геолокацию (скрепка 📎 → Локация)\n\n" +
    "Дальше просто спрашивай текстом: «куда сегодня?», «а завтра?» — " +
    "запомню локацию и подберу ближайшие подходящие споты с прогнозом.\n\n" +
    "Вес можно поменять в любой момент: /ves <кг>";

  bot.command("start", (ctx) => ctx.reply(WELCOME_TEXT));
  bot.command("help", (ctx) => ctx.reply(WELCOME_TEXT));

  bot.command("ves", async (ctx) => {
    const arg = ctx.match?.trim();
    const weight = Number(arg);

    if (!arg || !Number.isFinite(weight) || weight < MIN_WEIGHT || weight > MAX_WEIGHT) {
      return ctx.reply(`Напиши так: /ves 75 (вес в кг, от ${MIN_WEIGHT} до ${MAX_WEIGHT})`);
    }

    await userStore.setWeight(ctx.chat.id, weight);
    return ctx.reply(`Записал: ${weight} кг`);
  });

  bot.on("message:location", async (ctx) => {
    const { latitude, longitude } = ctx.message.location;

    // Базовая защита от мусорных/поддельных координат
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return ctx.reply("Некорректная геолокация, попробуй ещё раз.");
    }

    const placeName = await reverseGeocode(latitude, longitude);
    const loc = encodeLoc(latitude, longitude);

    const keyboard = new InlineKeyboard()
      .text("✅ Да, всё верно", `loc:ok:${loc}`)
      .text("🔄 Нет, пришлю заново", "loc:no");

    const question = placeName
      ? `Это рядом с "${placeName}"? Верно?`
      : `Координаты ${loc} — всё верно?`;

    await ctx.reply(question, { reply_markup: keyboard });
  });

  bot.callbackQuery(/^loc:ok:(-?\d+\.\d+),(-?\d+\.\d+)$/, async (ctx) => {
    const [, latStr, lonStr] = ctx.match;
    const lat = Number(latStr);
    const lon = Number(lonStr);

    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup(); // убираем кнопки, чтобы не жали повторно
    await confirmAndFindSpots(ctx, spots, lat, lon);
  });

  bot.callbackQuery("loc:no", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup();
    await ctx.reply("Хорошо, пришли геолокацию ещё раз (скрепка → Локация).");
  });

  // Свободный текст: "куда поехать сегодня и во сколько?", "а завтра?" и т.п.
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;

    // Не тратим квоту Gemini на сообщения, которые почти наверняка не по теме
    // (приветствия, "спасибо" и т.п.) — для них и так хватает офлайн-фолбэка.
    // Для похожих на вопрос/по теме сообщений — расходуем дневную квоту
    // (общую на бот + персональную на пользователя, см. userStore.tryConsumeGeminiQuota).
    let allowGemini = false;
    if (hasKiteKeyword(text) || text.includes("?")) {
      allowGemini = await userStore.tryConsumeGeminiQuota(ctx.chat.id);
    }

    const intent = await parseIntent(text, { allowGemini });

    if (!intent.isKiteQuestion) {
      return ctx.reply(
        "Не понял. Пришли геолокацию, используй /ves 75, чтобы задать вес, " +
          'или спроси текстом, например: "куда сегодня?"'
      );
    }

    const location = await userStore.getLocation(ctx.chat.id);
    if (!location) {
      return ctx.reply(
        "Сначала пришли геолокацию (скрепка → Локация) — так я буду знать, откуда считать ближайшие споты."
      );
    }

    const weight = (await userStore.getWeight(ctx.chat.id)) ?? config.defaultWeightKg;
    const dayLabel = intent.day === "tomorrow" ? "завтра" : "сегодня";

    await ctx.reply(`Смотрю прогноз на ${dayLabel}...`);

    try {
      const ranked = await findBestSpotsForDay(location, spots, intent.day);

      if (ranked.length === 0) {
        return ctx.reply(
          `Не нашёл спотов в базе рядом с тобой (радиус ${config.searchRadiusKm} км).`
        );
      }

      await ctx.reply(formatDayResults(ranked.slice(0, 3), weight));
    } catch (err) {
      logger.error("Ошибка обработки текстового вопроса", { chatId: ctx.chat.id, error: err.message });
      await ctx.reply("Что-то пошло не так с прогнозом. Попробуй ещё раз через минуту.");
    }
  });

  bot.on("message", (ctx) => {
    // Ловим всё остальное (стикеры, фото и т.п.), чтобы бот не молчал
    return ctx.reply("Не понял. Пришли геолокацию или используй /ves 75, чтобы задать вес.");
  });
}
