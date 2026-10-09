import { detectDeviceCapabilities } from './deviceTier';
import { deriveHealthStatus } from './healthReporter';
import { idbGet, idbRemove, idbSet } from './idb';
import type { HealthCheckItem } from '../store/diagnosticsStore';

async function probeLocalStorage(): Promise<HealthCheckItem> {
  try {
    const key = 'studyx-health-probe';
    localStorage.setItem(key, 'ok');
    localStorage.removeItem(key);
    return { id: 'local-storage', label: 'Local storage', status: 'ok', detail: 'Persistența locală răspunde normal.' };
  } catch (error) {
    return {
      id: 'local-storage',
      label: 'Local storage',
      status: 'error',
      detail: error instanceof Error ? error.message : 'Persistența locală nu a putut fi accesată.',
    };
  }
}

async function probeIndexedDb(): Promise<HealthCheckItem> {
  try {
    const key = 'studyx-health-probe';
    await idbSet(key, { ok: true, at: Date.now() });
    await idbGet(key);
    await idbRemove(key);
    return { id: 'indexeddb', label: 'IndexedDB', status: 'ok', detail: 'Stocarea extinsă este disponibilă.' };
  } catch (error) {
    return {
      id: 'indexeddb',
      label: 'IndexedDB',
      status: 'warning',
      detail: error instanceof Error ? error.message : 'Stocarea extinsă nu a răspuns complet.',
    };
  }
}

/**
 * Absence of the Electron bridge is the normal state for every web/PWA user —
 * it's only present in the packaged desktop app — so it must never fail this
 * check on its own (that turned into a false "Atenție moderată" toast on every
 * single web load, since `safeStartup` defaults to on). Same reasoning the
 * `UpdateButton` already applies: a missing bridge means "not applicable", not
 * "degraded".
 */
function probeElectronBridge(): HealthCheckItem {
  const available = typeof window !== 'undefined' && !!window.electronAPI;
  return {
    id: 'electron-bridge',
    label: 'Electron bridge',
    status: 'ok',
    detail: available ? 'Bridge-ul nativ este disponibil.' : 'Rulezi în browser — normal pentru versiunea web.',
  };
}

function probeDeviceTier(): HealthCheckItem {
  const capabilities = detectDeviceCapabilities();
  return {
    id: 'device-tier',
    label: 'Profil hardware',
    status: capabilities.tier === 'low' ? 'warning' : 'ok',
    detail: `Tier detectat: ${capabilities.tier}, ${capabilities.hardwareConcurrency} thread-uri, ${capabilities.deviceMemory} GB RAM estimat.`,
  };
}

export async function runStartupHealthCheck() {
  const checks = await Promise.all([
    probeLocalStorage(),
    probeIndexedDb(),
    Promise.resolve(probeElectronBridge()),
    Promise.resolve(probeDeviceTier()),
  ]);

  return {
    checks,
    status: deriveHealthStatus(checks),
  };
}
