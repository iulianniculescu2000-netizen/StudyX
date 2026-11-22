import { useEffect, useState } from 'react';
import { createFrameMeter, installConsoleHelper, snapshotRenderCost, type FrameStats, type RenderCostSnapshot } from './perfProbe';

/**
 * Panou de diagnostic, doar în dezvoltare: Ctrl+Shift+P îl arată/ascunde. Când e ascuns nu măsoară nimic
 * (nicio buclă rAF, niciun observator), deci nu schimbă ce măsoară. Montat din App numai sub `import.meta.env.DEV`.
 */
export default function PerfOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => installConsoleHelper(), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && !event.altKey && event.code === 'KeyP') {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return open ? <PerfPanel /> : null;
}

function PerfPanel() {
  const [frames, setFrames] = useState<FrameStats>({ fps: 0, longFrames: 0, worstFrameMs: 0 });
  const [snap, setSnap] = useState<RenderCostSnapshot | null>(null);
  const [longTasks, setLongTasks] = useState(0);
  const [shift, setShift] = useState(0);
  const [slowEvents, setSlowEvents] = useState(0);

  useEffect(() => {
    const meter = createFrameMeter((stats) => {
      setFrames(stats);
      setSnap(snapshotRenderCost());
    });
    const observers: PerformanceObserver[] = [];
    const observe = (type: string, onEntries: (entries: PerformanceEntryList) => void, extra: Record<string, unknown> = {}) => {
      if (!PerformanceObserver.supportedEntryTypes?.includes(type)) return;
      const observer = new PerformanceObserver((list) => onEntries(list.getEntries()));
      observer.observe({ type, buffered: false, ...extra } as PerformanceObserverInit);
      observers.push(observer);
    };
    observe('longtask', (entries) => setLongTasks((n) => n + entries.length));
    observe('layout-shift', (entries) => setShift((value) => value + entries.reduce((sum, e) => sum + ((e as PerformanceEntry & { hadRecentInput?: boolean; value?: number }).hadRecentInput ? 0 : (e as PerformanceEntry & { value?: number }).value ?? 0), 0)));
    observe('event', (entries) => setSlowEvents((n) => n + entries.length), { durationThreshold: 100 });
    return () => { meter.stop(); observers.forEach((o) => o.disconnect()); };
  }, []);

  const row = (label: string, value: string | number, bad = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <b style={{ color: bad ? '#ff6b6b' : 'inherit', fontVariantNumeric: 'tabular-nums' }}>{value}</b>
    </div>
  );

  return (
    <div
      role="status"
      aria-label="Diagnostic randare (dezvoltare)"
      style={{
        position: 'fixed', left: 12, bottom: 12, zIndex: 2147483000, width: 260, padding: '10px 12px', borderRadius: 10,
        background: 'rgba(12,12,16,0.92)', color: '#f5f5f7', font: '11px/1.5 ui-monospace, Consolas, monospace', pointerEvents: 'none',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Randare · Ctrl+Shift+P</div>
      {row('cadre/s', frames.fps, frames.fps > 0 && frames.fps < 50)}
      {row('cadre > 50 ms (ultima secundă)', frames.longFrames, frames.longFrames > 0)}
      {row('cel mai lung cadru', `${frames.worstFrameMs} ms`, frames.worstFrameMs > 50)}
      {row('sarcini lungi (de la deschidere)', longTasks, longTasks > 0)}
      {row('interacțiuni > 100 ms', slowEvents, slowEvents > 0)}
      {row('deplasări de layout (CLS)', shift.toFixed(3), shift > 0.1)}
      {snap && <>
        {row('animații active / bucle', `${snap.runningAnimations} / ${snap.infiniteAnimations}`)}
        {row('bucle pe firul principal', snap.mainThreadLoops.length, snap.mainThreadLoops.length > 0)}
        {row('backdrop-filter', snap.backdropFilters)}
        {row('filter', snap.filters)}
        {row('will-change', snap.willChange)}
        {snap.mainThreadLoops.slice(0, 4).map((loop) => <div key={loop} style={{ opacity: 0.75, overflowWrap: 'anywhere' }}>· {loop}</div>)}
      </>}
    </div>
  );
}
