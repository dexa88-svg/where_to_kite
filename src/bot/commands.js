import { InlineKeyboard } from "grammy";
import { findBestSpots, findBestSpotsForDay } from "../core/spotFinder.js";
import { userStore } from "../storage/userStore.js";
import { formatResults, formatDayResults } from "./format.js";
import { parseIntent, hasKiteKeyword } from "../nlp/intentParser.js";
import { reverseGeocode } from "../providers/geocodeProvider.js";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { t, normalizeLang } from "../i18n/index.js";

const MIN_WEIGHT = 20;
const MAX_WEIGHT = 200;
const COORD_PRECISION = 6; // ~11 см точности, с запасом хватает

function encodeLoc(lat, lon) {
  return `${lat.toFixed(COORD_PRECISION)},${lon.toFixed(COORD_PRECISION)}`;
}

/**
 * Определяет язык пользователя: если уже сохранён в userStore — берём его,
 * иначе выводим из языка Telegram-клиента (ctx.from.language_code) и запоминаем,
 * чтобы не пересчитывать на каждый апдейт. Пользователь ничего для этого не делает.
 */
async function resolveLang(ctx) {
  const chatId = ctx.chat?.id;
  if (!chatId) return normalizeLang(ctx.from?.language_code);

  const saved = await userStore.getLanguage(chatId);
  if (saved) return saved;

  const lang = normalizeLang(ctx.from?.language_code);
  await userStore.setLanguage(chatId, lang);
  return lang;
}

/** Сохраняет подтверждённую локацию и сразу присылает ближайшие споты "на сейчас" */
async function confirmAndFindSpots(ctx, spots, lat, lon, lang) {
  await userStore.setLocation(ctx.chat.id, lat, lon);
  const weight = (await userStore.getWeight(ctx.chat.id)) ?? config.defaultWeightKg;

  await ctx.reply(t("checking_now", lang));

  try {
    const ranked = await findBestSpots({ lat, lon }, spots);

    if (ranked.length === 0) {
      return ctx.reply(t("no_spots_found", lang, { radius: config.searchRadiusKm }));
    }

    await ctx.reply(formatResults(ranked.slice(0, 3), weight, lang));
    await ctx.reply(t("loc_saved_hint", lang));
  } catch (err) {
    logger.error("Ошибка обработки геолокации", { chatId: ctx.chat.id, error: err.message });
    await ctx.reply(t("generic_error", lang));
  }
}

export function registerCommands(bot, spots) {
  bot.command("start", async (ctx) => ctx.reply(t("welcome", await resolveLang(ctx))));
  bot.command("help", async (ctx) => ctx.reply(t("welcome", await resolveLang(ctx))));

  bot.command("ves", async (ctx) => {
    const lang = await resolveLang(ctx);
    const arg = ctx.match?.trim();
    const weight = Number(arg);

    if (!arg || !Number.isFinite(weight) || weight < MIN_WEIGHT || weight > MAX_WEIGHT) {
      return ctx.reply(t("ves_usage", lang, { min: MIN_WEIGHT, max: MAX_WEIGHT }));
    }

    await userStore.setWeight(ctx.chat.id, weight);
    return ctx.reply(t("ves_saved", lang, { weight }));
  });

  bot.on("message:location", async (ctx) => {
    const lang = await resolveLang(ctx);
    const { latitude, longitude } = ctx.message.location;

    // Базовая защита от мусорных/поддельных координат
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return ctx.reply(t("loc_invalid", lang));
    }

    const placeName = await reverseGeocode(latitude, longitude);
    const loc = encodeLoc(latitude, longitude);

    const keyboard = new InlineKeyboard()
      .text(t("loc_btn_yes", lang), `loc:ok:${loc}`)
      .text(t("loc_btn_no", lang), "loc:no");

    const question = placeName
      ? t("loc_question_named", lang, { place: placeName })
      : t("loc_question_coords", lang, { loc });

    await ctx.reply(question, { reply_markup: keyboard });
  });

  bot.callbackQuery(/^loc:ok:(-?\d+\.\d+),(-?\d+\.\d+)$/, async (ctx) => {
    const lang = await resolveLang(ctx);
    const [, latStr, lonStr] = ctx.match;
    const lat = Number(latStr);
    const lon = Number(lonStr);

    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup(); // убираем кнопки, чтобы не жали повторно
    await confirmAndFindSpots(ctx, spots, lat, lon, lang);
  });

  bot.callbackQuery("loc:no", async (ctx) => {
    const lang = await resolveLang(ctx);
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup();
    await ctx.reply(t("loc_no_retry", lang));
  });

  // Свободный текст: "куда поехать сегодня и во сколько?", "а завтра?" и т.п.
  bot.on("message:text", async (ctx) => {
    const lang = await resolveLang(ctx);
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
      return ctx.reply(t("not_understood_kite", lang));
    }

    const location = await userStore.getLocation(ctx.chat.id);
    if (!location) {
      return ctx.reply(t("need_location_first", lang));
    }

    const weight = (await userStore.getWeight(ctx.chat.id)) ?? config.defaultWeightKg;
    const dayLabel = intent.day === "tomorrow" ? t("day_tomorrow", lang) : t("day_today", lang);

    await ctx.reply(t("checking_day", lang, { day: dayLabel }));

    try {
      const ranked = await findBestSpotsForDay(location, spots, intent.day);

      if (ranked.length === 0) {
        return ctx.reply(t("no_spots_found_short", lang, { radius: config.searchRadiusKm }));
      }

      await ctx.reply(formatDayResults(ranked.slice(0, 3), weight, lang));
    } catch (err) {
      logger.error("Ошибка обработки текстового вопроса", { chatId: ctx.chat.id, error: err.message });
      await ctx.reply(t("generic_error", lang));
    }
  });

  bot.on("message", async (ctx) => {
    // Ловим всё остальное (стикеры, фото и т.п.), чтобы бот не молчал
    const lang = await resolveLang(ctx);
    return ctx.reply(t("not_understood_generic", lang));
  });
}
