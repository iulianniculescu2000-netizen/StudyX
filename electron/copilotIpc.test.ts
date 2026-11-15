/* eslint-disable @typescript-eslint/no-explicit-any -- dublurile de test lucrează cu forme libere ale SDK-ului fals */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Testează handlerele Copilot prin `registerCopilotIPC`, cu un ipcMain fals și un `@github/copilot-sdk` fals
 * injectat în cache-ul `require` ÎNAINTE ca `copilot.cjs` să fie încărcat. Nu atinge rețeaua, GitHub sau o cheie reală.
 */
const require = createRequire(import.meta.url);
const SDK_PATH = require.resolve('@github/copilot-sdk');
const COPILOT_PATH = require.resolve('./copilot.cjs');

type AnyFn = (...args: any[]) => any;

interface FakeSession {
  sessionId: string;
  listeners: AnyFn[];
  on: AnyFn;
  sendAndWait: AnyFn;
  abort: AnyFn;
  disconnect: AnyFn;
  rpc: { accounts: { enumerate: AnyFn; set: AnyFn; login: { begin: AnyFn; advance: AnyFn; cancel: AnyFn } } };
}

/** Starea controlabilă a SDK-ului fals; se resetează la fiecare test. */
const fake = {
  auth: { isAuthenticated: true, login: 'student', authType: 'user', host: 'github.com' } as Record<string, unknown>,
  accounts: [] as Array<Record<string, unknown>>,
  setResult: { ok: true } as Record<string, unknown>,
  quota: null as unknown,
  onSend: (async () => ({ data: { content: '' } })) as AnyFn,
  loginBegin: (async () => ({ flowId: 'f1', step: { kind: 'device-code', verificationUri: 'https://github.com/login/device', userCode: 'ABCD-1234', expiresIn: 600 } })) as AnyFn,
  loginAdvance: (() => new Promise(() => { /* rămâne în așteptare */ })) as AnyFn,
  sessions: [] as FakeSession[],
  deleted: [] as string[],
  loginCancels: [] as unknown[],
  setCalls: [] as unknown[],
  started: 0,
  stopped: 0,
};

function makeSession(): FakeSession {
  const s: FakeSession = {
    sessionId: `sess-${fake.sessions.length + 1}`,
    listeners: [],
    on: (cb: AnyFn) => { s.listeners.push(cb); return () => { s.listeners = s.listeners.filter((l) => l !== cb); }; },
    sendAndWait: vi.fn((...a: unknown[]) => fake.onSend(s, ...a)),
    abort: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    rpc: {
      accounts: {
        enumerate: vi.fn(async () => ({ items: fake.accounts })),
        set: vi.fn(async (arg: unknown) => { fake.setCalls.push(arg); return fake.setResult; }),
        login: {
          begin: vi.fn((...a: unknown[]) => fake.loginBegin(...a)),
          advance: vi.fn((...a: unknown[]) => fake.loginAdvance(...a)),
          cancel: vi.fn(async (arg: unknown) => { fake.loginCancels.push(arg); }),
        },
      },
    },
  };
  fake.sessions.push(s);
  return s;
}

class FakeCopilotClient {
  rpc = { account: { getQuota: async () => ({ quotaSnapshots: { chat: fake.quota } }) } };
  async start() { fake.started += 1; }
  async stop() { fake.stopped += 1; }
  async forceStop() { fake.stopped += 1; }
  async getAuthStatus() { return fake.auth; }
  async createSession() { return makeSession(); }
  async deleteSession(id: string) { fake.deleted.push(id); }
}

const emit = (s: FakeSession, event: unknown) => s.listeners.forEach((l) => l(event));
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('handlerele Copilot (IPC) cu SDK fals', () => {
  let userData = '';
  let copilot: any;
  const handlers = new Map<string, AnyFn>();
  const sent: Array<{ channel: string; payload: any }> = [];
  const opened: string[] = [];
  const call = (channel: string, ...args: unknown[]) => Promise.resolve(handlers.get(channel)!({}, ...args));

  beforeEach(() => {
    vi.useRealTimers();
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'studyx-copilot-ipc-'));
    Object.assign(fake, {
      auth: { isAuthenticated: true, login: 'student', authType: 'user', host: 'github.com' },
      accounts: [], setResult: { ok: true }, quota: null,
      onSend: async () => ({ data: { content: '' } }),
      sessions: [], deleted: [], loginCancels: [], setCalls: [], started: 0, stopped: 0,
    });
    fake.loginBegin = async () => ({ flowId: 'f1', step: { kind: 'device-code', verificationUri: 'https://github.com/login/device', userCode: 'ABCD-1234', expiresIn: 600 } });
    fake.loginAdvance = () => new Promise(() => { /* rămâne în așteptare */ });
    sent.length = 0;
    opened.length = 0;
    handlers.clear();

    require.cache[SDK_PATH] = {
      id: SDK_PATH, filename: SDK_PATH, loaded: true, children: [], paths: [],
      exports: { CopilotClient: FakeCopilotClient, RuntimeConnection: { forStdio: (o: unknown) => o } },
    } as any;
    delete require.cache[COPILOT_PATH];
    copilot = require('./copilot.cjs');

    const win = {
      isDestroyed: () => false,
      webContents: { isDestroyed: () => false, send: (channel: string, payload: unknown) => sent.push({ channel, payload }) },
    };
    copilot.registerCopilotIPC(
      { handle: (c: string, fn: AnyFn) => handlers.set(c, fn) },
      { getMainWindow: () => win, getUserDataPath: () => userData, openExternal: async (u: string) => { opened.push(u); } },
    );
  });

  afterEach(async () => {
    await copilot.stopCopilotEngine();
    delete require.cache[SDK_PATH];
    delete require.cache[COPILOT_PATH];
    fs.rmSync(userData, { recursive: true, force: true });
  });

  const streamPayload = (requestId = 'r1') => ({ requestId, messages: [{ role: 'user', content: 'Salut' }] });

  it('copilot:stream trimite deltele prin webContents.send și întoarce textul întreg', async () => {
    fake.onSend = async (s: FakeSession) => {
      emit(s, { type: 'assistant.message_delta', data: { deltaContent: 'Bună ' } });
      emit(s, { type: 'assistant.message_delta', data: { deltaContent: 'ziua' } });
      emit(s, { type: 'assistant.usage', data: { model: 'gpt-x', modelDisplayName: 'GPT X', quotaSnapshots: { chat: { isUnlimitedEntitlement: false, remainingPercentage: 40 } } } });
      return { data: { content: 'Bună ziua' } };
    };
    const res = await call('copilot:stream', streamPayload());
    expect(res).toMatchObject({ ok: true, content: 'Bună ziua', model: 'gpt-x', modelDisplayName: 'GPT X' });
    expect(sent).toEqual([
      { channel: 'copilot:stream-event', payload: { requestId: 'r1', type: 'delta', deltaContent: 'Bună ' } },
      { channel: 'copilot:stream-event', payload: { requestId: 'r1', type: 'delta', deltaContent: 'ziua' } },
    ]);
    expect(fake.deleted).toEqual(['sess-1']);
  });

  it('copilot:stream clasifică o eroare de cotă ca quota_exhausted', async () => {
    fake.onSend = async () => { throw new Error('429 Too Many Requests: quota exceeded'); };
    const res: any = await call('copilot:stream', streamPayload());
    expect(res).toMatchObject({ ok: false, errorCode: 'quota_exhausted' });
    const status: any = await call('copilot:status', {});
    expect(status.state).toBe('quota_exhausted');
  });

  it('copilot:stream întoarce auth_required când contul nu e conectat', async () => {
    fake.auth = { isAuthenticated: false };
    const res: any = await call('copilot:stream', streamPayload());
    expect(res).toMatchObject({ ok: false, errorCode: 'auth_required' });
    expect(fake.sessions).toHaveLength(0);
  });

  it('copilot:stream întoarce auth_required și când starea locală e „deconectat”', async () => {
    fs.writeFileSync(path.join(userData, 'copilot-state.json'), JSON.stringify({ disconnected: true }));
    const res: any = await call('copilot:stream', streamPayload());
    expect(res).toMatchObject({ ok: false, errorCode: 'auth_required' });
  });

  it('copilot:abort oprește un flux în curs: rezultat aborted și sesiunea oprită', async () => {
    let release: (v: unknown) => void = () => undefined;
    fake.onSend = () => new Promise((resolve) => { release = resolve; });
    const pending = call('copilot:stream', streamPayload('rA'));
    await vi.waitFor(() => expect(fake.sessions[0]?.sendAndWait).toHaveBeenCalled());
    expect(await call('copilot:abort', 'rA')).toEqual({ ok: true });
    expect(fake.sessions[0].abort).toHaveBeenCalled();
    release({ data: { content: 'târziu' } });
    expect(await pending).toMatchObject({ ok: false, errorCode: 'aborted' });
  });

  it('copilot:abort cu argument invalid sau id necunoscut întoarce { ok: false }, fără erori', async () => {
    for (const bad of [undefined, null, 5, {}, ['r1'], '', 'necunoscut', 'x'.repeat(1000)]) {
      expect(await call('copilot:abort', bad)).toEqual({ ok: false });
    }
  });

  it('copilot:stream cu același requestId e respins, iar primul flux rămâne neatins', async () => {
    let release: (v: unknown) => void = () => undefined;
    fake.onSend = () => new Promise((resolve) => { release = resolve; });
    const first = call('copilot:stream', streamPayload('dup'));
    await vi.waitFor(() => expect(fake.sessions[0]?.sendAndWait).toHaveBeenCalled());
    const second: any = await call('copilot:stream', streamPayload('dup'));
    expect(second).toMatchObject({ ok: false, errorCode: 'error' });
    expect(typeof second.error).toBe('string');
    expect(fake.sessions).toHaveLength(1);
    // primul flux încă poate fi oprit și se încheie normal
    expect(await call('copilot:abort', 'dup')).toEqual({ ok: true });
    release({ data: { content: 'x' } });
    expect(await first).toMatchObject({ ok: false, errorCode: 'aborted' });
  });

  it('copilot:stream cu două cereri simultane identice: doar una pornește', async () => {
    let release: (v: unknown) => void = () => undefined;
    fake.onSend = () => new Promise((resolve) => { release = resolve; });
    const a = call('copilot:stream', streamPayload('same'));
    const b = call('copilot:stream', streamPayload('same'));
    await vi.waitFor(() => expect(fake.sessions[0]?.sendAndWait).toHaveBeenCalled());
    await vi.waitFor(() => expect(fake.sessions.length).toBeGreaterThan(0));
    release({ data: { content: 'ok' } });
    const results: any[] = await Promise.all([a, b]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)[0]).toMatchObject({ errorCode: 'error' });
    expect(fake.sessions).toHaveLength(1);
  });

  it('copilot:stream cu payload null/nu-obiect nu aruncă și cere un identificator valid', async () => {
    for (const bad of [null, undefined, 'text', 7, []]) {
      expect(await call('copilot:stream', bad)).toMatchObject({ ok: false, errorCode: 'error' });
    }
  });

  it('copilot:status tolerează opțiuni null', async () => {
    const res: any = await call('copilot:status', null);
    expect(res.state).toBe('connected');
    expect((await call('copilot:status', 'x') as any).state).toBe('connected');
    expect((await call('copilot:status') as any).state).toBe('connected');
  });

  const twoAccounts = () => [
    { login: 'student', host: 'github.com', accountId: 'acc-1', active: true, switchable: true, selectionId: 'sel-1', authSource: 'user' },
    { login: 'altul', host: 'github.com', accountId: 'acc-2', active: false, switchable: true, selectionId: 'sel-2', authSource: 'user' },
    { login: 'cli', host: 'github.com', accountId: 'acc-3', active: false, switchable: false, authSource: 'gh-cli' },
  ];

  it('copilot:switch-account comută pe un cont care permite asta', async () => {
    fake.accounts = twoAccounts();
    expect(await call('copilot:switch-account', 'acc-2')).toEqual({ ok: true });
    expect(fake.setCalls).toEqual([{ command: { kind: 'switchActive', selectionId: 'sel-2' } }]);
  });

  it('copilot:switch-account refuză un cont care nu se poate comuta, unul necunoscut și argumente invalide', async () => {
    fake.accounts = twoAccounts();
    expect(await call('copilot:switch-account', 'acc-3')).toMatchObject({ ok: false });
    expect(await call('copilot:switch-account', 'nu-exista')).toMatchObject({ ok: false });
    for (const bad of [undefined, null, 5, {}, '', 'x'.repeat(1000)]) {
      expect(await call('copilot:switch-account', bad)).toMatchObject({ ok: false });
    }
    expect(fake.setCalls).toEqual([]);
  });

  it('copilot:login-start întoarce codul și deschide doar adresa exactă github.com/login/device', async () => {
    const res: any = await call('copilot:login-start');
    expect(res).toMatchObject({ ok: true, userCode: 'ABCD-1234', verificationUri: 'https://github.com/login/device', expiresIn: 600 });
    expect(opened).toEqual(['https://github.com/login/device']);
  });

  it('copilot:login-start nu deschide nimic dacă adresa de verificare nu e cea oficială GitHub', async () => {
    fake.loginBegin = async () => ({ flowId: 'f2', step: { kind: 'device-code', verificationUri: 'https://github.com.evil.example/login/device', userCode: 'ZZZZ' } });
    const res: any = await call('copilot:login-start');
    expect(res.ok).toBe(false);
    expect(opened).toEqual([]);
    expect(fake.loginCancels).toEqual([{ flowId: 'f2' }]);
  });

  it('copilot:login-cancel anulează conectarea în curs și curăță sesiunea; fără conectare întoarce tot ok', async () => {
    expect(await call('copilot:login-cancel')).toEqual({ ok: true });
    await call('copilot:login-start');
    expect(await call('copilot:login-cancel')).toEqual({ ok: true });
    expect(fake.loginCancels).toEqual([{ flowId: 'f1' }]);
    await flush();
    expect(fake.deleted).toContain('sess-1');
    // după anulare, „redeschide pagina” nu mai deschide nimic
    opened.length = 0;
    expect(await call('copilot:login-open-page')).toEqual({ ok: false });
    expect(opened).toEqual([]);
  });
});
