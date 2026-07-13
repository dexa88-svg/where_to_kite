// Простейшие метрики запросов в памяти процесса — без внешних зависимостей.
// Хватает, чтобы видеть количество апдейтов и error rate через /metrics
// или периодический лог, не поднимая отдельную систему мониторинга.

const startedAt = Date.now();
let totalRequests = 0;
let totalErrors = 0;

function snapshot() {
  const errorRate = totalRequests === 0 ? 0 : totalErrors / totalRequests;
  return {
    totalRequests,
    totalErrors,
    errorRate: Number(errorRate.toFixed(4)),
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
  };
}

export const metrics = {
  recordRequest: () => {
    totalRequests += 1;
  },
  recordError: () => {
    totalErrors += 1;
  },
  snapshot,
};
