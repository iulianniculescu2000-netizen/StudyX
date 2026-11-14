const path = require('path');
const fs = require('fs');

const COPILOT_STREAM_EVENT_CHANNEL = 'copilot:stream-event';
const REQUEST_TIMEOUT_MS = 120000;

let client = null;
let startPromise = null;
let lastServedModel = null;
let lastQuotaSnapshot = null;
let lastQuotaExhausted = false;
let lastErrorMessage = null;
const activeStreams = new Map();

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
    lastModel: typeof extras.lastModel === 'string' ? extras.lastModel : null,
    statusMessage:
      errorMessage ||
      (typeof auth?.statusMessage === 'string' && auth.statusMessage.trim()
        ? auth.statusMessage.trim()
        : isAuthenticated
          ? 'Conectat la GitHub Copilot'
          : 'Nu s-a găsit o sesiune GitHub Copilot activă (gh sau Copilot CLI).'),
  };
}

function classifyCopilotError(err, aborted = false) {
  if (aborted) {
    return { errorCode: 'aborted', error: 'Cerere oprită.' };
  }
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err || '');
  const message = String(raw || '').trim();
  const lower = message.toLowerCase();

  if (
    lower.includes('402') ||
    lower.includes('429') ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('limit exceeded') ||
    lower.includes('exhausted')
  ) {
    return {
      errorCode: 'quota_exhausted',
      error: 'Cota GitHub Copilot pentru chat a fost atinsă.',
    };
  }

  if (
    lower.includes('401') ||
    lower.includes('403') ||
    lower.includes('not authenticated') ||
    lower.includes('unauthenticated') ||
    lower.includes('unauthorized') ||
    lower.includes('login') ||
    lower.includes('auth')
  ) {
    return {
      errorCode: 'auth_required',
      error: 'Conectarea GitHub Copilot lipsește sau a expirat. Verifică `gh auth status`.',
    };
  }

  return {
    errorCode: 'error',
    error: message ? (message.length > 220 ? `${message.slice(0, 217)}…` : message) : 'Eroare necunoscută GitHub Copilot.',
  };
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
    lastErrorMessage = null;
    return instance;
  })();

  try {
    return await startPromise;
  } finally {
    startPromise = null;
  }
}

async function stopCopilotEngine(options = {}) {
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

function registerCopilotIPC(ipcMain, { getMainWindow, getUserDataPath }) {
  ipcMain.handle('copilot:status', async (_event, options = {}) => {
    const wantsConnect = Boolean(options && options.connect);
    if (wantsConnect) {
      writeLocalState(getUserDataPath, { disconnected: false });
      lastErrorMessage = null;
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
      if (!auth?.isAuthenticated) {
        return sanitizeAuthStatus(auth, {
          quota: null,
          quotaExhausted: false,
          lastModel: null,
          errorMessage: null,
        });
      }
      return sanitizeAuthStatus(auth, {
        quota: lastQuotaSnapshot,
        quotaExhausted: lastQuotaExhausted,
        lastModel: lastServedModel,
        errorMessage: lastErrorMessage,
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
      lastErrorMessage = classified.error;
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

  ipcMain.handle('copilot:stream', async (_event, payload = {}) => {
    const requestId = typeof payload.requestId === 'string' && payload.requestId.trim() ? payload.requestId.trim() : '';
    if (!requestId) {
      return { ok: false, errorCode: 'error', error: 'Identificator de cerere invalid.' };
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
          error: auth?.statusMessage || 'Conectează GitHub Copilot (gh CLI sau Copilot CLI) în Setări AI.',
        };
      }
    } catch (err) {
      const classified = classifyCopilotError(err, false);
      lastErrorMessage = classified.errorCode === 'error' ? classified.error : null;
      return { ok: false, ...classified };
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
          const quota = sanitizeQuota(data.quotaSnapshots?.chat);
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
            if (!quota.isUnlimitedEntitlement && typeof quota.remainingPercentage === 'number' && quota.remainingPercentage <= 0) {
              lastQuotaExhausted = true;
            }
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

      lastErrorMessage = null;
      if (
        usageInfo?.quota &&
        (usageInfo.quota.isUnlimitedEntitlement || (typeof usageInfo.quota.remainingPercentage === 'number' && usageInfo.quota.remainingPercentage > 0))
      ) {
        lastQuotaExhausted = false;
      } else if (!usageInfo?.quota) {
        lastQuotaExhausted = false;
      }

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
      } else if (classified.errorCode === 'error') {
        lastErrorMessage = classified.error;
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
        try {
          await session.disconnect();
        } catch {
          // ignore
        }
      }
    }
  });

  ipcMain.handle('copilot:abort', async (_event, requestId) => {
    const id = typeof requestId === 'string' ? requestId.trim() : '';
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
    lastErrorMessage = null;
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
  resolveCopilotRuntimeExecutable,
  sanitizeQuota,
  sanitizeAuthStatus,
  classifyCopilotError,
  buildCopilotSessionPayload,
  registerCopilotIPC,
  stopCopilotEngine,
};
