import { logDiagnosticEvent } from '../store/diagnosticsStore';

type GovernorTask = 'chat' | 'stream' | 'questions' | 'explanation' | 'mnemonic' | 'analysis' | 'hint';

interface RequestGovernorOptions {
  concurrency?: number;
  baseSpacingMs?: number;
}

interface QueuedTask<T> {
  label: GovernorTask;
  operation: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

export interface RequestGovernorSnapshot {
  active: number;
  queued: number;
  lastLatencyMs: number | null;
}

export function createRequestGovernor(options: RequestGovernorOptions = {}) {
  const concurrency = Math.max(1, options.concurrency ?? 2);
  const baseSpacingMs = Math.max(40, options.baseSpacingMs ?? 110);
  const queue: QueuedTask<unknown>[] = [];
  let active = 0;
  let lastStartedAt = 0;
  let lastLatencyMs: number | null = null;
  let queueWarningIssued = false;

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const runNext = () => {
    while (active < concurrency && queue.length > 0) {
      const task = queue.shift()!;
      active += 1;

      void (async () => {
        const now = Date.now();
        const elapsed = now - lastStartedAt;
        const spacing = Math.max(0, baseSpacingMs - elapsed);
        if (spacing > 0) await wait(spacing);
        lastStartedAt = Date.now();
        const startedAt = performance.now();

        try {
          const result = await task.operation();
          lastLatencyMs = Math.round(performance.now() - startedAt);
          task.resolve(result);
        } catch (error) {
          logDiagnosticEvent({
            area: 'ai',
            level: 'warning',
            title: 'Cerere AI eșuată',
            detail: `${task.label}: ${error instanceof Error ? error.message : String(error)}`,
          });
          task.reject(error);
        } finally {
          active -= 1;
          if (queue.length <= 1) {
            queueWarningIssued = false;
          }
          runNext();
        }
      })();
    }
  };

  return {
    run<T>(label: GovernorTask, operation: () => Promise<T>) {
      return new Promise<T>((resolve, reject) => {
        queue.push({
          label,
          operation: operation as () => Promise<unknown>,
          resolve: resolve as (value: unknown) => void,
          reject,
        });
        if (queue.length >= concurrency + 2 && !queueWarningIssued) {
          queueWarningIssued = true;
          logDiagnosticEvent({
            area: 'ai',
            level: 'info',
            title: 'Coada AI este ocupată',
            detail: `Există ${queue.length} cereri în așteptare. Aplicația le va rula gradual pentru mai multă stabilitate.`,
          });
        }
        runNext();
      });
    },
    snapshot(): RequestGovernorSnapshot {
      return {
        active,
        queued: queue.length,
        lastLatencyMs,
      };
    },
  };
}
