const fs = require('fs');

function isFiniteNumber(val) {
  return typeof val === 'number' && Number.isFinite(val);
}

function isValidBounds(b) {
  return Boolean(
    b &&
    typeof b === 'object' &&
    isFiniteNumber(b.x) &&
    isFiniteNumber(b.y) &&
    isFiniteNumber(b.width) && b.width > 0 &&
    isFiniteNumber(b.height) && b.height > 0
  );
}

function getAdaptiveWindowMetrics(screenModule) {
  try {
    const primaryDisplay = screenModule?.getPrimaryDisplay?.();
    const area = primaryDisplay?.workArea || { x: 0, y: 0, width: 1280, height: 800 };
    const margin = Math.max(20, Math.round(Math.min(area.width, area.height) * 0.03));
    const width = Math.max(820, Math.min(1440, area.width - margin * 2));
    const height = Math.max(620, Math.min(920, area.height - margin * 2));

    return {
      width,
      height,
      x: area.x + Math.round((area.width - width) / 2),
      y: area.y + Math.round((area.height - height) / 2),
      shouldMaximize: area.width < 1360 || area.height < 820,
    };
  } catch {
    return {
      width: 1024,
      height: 720,
      x: 100,
      y: 100,
      shouldMaximize: false,
    };
  }
}

function clampBoundsToDisplay(bounds, screenModule) {
  const fallback = getAdaptiveWindowMetrics(screenModule);
  const raw = bounds && typeof bounds === 'object' ? bounds : {};
  const targetX = isFiniteNumber(raw.x) ? raw.x : fallback.x;
  const targetY = isFiniteNumber(raw.y) ? raw.y : fallback.y;
  const targetWidth = isFiniteNumber(raw.width) && raw.width > 0 ? raw.width : fallback.width;
  const targetHeight = isFiniteNumber(raw.height) && raw.height > 0 ? raw.height : fallback.height;

  let display = null;
  try {
    display = screenModule?.getDisplayMatching?.({
      x: targetX,
      y: targetY,
      width: targetWidth,
      height: targetHeight,
    });
  } catch { /* ignore */ }

  if (!display) {
    try {
      display = screenModule?.getPrimaryDisplay?.();
    } catch { /* ignore */ }
  }

  const area = display?.workArea || { x: 0, y: 0, width: 1280, height: 800 };
  const minWidth = 720;
  const minHeight = 520;

  const width = Math.min(Math.max(minWidth, targetWidth), Math.max(minWidth, area.width));
  const height = Math.min(Math.max(minHeight, targetHeight), Math.max(minHeight, area.height));

  const maxX = Math.max(area.x, area.x + area.width - width);
  const maxY = Math.max(area.y, area.y + area.height - height);

  const x = Math.min(Math.max(targetX, area.x), maxX);
  const y = Math.min(Math.max(targetY, area.y), maxY);

  return { x, y, width, height };
}

function readWindowState(statePath, screenModule) {
  try {
    if (!fs.existsSync(statePath)) return null;
    const raw = fs.readFileSync(statePath, 'utf-8');
    if (!raw || !raw.trim()) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const clamped = clampBoundsToDisplay(parsed, screenModule);
    return {
      ...clamped,
      isMaximized: Boolean(parsed.isMaximized),
    };
  } catch (err) {
    console.warn('[WindowState] Error reading window state file, discarding corrupt state:', err?.message || String(err));
    try {
      if (fs.existsSync(statePath)) {
        fs.unlinkSync(statePath);
      }
    } catch { /* ignore */ }
    return null;
  }
}

function persistWindowState(win, statePath, screenModule) {
  try {
    if (!win || win.isDestroyed() || win.isMinimized()) return;
    const isMax = win.isMaximized();

    let previousValidState = null;
    try {
      if (fs.existsSync(statePath)) {
        const raw = fs.readFileSync(statePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          previousValidState = parsed;
        }
      }
    } catch { /* ignore */ }

    let normalBounds = null;
    if (isMax) {
      if (typeof win.getNormalBounds === 'function') {
        try {
          const nb = win.getNormalBounds();
          if (isValidBounds(nb)) {
            normalBounds = nb;
          }
        } catch { /* ignore */ }
      }
      if (!normalBounds && isValidBounds(previousValidState)) {
        normalBounds = previousValidState;
      }
      if (!normalBounds) {
        normalBounds = win.getBounds();
      }
    } else {
      normalBounds = win.getBounds();
    }

    const clamped = clampBoundsToDisplay(normalBounds, screenModule);
    const stateToSave = {
      ...clamped,
      isMaximized: isMax,
    };

    const tempPath = `${statePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(stateToSave, null, 2), 'utf-8');
    fs.renameSync(tempPath, statePath);
  } catch (err) {
    console.error('[WindowState] Failed to persist bounds:', err);
  }
}

function ensureWindowFitsDisplay(win, screenModule) {
  if (!win || win.isDestroyed() || win.isMinimized()) return;

  if (win.isMaximized()) {
    try {
      const bounds = win.getBounds();
      const displays = screenModule?.getAllDisplays?.() || [];
      const intersects = displays.some((d) => {
        const a = d.bounds;
        return bounds.x < a.x + a.width && bounds.x + bounds.width > a.x &&
               bounds.y < a.y + a.height && bounds.y + bounds.height > a.y;
      });
      if (!intersects && displays.length > 0) {
        win.unmaximize();
        const next = clampBoundsToDisplay(bounds, screenModule);
        win.setBounds(next);
        win.maximize();
      }
    } catch { /* ignore */ }
    return;
  }

  const current = win.getBounds();
  const nextBounds = clampBoundsToDisplay(current, screenModule);
  const changed = current.x !== nextBounds.x
    || current.y !== nextBounds.y
    || current.width !== nextBounds.width
    || current.height !== nextBounds.height;
  if (changed) win.setBounds(nextBounds);
}

module.exports = {
  isFiniteNumber,
  isValidBounds,
  getAdaptiveWindowMetrics,
  clampBoundsToDisplay,
  readWindowState,
  persistWindowState,
  ensureWindowFitsDisplay,
};
