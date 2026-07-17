// Простой i18n: словари ru/en + шаблонная функция t(key, lang, vars).
// Поддерживаем только два языка (под аудиторию бота); при желании легко
// добавить ещё один — просто новый ключ в STRINGS ниже.

export const SUPPORTED_LANGS = ["ru", "en"];
export const DEFAULT_LANG = "ru";

const STRINGS = {
  ru: {
    welcome:
      "👋 Привет! Я подбираю кайт-спот и размер кайта — по твоей геолокации и прогнозу ветра.\n\n" +
      "С чего начать:\n" +
      "1️⃣ /ves 75 — укажи свой вес (кг)\n" +
      "2️⃣ Пришли геолокацию (скрепка 📎 → Локация)\n\n" +
      "Дальше просто спрашивай текстом: «куда сегодня?», «а завтра?» — " +
      "запомню локацию и подберу ближайшие подходящие споты с прогнозом.\n\n" +
      "Вес можно поменять в любой момент: /ves <кг>",
    loc_invalid: "Некорректная геолокация, попробуй ещё раз.",
    loc_question_named: 'Это рядом с "{{place}}"? Верно?',
    loc_question_coords: "Координаты {{loc}} — всё верно?",
    loc_btn_yes: "✅ Да, всё верно",
    loc_btn_no: "🔄 Нет, пришлю заново",
    loc_no_retry: "Хорошо, пришли геолокацию ещё раз (скрепка → Локация).",
    ves_usage: "Напиши так: /ves 75 (вес в кг, от {{min}} до {{max}})",
    ves_saved: "Записал: {{weight}} кг",
    checking_now: "Смотрю прогноз по ближайшим спотам...",
    no_spots_found: "Не нашёл спотов в базе рядом с тобой (радиус {{radius}} км). Добавь споты в spots.json.",
    no_spots_found_short: "Не нашёл спотов в базе рядом с тобой (радиус {{radius}} км).",
    loc_saved_hint:
      'Геолокацию запомнил — теперь можно просто спрашивать текстом: "куда сегодня?" или "а завтра?"',
    generic_error: "Что-то пошло не так с прогнозом. Попробуй ещё раз через минуту.",
    not_understood_kite:
      'Не понял. Пришли геолокацию, используй /ves 75, чтобы задать вес, или спроси текстом, например: "куда сегодня?"',
    need_location_first:
      "Сначала пришли геолокацию (скрепка → Локация) — так я буду знать, откуда считать ближайшие споты.",
    checking_day: "Смотрю прогноз на {{day}}...",
    day_today: "сегодня",
    day_tomorrow: "завтра",
    not_understood_generic: "Не понял. Пришли геолокацию или используй /ves 75, чтобы задать вес.",

    status_suitable: "✅ подходит",
    status_not_suitable: "⚠️ не идеально",
    wind_label: "Ветер",
    kite_label: "Кайт",
    best_time_label: "Лучшее время",
    gust_prefix: "порывы до",
    unit_ms: "м/с",
    unit_kt: "уз",
    unit_km: "км",
    unit_sqm: "м²",
    warning_no_wind: "Ветра почти нет — кататься не получится.",
    warning_strong_wind: "Очень сильный ветер — только для опытных райдеров, оцени риски.",
    warning_gusty: "Порывистый ветер — будь готов активно депаурить, или возьми кайт на размер меньше.",

    extra_spot_label: "🎯 Ещё вариант (в пределах 50 км, ветер под комфортный 8–10 м² кайт):",
    more_spots_question: "Показать ещё варианты в пределах 50 км?",
    more_spots_btn_yes: "Да, покажи ещё",
    more_spots_btn_no: "Нет, спасибо",
    more_spots_intro: "Вот ещё варианты поблизости (до 50 км):",
    no_more_spots: "Больше подходящих вариантов в пределах 50 км не нашлось.",
  },
  en: {
    welcome:
      "👋 Hi! I help you pick a kite spot and kite size — based on your location and the wind forecast.\n\n" +
      "Getting started:\n" +
      "1️⃣ /ves 75 — set your weight (kg)\n" +
      "2️⃣ Send your location (📎 → Location)\n\n" +
      'After that just ask in plain text: "where today?", "what about tomorrow?" — ' +
      "I'll remember your location and find the best nearby spots with a forecast.\n\n" +
      "You can change your weight anytime: /ves <kg>",
    loc_invalid: "Invalid location, please try again.",
    loc_question_named: 'Is this near "{{place}}"? Is that right?',
    loc_question_coords: "Coordinates {{loc}} — is that correct?",
    loc_btn_yes: "✅ Yes, that's right",
    loc_btn_no: "🔄 No, I'll resend",
    loc_no_retry: "Okay, send your location again (📎 → Location).",
    ves_usage: "Use it like this: /ves 75 (weight in kg, from {{min}} to {{max}})",
    ves_saved: "Saved: {{weight}} kg",
    checking_now: "Checking the forecast for nearby spots...",
    no_spots_found: "Couldn't find any spots near you (radius {{radius}} km). Add spots to spots.json.",
    no_spots_found_short: "Couldn't find any spots near you (radius {{radius}} km).",
    loc_saved_hint:
      'Got your location — now you can just ask in plain text: "where today?" or "what about tomorrow?"',
    generic_error: "Something went wrong getting the forecast. Please try again in a minute.",
    not_understood_kite:
      'I didn\'t get that. Send your location, use /ves 75 to set your weight, or ask in text, e.g. "where today?"',
    need_location_first:
      "First send your location (📎 → Location) — that way I'll know where to search from.",
    checking_day: "Checking the forecast for {{day}}...",
    day_today: "today",
    day_tomorrow: "tomorrow",
    not_understood_generic: "I didn't get that. Send your location or use /ves 75 to set your weight.",

    status_suitable: "✅ good fit",
    status_not_suitable: "⚠️ not ideal",
    wind_label: "Wind",
    kite_label: "Kite",
    best_time_label: "Best time",
    gust_prefix: "gusts up to",
    unit_ms: "m/s",
    unit_kt: "kt",
    unit_km: "km",
    unit_sqm: "m²",
    warning_no_wind: "Barely any wind — you won't be able to ride.",
    warning_strong_wind: "Very strong wind — experienced riders only, assess the risk.",
    warning_gusty: "Gusty wind — be ready to depower actively, or consider sizing down a kite.",

    extra_spot_label: "🎯 One more option (within 50 km, wind for a comfortable 8–10 m² kite):",
    more_spots_question: "Want to see more options within 50 km?",
    more_spots_btn_yes: "Yes, show more",
    more_spots_btn_no: "No, thanks",
    more_spots_intro: "Here are a few more nearby options (within 50 km):",
    no_more_spots: "Couldn't find any more suitable options within 50 km.",
  },
};

/** Приводит произвольный код языка Telegram (ru-RU, en-GB, de, ...) к поддерживаемому. */
export function normalizeLang(languageCode) {
  if (typeof languageCode === "string" && languageCode.toLowerCase().startsWith("ru")) {
    return "ru";
  }
  return "en";
}

/**
 * @param {string} key
 * @param {string} lang
 * @param {Record<string, string|number>} [vars]
 */
export function t(key, lang, vars) {
  const dict = STRINGS[lang] ?? STRINGS[DEFAULT_LANG];
  let str = dict[key] ?? STRINGS[DEFAULT_LANG][key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{{${k}}}`, String(v));
    }
  }
  return str;
}
