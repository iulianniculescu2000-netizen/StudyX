/**
 * Unelte de diagnostic pentru performanța randării, doar în dezvoltare (încărcate leneș din App doar când
 * `import.meta.env.DEV`, deci nu ajung în build-ul de producție).
 *
 * - `snapshotRenderCost()`: ce ține GPU-ul și firul principal ocupate pe pagina curentă (animații care rulează,
 *   elemente cu backdrop-filter / filter / will-change).
 * - `createFrameMeter()`: cadre pe secundă și cadre lungi, din diferențele dintre requestAnimationFrame.
 * - În consolă: `__studyxPerf()` tipărește instantaneul ca tabel.
 */

export interface RenderCostSnapshot {
  /** Animații CSS/WAAPI care rulează acum. */
  runningAnimations: number;
  /** Dintre ele, câte sunt infinite (bucle). */
  infiniteAnimations: number;
  /** Elemente vizibile cu backdrop-filter (fiecare costă GPU la fiecare cadru în care se schimbă ce e în spate). */
  backdropFilters: number;
  /** Elemente cu `filter` (blur, drop-shadow...). */
  filters: number;
  /** Elemente cu will-change setat permanent (straturi ținute în memorie). */
  willChange: number;
  /** Bucle care animă proprietăți ce nu pot rula pe compozitor (trezesc firul principal la fiecare cadru). */
  mainThreadLoops: string[];
}

const COMPOSITOR_PROPS = new Set(['transform', 'opacity', 'translate', 'scale', 'rotate']);

function describe(el: Element | null | undefined): string {
  if (!el) return '?';
  const cls = String((el as HTMLElement).className && typeof (el as HTMLElement).className === 'object'
    ? (el as unknown as SVGElement).className.baseVal
    : (el as HTMLElement).className ?? '').trim().split(/\s+/).slice(0, 2).join('.');
  return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`;
}

/** O buclă rulează pe compozitor doar dacă animă transform/opacitate pe un element HTML (nu pe interiorul unui SVG). */
export function isCompositorFriendly(target: Element | null | undefined, properties: string[]): boolean {
  if (!target) return false;
  const insideSvg = target instanceof SVGElement && target.tagName.toLowerCase() !== 'svg';
  return !insideSvg && properties.length > 0 && properties.every((p) => COMPOSITOR_PROPS.has(p));
}

function animatedProperties(animation: Animation): string[] {
  const effect = animation.effect as KeyframeEffect | null;
  const frames = effect?.getKeyframes?.() ?? [];
  const skip = new Set(['offset', 'computedOffset', 'easing', 'composite']);
  return [...new Set(frames.flatMap((frame) => Object.keys(frame).filter((key) => !skip.has(key))))];
}

export function snapshotRenderCost(root: Document = document): RenderCostSnapshot {
  const animations = typeof root.getAnimations === 'function' ? root.getAnimations().filter((a) => a.playState === 'running') : [];
  const mainThreadLoops: string[] = [];
  let infinite = 0;
  for (const animation of animations) {
    const effect = animation.effect as KeyframeEffect | null;
    if (effect?.getTiming?.().iterations !== Infinity) continue;
    infinite += 1;
    const props = animatedProperties(animation);
    if (!isCompositorFriendly(effect?.target, props)) {
      const name = (animation as CSSAnimation).animationName || animation.id || 'animație';
      mainThreadLoops.push(`${name} pe ${describe(effect?.target)} (${props.join(', ') || '?'})`);
    }
  }
  let backdropFilters = 0;
  let filters = 0;
  let willChange = 0;
  for (const el of root.querySelectorAll<HTMLElement>('body *')) {
    const style = getComputedStyle(el);
    const backdrop = style.backdropFilter || (style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter;
    if (backdrop && backdrop !== 'none') backdropFilters += 1;
    if (style.filter && style.filter !== 'none') filters += 1;
    if (style.willChange && style.willChange !== 'auto') willChange += 1;
  }
  return { runningAnimations: animations.length, infiniteAnimations: infinite, backdropFilters, filters, willChange, mainThreadLoops };
}

export interface FrameStats {
  fps: number;
  /** Cadre peste 50 ms în fereastra măsurată (se simt ca sacadare). */
  longFrames: number;
  worstFrameMs: number;
}

/** Statistici dintr-o listă de durate de cadru (ms), pe o fereastră de `windowMs`. */
export function summarizeFrames(deltas: number[], windowMs: number): FrameStats {
  if (deltas.length === 0 || windowMs <= 0) return { fps: 0, longFrames: 0, worstFrameMs: 0 };
  return {
    fps: Math.round((deltas.length / windowMs) * 1000),
    longFrames: deltas.filter((d) => d > 50).length,
    worstFrameMs: Math.round(Math.max(...deltas)),
  };
}

/** Măsoară cadrele cu requestAnimationFrame; `stop()` oprește bucla. Folosit doar de panoul de diagnostic. */
export function createFrameMeter(onSecond: (stats: FrameStats) => void, windowMs = 1000) {
  let frame = 0;
  let last = performance.now();
  let windowStart = last;
  let deltas: number[] = [];
  const tick = (now: number) => {
    deltas.push(now - last);
    last = now;
    if (now - windowStart >= windowMs) {
      onSecond(summarizeFrames(deltas, now - windowStart));
      deltas = [];
      windowStart = now;
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return { stop: () => cancelAnimationFrame(frame) };
}

/** `__studyxPerf()` în consola de dezvoltare. */
export function installConsoleHelper(target: Window = window): () => void {
  const helper = () => {
    const snap = snapshotRenderCost();
    console.table({ ...snap, mainThreadLoops: snap.mainThreadLoops.length });
    if (snap.mainThreadLoops.length) console.info('Bucle pe firul principal:\n' + snap.mainThreadLoops.join('\n'));
    return snap;
  };
  (target as Window & { __studyxPerf?: typeof helper }).__studyxPerf = helper;
  return () => { delete (target as Window & { __studyxPerf?: typeof helper }).__studyxPerf; };
}
