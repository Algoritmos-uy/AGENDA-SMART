import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const telemetry = require('../../src/assistantTelemetry.js');

describe('assistantTelemetry', () => {
  beforeEach(() => {
    telemetry.resetTelemetry();
  });

  it('registra intentos exitosos por proveedor y modo', () => {
    const ctx = telemetry.beginAttempt({
      provider: 'deepseek',
      mode: 'stream',
      messageCount: 3,
      totalChars: 120,
      retry: false,
    });

    telemetry.succeedAttempt(ctx, { outputChars: 200 });

    const snap = telemetry.getSnapshot();
    expect(snap.totalRequests).toBe(1);
    expect(snap.streamRequests).toBe(1);
    expect(snap.successes).toBe(1);
    expect(snap.byProvider.deepseek.requests).toBe(1);
    expect(snap.byProvider.deepseek.successes).toBe(1);
    expect(snap.recent[0].type).toBe('success');
  });

  it('registra fallos y timeouts', () => {
    const timeoutCtx = telemetry.beginAttempt({ provider: 'openai', mode: 'chat' });
    const timeoutErr = new Error('request timeout');
    timeoutErr.name = 'AbortError';
    timeoutErr.code = 'ABORT_ERR';
    telemetry.failAttempt(timeoutCtx, timeoutErr);

    const failCtx = telemetry.beginAttempt({ provider: 'openai', mode: 'chat', retry: true });
    const err = new Error('bad gateway');
    err.code = 'API_ERROR';
    telemetry.failAttempt(failCtx, err);

    const snap = telemetry.getSnapshot();
    expect(snap.totalRequests).toBe(2);
    expect(snap.failures).toBe(2);
    expect(snap.timeouts).toBe(1);
    expect(snap.retries).toBe(1);
    expect(snap.byProvider.openai.timeouts).toBe(1);
  });
});
