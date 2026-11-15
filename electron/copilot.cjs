const path = require('path');
const fs = require('fs');

const COPILOT_STREAM_EVENT_CHANNEL = 'copilot:stream-event';
const COPILOT_LOGIN_EVENT_CHANNEL = 'copilot:login-event';
const REQUEST_TIMEOUT_MS = 120000;

let client = null;
let startPromise = null;
let lastServedModel = null;
let lastQuotaSnapshot = null;
let lastQuotaExhausted = false;
/** Tipul contului din ultima verificare: „user” = conectat din StudyX, „gh-cli” = preluat din GitHub CLI. */
let lastAuthType = null;
const activeStreams = new Map();
/** Conectarea cu cod în curs (cel mult una): sesiunea motorului prin care rulează, id-ul fluxului și pagina de verificare. */
let loginFlow = null;

function loadCopilotSdk() {
  return require('@github/copilot-sdk');
}

function resolveCopilotRuntimeExecutable() {
  const platform = process.platform;
  const arch = process.arch;
  const target = `${platform}-${arch}`;
  const binary = platform === 'win32' ? 'copilot-runtime.exe' : 'copilot-runtime';
  try {
    const candidate = require.resolve(`@github/copilot-sdk-${target}/prebuilds/${target}/${binary}`);
    return candidate.replace(/app\.asar([/\\])/i, 'app.asar.unpacked$1');
  } catch {
    return null;
  }
}

function getRuntimeDir(getUserDataPath) {
  const userData = typeof getUserDataPath === 'function' ? getUserDataPath() : process.cwd();
  const dir = path.join(userData, 'copilot-runtime');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getStateFilePath(getUserDataPath) {
  const userData = typeof getUserDataPath === 'function' ? getUserDataPath() : process.cwd();
  return path.join(userData, 'copilot-state.json');
}

function readLocalState(getUserDataPath) {
  try {
    const raw = fs.readFileSync(getStateFilePath(getUserDataPath), 'utf8');
    const parsed = JSON.parse(raw);
    return { disconnected: Boolean(parsed && parsed.disconnected) };
  } catch {
    return { disconnected: false };
  }
}

function writeLocalState(getUserDataPath, nextState) {
  try {
    const filePath = getStateFilePath(getUserDataPath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ disconnected: Boolean(nextState?.disconnected) }), 'utf8');
  } catch {
    // non-fatal
  }
}

function sanitizeQuota(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    isUnlimitedEntitlement: Boolean(raw.isUnlimitedEntitlement),
    ...(typeof raw.entitlementRequests === 'number' ? { entitlementRequests: raw.entitlementRequests } : {}),
    ...(typeof raw.usedRequests === 'number' ? { usedRequests: raw.usedRequests } : {}),
    ...(typeof raw.remainingPercentage === 'number' ? { remainingPercentage: raw.remainingPercentage } : {}),
    ...(typeof raw.resetDate === 'string' ? { resetDate: raw.resetDate } : {}),
  };
}

/** Conturile pe care le vede motorul, fără nimic secret: cheia e identificatorul stabil al contului, nu un token. */
function sanitizeAccounts(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a) => a && typeof a === 'object' && typeof a.login === 'string' && a.login)
    .map((a) => ({
      key: typeof a.accountId === 'string' && a.accountId ? a.accountId : `${a.host || ''}|${a.login}`,
      login: a.login,
      source: typeof a.authSource === 'string' ? a.authSource : null,
      active: Boolean(a.active),
      switchable: a.switchable !== false && typeof a.selectionId === 'string' && Boolean(a.selectionId),
    }));
}

function sanitizeAuthStatus(auth, extras = {}) {
  const isAuthenticated = Boolean(auth && auth.isAuthenticated);
  const quota = extras.quota ?? null;
  const quotaExhausted = Boolean(extras.quotaExhausted);
  const errorMessage = typeof extras.errorMessage === 'string' && extras.errorMessage ? extras.errorMessage : null;

  let state = 'disconnected';
  if (errorMessage) {
    state = 'error';
  } else if (isAuthenticated) {
    state = quotaExhausted ? 'quota_exhausted' : 'connected';
  }

  return {
    state,
    isAuthenticated,
    login: isAuthenticated && typeof auth.login === 'string' ? auth.login : null,
    authType: isAuthenticated && typeof auth.authType === 'string' ? auth.authType : null,
    host: isAuthenticated && typeof auth.host === 'string' ? auth.host : null,
    quota,
    accounts: isAuthenticated ? sanitizeAccounts(extras.accounts) : [],
    lastModel: typeof extras.lastModel === 'string' ? extras.lastModel : null,
    statusMessage:
      errorMessage ||
      (typeof auth?.statusMessage === 'string' && auth.statusMessage.trim()
        ? auth.statusMessage.trim()
        : isAuthenticated
          ? 'Conectat la GitHub Copilot'
          : 'Nu am găsit niciun cont GitHub conectat pe acest calculator (GitHub CLI sau Copilot CLI).'),
  };
}

const QUOTA_ERROR_RE =
  /(?:^|\D)(?:402|429)(?:\D|$)|\bquota\b|rate[ _-]?limit|too many requests|limit (?:exceeded|reached)|premium requests?.{0,40}(?:exhausted|exceeded|used)/i;
const AUTH_ERROR_RE =
  /(?:^|\D)(?:401|403)(?:\D|$)|not authenticated|unauthenticated|unauthori[sz]ed|authentication (?:required|failed)|not (?:logged|signed) in|no (?:valid )?(?:credentials|token)|bad credentials|copilot (?:is )?not (?:enabled|available)|no (?:active )?copilot (?:subscription|access)/i;
const TIMEOUT_ERROR_RE = /\btime(?:d)?[ -]?out\b|\betimedout\b/i;

/**
 * Împarte o eroare a motorului în patru feluri pe care restul aplicației le tratează diferit: oprită de utilizator,
 * cotă atinsă (trecem pe cheile API), cont lipsă sau fără acces (cerem reconectarea) și orice altceva (trecătoare).
 * Potrivirile sunt pe cuvinte și coduri întregi: „author” sau un „4290 ms” dintr-un mesaj nu înseamnă autentificare ori cotă.
 */
function classifyCopilotError(err, aborted = false) {
  if (aborted) {
    return { errorCode: 'aborted', error: 'Cerere oprită.' };
  }
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err || '');
  const message = String(raw || '').trim();

  if (QUOTA_ERROR_RE.test(message)) {
    return {
      errorCode: 'quota_exhausted',
      error: 'Cota GitHub Copilot pentru chat a fost atinsă.',
    };
  }

  if (AUTH_ERROR_RE.test(message)) {
    return {
      errorCode: 'auth_required',
      error: 'Contul GitHub de pe acest calculator nu mai este conectat sau nu are acces la Copilot.',
    };
  }

  if (TIMEOUT_ERROR_RE.test(message)) {
    return { errorCode: 'error', error: 'GitHub Copilot nu a răspuns la timp.' };
  }

  return {
    errorCode: 'error',
    error: message ? (message.length > 220 ? `${message.slice(0, 217)}…` : message) : 'Eroare necunoscută GitHub Copilot.',
  };
}

/** Unele conturi raportează ca dată de resetare chiar momentul curent: o dată care a trecut nu ajută pe nimeni, așa că o lăsăm deoparte. */
function dropPastResetDate(quota) {
  if (!quota || typeof quota.resetDate !== 'string') return quota;
  const at = Date.parse(quota.resetDate);
  if (Number.isFinite(at) && at > Date.now() + 60_000) return quota;
  const { resetDate: _past, ...rest } = quota;
  return rest;
}

/** Cota e atinsă doar când contul are o limită și nu a mai rămas nimic din ea. */
function isQuotaExhausted(quota) {
  return Boolean(
    quota && !quota.isUnlimitedEntitlement && typeof quota.remainingPercentage === 'number' && quota.remainingPercentage <= 0,
  );
}

/** Conturile GitHub pe care le vede motorul (cel activ și cele în care poate comuta). Listă goală dacă nu se poate citi. */
async function readAccounts(instance) {
  let session = null;
  try {
    session = await createAccountSession(instance);
    const res = await session.rpc.accounts.enumerate({ query: { kind: 'accounts', refresh: true } });
    return Array.isArray(res?.items) ? res.items : [];
  } catch {
    return [];
  } finally {
    await disposeSession(instance, session);
  }
}

/** Cota de chat a contului, citită direct de la motor (fără să trimită vreun mesaj). Null dacă motorul nu o oferă. */
async function readChatQuota(instance) {
  try {
    const res = await instance.rpc.account.getQuota();
    return dropPastResetDate(sanitizeQuota(res && res.quotaSnapshots ? res.quotaSnapshots.chat : null));
  } catch {
    return null;
  }
}

function buildCopilotSessionPayload(messages, systemPrompt) {
  const list = Array.isArray(messages) ? messages : [];
  const systemParts = [];
  if (typeof systemPrompt === 'string' && systemPrompt.trim()) {
    systemParts.push(systemPrompt.trim());
  }

  const turns = [];
  for (const msg of list) {
    if (!msg || typeof msg !== 'object') continue;
    const role = typeof msg.role === 'string' ? msg.role : 'user';
    const content = typeof msg.content === 'string' ? msg.content.trim() : '';
    if (!content) continue;
    if (role === 'system') {
      systemParts.push(content);
    } else if (role === 'assistant') {
      turns.push({ role: 'assistant', content });
    } else {
      turns.push({ role: 'user', content });
    }
  }

  const systemContent = systemParts.join('\n\n').trim();

  if (turns.length === 0) {
    return { systemContent, prompt: '' };
  }

  if (turns.length === 1 && turns[0].role === 'user') {
    return { systemContent, prompt: turns[0].content };
  }

  const last = turns[turns.length - 1];
  const history = turns.slice(0, -1);
  if (last.role === 'user' && history.length > 0) {
    const formattedHistory = history
      .map((t) => `${t.role === 'assistant' ? 'Asistent' : 'Utilizator'}: ${t.content}`)
      .join('\n\n');
    return {
      systemContent,
      prompt: `Conversație anterioară:\n${formattedHistory}\n\nMesaj curent:\n${last.content}`,
    };
  }

  return {
    systemContent,
    prompt: turns
      .map((t) => `${t.role === 'assistant' ? 'Asistent' : 'Utilizator'}: ${t.content}`)
      .join('\n\n'),
  };
}

function sendStreamEvent(getMainWindow, payload) {
  try {
    const win = typeof getMainWindow === 'function' ? getMainWindow() : null;
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(COPILOT_STREAM_EVENT_CHANNEL, payload);
    }
  } catch {
    // window closing
  }
}

/** Singura pagină pe care o deschidem în browser pentru conectare: pagina oficială GitHub pentru coduri de dispozitiv. */
function isGitHubDeviceUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' && url.hostname === 'github.com' && url.pathname.startsWith('/login/device');
  } catch {
    return false;
  }
}

function sendLoginEvent(getMainWindow, payload) {
  try {
    const win = typeof getMainWindow === 'function' ? getMainWindow() : null;
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(COPILOT_LOGIN_EVENT_CHANNEL, payload);
    }
  } catch {
    // window closing
  }
}

/** O sesiune fără unelte și fără drepturi, doar ca să ajungem la metodele de conectare ale motorului (sunt legate de sesiune). */
async function createAccountSession(instance) {
  return instance.createSession({
    availableTools: [],
    onPermissionRequest: async () => ({ kind: 'denied-by-rules', rules: [] }),
  });
}

async function disposeSession(instance, session) {
  if (!session) return;
  const sessionId = typeof session.sessionId === 'string' ? session.sessionId : '';
  try {
    await session.disconnect();
  } catch {
    // ignore
  }
  if (sessionId && instance) {
    try {
      await instance.deleteSession(sessionId);
    } catch {
      // ignore
    }
  }
}

async function endLoginFlow({ cancel }) {
  const flow = loginFlow;
  loginFlow = null;
  if (!flow) return;
  flow.cancelled = true;
  if (cancel) {
    try {
      await flow.session.rpc.accounts.login.cancel({ flowId: flow.flowId });
    } catch {
      // ignore
    }
  }
  await disposeSession(flow.instance, flow.session);
}

/**
 * Așteaptă ca utilizatorul să introducă codul pe GitHub. Motorul face singur interogările până la autorizare sau
 * expirare, iar noi doar anunțăm fereastra la final. Parola nu trece niciodată pe aici: se scrie pe github.com.
 */
async function awaitLoginCompletion(flow, { getMainWindow, getUserDataPath }) {
  try {
    let step = await flow.session.rpc.accounts.login.advance({ flowId: flow.flowId });
    // Un cont cu mai multe identități cere alegerea uneia: luăm contul github.com (singurul pe care îl oferim).
    if (step.kind === 'completed' && step.result?.status === 'needs-account-selection') {
      const accounts = Array.isArray(step.result.accounts) ? step.result.accounts : [];
      const pick = accounts.find((a) => a && a.host === 'github.com') || accounts[0];
      if (!pick) throw new Error('Nu am găsit un cont GitHub de ales.');
      step = await flow.session.rpc.accounts.login.advance({ flowId: flow.flowId, input: pick.selectionId });
    }
    if (flow.cancelled) return;
    if (step.kind === 'error') throw new Error(step.message || 'Conectarea a eșuat.');
    if (step.kind !== 'completed' || step.result?.status !== 'completed') {
      const status = step.kind === 'completed' ? step.result?.status : step.kind;
      if (status === 'needs-plaintext-consent' || status === 'declined') {
        // Nu salvăm jetonul necriptat fără acordul explicit al utilizatorului: lăsăm conectarea neterminată.
        throw new Error('Windows nu a putut păstra conectarea în siguranță pe acest calculator, așa că nu am salvat-o.');
      }
      throw new Error('Conectarea nu s-a încheiat. Încearcă din nou.');
    }

    writeLocalState(getUserDataPath, { disconnected: false });
    lastQuotaSnapshot = null;
    lastQuotaExhausted = false;
    await endLoginFlow({ cancel: false });
    // Motorul pornit înainte de conectare nu vede mereu contul nou: îl repornim, apoi verificăm că îl vede.
    await stopCopilotEngine();
    const instance = await ensureClient(getUserDataPath);
    const auth = await instance.getAuthStatus();
    if (!auth?.isAuthenticated) throw new Error('Conectarea s-a făcut, dar motorul nu vede încă contul. Apasă „Verifică starea”.');
    sendLoginEvent(getMainWindow, { type: 'done' });
  } catch (err) {
    if (flow.cancelled) return;
    const message = err instanceof Error ? err.message : String(err || '');
    const expired = /expire|timed? ?out|expirat/i.test(message);
    await endLoginFlow({ cancel: true });
    sendLoginEvent(getMainWindow, {
      type: 'error',
      error: expired ? 'Codul a expirat. Apasă din nou „Conectează GitHub Copilot”.' : message || 'Conectarea a eșuat.',
    });
  }
}

async function ensureClient(getUserDataPath) {
  if (client) return client;
  if (startPromise) return startPromise;

  startPromise = (async () => {
    const { CopilotClient, RuntimeConnection } = loadCopilotSdk();
    const runtimeDir = getRuntimeDir(getUserDataPath);
    const runtimeExe = resolveCopilotRuntimeExecutable();
    const connection = runtimeExe ? RuntimeConnection.forStdio({ path: runtimeExe }) : undefined;

    const instance = new CopilotClient({
      ...(connection ? { connection } : {}),
      mode: 'empty',
      baseDirectory: runtimeDir,
      workingDirectory: runtimeDir,
      useLoggedInUser: true,
      autoStart: false,
      logLevel: 'error',
    });

    await instance.start();
    client = instance;
    return instance;
  })();

  try {
    return await startPromise;
  } finally {
    startPromise = null;
  }
}

async function stopCopilotEngine(options = {}) {
  await endLoginFlow({ cancel: true });
  for (const entry of activeStreams.values()) {
    entry.aborted = true;
    try {
      await entry.session.abort();
    } catch {
      // ignore
    }
    try {
      await entry.session.disconnect();
    } catch {
      // ignore
    }
  }
  activeStreams.clear();

  const current = client;
  client = null;
  startPromise = null;
  if (current) {
    try {
      await current.stop();
    } catch {
      try {
        await current.forceStop();
      } catch {
        // ignore
      }
    }
  }

  if (options.clearRuntimeDir && typeof options.getUserDataPath === 'function') {
    const runtimeDir = path.join(options.getUserDataPath(), 'copilot-runtime');
    try {
      fs.rmSync(runtimeDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

/**
 * Dacă contul a fost conectat chiar din StudyX (tip „user”), îl scoatem și din motor, ca „Deconectează” să însemne
 * deconectare adevărată. Un cont preluat din GitHub CLI nu e al nostru: acela rămâne, iar „Deconectează” doar îl lasă
 * deoparte în StudyX.
 */
async function logoutOwnAccount(getUserDataPath) {
  // Fără o verificare anterioară nu știm al cui e contul: nu pornim motorul doar ca să aflăm.
  if (lastAuthType !== 'user') return;
  try {
    const instance = await ensureClient(getUserDataPath);
    const auth = await instance.getAuthStatus();
    if (!auth?.isAuthenticated || auth.authType !== 'user') return;
    const session = await createAccountSession(instance);
    try {
      await session.rpc.accounts.set({ command: { kind: 'logout' } });
    } finally {
      await disposeSession(instance, session);
    }
  } catch {
    // Deconectarea locală (steagul „deconectat”) se face oricum.
  }
}

function registerCopilotIPC(ipcMain, { getMainWindow, getUserDataPath, openExternal }) {
  ipcMain.handle('copilot:switch-account', async (_event, accountKey) => {
    const key = typeof accountKey === 'string' && accountKey.length <= 512 ? accountKey : '';
    if (!key) return { ok: false, error: 'Cont necunoscut.' };
    let session = null;
    try {
      const instance = await ensureClient(getUserDataPath);
      // Căutăm contul în lista proaspătă: id-ul opac de comutare se schimbă, deci nu ne bazăm pe unul păstrat de interfață.
      const items = await readAccounts(instance);
      const target = sanitizeAccounts(items).find((a) => a.key === key);
      const raw = items.find((a) => (typeof a.accountId === 'string' && a.accountId ? a.accountId : `${a.host || ''}|${a.login}`) === key);
      if (!target || !raw || !target.switchable) return { ok: false, error: 'În contul acesta nu se poate comuta acum.' };
      session = await createAccountSession(instance);
      const res = await session.rpc.accounts.set({ command: { kind: 'switchActive', selectionId: raw.selectionId } });
      if (!res?.ok) return { ok: false, error: 'Motorul nu a putut comuta contul.' };
      writeLocalState(getUserDataPath, { disconnected: false });
      lastQuotaSnapshot = null;
      lastQuotaExhausted = false;
      lastServedModel = null;
      return { ok: true };
    } catch (err) {
      return { ok: false, error: classifyCopilotError(err, false).error };
    } finally {
      if (session) await disposeSession(client, session);
    }
  });

  ipcMain.handle('copilot:login-start', async () => {
    try {
      // Pornim de la zero: o conectare rămasă deschisă se anulează, iar un nou cod îl înlocuiește pe cel vechi.
      await endLoginFlow({ cancel: true });
      const instance = await ensureClient(getUserDataPath);
      const session = await createAccountSession(instance);
      let begun;
      try {
        begun = await session.rpc.accounts.login.begin({ kind: 'githubDotCom', method: 'device-code' });
      } catch (err) {
        await disposeSession(instance, session);
        throw err;
      }
      const step = begun?.step;
      if (!step || step.kind !== 'device-code' || !isGitHubDeviceUrl(step.verificationUri)) {
        try {
          await session.rpc.accounts.login.cancel({ flowId: begun.flowId });
        } catch {
          // ignore
        }
        await disposeSession(instance, session);
        return { ok: false, error: 'GitHub nu a oferit conectarea cu cod. Încearcă din nou peste puțin.' };
      }

      const flow = { flowId: begun.flowId, session, instance, cancelled: false, verificationUri: step.verificationUri };
      loginFlow = flow;
      void awaitLoginCompletion(flow, { getMainWindow, getUserDataPath });
      if (typeof openExternal === 'function') {
        try {
          await openExternal(step.verificationUri);
        } catch {
          // Utilizatorul poate deschide pagina din buton.
        }
      }
      return {
        ok: true,
        userCode: String(step.userCode),
        verificationUri: step.verificationUri,
        expiresIn: typeof step.expiresIn === 'number' ? step.expiresIn : 900,
      };
    } catch (err) {
      const classified = classifyCopilotError(err, false);
      return { ok: false, error: classified.error };
    }
  });

  ipcMain.handle('copilot:login-cancel', async () => {
    await endLoginFlow({ cancel: true });
    return { ok: true };
  });

  ipcMain.handle('copilot:login-open-page', async () => {
    const uri = loginFlow?.verificationUri;
    if (!uri || !isGitHubDeviceUrl(uri) || typeof openExternal !== 'function') return { ok: false };
    try {
      await openExternal(uri);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle('copilot:status', async (_event, rawOptions) => {
    const options = rawOptions && typeof rawOptions === 'object' ? rawOptions : {};
    const wantsConnect = Boolean(options.connect);
    if (wantsConnect) {
      writeLocalState(getUserDataPath, { disconnected: false });
    } else if (readLocalState(getUserDataPath).disconnected) {
      return {
        state: 'disconnected',
        isAuthenticated: false,
        login: null,
        authType: null,
        host: null,
        quota: null,
        lastModel: null,
        statusMessage: 'Deconectat în StudyX',
      };
    }

    try {
      const instance = await ensureClient(getUserDataPath);
      const auth = await instance.getAuthStatus();
      lastAuthType = auth?.isAuthenticated && typeof auth.authType === 'string' ? auth.authType : null;
      if (!auth?.isAuthenticated) {
        return sanitizeAuthStatus(auth, {
          quota: null,
          quotaExhausted: false,
          lastModel: null,
          errorMessage: null,
        });
      }
      // Cota vine direct de la cont: se vede din prima, nu abia după primul mesaj, și o cotă refăcută se observă singură.
      const accounts = await readAccounts(instance);
      const freshQuota = await readChatQuota(instance);
      if (freshQuota) {
        // Data de resetare vine sigur doar odată cu un răspuns; o păstrăm pe cea deja aflată dacă e încă în viitor.
        const knownReset = dropPastResetDate(lastQuotaSnapshot)?.resetDate;
        lastQuotaSnapshot = !freshQuota.resetDate && knownReset ? { ...freshQuota, resetDate: knownReset } : freshQuota;
        lastQuotaExhausted = isQuotaExhausted(freshQuota);
      }
      return sanitizeAuthStatus(auth, {
        quota: lastQuotaSnapshot,
        quotaExhausted: lastQuotaExhausted,
        lastModel: lastServedModel,
        errorMessage: null,
        accounts,
      });
    } catch (err) {
      const classified = classifyCopilotError(err, false);
      if (classified.errorCode === 'auth_required') {
        return {
          state: 'disconnected',
          isAuthenticated: false,
          login: null,
          authType: null,
          host: null,
          quota: null,
          lastModel: null,
          statusMessage: classified.error,
        };
      }
      return {
        state: classified.errorCode === 'quota_exhausted' ? 'quota_exhausted' : 'error',
        isAuthenticated: false,
        login: null,
        authType: null,
        host: null,
        quota: lastQuotaSnapshot,
        lastModel: lastServedModel,
        statusMessage: classified.error,
      };
    }
  });

  ipcMain.handle('copilot:stream', async (_event, rawPayload) => {
    const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
    const requestId = typeof payload.requestId === 'string' && payload.requestId.trim() ? payload.requestId.trim() : '';
    if (!requestId) {
      return { ok: false, errorCode: 'error', error: 'Identificator de cerere invalid.' };
    }
    // Un al doilea flux cu același id nu îl înlocuiește pe primul (altfel „oprește” ar afecta cererea greșită).
    if (activeStreams.has(requestId)) {
      return { ok: false, errorCode: 'error', error: 'O cerere cu acest identificator rulează deja.' };
    }

    if (readLocalState(getUserDataPath).disconnected) {
      return { ok: false, errorCode: 'auth_required', error: 'GitHub Copilot este deconectat în StudyX.' };
    }

    const { systemContent, prompt } = buildCopilotSessionPayload(payload.messages, payload.systemPrompt);
    if (!prompt) {
      return { ok: false, errorCode: 'error', error: 'Mesajul pentru GitHub Copilot este gol.' };
    }

    let instance;
    try {
      instance = await ensureClient(getUserDataPath);
      const auth = await instance.getAuthStatus();
      if (!auth?.isAuthenticated) {
        return {
          ok: false,
          errorCode: 'auth_required',
          error: 'Nu am găsit niciun cont GitHub conectat pe acest calculator (GitHub CLI sau Copilot CLI).',
        };
      }
    } catch (err) {
      return { ok: false, ...classifyCopilotError(err, false) };
    }

    // Verificare repetată: între prima și aceasta au trecut așteptări, iar o cerere identică a putut porni între timp.
    if (activeStreams.has(requestId)) {
      return { ok: false, errorCode: 'error', error: 'O cerere cu acest identificator rulează deja.' };
    }
    let session = null;
    let unsubscribe = null;
    const entry = { session: null, aborted: false };
    activeStreams.set(requestId, entry);

    let streamedText = '';
    let finalMessageContent = '';
    let usageInfo = null;
    let sessionError = null;

    try {
      session = await instance.createSession({
        streaming: true,
        availableTools: [],
        onPermissionRequest: async () => ({ kind: 'denied-by-rules', rules: [] }),
        ...(systemContent ? { systemMessage: { mode: 'replace', content: systemContent } } : {}),
      });
      entry.session = session;

      if (entry.aborted) {
        return { ok: false, errorCode: 'aborted', error: 'Cerere oprită.' };
      }

      unsubscribe = session.on((event) => {
        if (!event || typeof event !== 'object') return;
        if (event.type === 'assistant.message_delta') {
          const delta = typeof event.data?.deltaContent === 'string' ? event.data.deltaContent : '';
          if (delta && !entry.aborted) {
            streamedText += delta;
            sendStreamEvent(getMainWindow, { requestId, type: 'delta', deltaContent: delta });
          }
          return;
        }
        if (event.type === 'assistant.message') {
          if (typeof event.data?.content === 'string') {
            finalMessageContent = event.data.content;
          }
          return;
        }
        if (event.type === 'assistant.usage') {
          const data = event.data || {};
          const quota = dropPastResetDate(sanitizeQuota(data.quotaSnapshots?.chat));
          usageInfo = {
            ...(typeof data.model === 'string' ? { model: data.model } : {}),
            ...(typeof data.modelDisplayName === 'string' ? { modelDisplayName: data.modelDisplayName } : {}),
            ...(typeof data.inputTokens === 'number' ? { inputTokens: data.inputTokens } : {}),
            ...(typeof data.outputTokens === 'number' ? { outputTokens: data.outputTokens } : {}),
            ...(typeof data.finishReason === 'string' ? { finishReason: data.finishReason } : {}),
            quota,
          };
          if (usageInfo.modelDisplayName || usageInfo.model) {
            lastServedModel = usageInfo.modelDisplayName || usageInfo.model;
          }
          if (quota) {
            lastQuotaSnapshot = quota;
            if (isQuotaExhausted(quota)) lastQuotaExhausted = true;
          }
          return;
        }
        if (event.type === 'session.error') {
          sessionError = event.data?.message || event.data || 'Eroare în sesiunea Copilot';
        }
      });

      const reply = await session.sendAndWait({ prompt }, REQUEST_TIMEOUT_MS);

      if (entry.aborted) {
        return { ok: false, errorCode: 'aborted', error: 'Cerere oprită.' };
      }

      if (sessionError && !streamedText && !finalMessageContent && !reply?.data?.content) {
        throw new Error(String(sessionError));
      }

      const fullText = streamedText || finalMessageContent || (typeof reply?.data?.content === 'string' ? reply.data.content : '');
      if (!fullText) {
        throw new Error('GitHub Copilot nu a returnat niciun răspuns.');
      }

      if (!streamedText && fullText) {
        sendStreamEvent(getMainWindow, { requestId, type: 'delta', deltaContent: fullText });
      }

      // Un răspuns primit înseamnă că mai e cotă, în afară de cazul în care chiar acest răspuns a consumat-o pe ultima.
      lastQuotaExhausted = isQuotaExhausted(usageInfo?.quota);

      return {
        ok: true,
        content: fullText,
        model: usageInfo?.model || 'copilot-auto',
        modelDisplayName: usageInfo?.modelDisplayName || 'GitHub Copilot',
        usage: usageInfo,
      };
    } catch (err) {
      const classified = classifyCopilotError(err, entry.aborted);
      if (classified.errorCode === 'quota_exhausted') {
        lastQuotaExhausted = true;
      }
      // O cerere căzută (de pildă la expirarea timpului) poate încă rula în motor: o oprim, ca să nu consume cotă degeaba.
      if (session && !entry.aborted) {
        try {
          await session.abort();
        } catch {
          // ignore
        }
      }
      return { ok: false, ...classified };
    } finally {
      activeStreams.delete(requestId);
      try {
        if (typeof unsubscribe === 'function') unsubscribe();
      } catch {
        // ignore
      }
      if (session) {
        const sessionId = typeof session.sessionId === 'string' ? session.sessionId : '';
        try {
          await session.disconnect();
        } catch {
          // ignore
        }
        // Fiecare cerere e o sesiune de unică folosință: o ștergem, ca întrebările să nu rămână pe disc în folderul motorului.
        if (sessionId) {
          try {
            await instance.deleteSession(sessionId);
          } catch {
            // ignore
          }
        }
      }
    }
  });

  ipcMain.handle('copilot:abort', async (_event, requestId) => {
    const id = typeof requestId === 'string' && requestId.length <= 512 ? requestId.trim() : '';
    const entry = id ? activeStreams.get(id) : null;
    if (!entry) return { ok: false };
    entry.aborted = true;
    if (entry.session) {
      try {
        await entry.session.abort();
      } catch {
        // ignore
      }
      try {
        await entry.session.disconnect();
      } catch {
        // ignore
      }
    }
    return { ok: true };
  });

  ipcMain.handle('copilot:disconnect', async () => {
    writeLocalState(getUserDataPath, { disconnected: true });
    lastServedModel = null;
    lastQuotaSnapshot = null;
    lastQuotaExhausted = false;
    await logoutOwnAccount(getUserDataPath);
    lastAuthType = null;
    await stopCopilotEngine({ clearRuntimeDir: true, getUserDataPath });
    return {
      state: 'disconnected',
      isAuthenticated: false,
      login: null,
      authType: null,
      host: null,
      quota: null,
      lastModel: null,
      statusMessage: 'Deconectat în StudyX',
    };
  });
}

module.exports = {
  COPILOT_STREAM_EVENT_CHANNEL,
  COPILOT_LOGIN_EVENT_CHANNEL,
  isGitHubDeviceUrl,
  resolveCopilotRuntimeExecutable,
  sanitizeQuota,
  sanitizeAuthStatus,
  sanitizeAccounts,
  classifyCopilotError,
  isQuotaExhausted,
  dropPastResetDate,
  buildCopilotSessionPayload,
  registerCopilotIPC,
  stopCopilotEngine,
};
