import fetch from "node-fetch";
import { config } from "../config.js";
import { logger } from "../logger.js";

/**
 * fetch с таймаутом и ретраями на транзиентные ошибки (5xx, сетевые сбои, таймаут).
 * 4xx (ошибка запроса, например неверные параметры) не ретраим — смысла нет.
 */
export async function fetchWithRetry(url, options = {}, retries = config.httpRetries) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.httpTimeoutMs);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);

      if (res.status >= 500 && attempt < retries) {
        logger.warn("Транзиентная ошибка HTTP, повторяю", { url, status: res.status, attempt });
        await sleep(backoffMs(attempt));
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
  return 300 * 2 ** attempt; // 300ms, 600ms, 1200ms...
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
