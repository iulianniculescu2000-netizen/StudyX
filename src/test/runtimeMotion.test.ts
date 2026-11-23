import { act, cleanup, render, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../components/pdf/BookViewerHost', () => ({ default: () => null }));

import {
  loadRuntimeSettings,
  RUNTIME_SCHEMA_VERSION,
  RUNTIME_SETTINGS_STORAGE_KEY,
  useRuntimeStore,
} from '../store/runtimeStore';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { ThemeProvider } from '../theme/ThemeContext';
import { inspectPreviousStartup } from '../lib/startupSessionGuard';
import App from '../App';

function installMatchMediaMock(initialReducedMotion = false) {
  let reducedMotion = initialReducedMotion;
  const listeners = new Map<string, Set<() => void>>();

  const mock = (query: string) => {
    if (!listeners.has(query)) listeners.set(query, new Set());
    const queryListeners = listeners.get(query)!;
    return {
      matches: query.includes('prefers-reduced-motion') ? reducedMotion : false,
      media: query,
      onchange: null,
      addEventListener: (_event: string, cb: () => void) => queryListeners.add(cb),
      removeEventListener: (_event: string, cb: () => void) => queryListeners.delete(cb),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  };

  Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: mock });

  return {
    setReducedMotion(next: boolean) {
      reducedMotion = next;
      const set = listeners.get('(prefers-reduced-motion: reduce)');
      if (set) {
        for (const cb of set) cb();
      }
    },
  };
}

function resetRootAttributes() {
  const root = document.documentElement;
  root.removeAttribute('data-theme');
  root.removeAttribute('data-theme-id');
  root.removeAttribute('data-theme-mode');
  root.removeAttribute('data-performance');
  root.removeAttribute('data-power-save');
  root.removeAttribute('data-device-tier');
  document.body.style.backgroundImage = '';
  document.body.style.backgroundColor = '';
}

describe('runtimeStore migrare v1 -> v2 și mod economisire', () => {
  beforeEach(() => {
    localStorage.clear();
    useRuntimeStore.setState({
      schemaVersion: RUNTIME_SCHEMA_VERSION,
      performanceMode: 'auto',
      lowPowerMode: false,
      lowPowerManual: false,
      featureFlags: { diagnosticsPanel: true, backgroundQueue: true, safeStartup: true },
    });
  });

  it('resetează lowPowerMode din formatul vechi (1.0.x fără schemaVersion >= 2) și păstrează restul setărilor', () => {
    localStorage.setItem(
      RUNTIME_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        performanceMode: 'full',
        lowPowerMode: true,
        featureFlags: { diagnosticsPanel: false, backgroundQueue: true, safeStartup: false },
      }),
    );

    const migrated = loadRuntimeSettings();
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.lowPowerMode).toBe(false);
    expect(migrated.lowPowerManual).toBe(false);
    expect(migrated.performanceMode).toBe('full');
    expect(migrated.featureFlags).toEqual({
      diagnosticsPanel: false,
      backgroundQueue: true,
      safeStartup: false,
    });

    const persisted = JSON.parse(localStorage.getItem(RUNTIME_SETTINGS_STORAGE_KEY)!);
    expect(persisted.schemaVersion).toBe(2);
    expect(persisted.lowPowerMode).toBe(false);
    expect(persisted.lowPowerManual).toBe(false);
  });

  it('persistă setLowPowerMode manual cu schemaVersion 2 + lowPowerManual, dar nu persistă setLowPowerModeForThisSessionOnly', () => {
    act(() => {
      useRuntimeStore.getState().setLowPowerMode(true);
    });
    let saved = JSON.parse(localStorage.getItem(RUNTIME_SETTINGS_STORAGE_KEY)!);
    expect(saved).toMatchObject({ schemaVersion: 2, lowPowerMode: true, lowPowerManual: true });

    act(() => {
      useRuntimeStore.getState().setLowPowerMode(false);
    });
    saved = JSON.parse(localStorage.getItem(RUNTIME_SETTINGS_STORAGE_KEY)!);
    expect(saved).toMatchObject({ schemaVersion: 2, lowPowerMode: false, lowPowerManual: false });

    act(() => {
      useRuntimeStore.getState().setLowPowerModeForThisSessionOnly();
      useRuntimeStore.getState().setPerformanceMode('full');
    });
    expect(useRuntimeStore.getState().lowPowerMode).toBe(true);
    saved = JSON.parse(localStorage.getItem(RUNTIME_SETTINGS_STORAGE_KEY)!);
    expect(saved).toMatchObject({
      schemaVersion: 2,
      performanceMode: 'full',
      lowPowerMode: false,
      lowPowerManual: false,
    });
  });
});

describe('useAdaptiveMotion reactivitate și ThemeContext', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    localStorage.clear();
    resetRootAttributes();
    useRuntimeStore.setState({
      schemaVersion: RUNTIME_SCHEMA_VERSION,
      performanceMode: 'auto',
      lowPowerMode: false,
      lowPowerManual: false,
      featureFlags: { diagnosticsPanel: true, backgroundQueue: true, safeStartup: true },
    });
  });

  afterEach(() => {
    cleanup();
    resetRootAttributes();
    Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: originalMatchMedia });
    vi.restoreAllMocks();
  });

  it('reacționează sincron la schimbări de performanceMode, lowPowerMode și prefers-reduced-motion', () => {
    const media = installMatchMediaMock(false);
    const { result } = renderHook(() => useAdaptiveMotion());

    expect(result.current.performanceLite).toBe(false);
    expect(result.current.calmMotion).toBe(false);

    act(() => {
      useRuntimeStore.getState().setPerformanceMode('lite');
    });
    expect(result.current.performanceLite).toBe(true);
    expect(result.current.calmMotion).toBe(true);

    act(() => {
      useRuntimeStore.getState().setPerformanceMode('full');
    });
    expect(result.current.performanceLite).toBe(false);
    expect(result.current.calmMotion).toBe(false);

    act(() => {
      useRuntimeStore.getState().setPerformanceMode('auto');
      useRuntimeStore.getState().setLowPowerModeForThisSessionOnly();
    });
    expect(result.current.performanceLite).toBe(true);
    expect(result.current.calmMotion).toBe(true);

    act(() => {
      useRuntimeStore.getState().setLowPowerMode(false);
      media.setReducedMotion(true);
    });
    expect(result.current.reducedMotion).toBe(true);
    expect(result.current.performanceLite).toBe(true);
    expect(result.current.calmMotion).toBe(true);
  });

  it('păstrează compatibilitatea cu data-performance="lite" setat manual în teste izolate fără ThemeProvider', async () => {
    installMatchMediaMock(false);
    document.documentElement.setAttribute('data-performance', 'lite');

    const { result } = renderHook(() => useAdaptiveMotion());
    expect(result.current.performanceLite).toBe(true);
    expect(result.current.calmMotion).toBe(true);

    await act(async () => {
      document.documentElement.setAttribute('data-performance', 'full');
      await Promise.resolve();
    });
    expect(result.current.performanceLite).toBe(false);
  });

  it('nu are decalaj cu ThemeProvider și folosește backgroundColor ca să nu șteargă backgroundImage', () => {
    installMatchMediaMock(false);
    document.body.style.backgroundImage = 'linear-gradient(rgb(1, 2, 3), rgb(4, 5, 6))';

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(ThemeProvider, null, children);
    const { result } = renderHook(() => useAdaptiveMotion(), { wrapper });

    expect(document.body.style.backgroundImage).toContain('linear-gradient');
    expect(document.body.style.backgroundColor).not.toBe('');
    expect(document.documentElement.getAttribute('data-performance')).toBe('full');
    expect(result.current.performanceLite).toBe(false);

    act(() => {
      useRuntimeStore.getState().setPerformanceMode('lite');
    });
    expect(document.documentElement.getAttribute('data-performance')).toBe('lite');
    expect(result.current.performanceLite).toBe(true);

    act(() => {
      useRuntimeStore.getState().setPerformanceMode('full');
    });
    expect(document.documentElement.getAttribute('data-performance')).toBe('full');
    expect(result.current.performanceLite).toBe(false);
  });
});

describe('App completeStartupSession la ~500ms și închidere rapidă', () => {
  beforeEach(() => {
    localStorage.clear();
    resetRootAttributes();
    useRuntimeStore.setState({
      schemaVersion: RUNTIME_SCHEMA_VERSION,
      performanceMode: 'auto',
      lowPowerMode: false,
      lowPowerManual: false,
      featureFlags: { diagnosticsPanel: true, backgroundQueue: true, safeStartup: true },
    });
  });

  afterEach(() => {
    cleanup();
    resetRootAttributes();
  });

  it('marchează pornirea completă la ~500ms după montare (înainte să dispară splash-ul)', () => {
    render(createElement(App));
    expect(inspectPreviousStartup().hadUncleanExit).toBe(true);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(inspectPreviousStartup().hadUncleanExit).toBe(false);
  });

  it('marchează pornirea completă la pagehide înainte de 500ms', () => {
    render(createElement(App));
    expect(inspectPreviousStartup().hadUncleanExit).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(inspectPreviousStartup().hadUncleanExit).toBe(false);
  });
});
