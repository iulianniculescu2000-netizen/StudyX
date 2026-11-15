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
  isQuotaExhausted,
  dropPastResetDate,
  isGitHubDeviceUrl,
  sanitizeAccounts,
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

  it('classifyCopilotError does not mistake ordinary words or numbers for auth or quota problems', () => {
    // „author” conține „auth”, „4290” conține „429”: înainte, ambele scoteau Copilot din uz degeaba.
    expect(classifyCopilotError(new Error('The author field is missing from the reply'))).toMatchObject({ errorCode: 'error' });
    expect(classifyCopilotError(new Error('Request failed after 4290 ms'))).toMatchObject({ errorCode: 'error' });
    expect(classifyCopilotError(new Error('Model returned 14029 tokens'))).toMatchObject({ errorCode: 'error' });
    expect(classifyCopilotError(new Error('Timeout after 120000ms waiting for session.idle'))).toEqual({
      errorCode: 'error',
      error: 'GitHub Copilot nu a răspuns la timp.',
    });
    expect(classifyCopilotError(new Error('403 Forbidden'))).toMatchObject({ errorCode: 'auth_required' });
    expect(classifyCopilotError(new Error('User is not signed in'))).toMatchObject({ errorCode: 'auth_required' });
    expect(classifyCopilotError(new Error('402: premium requests exhausted'))).toMatchObject({ errorCode: 'quota_exhausted' });
    expect(classifyCopilotError(new Error('quota exceeded for chat'))).toMatchObject({ errorCode: 'quota_exhausted' });
  });

  it('opens only the official GitHub device page for sign-in', () => {
    expect(isGitHubDeviceUrl('https://github.com/login/device')).toBe(true);
    expect(isGitHubDeviceUrl('https://github.com/login/device?user_code=ABCD-1234')).toBe(true);
    expect(isGitHubDeviceUrl('http://github.com/login/device')).toBe(false);
    expect(isGitHubDeviceUrl('https://github.com.evil.example/login/device')).toBe(false);
    expect(isGitHubDeviceUrl('https://evil.example/login/device')).toBe(false);
    expect(isGitHubDeviceUrl('https://github.com/settings/tokens')).toBe(false);
    expect(isGitHubDeviceUrl('file:///C:/Windows/System32/calc.exe')).toBe(false);
    expect(isGitHubDeviceUrl('nu e un url')).toBe(false);
  });

  it('sanitizeAccounts keeps only safe account fields and marks which can be switched to', () => {
    const out = sanitizeAccounts([
      { accountId: 'acc-1', host: 'https://github.com', login: 'student', authSource: 'gh', active: true, switchable: true, selectionId: 'sel-1', token: 'ghp_secret' },
      { host: 'https://github.com', login: 'platit', authSource: 'user', active: false, switchable: false },
      { login: '' },
      null,
    ]);
    expect(out).toEqual([
      { key: 'acc-1', login: 'student', source: 'gh', active: true, switchable: true },
      { key: 'https://github.com|platit', login: 'platit', source: 'user', active: false, switchable: false },
    ]);
    expect(JSON.stringify(out)).not.toContain('ghp_');
    expect(JSON.stringify(out)).not.toContain('sel-1');
    expect(sanitizeAccounts(undefined)).toEqual([]);
  });

  it('isQuotaExhausted is true only for a limited account with nothing left', () => {
    expect(isQuotaExhausted(null)).toBe(false);
    expect(isQuotaExhausted({ isUnlimitedEntitlement: true, remainingPercentage: 0 })).toBe(false);
    expect(isQuotaExhausted({ isUnlimitedEntitlement: false, remainingPercentage: 12 })).toBe(false);
    expect(isQuotaExhausted({ isUnlimitedEntitlement: false })).toBe(false);
    expect(isQuotaExhausted({ isUnlimitedEntitlement: false, remainingPercentage: 0 })).toBe(true);
  });

  it('dropPastResetDate keeps only a reset date that is still ahead', () => {
    const past = new Date(Date.now() - 5_000).toISOString();
    const future = new Date(Date.now() + 3 * 24 * 3600_000).toISOString();
    expect(dropPastResetDate({ remainingPercentage: 40, resetDate: past })).toEqual({ remainingPercentage: 40 });
    expect(dropPastResetDate({ remainingPercentage: 40, resetDate: future })).toEqual({ remainingPercentage: 40, resetDate: future });
    expect(dropPastResetDate({ remainingPercentage: 40, resetDate: 'nu e o dată' })).toEqual({ remainingPercentage: 40 });
    expect(dropPastResetDate(null)).toBeNull();
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

  it('registers all IPC channels and stays locally disconnected after copilot:disconnect', async () => {
    for (const ch of ['copilot:status', 'copilot:stream', 'copilot:abort', 'copilot:disconnect', 'copilot:switch-account', 'copilot:login-start', 'copilot:login-cancel', 'copilot:login-open-page']) {
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
