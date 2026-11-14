import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const {
  resolveCopilotRuntimeExecutable,
  sanitizeQuota,
  sanitizeAuthStatus,
  classifyCopilotError,
  buildCopilotSessionPayload,
  registerCopilotIPC,
} = require('./copilot.cjs');

type Handler = (event: unknown, payload?: unknown) => Promise<unknown> | unknown;

describe('electron/copilot.cjs unit tests', () => {
  let userData = '';
  const handlers = new Map<string, Handler>();
  const call = (channel: string, payload?: unknown) => Promise.resolve(handlers.get(channel)!({}, payload));

  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'studyx-copilot-ud-'));
    handlers.clear();
    const ipcMain = { handle: (channel: string, fn: Handler) => handlers.set(channel, fn) };
    registerCopilotIPC(ipcMain, { getMainWindow: () => null, getUserDataPath: () => userData });
  });

  afterEach(() => {
    fs.rmSync(userData, { recursive: true, force: true });
  });

  it('sanitizeQuota keeps numeric/reset fields and strips extraneous data', () => {
    expect(sanitizeQuota(null)).toBeNull();
    expect(
      sanitizeQuota({
        isUnlimitedEntitlement: false,
        entitlementRequests: 50,
        usedRequests: 12,
        remainingPercentage: 76,
        resetDate: '2026-12-01',
        secretToken: 'ghp_should_never_leak',
      }),
    ).toEqual({
      isUnlimitedEntitlement: false,
      entitlementRequests: 50,
      usedRequests: 12,
      remainingPercentage: 76,
      resetDate: '2026-12-01',
    });
  });

  it('sanitizeAuthStatus maps connected, quota_exhausted, error, disconnected without exposing tokens', () => {
    const rawWithToken = {
      isAuthenticated: true,
      login: 'student-med',
      authType: 'gh-cli',
      host: 'github.com',
      token: 'ghp_1234567890secret',
      accessToken: 'github_pat_secret',
    };

    const connected = sanitizeAuthStatus(rawWithToken, { lastModel: 'gpt-4.1' });
    expect(connected.state).toBe('connected');
    expect(connected.login).toBe('student-med');
    expect(connected.lastModel).toBe('gpt-4.1');
    expect(JSON.stringify(connected)).not.toContain('ghp_');
    expect(JSON.stringify(connected)).not.toContain('github_pat_');
    expect((connected as Record<string, unknown>).token).toBeUndefined();

    expect(sanitizeAuthStatus(rawWithToken, { quotaExhausted: true }).state).toBe('quota_exhausted');
    expect(sanitizeAuthStatus(rawWithToken, { errorMessage: 'CLI fail' }).state).toBe('error');
    expect(sanitizeAuthStatus({ isAuthenticated: false }).state).toBe('disconnected');
  });

  it('classifyCopilotError distinguishes abort, quota_exhausted, auth_required, and generic errors', () => {
    expect(classifyCopilotError(new Error('anything'), true)).toEqual({
      errorCode: 'aborted',
      error: 'Cerere oprită.',
    });
    expect(classifyCopilotError(new Error('HTTP 429 rate limit exceeded'))).toMatchObject({
      errorCode: 'quota_exhausted',
    });
    expect(classifyCopilotError(new Error('HTTP 401 unauthorized: not authenticated'))).toMatchObject({
      errorCode: 'auth_required',
    });
    expect(classifyCopilotError(new Error('ECONNRESET socket hang up'))).toEqual({
      errorCode: 'error',
      error: 'ECONNRESET socket hang up',
    });
  });

  it('buildCopilotSessionPayload merges system prompts and formats single or multi-turn history', () => {
    const single = buildCopilotSessionPayload(
      [
        { role: 'system', content: 'Rule A' },
        { role: 'user', content: 'Ce este fibrilația atrială?' },
      ],
      'Base system prompt',
    );
    expect(single.systemContent).toBe('Base system prompt\n\nRule A');
    expect(single.prompt).toBe('Ce este fibrilația atrială?');

    const multi = buildCopilotSessionPayload([
      { role: 'user', content: 'Bună' },
      { role: 'assistant', content: 'Salut!' },
      { role: 'user', content: 'Explică insuficiența cardiacă.' },
    ]);
    expect(multi.prompt).toContain('Utilizator: Bună');
    expect(multi.prompt).toContain('Asistent: Salut!');
    expect(multi.prompt).toContain('Mesaj curent:\nExplică insuficiența cardiacă.');
  });

  it('resolveCopilotRuntimeExecutable resolves unpacked binary outside app.asar', () => {
    const exe = resolveCopilotRuntimeExecutable();
    expect(exe).toBeTruthy();
    expect(path.basename(exe!)).toMatch(/^copilot-runtime(\.exe)?$/);
    expect(exe!).not.toMatch(/app\.asar[/\\]/i);
  });

  it('registers all 4 IPC channels and stays locally disconnected after copilot:disconnect', async () => {
    for (const ch of ['copilot:status', 'copilot:stream', 'copilot:abort', 'copilot:disconnect']) {
      expect(handlers.has(ch), ch).toBe(true);
    }

    const disconnected = await call('copilot:disconnect');
    expect(disconnected).toMatchObject({
      state: 'disconnected',
      isAuthenticated: false,
      statusMessage: 'Deconectat în StudyX',
    });

    const statusAfter = await call('copilot:status', {});
    expect(statusAfter).toMatchObject({
      state: 'disconnected',
      isAuthenticated: false,
      statusMessage: 'Deconectat în StudyX',
    });

    const streamWhileDisconnected = await call('copilot:stream', {
      requestId: 'req-1',
      messages: [{ role: 'user', content: 'test' }],
    });
    expect(streamWhileDisconnected).toMatchObject({
      ok: false,
      errorCode: 'auth_required',
    });
  });
});
