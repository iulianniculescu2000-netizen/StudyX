const STARTUP_KEY = 'studyx-startup-session';
const STALE_STARTUP_MS = 1000 * 60 * 3;

type StartupSessionState = {
  active: boolean;
  startedAt: number;
  completedAt?: number;
};

function readState(): StartupSessionState | null {
  try {
    const raw = localStorage.getItem(STARTUP_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StartupSessionState;
  } catch {
    return null;
  }
}

function writeState(state: StartupSessionState) {
  try {
    localStorage.setItem(STARTUP_KEY, JSON.stringify(state));
  } catch {
    // Non-fatal.
  }
}

export function inspectPreviousStartup() {
  const previous = readState();
  if (!previous?.active) return { hadUncleanExit: false };

  // `previous.active` still being true here already IS the "didn't finish
  // booting last time" signal — completeStartupSession() flips it to false
  // ~600ms after the splash hides, on every normal launch. (This used to be
  // written as `age > 0`, which is always true by construction — a no-op
  // that happened to read as a real condition. The caller used to also
  // persist the resulting lowPowerMode flag, so a single stuck flag here
  // permanently degraded every animation in the app on every future launch;
  // that part is fixed in App.tsx/runtimeStore.ts, not here.)
  const age = Date.now() - previous.startedAt;
  return {
    hadUncleanExit: true,
    stale: age > STALE_STARTUP_MS,
    previous,
  };
}

export function beginStartupSession() {
  writeState({
    active: true,
    startedAt: Date.now(),
  });
}

export function completeStartupSession() {
  writeState({
    active: false,
    startedAt: readState()?.startedAt ?? Date.now(),
    completedAt: Date.now(),
  });
}
