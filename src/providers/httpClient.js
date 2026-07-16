import fetch from "node-fetch";
import { config } from "../config.js";
import { logger } from "../logger.js";

/**
 * fetch с таймаутом и ретраями на транзиентные ошибки (5xx, 429 rate limit,
 * сетевые сбои, таймаут). Остальные 4xx (ошибка запроса, например неверные
 * параметры) не ретраим — смысла нет, повтор даст тот же результат.
 */
export async function fetchWithRetry(url, options = {}, retries = config.httpRetries) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.httpTimeoutMs);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);

      const isTransient = res.status >= 500 || res.status === 429;
      if (isTransient && attempt < retries) {
        logger.warn("Транзиентная ошибка HTTP, повторяю", { url, status: res.status, attempt });
        await sleep(retryDelayMs(res, attempt));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timeout);
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        throw new Error(`Запрос не удался после ${retries + 1} попыток: ${err.message}`);
      }
      logger.warn("Сетевая ошибка, повторяю", { url, error: err.message, attempt });
      await sleep(backoffMs(attempt));
    }
  }
}

function backoffMs(attempt) {
  // + джиттер (0-250мс): без него несколько параллельных воркеров, получивших 429
  // почти одновременно, повторяют запрос тоже почти одновременно — и снова ловят 429.
  return 300 * 2 ** attempt + Math.random() * 250;
}

/** Для 429 уважаем Retry-After от сервера, если он есть; иначе — обычный backoff (+джиттер) */
function retryDelayMs(res, attempt) {
  const retryAfter = res.status === 429 ? Number(res.headers?.get?.("retry-after")) : NaN;
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  return backoffMs(attempt);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
