type IdleHandle = number;

interface IdleTaskOptions {
  timeoutMs?: number;
  dedupeKey?: string;
}

const pendingTasks = new Map<string, IdleHandle>();

function getIdleWindow() {
  return window as Window & typeof globalThis & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
}

export function scheduleIdleTask(task: () => void, options: IdleTaskOptions = {}) {
  if (typeof window === 'undefined') return -1;

  const { timeoutMs = 1200, dedupeKey } = options;
  const idleWindow = getIdleWindow();

  if (dedupeKey) {
    const existing = pendingTasks.get(dedupeKey);
    if (typeof existing === 'number') {
      if (typeof idleWindow.cancelIdleCallback === 'function') idleWindow.cancelIdleCallback(existing);
      else window.clearTimeout(existing);
      pendingTasks.delete(dedupeKey);
    }
  }

  const runner = () => {
    if (dedupeKey) pendingTasks.delete(dedupeKey);
    task();
  };

  const handle = typeof idleWindow.requestIdleCallback === 'function'
    ? idleWindow.requestIdleCallback(() => runner(), { timeout: timeoutMs })
    : window.setTimeout(runner, Math.min(timeoutMs, 300));

  if (dedupeKey) pendingTasks.set(dedupeKey, handle);
  return handle;
}

export function cancelIdleTask(handle: number) {
  if (typeof window === 'undefined') return;
  const idleWindow = getIdleWindow();
  if (typeof idleWindow.cancelIdleCallback === 'function') idleWindow.cancelIdleCallback(handle);
  else window.clearTimeout(handle);
}
