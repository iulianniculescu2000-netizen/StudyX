/**
 * Dependency-free renderer for the AI chat's visual schemas.
 *
 * The model is asked to emit a Mermaid flowchart (```mermaid + `graph TD`), a
 * syntax every LLM already writes fluently. We parse a safe subset of it and lay
 * it out ourselves into inline SVG — no mermaid bundle, works offline in
 * Electron, and renders identically in light & dark because every color is
 * either `currentColor` or a translucent accent.
 *
 * Anything we cannot parse falls back to the plain code block upstream, so a
 * malformed diagram never breaks a chat message.
 */

import { isSchemaFence, parseSchema } from './schemaDsl';

/**
 * Marks a block the chat can open full-screen. The chat drawer delegates clicks
 * and re-renders the matched element's markup inside an overlay, so wide
 * schemas and tables are readable without widening every message bubble.
 */
export const ZOOM_ATTR = 'data-sx-zoom="1"';

export type DiagramDirection = 'TD' | 'LR';

export type NodeShape = 'process' | 'decision' | 'terminal' | 'accent';

/** Semantic accent of a node (schema DSL): urgency, treatment, investigation, or neutral. */
export type NodeTone = 'neutral' | 'danger' | 'ok' | 'info';

export interface DiagramNode {
  id: string;
  label: string;
  shape: NodeShape;
  /** Semantic color. Absent for plain mermaid nodes, which keep their shape-based tint. */
  tone?: NodeTone;
  /** Short explanation shown in a small popover on click. */
  note?: string;
  /** Book page the step comes from, as written by the model: "350" or "350–351" (schema DSL `(p. 350)`). */
  page?: string;
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
}

export interface ParsedDiagram {
  direction: DiagramDirection;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  /** Optional heading drawn inside the SVG (schema DSL `# Titlu`). */
  title?: string;
  /** Short message drawn under the schema, e.g. when it was truncated. */
  notice?: string;
}

/** Languages we accept on the fence: ```mermaid, ```flowchart, ```graph, ```schema. */
export function isDiagramLanguage(lang: string) {
  return /^(mermaid|flowchart|graph|schema|schem[ăa])$/i.test(lang.trim());
}

// ── Parsing ──────────────────────────────────────────────────────────────────

// `id[Label]`, `id{Label}`, `id(Label)`, `id((Label))`, `id([Label])`, or bare `id`.
const NODE_RE = /^([A-Za-z0-9_À-ɏ]+)\s*(\(\(|\(\[|\{|\[|\()?/;

const SHAPE_CLOSERS: Record<string, { close: string; shape: NodeShape }> = {
  '[': { close: ']', shape: 'process' },
  '{': { close: '}', shape: 'decision' },
  '(': { close: ')', shape: 'terminal' },
  '([': { close: '])', shape: 'terminal' },
  '((': { close: '))', shape: 'accent' },
};

function decodeEntities(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function cleanLabel(raw: string) {
  return decodeEntities(raw)
    .replace(/^["']|["']$/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/[*`]/g, '')
    .trim();
}

interface TokenResult {
  node: DiagramNode;
  rest: string;
}

/** Reads one node token from the head of `text`; returns null when it isn't one. */
function readNode(text: string): TokenResult | null {
  const match = NODE_RE.exec(text.trimStart());
  if (!match) return null;
  const trimmed = text.trimStart();
  const id = match[1];
  const opener = match[2];

  if (!opener) {
    return { node: { id, label: id, shape: 'process' }, rest: trimmed.slice(match[0].length) };
  }

  const spec = SHAPE_CLOSERS[opener];
  const bodyStart = match[0].length;
  const closeIndex = trimmed.indexOf(spec.close, bodyStart);
  if (closeIndex === -1) return null;

  const label = cleanLabel(trimmed.slice(bodyStart, closeIndex));
  return {
    node: { id, label: label || id, shape: spec.shape },
    rest: trimmed.slice(closeIndex + spec.close.length),
  };
}

const ARROW_RE = /^\s*(-{2,}>|-\.-+>|={2,}>|-{3,}|-\.-+)\s*(\|([^|]*)\||"([^"]*)")?\s*/;

export function parseDiagram(source: string): ParsedDiagram | null {
  // The chat pipeline HTML-escapes model text before formatting, so arrows
  // arrive as `--&gt;`. Restore them; label text is re-escaped at render time.
  const rawLines = source.replace(/&gt;/g, '>').split('\n');
  let direction: DiagramDirection = 'TD';
  let droppedGroups = false;

  const nodes = new Map<string, DiagramNode>();
  const edges: DiagramEdge[] = [];

  const upsert = (node: DiagramNode) => {
    const existing = nodes.get(node.id);
    // A later, richer declaration wins over a bare id reference.
    if (!existing || (existing.label === existing.id && node.label !== node.id)) {
      nodes.set(node.id, node);
    }
  };

  for (const rawLine of rawLines) {
    const line = rawLine.trim().replace(/;+$/, '');
    if (!line) continue;

    const header = /^(?:graph|flowchart)\s+(TD|TB|LR|RL|BT)\b/i.exec(line);
    if (header) {
      const value = header[1].toUpperCase();
      direction = value === 'LR' || value === 'RL' ? 'LR' : 'TD';
      continue;
    }

    // Structural noise we intentionally ignore rather than fail on. Keywords
    // must be whole words: nodes called `style1` / `endocard` are real nodes.
    // A `subgraph` header is skipped but its body is parsed as ordinary lines,
    // so nodes and edges inside groups survive; only the grouping is lost.
    if (/^subgraph(\s|$)/i.test(line)) {
      droppedGroups = true;
      continue;
    }
    if (/^end$/i.test(line) || /^(classDef|class|style|linkStyle|click)\s/i.test(line) || line.startsWith('%%')) continue;

    const first = readNode(line);
    if (!first) continue;
    upsert(first.node);

    // `A --> B --> C` chains: each parsed target becomes the next edge's source.
    let source = first.node;
    let cursor = first.rest;
    while (cursor.trim()) {
      const arrow = ARROW_RE.exec(cursor);
      if (!arrow) break;
      const next = readNode(cursor.slice(arrow[0].length));
      if (!next) break;

      upsert(next.node);
      edges.push({
        from: source.id,
        to: next.node.id,
        label: (arrow[3] ?? arrow[4] ?? '').trim() || undefined,
        dashed: arrow[1].includes('.'),
      });
      source = next.node;
      cursor = next.rest;
    }
  }

  if (nodes.size === 0 || edges.length === 0) return null;
  return {
    direction,
    nodes: [...nodes.values()],
    edges,
    ...(droppedGroups ? { notice: 'Grupurile din schemă nu sunt afișate' } : {}),
  };
}

// ── Layout ───────────────────────────────────────────────────────────────────

const FONT_SIZE = 13;
const CHAR_WIDTH = 7.1;
const LINE_HEIGHT = 17;
const PAD_X = 16;
const PAD_Y = 14;
const MIN_W = 88;
const MAX_W = 210;
const GAP_MAIN = 58; // between layers
const GAP_CROSS = 24; // between siblings in a row
const GAP_ROW = 20; // between wrapped rows of the same layer
/** Cross-axis budget before a layer wraps: keeps wide fan-outs readable in the chat. */
const CROSS_CAPACITY_TD = 660;
const CROSS_CAPACITY_LR = 520;
const MARGIN = 14;

export function wrapLabel(label: string, maxChars = 24): string[] {
  const out: string[] = [];
  for (const paragraph of label.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    let line = '';
    for (const word of words) {
      // Preserve every character, including long medical terms without spaces.
      for (let offset = 0; offset < word.length; offset += maxChars) {
        const chunk = word.slice(offset, offset + maxChars);
        if (!line) line = chunk;
        else if (line.length + 1 + chunk.length <= maxChars) line += ` ${chunk}`;
        else { out.push(line); line = chunk; }
      }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [label];
}

interface PlacedNode extends DiagramNode {
  lines: string[];
  width: number;
  height: number;
  x: number;
  y: number;
}

/**
 * Edges that close a loop (they point at a node still open on the DFS path).
 * Layering and ordering ignore them, so a "repeat the ECG" arrow never inflates
 * the depth of the steps it loops over; they are drawn dashed.
 */
export function findBackEdges(nodes: DiagramNode[], edges: DiagramEdge[]): Set<DiagramEdge> {
  const out = new Map<string, DiagramEdge[]>();
  const hasIncoming = new Set<string>();
  for (const edge of edges) {
    out.set(edge.from, [...(out.get(edge.from) ?? []), edge]);
    if (edge.from !== edge.to) hasIncoming.add(edge.to);
  }

  const back = new Set<DiagramEdge>();
  const state = new Map<string, 1 | 2>(); // 1 = on the path, 2 = done
  const visit = (start: string) => {
    const stack: Array<{ id: string; next: number }> = [{ id: start, next: 0 }];
    state.set(start, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const list = out.get(top.id) ?? [];
      if (top.next >= list.length) {
        state.set(top.id, 2);
        stack.pop();
        continue;
      }
      const edge = list[top.next];
      top.next += 1;
      const seen = state.get(edge.to);
      if (seen === 1) back.add(edge);
      else if (seen === undefined) {
        state.set(edge.to, 1);
        stack.push({ id: edge.to, next: 0 });
      }
    }
  };

  // Entry points first, so the loop is the edge that goes "back", not the first step.
  for (const node of nodes) if (!hasIncoming.has(node.id) && !state.has(node.id)) visit(node.id);
  for (const node of nodes) if (!state.has(node.id)) visit(node.id);
  return back;
}

/** Longest-path layering over the acyclic part of the graph (`back` edges are ignored). */
function computeLayers(nodes: DiagramNode[], edges: DiagramEdge[], back: Set<DiagramEdge>) {
  const depth = new Map<string, number>();
  nodes.forEach((node) => depth.set(node.id, 0));

  const forward = edges.filter((edge) => edge.from !== edge.to && !back.has(edge));
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let changed = false;
    for (const edge of forward) {
      const candidate = (depth.get(edge.from) ?? 0) + 1;
      if (candidate > (depth.get(edge.to) ?? 0)) {
        depth.set(edge.to, candidate);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return depth;
}

/**
 * Orders the nodes inside every layer by the average position of their
 * neighbours in the adjacent layer (barycenter), sweeping down then up a few
 * times. Branches of the same parent stay together and crossings drop sharply.
 */
export function orderLayers<T extends { id: string }>(
  layers: Map<number, T[]>,
  levels: number[],
  edges: DiagramEdge[],
): void {
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  for (const edge of edges) {
    parents.set(edge.to, [...(parents.get(edge.to) ?? []), edge.from]);
    children.set(edge.from, [...(children.get(edge.from) ?? []), edge.to]);
  }

  const position = new Map<string, number>();
  const refresh = (level: number) => {
    const bucket = layers.get(level)!;
    bucket.forEach((node, index) => position.set(node.id, (index + 0.5) / bucket.length));
  };
  levels.forEach(refresh);

  const sweep = (level: number, neighbours: Map<string, string[]>) => {
    const bucket = layers.get(level)!;
    const keyed = bucket.map((node, index) => {
      const known = (neighbours.get(node.id) ?? []).filter((id) => position.has(id) && id !== node.id);
      const own = position.get(node.id) ?? 0;
      const value = known.length ? known.reduce((sum, id) => sum + (position.get(id) ?? 0), 0) / known.length : own;
      return { node, value, index };
    });
    keyed.sort((a, b) => a.value - b.value || a.index - b.index);
    layers.set(level, keyed.map((item) => item.node));
    refresh(level);
  };

  for (let round = 0; round < 3; round += 1) {
    for (let i = 1; i < levels.length; i += 1) sweep(levels[i], parents);
    for (let i = levels.length - 2; i >= 0; i -= 1) sweep(levels[i], children);
  }
}

let measureContext: OffscreenCanvasRenderingContext2D | null | undefined;
const widthCache = new Map<string, number>();

/** Rendered width of one line of node text; falls back to a per-character estimate off-browser. */
function textWidth(text: string): number {
  if (measureContext === undefined) {
    try {
      measureContext = typeof OffscreenCanvas === 'undefined' ? null : new OffscreenCanvas(1, 1).getContext('2d');
      if (measureContext) measureContext.font = `700 ${FONT_SIZE}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    } catch {
      measureContext = null;
    }
  }
  if (!measureContext) return text.length * CHAR_WIDTH;
  const cached = widthCache.get(text);
  if (cached !== undefined) return cached;
  const width = measureContext.measureText(text).width;
  if (widthCache.size > 500) widthCache.clear();
  widthCache.set(text, width);
  return width;
}

function longestLine(lines: string[]) {
  return lines.reduce((max, line) => Math.max(max, textWidth(line)), 0);
}

function layout(diagram: ParsedDiagram) {
  const back = findBackEdges(diagram.nodes, diagram.edges);
  const depth = computeLayers(diagram.nodes, diagram.edges, back);

  const placed: PlacedNode[] = diagram.nodes.map((node) => {
    const lines = wrapLabel(node.label);
    const width = Math.max(MIN_W, Math.min(MAX_W, longestLine(lines) + PAD_X * 2));
    const height = lines.length * LINE_HEIGHT + PAD_Y * 2;
    return { ...node, lines, width, height, x: 0, y: 0 };
  });

  const byId = new Map(placed.map((node) => [node.id, node]));
  const layers = new Map<number, PlacedNode[]>();
  placed.forEach((node) => {
    const level = depth.get(node.id) ?? 0;
    const bucket = layers.get(level) ?? [];
    bucket.push(node);
    layers.set(level, bucket);
  });

  const orderedLevels = [...layers.keys()].sort((a, b) => a - b);
  orderLayers(layers, orderedLevels, diagram.edges.filter((edge) => edge.from !== edge.to && !back.has(edge)));
  const horizontal = diagram.direction === 'LR';
  const crossOf = (node: PlacedNode) => (horizontal ? node.height : node.width);
  const mainOf = (node: PlacedNode) => (horizontal ? node.width : node.height);

  // A chapter hub with eight children would otherwise be one 1500px-wide row.
  // Wide layers wrap into several rows so the whole schema stays compact.
  const capacity = horizontal ? CROSS_CAPACITY_LR : CROSS_CAPACITY_TD;
  const rowsPerLayer = new Map<number, PlacedNode[][]>();
  for (const level of orderedLevels) {
    const bucket = layers.get(level)!;
    const rows: PlacedNode[][] = [];
    let row: PlacedNode[] = [];
    let rowCross = 0;
    for (const node of bucket) {
      const next = rowCross === 0 ? crossOf(node) : rowCross + GAP_CROSS + crossOf(node);
      if (row.length > 0 && next > capacity) {
        rows.push(row);
        row = [node];
        rowCross = crossOf(node);
        continue;
      }
      row.push(node);
      rowCross = next;
    }
    if (row.length > 0) rows.push(row);
    rowsPerLayer.set(level, rows);
  }

  const rowCrossSize = (row: PlacedNode[]) =>
    row.reduce((sum, node) => sum + crossOf(node), 0) + GAP_CROSS * (row.length - 1);

  // Main axis offsets: each layer takes as many rows as it needed above.
  let mainOffset = MARGIN;
  const layerMain = new Map<number, number>();
  const rowExtents = new Map<number, number[]>();
  for (const level of orderedLevels) {
    const rows = rowsPerLayer.get(level)!;
    const extents = rows.map((row) => row.reduce((max, node) => Math.max(max, mainOf(node)), 0));
    layerMain.set(level, mainOffset);
    rowExtents.set(level, extents);
    mainOffset += extents.reduce((sum, extent) => sum + extent, 0) + GAP_ROW * (rows.length - 1) + GAP_MAIN;
  }
  const mainSize = mainOffset - GAP_MAIN + MARGIN;

  // Cross axis: center every row against the widest one in the whole schema.
  let crossSize = 0;
  for (const level of orderedLevels) {
    for (const row of rowsPerLayer.get(level)!) {
      crossSize = Math.max(crossSize, rowCrossSize(row));
    }
  }
  crossSize += MARGIN * 2;

  for (const level of orderedLevels) {
    const rows = rowsPerLayer.get(level)!;
    const extents = rowExtents.get(level)!;
    let main = layerMain.get(level)!;

    rows.forEach((row, rowIndex) => {
      let cross = (crossSize - rowCrossSize(row)) / 2;
      for (const node of row) {
        if (horizontal) {
          node.x = main + (extents[rowIndex] - node.width) / 2;
          node.y = cross;
          cross += node.height + GAP_CROSS;
        } else {
          node.y = main + (extents[rowIndex] - node.height) / 2;
          node.x = cross;
          cross += node.width + GAP_CROSS;
        }
      }
      main += extents[rowIndex] + GAP_ROW;
    });
  }

  return {
    placed,
    byId,
    depth,
    back,
    width: horizontal ? mainSize : crossSize,
    height: horizontal ? crossSize : mainSize,
    horizontal,
  };
}

// ── SVG rendering ────────────────────────────────────────────────────────────
//
// Nodes are small "glass" cards: a translucent tint of their semantic color, a
// soft top highlight and a thin accent bar. Colors come from CSS variables the
// chat frame sets from the active theme (`--sx-danger`, …) with fixed fallbacks,
// so the same markup also exports correctly as a standalone SVG/PNG.
//
// Everything interactive (path highlight on hover, pinned path + note popover,
// keyboard) is driven from the data-* attributes written here — see
// `schemaInteraction.ts`. The markup carries no script and no handlers, so it
// passes the SVG sanitizer unchanged.

const TONE_VAR: Record<NodeTone, string> = {
  danger: 'var(--sx-danger, #e5484d)',
  ok: 'var(--sx-ok, #30a46c)',
  info: 'var(--sx-info, #0a84ff)',
  neutral: 'var(--sx-neutral, #8e8e93)',
};

const LEGACY_COLOR: Record<NodeShape, string> = {
  process: '#6366f1',
  decision: '#f59e0b',
  terminal: '#10b981',
  accent: '#f43f5e',
};

function colorOf(node: DiagramNode) {
  return node.tone ? TONE_VAR[node.tone] : LEGACY_COLOR[node.shape];
}

function mix(color: string, percent: number) {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function kindOf(node: DiagramNode) {
  if (node.shape === 'decision') return 'Decizie';
  if (node.tone === 'danger') return 'Urgență';
  if (node.tone === 'ok') return 'Tratament';
  if (node.tone === 'info') return 'Investigație';
  if (node.shape === 'terminal') return 'Rezultat';
  return '';
}

interface NodeContext {
  /** Space-separated ids of the node, its ancestors and its descendants. */
  path: string;
  /** Entrance delay: layers appear one after another. */
  delayMs: number;
  gradientId: string;
}

function nodeCard(node: PlacedNode, gradientId: string) {
  const { x, y, width: w, height: h, shape } = node;
  const color = colorOf(node);
  const radius = shape === 'terminal' || shape === 'accent' ? h / 2 : 12;
  const strokeWidth = shape === 'decision' ? 1.8 : 1.3;
  const tint = node.tone && node.tone !== 'neutral' ? 15 : 10;
  const card = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" ry="${radius}" fill="${mix(color, tint)}" stroke="${mix(color, 58)}" stroke-width="${strokeWidth}"/>`;
  const inner = Math.max(0, radius - 0.5);
  const sheen = `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="${inner}" ry="${inner}" fill="url(#${gradientId})" stroke="none" pointer-events="none"/>`;
  const barInset = Math.min(10, radius * 0.7 + 3);
  const bar = shape === 'terminal' || shape === 'accent'
    ? ''
    : `<rect x="${x + 6}" y="${y + barInset}" width="3" height="${Math.max(6, h - barInset * 2)}" rx="1.5" fill="${color}" fill-opacity="0.85"/>`;
  const badge = shape === 'decision'
    ? `<circle cx="${x + 1}" cy="${y + 1}" r="9" fill="${color}"/><text x="${x + 1}" y="${y + 1.5}" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="800" fill="#fff">?</text>`
    : '';
  return `${card}${sheen}${bar}${badge}`;
}

function nodeText(node: PlacedNode) {
  const cx = node.x + node.width / 2 + (node.shape === 'terminal' || node.shape === 'accent' ? 0 : 2);
  const startY = node.y + node.height / 2 - ((node.lines.length - 1) * LINE_HEIGHT) / 2 + 1;
  const weight = node.shape === 'decision' || node.shape === 'accent' || node.shape === 'terminal' ? 700 : 600;
  return node.lines
    .map(
      (line, index) =>
        `<text x="${cx}" y="${startY + index * LINE_HEIGHT}" text-anchor="middle" dominant-baseline="middle" font-size="${FONT_SIZE}" font-weight="${weight}" fill="currentColor">${escapeXml(line)}</text>`,
    )
    .join('');
}

/**
 * What to do with a step's book page. `ok`: the page is among the sources given to the model (the popover can open
 * it); `hide`: the page is not among them (probably invented), so nothing is drawn. Without a checker the page is
 * only informative (`info`: text, no button).
 */
export type PageStatus = 'ok' | 'hide';
export interface DiagramRenderOptions {
  pageStatus?: (page: string) => PageStatus;
}

let pageChecker: DiagramRenderOptions['pageStatus'];

/** Page of a node as it will be drawn, or null when it must not be shown. */
function pageOf(node: DiagramNode): { page: string; state: 'ok' | 'info' } | null {
  if (!node.page) return null;
  if (!pageChecker) return { page: node.page, state: 'info' };
  return pageChecker(node.page) === 'ok' ? { page: node.page, state: 'ok' } : null;
}

/** Small "p. 350" pill straddling the bottom edge of the card; only inline attributes so it survives SVG/PNG export. */
function pagePill(node: PlacedNode, page: string) {
  const text = `p. ${page}`;
  const w = Math.round(text.length * 5.6 + 12);
  const x = node.x + node.width - w - 8;
  const y = node.y + node.height - 7;
  return (
    `<g class="sx-pg" aria-hidden="true"><rect x="${x}" y="${y}" width="${w}" height="14" rx="7" fill="var(--sx-surface, #ffffff)" stroke="rgba(128,128,128,0.45)" stroke-width="0.9"/>` +
    `<text x="${x + w / 2}" y="${y + 7.5}" text-anchor="middle" dominant-baseline="middle" font-size="9.5" font-weight="700" fill="currentColor" fill-opacity="0.78">${escapeXml(text)}</text></g>`
  );
}

function nodeGroup(node: PlacedNode, ctx: NodeContext) {
  const kind = kindOf(node);
  const shown = pageOf(node);
  const pageAria = shown ? `. ${shown.page.includes('–') ? 'Paginile' : 'Pagina'} ${shown.page}` : '';
  const aria = `${kind ? `${kind}: ` : ''}${node.label.replace(/\n/g, ' ')}${node.note ? `. ${node.note}` : ''}${pageAria}`;
  const note = node.note ? ` data-note="${escapeXml(node.note)}"` : '';
  const pageAttrs = shown ? ` data-page="${escapeXml(shown.page)}" data-page-state="${shown.state}"` : '';
  const title = node.note ? `<title>${escapeXml(node.note)}</title>` : '';
  return (
    `<g class="sx-node" data-id="${escapeXml(node.id)}" data-path="${escapeXml(ctx.path)}"${note}${pageAttrs} tabindex="0" role="button" aria-label="${escapeXml(aria)}" style="--d:${ctx.delayMs}ms">` +
    `${title}${nodeCard(node, ctx.gradientId)}${nodeText(node)}${shown ? pagePill(node, shown.page) : ''}</g>`
  );
}

/** Ids of every node on a node's way to and from it: ancestors, descendants and itself. */
function computePaths(diagram: ParsedDiagram) {
  const forward = new Map<string, string[]>();
  const backward = new Map<string, string[]>();
  for (const edge of diagram.edges) {
    forward.set(edge.from, [...(forward.get(edge.from) ?? []), edge.to]);
    backward.set(edge.to, [...(backward.get(edge.to) ?? []), edge.from]);
  }
  const walk = (start: string, graph: Map<string, string[]>) => {
    const seen = new Set<string>();
    const stack = [start];
    while (stack.length) {
      const current = stack.pop()!;
      for (const next of graph.get(current) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    return seen;
  };
  const paths = new Map<string, string>();
  for (const node of diagram.nodes) {
    const ids = new Set<string>([node.id, ...walk(node.id, forward), ...walk(node.id, backward)]);
    paths.set(node.id, [...ids].join(' '));
  }
  return paths;
}

/** Entrance timing: layers appear one after another, the whole thing within ~0.9 s. */
function staggerFor(maxDepth: number) {
  return Math.round(Math.min(120, 340 / Math.max(1, maxDepth)));
}

interface Point {
  x: number;
  y: number;
}

/** Fan-out slot: k-th of n edges leaving/entering a border, spread over its middle half. */
function slot(size: number, index: number, count: number) {
  if (count <= 1) return size / 2;
  const usable = Math.min(size - 16, size * 0.7);
  return size / 2 - usable / 2 + (usable * index) / (count - 1);
}

interface Fan {
  outIndex: number;
  outCount: number;
  inIndex: number;
  inCount: number;
}

/**
 * Anchor points on the node borders. Edges sharing a node are fanned out along
 * that border so parallel branches (and their labels) never overlap.
 */
function anchors(from: PlacedNode, to: PlacedNode, horizontal: boolean, fan: Fan): [Point, Point] {
  if (horizontal) {
    const forward = to.x >= from.x;
    return [
      {
        x: forward ? from.x + from.width : from.x,
        y: from.y + slot(from.height, fan.outIndex, fan.outCount),
      },
      {
        x: forward ? to.x : to.x + to.width,
        y: to.y + slot(to.height, fan.inIndex, fan.inCount),
      },
    ];
  }

  const forward = to.y >= from.y;
  return [
    {
      x: from.x + slot(from.width, fan.outIndex, fan.outCount),
      y: forward ? from.y + from.height : from.y,
    },
    {
      x: to.x + slot(to.width, fan.inIndex, fan.inCount),
      y: forward ? to.y : to.y + to.height,
    },
  ];
}

/** Control points of the cubic used for an edge — shared by the path and its label. */
function edgeCurve(start: Point, end: Point, horizontal: boolean): [Point, Point, Point, Point] {
  if (horizontal) {
    const midX = (start.x + end.x) / 2;
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  }
  const midY = (start.y + end.y) / 2;
  return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
}

function edgePath(curve: [Point, Point, Point, Point]) {
  const [p0, p1, p2, p3] = curve;
  return `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`;
}

function pointOnCurve(curve: [Point, Point, Point, Point], t: number): Point {
  const [p0, p1, p2, p3] = curve;
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** A fine open chevron at `tip`, pointing along the incoming direction. */
function arrowHead(from: Point, tip: Point) {
  let dx = tip.x - from.x;
  let dy = tip.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  dx /= length;
  dy /= length;
  const back = { x: tip.x - dx * 7, y: tip.y - dy * 7 };
  const a = { x: back.x - dy * 4, y: back.y + dx * 4 };
  const b = { x: back.x + dy * 4, y: back.y - dx * 4 };
  const r = (n: number) => Math.round(n * 10) / 10;
  return `<path class="sx-head" d="M ${r(a.x)} ${r(a.y)} L ${r(tip.x)} ${r(tip.y)} L ${r(b.x)} ${r(b.y)}" fill="none" stroke="currentColor" stroke-opacity="0.55" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function edgeStroke(dashed: boolean | undefined) {
  const dash = dashed ? ' stroke-dasharray="5 4" data-dashed="1"' : '';
  return `fill="none" stroke="currentColor" stroke-opacity="0.42" stroke-width="1.6" stroke-linecap="round"${dash}`;
}

// ── Edge routing around nodes ────────────────────────────────────────────────
//
// A cubic between distant layers (a loop back to an earlier step, a branch that
// rejoins later) can cut straight through the nodes in between. Such an edge is
// redrawn as a rounded orthogonal route: out of its node, along a vertical
// channel that no node occupies, then into its target.

const ROUTE_PAD = 8;
const ROUTE_TURN = 12;
const ROUTE_RADIUS = 8;

function curveHitsNode(curve: [Point, Point, Point, Point], nodes: PlacedNode[]) {
  for (let i = 1; i < 20; i += 1) {
    const p = pointOnCurve(curve, i / 20);
    if (nodes.some((n) => p.x > n.x - 4 && p.x < n.x + n.width + 4 && p.y > n.y - 4 && p.y < n.y + n.height + 4)) return true;
  }
  return false;
}

/** Polyline with rounded corners; collinear and repeated points are dropped first. */
export function roundedPath(points: Point[], radius = ROUTE_RADIUS): string {
  const pts = points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
  const clean = pts.filter((p, i) => {
    if (i === 0 || i === pts.length - 1) return true;
    const a = pts[i - 1];
    const b = pts[i + 1];
    return (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x) !== 0;
  });
  const r = (n: number) => Math.round(n * 10) / 10;
  let d = `M ${r(clean[0].x)} ${r(clean[0].y)}`;
  for (let i = 1; i < clean.length - 1; i += 1) {
    const prev = clean[i - 1];
    const p = clean[i];
    const next = clean[i + 1];
    const inLen = Math.hypot(p.x - prev.x, p.y - prev.y);
    const outLen = Math.hypot(next.x - p.x, next.y - p.y);
    const k = Math.min(radius, inLen / 2, outLen / 2);
    const a = { x: p.x - ((p.x - prev.x) / inLen) * k, y: p.y - ((p.y - prev.y) / inLen) * k };
    const b = { x: p.x + ((next.x - p.x) / outLen) * k, y: p.y + ((next.y - p.y) / outLen) * k };
    d += ` L ${r(a.x)} ${r(a.y)} Q ${r(p.x)} ${r(p.y)} ${r(b.x)} ${r(b.y)}`;
  }
  const last = clean[clean.length - 1];
  return `${d} L ${r(last.x)} ${r(last.y)}`;
}

interface Route {
  d: string;
  /** Last segment, for the arrow head. */
  head: [Point, Point];
  labelAt: Point;
  /** Extent on the cross axis (x when top-down, y when left-right); the route may run past the nodes, so the canvas grows to hold it. */
  minCross: number;
  maxCross: number;
}

const flip = (p: Point): Point => ({ x: p.y, y: p.x });
const flipNode = (n: PlacedNode): PlacedNode => ({ ...n, x: n.y, y: n.x, width: n.height, height: n.width });

/**
 * A route through a channel clear of every other node, or null. Works on the
 * cross axis of the layout: vertical channels when top-down, horizontal ones
 * when left-right (the layout is transposed, routed, and transposed back).
 */
export function routeAround(from: PlacedNode, to: PlacedNode, start: Point, end: Point, all: PlacedNode[], horizontal = false): Route | null {
  if (!horizontal) return routeTopDown(from, to, start, end, all);
  const route = routeTopDown(flipNode(from), flipNode(to), flip(start), flip(end), all.map(flipNode), true);
  if (!route) return null;
  return { ...route, head: [flip(route.head[0]), flip(route.head[1])], labelAt: flip(route.labelAt) };
}

function routeTopDown(from: PlacedNode, to: PlacedNode, start: Point, end: Point, all: PlacedNode[], flipBack = false): Route | null {
  const down = to.y >= from.y;
  const centerY = (n: PlacedNode) => n.y + n.height / 2;
  const row = (n: PlacedNode) => all.filter((o) => Math.abs(centerY(o) - centerY(n)) < 30);
  const rowBottom = (n: PlacedNode) => Math.max(...row(n).map((o) => o.y + o.height));
  const rowTop = (n: PlacedNode) => Math.min(...row(n).map((o) => o.y));

  const turnStart = down ? rowBottom(from) + ROUTE_TURN : rowTop(from) - ROUTE_TURN;
  const turnEnd = down ? rowTop(to) - ROUTE_TURN : rowBottom(to) + ROUTE_TURN;
  if (down ? turnEnd < turnStart : turnEnd > turnStart) return null;

  const yTop = Math.min(turnStart, turnEnd);
  const yBottom = Math.max(turnStart, turnEnd);
  const obstacles = all.filter((n) => n !== from && n !== to);

  const candidates = [start.x, end.x];
  for (const n of obstacles) candidates.push(n.x - ROUTE_PAD * 1.5, n.x + n.width + ROUTE_PAD * 1.5);
  const free = (x: number) =>
    !obstacles.some((n) => n.y < yBottom + ROUTE_PAD && n.y + n.height > yTop - ROUTE_PAD && x > n.x - ROUTE_PAD && x < n.x + n.width + ROUTE_PAD);

  let best: number | null = null;
  let bestCost = Infinity;
  for (const x of candidates) {
    if (!free(x)) continue;
    const cost = Math.abs(x - start.x) + Math.abs(x - end.x);
    if (cost < bestCost) {
      best = x;
      bestCost = cost;
    }
  }
  if (best === null) return null;

  const points: Point[] = [
    start,
    { x: start.x, y: turnStart },
    { x: best, y: turnStart },
    { x: best, y: turnEnd },
    { x: end.x, y: turnEnd },
    end,
  ];
  return {
    d: roundedPath(flipBack ? points.map(flip) : points),
    head: [{ x: end.x, y: turnEnd }, end],
    labelAt: { x: start.x, y: (start.y + turnStart) / 2 },
    minCross: Math.min(start.x, end.x, best),
    maxCross: Math.max(start.x, end.x, best),
  };
}

/** Pushes edge labels that would print on top of each other further along their curves. */
export function spreadLabels<T extends { x: number; y: number; w: number; t: number | null; at(t: number): Point }>(labels: T[]): void {
  for (let pass = 0; pass < 6; pass += 1) {
    let moved = false;
    for (let i = 0; i < labels.length; i += 1) {
      for (let j = i + 1; j < labels.length; j += 1) {
        const a = labels[i];
        const b = labels[j];
        if (b.t === null || b.t >= 0.85) continue;
        if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 2 && Math.abs(a.y - b.y) < 20) {
          b.t = Math.min(0.85, b.t + 0.14);
          const p = b.at(b.t);
          b.x = p.x;
          b.y = p.y;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
}

let svgSeq = 0;

/** A hub is one node branching into simple leaves — a book's chapter list, typically. */
const HUB_MIN_CHILDREN = 4;

interface HubShape {
  root: DiagramNode;
  children: DiagramNode[];
}

/**
 * Detects "one node, many leaves": a table of contents, a classification, a list
 * of causes. Drawn as a graph it becomes a very wide row (or a grid crossed by
 * long curves); drawn as a bracketed list it is compact and instantly readable.
 */
function detectHub(diagram: ParsedDiagram): HubShape | null {
  if (diagram.nodes.length < HUB_MIN_CHILDREN + 1) return null;

  const rootId = diagram.edges[0]?.from;
  if (!rootId) return null;
  if (!diagram.edges.every((edge) => edge.from === rootId)) return null;

  const byId = new Map(diagram.nodes.map((node) => [node.id, node]));
  const root = byId.get(rootId);
  if (!root) return null;

  const seen = new Set<string>();
  const children: DiagramNode[] = [];
  for (const edge of diagram.edges) {
    if (edge.to === rootId || seen.has(edge.to)) continue;
    const child = byId.get(edge.to);
    if (!child) return null;
    seen.add(edge.to);
    children.push(child);
  }

  // Every node must take part, otherwise this is a richer graph than a hub.
  if (children.length + 1 !== diagram.nodes.length) return null;
  // Branch labels (da/nu…) are lost in a bracketed list, so a fan whose labels
  // tell the branches apart stays a graph. Labels are decorative only when every
  // arc carries the same text (e.g. all "include"): then nothing is lost and
  // adding or dropping one label doesn't flip the whole presentation. A fan with
  // an extra step (a child that continues) is not a hub: it is a tree, a graph.
  const labels = new Set(diagram.edges.map((edge) => edge.label ?? ''));
  if (labels.size > 1) return null;
  return children.length >= HUB_MIN_CHILDREN ? { root, children } : null;
}

const HUB_ROOT_GAP = 34; // root → rail
const HUB_RAIL_GAP = 26; // rail → child
const HUB_ROW_GAP = 12;

interface Rendered {
  markup: string;
  width: number;
  height: number;
}

function measureNode(node: DiagramNode, maxChars: number, maxWidth: number): PlacedNode {
  const lines = wrapLabel(node.label, maxChars);
  return {
    ...node,
    lines,
    width: Math.max(MIN_W, Math.min(maxWidth, longestLine(lines) + PAD_X * 2)),
    height: lines.length * LINE_HEIGHT + PAD_Y * 2,
    x: 0,
    y: 0,
  };
}

/** Bracketed-list rendering for the hub shape: root on the left, leaves stacked right. */
function renderHubSvg(hub: HubShape, gradientId: string, paths: Map<string, string>): Rendered {
  const root = measureNode(hub.root, 20, MAX_W);
  const children = hub.children.map((child) => measureNode(child, 30, MAX_W + 40));
  const childWidth = children.reduce((max, child) => Math.max(max, child.width), 0);
  const stagger = staggerFor(1);

  // Root sits on top like a title, with the rail dropping from it — a centered
  // root would leave a tall empty column beside a long chapter list.
  root.x = MARGIN;
  root.y = MARGIN;

  const railX = MARGIN + Math.min(30, root.width / 2);
  const columnX = railX + HUB_RAIL_GAP;
  let cursorY = root.y + root.height + HUB_ROOT_GAP;
  for (const child of children) {
    child.x = columnX;
    child.y = cursorY;
    child.width = childWidth; // one column reads calmer than ragged cards
    cursorY += child.height + HUB_ROW_GAP;
  }

  const totalHeight = cursorY - HUB_ROW_GAP + MARGIN;
  const lastCenter = children[children.length - 1].y + children[children.length - 1].height / 2;
  const childIds = children.map((child) => escapeXml(child.id)).join(' ');

  const trunk = `<g class="sx-eg" data-from="${escapeXml(root.id)}" data-to="${childIds}" style="--d:${stagger}ms"><path class="sx-edge" pathLength="1" d="M ${railX} ${root.y + root.height} V ${lastCenter}" ${edgeStroke(false)}/></g>`;
  const connectors = children.map((child, index) => {
    const center = child.y + child.height / 2;
    return `<g class="sx-eg" data-from="${escapeXml(root.id)}" data-to="${escapeXml(child.id)}" style="--d:${stagger + 40 + index * 25}ms"><path class="sx-edge" pathLength="1" d="M ${railX} ${center} H ${child.x}" ${edgeStroke(false)}/>${arrowHead({ x: railX, y: center }, { x: child.x, y: center })}</g>`;
  });

  const nodes = [root, ...children]
    .map((node, index) =>
      nodeGroup(node, {
        path: paths.get(node.id) ?? node.id,
        delayMs: index === 0 ? 0 : stagger + index * 25,
        gradientId,
      }),
    )
    .join('');

  return {
    markup: `${trunk}${connectors.join('')}${nodes}`,
    width: Math.max(columnX + childWidth, MARGIN + root.width) + MARGIN,
    height: totalHeight,
  };
}

/**
 * A wide LR chain squeezed into the chat column shrinks until the labels are
 * unreadable. Past this width the same graph is re-laid-out top-down, which is
 * tall (and scrollable) but stays at full size.
 */
const LR_REFLOW_WIDTH = 720;

/** Below this the SVG may scale down to fit; above it the wrapper scrolls instead. */
const SHRINK_LIMIT = 560;

const TITLE_BAND = 30;
const NOTICE_BAND = 26;

/** Plain-language summary of the steps, used as the SVG's accessible name. */
export function describeDiagram(diagram: ParsedDiagram): string {
  const flat = (text: string) => text.replace(/\s+/g, ' ').trim();
  const steps = diagram.nodes
    .slice(0, 24)
    .map((node, index) => {
      const kind = kindOf(node);
      return `${index + 1}. ${kind ? `${kind}: ` : ''}${flat(node.label)}`;
    })
    .join('; ');
  const head = diagram.title ? `Schemă: ${diagram.title}.` : 'Schemă.';

  // Relations, grouped per source: "A duce la: B (da), C (nu)".
  const byId = new Map(diagram.nodes.map((node) => [node.id, flat(node.label)]));
  const targets = new Map<string, string[]>();
  for (const edge of diagram.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to || edge.from === edge.to) continue;
    targets.set(edge.from, [...(targets.get(edge.from) ?? []), edge.label ? `${to} (${flat(edge.label)})` : to]);
  }
  const links = [...targets.entries()].map(([id, list]) => `${byId.get(id)} duce la: ${list.join(', ')}`);

  const LIMIT = 900;
  const STEPS_BUDGET = 480; // steps first, but never starve the links
  let stepsText = steps;
  if (links.length && stepsText.length > STEPS_BUDGET) stepsText = `${stepsText.slice(0, STEPS_BUDGET - 1).trimEnd()}…`;
  let out = `${head} ${stepsText}`;
  let added = false;
  for (const link of links) {
    const next = `${out}${added ? '; ' : '. Legături: '}${link}`;
    if (next.length > LIMIT - 1) {
      out = `${out}…`;
      break;
    }
    out = next;
    added = true;
  }
  return out.slice(0, LIMIT);
}

/** Renders a parsed diagram to standalone inline SVG markup. */
export function renderDiagramSvg(diagram: ParsedDiagram, options: DiagramRenderOptions = {}): string {
  svgSeq += 1;
  const gradientId = `sx-g-${svgSeq}`;
  const paths = computePaths(diagram);

  pageChecker = options.pageStatus;
  try {
    const hub = detectHub(diagram);
    const body = hub ? renderHubSvg(hub, gradientId, paths) : renderGraph(diagram, gradientId, paths);
    return wrapSvg(body, gradientId, diagram);
  } finally {
    pageChecker = undefined;
  }
}

function renderGraph(diagram: ParsedDiagram, gradientId: string, paths: Map<string, string>): Rendered {
  let computed = layout(diagram);
  if (diagram.direction === 'LR' && computed.width > LR_REFLOW_WIDTH) {
    computed = layout({ ...diagram, direction: 'TD' });
  }
  const { placed, byId, depth, back, width, height, horizontal } = computed;
  const maxDepth = Math.max(0, ...depth.values());
  const stagger = staggerFor(maxDepth);

  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  diagram.edges.forEach((edge, index) => {
    if (edge.from === edge.to) return;
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), String(index)]);
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), String(index)]);
  });

  interface EdgeDraw {
    edge: DiagramEdge;
    index: number;
    path: string;
    head: string;
    delay: number;
    label: { x: number; y: number; w: number; t: number | null; at(t: number): Point } | null;
  }
  const draws: EdgeDraw[] = [];
  const crossSize = horizontal ? height : width;
  let routeMin = 0;
  let routeMax = crossSize;

  diagram.edges.forEach((edge, index) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to || from === to) return;
    const outSlots = outgoing.get(edge.from) ?? [];
    const inSlots = incoming.get(edge.to) ?? [];
    const [start, end] = anchors(from, to, horizontal, {
      outIndex: Math.max(0, outSlots.indexOf(String(index))),
      outCount: outSlots.length,
      inIndex: Math.max(0, inSlots.indexOf(String(index))),
      inCount: inSlots.length,
    });
    const curve = edgeCurve(start, end, horizontal);
    const others = placed.filter((n) => n !== from && n !== to);
    const route = curveHitsNode(curve, others) ? routeAround(from, to, start, end, placed, horizontal) : null;

    const dashed = edge.dashed || back.has(edge);
    // pathLength="1" rescales dash units to the whole path, which would turn a dashed edge solid.
    const lengthAttr = dashed ? '' : ' pathLength="1"';
    if (route) {
      routeMin = Math.min(routeMin, route.minCross - ROUTE_PAD);
      routeMax = Math.max(routeMax, route.maxCross + ROUTE_PAD);
    }
    const d = route ? route.d : edgePath(curve);
    const path = `<path class="sx-edge"${lengthAttr} d="${d}" ${edgeStroke(dashed)}/>`;
    const head = route ? arrowHead(route.head[0], route.head[1]) : arrowHead(curve[2], end);

    let label: EdgeDraw['label'] = null;
    if (edge.label) {
      // Anchored near the source (mermaid convention) so an edge that skips a
      // layer never drops its label on top of an unrelated node. Siblings leaving
      // the same node start at different distances; spreadLabels settles the rest.
      const w = edge.label.length * 6.3 + 14;
      if (route) {
        label = { x: route.labelAt.x, y: route.labelAt.y, w, t: null, at: () => route.labelAt };
      } else {
        const t0 = outSlots.indexOf(String(index)) % 2 === 0 ? 0.24 : 0.42;
        const p0 = pointOnCurve(curve, t0);
        label = { x: p0.x, y: p0.y, w, t: t0, at: (t: number) => pointOnCurve(curve, t) };
      }
    }
    draws.push({ edge, index, path, head, delay: (depth.get(edge.from) ?? 0) * stagger + 150, label });
  });

  spreadLabels(draws.flatMap((draw) => (draw.label ? [draw.label] : [])));

  const edgeMarkup = draws
    .map(({ edge, path, head, delay, label }) => {
      let pill = '';
      if (label && edge.label) {
        const text = escapeXml(edge.label);
        pill =
          `<g class="sx-pill"><rect x="${label.x - label.w / 2}" y="${label.y - 9}" width="${label.w}" height="18" rx="9" ` +
          `fill="rgba(128,128,128,0.2)" stroke="rgba(128,128,128,0.35)" stroke-width="0.8"/>` +
          `<text x="${label.x}" y="${label.y + 0.5}" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="700" fill="currentColor" fill-opacity="0.92">${text}</text></g>`;
      }
      return `<g class="sx-eg" data-from="${escapeXml(edge.from)}" data-to="${escapeXml(edge.to)}" style="--d:${delay}ms">${path}${head}${pill}</g>`;
    })
    .join('');

  const nodeMarkup = placed
    .map((node) =>
      nodeGroup(node, {
        path: paths.get(node.id) ?? node.id,
        delayMs: (depth.get(node.id) ?? 0) * stagger,
        gradientId,
      }),
    )
    .join('');

  // A route that left the node band needs room on the cross axis: shift everything and grow the canvas.
  const shift = Math.max(0, -routeMin);
  const grown = Math.max(crossSize, routeMax) + shift;
  const body = `${edgeMarkup}${nodeMarkup}`;
  const move = horizontal ? `0 ${shift}` : `${shift} 0`;
  return {
    markup: shift > 0 ? `<g transform="translate(${move})">${body}</g>` : body,
    width: horizontal ? width : grown,
    height: horizontal ? grown : height,
  };
}

// ── Legend ───────────────────────────────────────────────────────────────────
//
// Colors carry meaning (urgency, treatment, investigation...), so a schema that
// uses at least two of them gets a small key under it. Purely decorative for
// assistive tech: describeDiagram already names each step's kind.

const LEGEND_ROW = 18;

interface LegendItem {
  kind: string;
  color: string;
  w: number;
}

function legendItems(diagram: ParsedDiagram): LegendItem[] {
  const seen = new Map<string, string>();
  for (const node of diagram.nodes) {
    const kind = kindOf(node);
    if (kind && !seen.has(kind)) seen.set(kind, colorOf(node));
  }
  if (seen.size < 2) return [];
  return [...seen].map(([kind, color]) => ({ kind, color, w: Math.round(kind.length * 6.2 + 34) }));
}

function renderLegend(items: LegendItem[], boxWidth: number, top: number): { markup: string; height: number } {
  if (!items.length) return { markup: '', height: 0 };
  const rows: LegendItem[][] = [[]];
  let used = 0;
  for (const item of items) {
    if (used + item.w > boxWidth - MARGIN * 2 && rows[rows.length - 1].length) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1].push(item);
    used += item.w;
  }
  const cells = rows.map((row, r) => {
    const rowW = row.reduce((sum, item) => sum + item.w, 0);
    let x = (boxWidth - rowW) / 2;
    const cy = top + 10 + r * LEGEND_ROW;
    return row
      .map((item) => {
        const cell =
          `<rect x="${x + 6}" y="${cy - 4}" width="8" height="8" rx="2.5" fill="${mix(item.color, 15)}" stroke="${mix(item.color, 70)}" stroke-width="1.2"/>` +
          `<text x="${x + 20}" y="${cy + 0.5}" dominant-baseline="middle" font-size="10.5" font-weight="600" fill="currentColor" fill-opacity="0.68">${escapeXml(item.kind)}</text>`;
        x += item.w;
        return cell;
      })
      .join('');
  });
  const height = rows.length * LEGEND_ROW + 6;
  return { markup: `<g class="sx-legend" aria-hidden="true">${cells.join('')}</g>`, height };
}

/** Shared chrome: zoom wrapper, scroll box, title/notice, and fit-vs-scroll sizing. */
function wrapSvg(body: Rendered, gradientId: string, diagram: ParsedDiagram): string {
  const titleText = diagram.title ? diagram.title.slice(0, 90) : '';
  const titleBand = titleText ? TITLE_BAND : 0;
  const noticeBand = diagram.notice ? NOTICE_BAND : 0;

  const titleWidth = titleText ? titleText.length * 8 + MARGIN * 2 : 0;
  const noticeWidth = diagram.notice ? diagram.notice.length * 6.4 + MARGIN * 2 : 0;
  const items = legendItems(diagram);
  const legendWidth = items.reduce((sum, item) => sum + item.w, 0) + MARGIN * 2;
  const boxWidth = Math.round(Math.max(body.width, Math.min(titleWidth, 640), Math.min(noticeWidth, 640), Math.min(legendWidth, 640)));
  const legend = renderLegend(items, boxWidth, titleBand + body.height + 4);
  const boxHeight = Math.round(body.height + titleBand + legend.height + noticeBand);
  const shift = Math.round((boxWidth - body.width) / 2);

  // Centered on the canvas, like the notice below: stays put when routes widen it.
  const title = titleText
    ? `<text class="sx-title" x="${boxWidth / 2}" y="${MARGIN + 8}" text-anchor="middle" font-size="14" font-weight="800" fill="currentColor">${escapeXml(titleText)}</text>`
    : '';
  const notice = diagram.notice
    ? `<text class="sx-notice" x="${boxWidth / 2}" y="${boxHeight - 12}" text-anchor="middle" font-size="11" font-weight="600" fill="currentColor" fill-opacity="0.6">${escapeXml(diagram.notice)}</text>`
    : '';

  // Narrow schemas may scale down to fit the bubble; wider ones keep their
  // natural size and the wrapper scrolls, so the text never becomes tiny.
  const sizing = boxWidth <= SHRINK_LIMIT
    ? 'max-width:100%;height:auto;'
    : `min-width:${boxWidth}px;`;
  const aria = escapeXml(describeDiagram(diagram));

  return [
    `<div ${ZOOM_ATTR} style="position:relative;margin:10px 0;border:1px solid rgba(128,128,128,0.22);border-radius:14px;background:rgba(128,128,128,0.05);cursor:var(--cursor-zoom-in, zoom-in);">`,
    '<div data-sx-hint="1" style="position:absolute;top:6px;right:10px;z-index:1;font-size:10px;font-weight:700;letter-spacing:0.04em;opacity:0.55;pointer-events:none;">⤢ MĂREȘTE</div>',
    '<div style="overflow-x:auto;padding:10px 4px;border-radius:14px;">',
    `<svg class="sx-sch" viewBox="0 0 ${boxWidth} ${boxHeight}" width="${boxWidth}" height="${boxHeight}" style="${sizing}display:block;margin:0 auto;color:currentColor;font-family:inherit;" role="img" aria-label="${aria}">`,
    `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.2"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.03"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`,
    title,
    `<g transform="translate(${shift} ${titleBand})">${body.markup}</g>`,
    legend.markup,
    notice,
    '</svg>',
    '</div>',
    '</div>',
  ].join('');
}

/**
 * Parse + render in one step; returns null when the block isn't a usable diagram.
 * `lang` only matters for the compact schema DSL: a ```schema fence is parsed as
 * DSL unless it actually holds mermaid, and nothing else is reinterpreted.
 */
export function renderDiagramBlock(source: string, lang = '', options: DiagramRenderOptions = {}): string | null {
  try {
    const parsed = isSchemaFence(lang, source) ? parseSchema(source) : parseDiagram(source);
    if (!parsed) return null;
    if (parsed.nodes.length > 40 || parsed.edges.length > 60) return null;
    return renderDiagramSvg(parsed, options);
  } catch {
    return null;
  }
}
