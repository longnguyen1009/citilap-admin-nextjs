/**
 * Lightweight Server-Timing instrumentation for internal API routes.
 * The header is intentionally opt-in so existing response bodies/contracts stay unchanged.
 */
export const createTiming = () => ({ startedAt: performance.now() });

export const markTiming = (timing, name, startedAt = performance.now()) => {
  if (!timing || !name) return;
  timing[name] = Math.max(0, performance.now() - startedAt);
};

export const timeAsync = async (timing, name, callback) => {
  const startedAt = performance.now();
  try {
    return await callback();
  } finally {
    markTiming(timing, name, startedAt);
  }
};

export const withServerTiming = (response, timing) => {
  if (!response || !timing) return response;
  const entries = Object.entries(timing)
    .filter(([name, duration]) => name !== 'startedAt' && Number.isFinite(duration))
    .map(([name, duration]) => `${name};dur=${duration.toFixed(1)}`);
  if (entries.length) response.headers.set('Server-Timing', entries.join(', '));
  response.headers.set('Server-Timing-Source', 'citilap');
  return response;
};
