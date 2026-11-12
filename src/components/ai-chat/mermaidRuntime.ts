import type { MermaidConfig } from 'mermaid';
import type { Theme } from '../../theme/themes';
import { sanitizeSvg } from './sanitize';

/**
 * Lazy mermaid runtime: the library (~1 MB) is only fetched the first time a
 * reply actually contains a diagram, rendering is serialised (mermaid's config
 * is global), and finished SVGs are cached per theme + source.
 */

type MermaidApi = typeof import('mermaid')['default'];

let loader: Promise<MermaidApi> | null = null;

export function loadMermaid(): Promise<MermaidApi> {
  loader ??= import('mermaid').then((module) => module.default).catch((error) => {
    loader = null; // allow a retry (e.g. chunk fetch failed once)
    throw error;
  });
  return loader;
}

// ── Theme → mermaid variables ────────────────────────────────────────────────

function parseHex(color: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const raw = match[1].length === 3 ? match[1].replace(/./g, (c) => c + c) : match[1];
  return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)];
}

/** Mixes `fg` over `bg` (`amount` 0–1 of fg). Falls back to `fg` when a color isn't a hex. */
export function mixHex(fg: string, bg: string, amount: number): string {
  const a = parseHex(fg);
  const b = parseHex(bg);
  if (!a || !b) return fg;
  const channel = (i: number) => Math.round(a[i] * amount + b[i] * (1 - amount)).toString(16).padStart(2, '0');
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

const PALETTE_LIGHT = ['#007AFF', '#5E5CE6', '#34C759', '#FF9500', '#FF2D55', '#AF52DE', '#00B5AD', '#E0B000', '#A2845E', '#32ADE6', '#FF3B30', '#30B0C7'];
const PALETTE_DARK = ['#0A84FF', '#5E5CE6', '#30D158', '#FF9F0A', '#FF375F', '#BF5AF2', '#63E6E2', '#FFD60A', '#AC8E68', '#64D2FF', '#FF453A', '#40C8E0'];

export const MERMAID_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

type MermaidTheme = Pick<Theme, 'id' | 'isDark' | 'surface' | 'text' | 'text2' | 'text3' | 'accent'>;

export function buildMermaidConfig(theme: MermaidTheme): MermaidConfig {
  const palette = theme.isDark ? PALETTE_DARK : PALETTE_LIGHT;
  const tint = (color: string, amount = theme.isDark ? 0.26 : 0.16) => mixHex(color, theme.surface, amount);
  const line = mixHex(theme.text, theme.surface, 0.55);
  const node = tint(theme.accent, theme.isDark ? 0.22 : 0.10);

  const variables: Record<string, string | boolean> = {
    darkMode: theme.isDark,
    background: theme.surface,
    fontFamily: MERMAID_FONT,
    fontSize: '14px',
    primaryColor: node,
    primaryTextColor: theme.text,
    primaryBorderColor: theme.accent,
    secondaryColor: tint(palette[1]),
    secondaryTextColor: theme.text,
    secondaryBorderColor: palette[1],
    tertiaryColor: tint(palette[2]),
    tertiaryTextColor: theme.text,
    tertiaryBorderColor: palette[2],
    lineColor: line,
    textColor: theme.text,
    mainBkg: node,
    nodeBorder: theme.accent,
    nodeTextColor: theme.text,
    clusterBkg: mixHex(theme.text, theme.surface, 0.05),
    clusterBorder: mixHex(theme.text, theme.surface, 0.25),
    edgeLabelBackground: theme.surface,
    titleColor: theme.text,
    noteBkgColor: tint(palette[7]),
    noteTextColor: theme.text,
    noteBorderColor: palette[7],
    actorBkg: node,
    actorBorder: theme.accent,
    actorTextColor: theme.text,
    actorLineColor: line,
    signalColor: theme.text2,
    signalTextColor: theme.text,
    labelBoxBkgColor: node,
    labelBoxBorderColor: theme.accent,
    labelTextColor: theme.text,
    loopTextColor: theme.text,
    activationBkgColor: tint(theme.accent, 0.3),
    activationBorderColor: theme.accent,
    sequenceNumberColor: theme.isDark ? '#000000' : '#ffffff',
    pieTitleTextColor: theme.text,
    pieSectionTextColor: theme.text,
    pieLegendTextColor: theme.text,
    pieStrokeColor: theme.surface,
    pieOuterStrokeColor: 'transparent',
    pieOpacity: '1',
    attributeBackgroundColorOdd: mixHex(theme.text, theme.surface, 0.03),
    attributeBackgroundColorEven: mixHex(theme.text, theme.surface, 0.07),
    relationColor: line,
    relationLabelColor: theme.text,
    relationLabelBackground: theme.surface,
    transitionColor: line,
    transitionLabelColor: theme.text,
    stateLabelColor: theme.text,
    stateBkg: node,
    specialStateColor: line,
    labelColor: theme.text,
    altBackground: mixHex(theme.text, theme.surface, 0.05),
    compositeBackground: mixHex(theme.text, theme.surface, 0.04),
    compositeTitleBackground: mixHex(theme.text, theme.surface, 0.08),
    compositeBorder: mixHex(theme.text, theme.surface, 0.25),
    innerEndBackground: line,
  };

  palette.forEach((color, index) => {
    variables[`cScale${index}`] = tint(color, theme.isDark ? 0.34 : 0.22);
    variables[`cScaleLabel${index}`] = theme.text;
    variables[`cScaleInv${index}`] = color;
    variables[`pie${index + 1}`] = tint(color, theme.isDark ? 0.55 : 0.4);
    variables[`git${index}`] = color;
    variables[`gitBranchLabel${index}`] = '#ffffff';
  });

  return {
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    themeVariables: variables,
    fontFamily: MERMAID_FONT,
    htmlLabels: false,
    flowchart: { htmlLabels: false, curve: 'basis', padding: 12 },
    sequence: { useMaxWidth: true },
    mindmap: { useMaxWidth: true },
    timeline: { useMaxWidth: true },
    logLevel: 'fatal',
    maxTextSize: 20000,
  } as MermaidConfig;
}

// ── Cache + serial rendering ────────────────────────────────────────────────

/** Real LRU: a Map keeps insertion order, hits are re-inserted at the end. */
const CACHE_LIMIT = 120;
const CACHE_MAX_CHARS = 6_000_000;
const cache = new Map<string, string>();
let cacheChars = 0;

function cacheGet(key: string): string | undefined {
  const hit = cache.get(key);
  if (hit !== undefined) {
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit;
}

function cacheSet(key: string, svg: string): void {
  const old = cache.get(key);
  if (old !== undefined) {
    cacheChars -= old.length;
    cache.delete(key);
  }
  cache.set(key, svg);
  cacheChars += svg.length;
  while (cache.size > 1 && (cache.size > CACHE_LIMIT || cacheChars > CACHE_MAX_CHARS)) {
    const oldest = cache.keys().next().value as string;
    cacheChars -= cache.get(oldest)?.length ?? 0;
    cache.delete(oldest);
  }
}

export function cacheKey(themeId: string, code: string): string {
  return `${themeId}\u0000${code}`;
}

export function peekRendered(themeId: string, code: string): string | undefined {
  return cacheGet(cacheKey(themeId, code));
}

let configuredFor = '';
let idSeq = 0;

export type RenderPriority = 'visible' | 'idle';

interface Job {
  key: string;
  priority: RenderPriority;
  run: () => Promise<string>;
  promise: Promise<string>;
  resolve: (svg: string) => void;
  reject: (error: unknown) => void;
}

/** Waiting jobs; mermaid.render stays strictly one at a time (global config). */
let pending: Job[] = [];
let pumping = false;

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    while (pending.length) {
      // Visible diagrams first (FIFO inside a priority), off-screen ones when nothing else waits.
      const index = pending.findIndex((job) => job.priority === 'visible');
      const [job] = pending.splice(index === -1 ? 0 : index, 1);
      try {
        job.resolve(await job.run());
      } catch (error) {
        job.reject(error);
      }
    }
  } finally {
    pumping = false;
  }
}

/** Test hook: forget everything (cache, config marker). */
export function resetMermaidRuntime(): void {
  cache.clear();
  cacheChars = 0;
  configuredFor = '';
  loader = null;
  pending = [];
}

export class MermaidSyntaxError extends Error {}

/** Mermaid draws `root((Long title))` as a circle with a fixed visual radius.
 * Longer labels can extend outside that circle, so use its content-sized card
 * shape while keeping the text and the rest of the mindmap unchanged. */
export function fitMindmapRoots(code: string): string {
  if (!/^\s*mindmap\b/im.test(code)) return code;
  return code.replace(/^(\s*)([\w-]+)\(\(([^()\n]+)\)\)(\s*)$/gm, (whole, indent: string, id: string, label: string, suffix: string) =>
    label.trim().length > 7 && !label.includes(']') ? `${indent}${id}[${label}]${suffix}` : whole);
}

/**
 * Renders mermaid source to a sanitized SVG string for the given theme.
 * Rejects with MermaidSyntaxError when the diagram does not parse.
 */
export function renderMermaid(code: string, theme: MermaidTheme, priority: RenderPriority = 'visible'): Promise<string> {
  const key = cacheKey(theme.id, code);
  const hit = cacheGet(key);
  if (hit) return Promise.resolve(hit);

  // Same diagram already waiting: share it, and promote it if it became visible.
  const waiting = pending.find((job) => job.key === key);
  if (waiting) {
    if (priority === 'visible') waiting.priority = 'visible';
    return waiting.promise;
  }

  const run = async () => {
    const again = cacheGet(key);
    if (again) return again;
    const mermaid = await loadMermaid();
    const fittedCode = fitMindmapRoots(code);
    // Re-initialise only when the effective config changed (themes that map to
    // the same variables share it), not on every theme id switch.
    const config = buildMermaidConfig(theme);
    const signature = JSON.stringify(config);
    if (configuredFor !== signature) {
      mermaid.initialize(config);
      configuredFor = signature;
    }
    const ok = await mermaid.parse(fittedCode, { suppressErrors: true });
    if (!ok) throw new MermaidSyntaxError('parse');

    idSeq += 1;
    const id = `sx-mermaid-${idSeq}`;
    try {
      const { svg } = await mermaid.render(id, fittedCode);
      const clean = sanitizeSvg(svg);
      if (!clean.includes('<svg')) throw new MermaidSyntaxError('empty');
      cacheSet(key, clean);
      return clean;
    } finally {
      // mermaid parks scratch / error nodes in <body> when a render throws.
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
    }
  };

  let resolve!: (svg: string) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<string>((res, rej) => { resolve = res; reject = rej; });
  pending.push({ key, priority, run, promise, resolve, reject });
  void pump();
  return promise;
}
