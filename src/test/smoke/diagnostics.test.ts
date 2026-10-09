import { describe, it, expect, beforeEach } from 'vitest';
import { useDiagnosticsStore, logDiagnosticEvent } from '../../store/diagnosticsStore';

describe('Diagnostics Smoke Tests', () => {
  beforeEach(() => {
    useDiagnosticsStore.getState().clearDiagnostics();
  });

  it('should initialize with healthy status', () => {
    const store = useDiagnosticsStore.getState();
    expect(store.healthStatus).toBe('healthy');
    expect(store.checks).toEqual([]);
    expect(store.events).toEqual([]);
  });

  it('should add diagnostic events correctly', () => {
    logDiagnosticEvent({
      area: 'ai',
      level: 'error',
      title: 'Test Error',
      detail: 'This is a test error',
    });

    const store = useDiagnosticsStore.getState();
    expect(store.events).toHaveLength(1);
    expect(store.events[0]).toMatchObject({
      area: 'ai',
      level: 'error',
      title: 'Test Error',
      detail: 'This is a test error',
    });
    expect(store.events[0].id).toMatch(/^ai-\d+-[a-z0-9]+$/);
    expect(store.events[0].createdAt).toBeTypeOf('number');
  });

  it('should limit events to 30 most recent', () => {
    // Add 35 events
    for (let i = 0; i < 35; i++) {
      logDiagnosticEvent({
        area: 'ai',
        level: 'info',
        title: `Event ${i}`,
        detail: `Test event ${i}`,
      });
    }

    const store = useDiagnosticsStore.getState();
    expect(store.events).toHaveLength(30);
    expect(store.events[0].title).toBe('Event 34'); // Most recent
    expect(store.events[29].title).toBe('Event 5'); // Oldest kept
  });

  it('should clear events correctly', () => {
    logDiagnosticEvent({
      area: 'storage',
      level: 'warning',
      title: 'Test Warning',
      detail: 'This is a test warning',
    });

    const store = useDiagnosticsStore.getState();
    expect(store.events).toHaveLength(1);
    
    store.clearEvents();
    expect(useDiagnosticsStore.getState().events).toEqual([]);
  });

  it('should set health report correctly', () => {
    const checks = [
      {
        id: 'test-check-1',
        label: 'Test Check 1',
        status: 'ok' as const,
        detail: 'Everything is fine',
      },
      {
        id: 'test-check-2',
        label: 'Test Check 2',
        status: 'warning' as const,
        detail: 'Something needs attention',
      },
    ];

    useDiagnosticsStore.getState().setHealthReport('warning', checks);

    const store = useDiagnosticsStore.getState();
    expect(store.healthStatus).toBe('warning');
    expect(store.checks).toEqual(checks);
    expect(store.lastCheckedAt).toBeTypeOf('number');
  });

  it('should clear all diagnostics correctly', () => {
    logDiagnosticEvent({
      area: 'updater',
      level: 'error',
      title: 'Updater Error',
      detail: 'Update failed',
    });

    useDiagnosticsStore.getState().setHealthReport('degraded', []);

    let store = useDiagnosticsStore.getState();
    expect(store.events).toHaveLength(1);
    expect(store.healthStatus).toBe('degraded');
    
    store.clearDiagnostics();

    store = useDiagnosticsStore.getState();
    expect(store.events).toEqual([]);
    expect(store.checks).toEqual([]);
    expect(store.healthStatus).toBe('healthy');
    expect(store.lastCheckedAt).toBeNull();
  });
});
