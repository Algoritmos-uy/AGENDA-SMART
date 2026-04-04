const MAX_EVENTS = 100;

const state = {
  totalRequests: 0,
  streamRequests: 0,
  nonStreamRequests: 0,
  successes: 0,
  failures: 0,
  timeouts: 0,
  retries: 0,
  byProvider: {
    deepseek: { requests: 0, successes: 0, failures: 0, timeouts: 0 },
    openai: { requests: 0, successes: 0, failures: 0, timeouts: 0 },
  },
  recent: [],
};

function ensureProvider(provider) {
  if (!state.byProvider[provider]) {
    state.byProvider[provider] = { requests: 0, successes: 0, failures: 0, timeouts: 0 };
  }
  return state.byProvider[provider];
}

function nowIso() {
  return new Date().toISOString();
}

function isTimeoutError(error) {
  const msg = (error?.message || '').toLowerCase();
  return error?.name === 'AbortError'
    || error?.code === 'ABORT_ERR'
    || msg.includes('abort')
    || msg.includes('timeout');
}

function pushEvent(event) {
  state.recent.push(event);
  if (state.recent.length > MAX_EVENTS) {
    state.recent.splice(0, state.recent.length - MAX_EVENTS);
  }
  try {
    console.info('[assistant.telemetry]', JSON.stringify(event));
  } catch (_e) {
    console.info('[assistant.telemetry]', event.type, event.provider, event.mode);
  }
}

function beginAttempt({ provider = 'deepseek', mode = 'chat', messageCount = 0, totalChars = 0, retry = false } = {}) {
  const startedAt = Date.now();
  const providerStats = ensureProvider(provider);

  state.totalRequests += 1;
  providerStats.requests += 1;
  if (mode === 'stream') state.streamRequests += 1;
  else state.nonStreamRequests += 1;
  if (retry) state.retries += 1;

  return {
    provider,
    mode,
    messageCount,
    totalChars,
    retry,
    startedAt,
  };
}

function succeedAttempt(ctx, { outputChars = 0 } = {}) {
  const durationMs = Math.max(0, Date.now() - (ctx?.startedAt || Date.now()));
  const providerStats = ensureProvider(ctx?.provider || 'deepseek');

  state.successes += 1;
  providerStats.successes += 1;

  pushEvent({
    type: 'success',
    at: nowIso(),
    provider: ctx?.provider || 'deepseek',
    mode: ctx?.mode || 'chat',
    retry: !!ctx?.retry,
    messageCount: ctx?.messageCount || 0,
    totalChars: ctx?.totalChars || 0,
    outputChars,
    durationMs,
  });
}

function failAttempt(ctx, error) {
  const durationMs = Math.max(0, Date.now() - (ctx?.startedAt || Date.now()));
  const providerStats = ensureProvider(ctx?.provider || 'deepseek');
  const timeout = isTimeoutError(error);

  state.failures += 1;
  providerStats.failures += 1;
  if (timeout) {
    state.timeouts += 1;
    providerStats.timeouts += 1;
  }

  pushEvent({
    type: timeout ? 'timeout' : 'failure',
    at: nowIso(),
    provider: ctx?.provider || 'deepseek',
    mode: ctx?.mode || 'chat',
    retry: !!ctx?.retry,
    messageCount: ctx?.messageCount || 0,
    totalChars: ctx?.totalChars || 0,
    durationMs,
    errorCode: error?.code || null,
    errorName: error?.name || null,
    errorMessage: String(error?.message || 'unknown_error').slice(0, 180),
  });
}

function getSnapshot() {
  return JSON.parse(JSON.stringify(state));
}

function resetTelemetry() {
  state.totalRequests = 0;
  state.streamRequests = 0;
  state.nonStreamRequests = 0;
  state.successes = 0;
  state.failures = 0;
  state.timeouts = 0;
  state.retries = 0;
  Object.keys(state.byProvider).forEach((p) => {
    state.byProvider[p] = { requests: 0, successes: 0, failures: 0, timeouts: 0 };
  });
  state.recent = [];
}

module.exports = {
  beginAttempt,
  succeedAttempt,
  failAttempt,
  getSnapshot,
  resetTelemetry,
};
