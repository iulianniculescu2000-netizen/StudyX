import '@testing-library/jest-dom';
import { beforeAll, afterEach, afterAll, vi } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] || null,
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock IndexedDB
const indexedDBMock = {
  open: () => ({
    onsuccess: null,
    onerror: null,
    onblocked: null,
    result: {
      transaction: () => ({
        objectStore: () => ({
          get: () => ({ result: null }),
          put: () => ({ result: undefined }),
          delete: () => ({ result: undefined }),
        }),
      }),
    },
  }),
};

Object.defineProperty(window, 'indexedDB', {
  value: indexedDBMock,
});

// Mock Electron API
Object.defineProperty(window, 'electronAPI', {
  value: {
    appReady: () => {},
    onAppClose: () => () => {},
    isMaximized: () => Promise.resolve(false),
    onMaximized: () => () => {},
    minimize: () => Promise.resolve(),
    maximize: () => Promise.resolve(),
    unmaximize: () => Promise.resolve(),
    close: () => Promise.resolve(),
    storageLoad: () => Promise.resolve(null),
    storageSave: () => Promise.resolve(),
    autoBackup: () => Promise.resolve({ success: true, path: '/mock/backup' }),
    updaterInstallDownloaded: () => Promise.resolve(),
    updaterCheckForUpdates: () => Promise.resolve({ hasUpdate: false }),
    updaterGetVersion: () => Promise.resolve('1.0.1'),
  },
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  writable: true,
  value: () => {},
});

// Mock setTimeout/setInterval for testing
beforeAll(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  localStorageMock.clear();
});

afterAll(() => {
  vi.useRealTimers();
});
