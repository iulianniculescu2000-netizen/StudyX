import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const {
  isFiniteNumber,
  isValidBounds,
  clampBoundsToDisplay,
  readWindowState,
  persistWindowState,
  ensureWindowFitsDisplay,
} = require('./windowState.cjs');

describe('windowState', () => {
  let tmpDir: string;
  let statePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studyx-ws-test-'));
    statePath = path.join(tmpDir, 'window-state.json');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  const mockPrimaryDisplay = {
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  };

  const mockSecondaryDisplay = {
    bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
    workArea: { x: 1920, y: 0, width: 1920, height: 1040 },
  };

  const createMockScreen = (displays = [mockPrimaryDisplay]) => ({
    getPrimaryDisplay: () => displays[0],
    getAllDisplays: () => displays,
    getDisplayMatching: (rect: { x: number; y: number; width: number; height: number }) => {
      // Find closest or intersecting display
      for (const d of displays) {
        if (
          rect.x < d.bounds.x + d.bounds.width &&
          rect.x + rect.width > d.bounds.x &&
          rect.y < d.bounds.y + d.bounds.height &&
          rect.y + rect.height > d.bounds.y
        ) {
          return d;
        }
      }
      return displays[0];
    },
  });

  describe('isFiniteNumber and isValidBounds', () => {
    it('validează numere finite și respinge NaN, null, string, Infinity', () => {
      expect(isFiniteNumber(100)).toBe(true);
      expect(isFiniteNumber(0)).toBe(true);
      expect(isFiniteNumber(-50)).toBe(true);
      expect(isFiniteNumber(NaN)).toBe(false);
      expect(isFiniteNumber(null)).toBe(false);
      expect(isFiniteNumber(undefined)).toBe(false);
      expect(isFiniteNumber('100')).toBe(false);
      expect(isFiniteNumber(Infinity)).toBe(false);
    });

    it('validează structura completă de bounds', () => {
      expect(isValidBounds({ x: 100, y: 50, width: 800, height: 600 })).toBe(true);
      expect(isValidBounds({ x: NaN, y: 50, width: 800, height: 600 })).toBe(false);
      expect(isValidBounds({ x: 100, y: null, width: 800, height: 600 })).toBe(false);
      expect(isValidBounds({ x: 100, y: 50, width: 0, height: 600 })).toBe(false);
      expect(isValidBounds({ x: 100, y: 50, width: -100, height: 600 })).toBe(false);
      expect(isValidBounds(null)).toBe(false);
      expect(isValidBounds('invalid')).toBe(false);
    });
  });

  describe('clampBoundsToDisplay', () => {
    it('păstrează dimensiunile valide pe monitorul primar', () => {
      const screen = createMockScreen([mockPrimaryDisplay]);
      const bounds = { x: 200, y: 150, width: 1000, height: 700 };
      const clamped = clampBoundsToDisplay(bounds, screen);
      expect(clamped).toEqual(bounds);
    });

    it('asigură plasarea corectă pe monitoare multiple', () => {
      const screen = createMockScreen([mockPrimaryDisplay, mockSecondaryDisplay]);
      const boundsOnSecondary = { x: 2100, y: 100, width: 1200, height: 800 };
      const clamped = clampBoundsToDisplay(boundsOnSecondary, screen);
      expect(clamped.x).toBe(2100);
      expect(clamped.y).toBe(100);
      expect(clamped.width).toBe(1200);
      expect(clamped.height).toBe(800);
    });

    it('repoziționează fereastra pe monitorul rămas când monitorul secundar este deconectat', () => {
      // Doar monitorul primar este conectat acum
      const screen = createMockScreen([mockPrimaryDisplay]);
      const oldBoundsFromDisconnectedDisplay = { x: 2500, y: 100, width: 1200, height: 800 };
      const clamped = clampBoundsToDisplay(oldBoundsFromDisconnectedDisplay, screen);

      // Fereastra trebuie să fie complet în interiorul monitorului primar (0..1920)
      expect(clamped.x).toBeLessThanOrEqual(mockPrimaryDisplay.workArea.width - clamped.width);
      expect(clamped.x).toBeGreaterThanOrEqual(mockPrimaryDisplay.workArea.x);
      expect(clamped.y).toBeGreaterThanOrEqual(mockPrimaryDisplay.workArea.y);
      expect(clamped.width).toBe(1200);
      expect(clamped.height).toBe(800);
    });

    it('tratează fără erori valori NaN, null sau corupte și returnează bounds valide', () => {
      const screen = createMockScreen([mockPrimaryDisplay]);
      const corrupt = { x: NaN, y: null, width: 'bad', height: -200 };
      const clamped = clampBoundsToDisplay(corrupt, screen);

      expect(Number.isFinite(clamped.x)).toBe(true);
      expect(Number.isFinite(clamped.y)).toBe(true);
      expect(Number.isFinite(clamped.width)).toBe(true);
      expect(Number.isFinite(clamped.height)).toBe(true);
      expect(clamped.width).toBeGreaterThanOrEqual(720);
      expect(clamped.height).toBeGreaterThanOrEqual(520);
    });
  });

  describe('readWindowState and persistWindowState', () => {
    it('returnează null dacă fișierul nu există', () => {
      const screen = createMockScreen([mockPrimaryDisplay]);
      expect(readWindowState(statePath, screen)).toBeNull();
    });

    it('elimină fișierul corupt și returnează null în loc să crape', () => {
      const screen = createMockScreen([mockPrimaryDisplay]);
      fs.writeFileSync(statePath, '{{invalid-json--!!', 'utf-8');
      expect(readWindowState(statePath, screen)).toBeNull();
      expect(fs.existsSync(statePath)).toBe(false);
    });

    it('tratează valori null sau lipsă în JSON și păstrează isMaximized', () => {
      const screen = createMockScreen([mockPrimaryDisplay]);
      fs.writeFileSync(statePath, JSON.stringify({ x: null, y: null, width: null, height: null, isMaximized: true }), 'utf-8');
      const loaded = readWindowState(statePath, screen);

      expect(loaded).toBeTruthy();
      expect(loaded?.isMaximized).toBe(true);
      expect(Number.isFinite(loaded?.x)).toBe(true);
      expect(Number.isFinite(loaded?.y)).toBe(true);
      expect(loaded?.width).toBeGreaterThanOrEqual(720);
      expect(loaded?.height).toBeGreaterThanOrEqual(520);
    });

    it('persistă starea ferestrei atomar și restaurează corect bounds la unmaximize', () => {
      const screen = createMockScreen([mockPrimaryDisplay]);
      const winNormal = {
        isDestroyed: () => false,
        isMinimized: () => false,
        isMaximized: () => false,
        getBounds: () => ({ x: 150, y: 120, width: 1100, height: 750 }),
      };

      persistWindowState(winNormal, statePath, screen);
      const saved = readWindowState(statePath, screen);
      expect(saved?.x).toBe(150);
      expect(saved?.y).toBe(120);
      expect(saved?.width).toBe(1100);
      expect(saved?.height).toBe(750);
      expect(saved?.isMaximized).toBe(false);

      // Când fereastra este maximizată, getNormalBounds() trebuie folosit dacă este disponibil
      const winMaximized = {
        isDestroyed: () => false,
        isMinimized: () => false,
        isMaximized: () => true,
        getBounds: () => ({ x: -8, y: -8, width: 1936, height: 1056 }),
        getNormalBounds: () => ({ x: 150, y: 120, width: 1100, height: 750 }),
      };

      persistWindowState(winMaximized, statePath, screen);
      const savedMax = readWindowState(statePath, screen);
      expect(savedMax?.isMaximized).toBe(true);
      // Dimensiunile normale salvate sunt cele de dinainte de maximizare
      expect(savedMax?.x).toBe(150);
      expect(savedMax?.y).toBe(120);
      expect(savedMax?.width).toBe(1100);
      expect(savedMax?.height).toBe(750);
    });
  });

  describe('ensureWindowFitsDisplay', () => {
    it('ajustează poziția ferestrei dacă iese din ecran', () => {
      const screen = createMockScreen([mockPrimaryDisplay]);
      let currentBounds = { x: 2500, y: 100, width: 1000, height: 700 };
      const win = {
        isDestroyed: () => false,
        isMinimized: () => false,
        isMaximized: () => false,
        getBounds: () => currentBounds,
        setBounds: (b: typeof currentBounds) => { currentBounds = b; },
      };

      ensureWindowFitsDisplay(win, screen);
      expect(currentBounds.x).toBeLessThanOrEqual(mockPrimaryDisplay.workArea.width - 1000);
      expect(currentBounds.x).toBeGreaterThanOrEqual(0);
    });
  });
});
