/**
 * Compact "schemă" format: a flowchart in roughly a third of the tokens of
 * mermaid. One line per step, indentation = branching.
 *
 *   # Durere toracică
 *   ! Durere toracică acută | Sub 20 min = suspect
 *   ~ ECG în 10 minute
 *   ? Supradenivelare ST?
 *     da> + Reperfuzie urgentă
 *     nu> ~ Troponină seriată
 *       [pozitivă]> + Tratament NSTEMI
 *       [negativă]> . Alte cauze
 *   = Externare
 *   Hipoxie -> Acidoză -> Aritmii        (lanț cauzal pe o singură linie)
 *
 * Markers (followed by a space): `?` decision, `!` urgency (red), `+` treatment
 * (green), `~` investigation (blue), `.` plain step, `=` result. `da>`, `nu>`
 * or `[eticheta]>` label the branch leading to the line. `| text` adds a short
 * note. The parser is deliberately forgiving: unknown lines are plain steps,
 * irregular indentation is repaired, and an over-long schema is cut with a
 * visible message instead of failing.
 *
 * It produces the same `ParsedDiagram` the mermaid fallback renders, so layout,
 * export and zoom are shared.
 */
import type { DiagramEdge, DiagramNode, NodeShape, NodeTone, ParsedDiagram } from './diagram';

/** Past this many steps a schema stops being readable in a chat bubble. */
export const SCHEMA_MAX_NODES = 16;

const MAX_LABEL = 100;
const MAX_NOTE = 240;

const MERMAID_HEADER_RE = /^\s*(?:%%[^\n]*\n\s*)*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|quadrantChart|requirementDiagram|gitGraph|C4Context|sankey-beta|xychart-beta|block-beta)\b/;

/** True for a ```schema / ```schemă fence whose body is DSL rather than mermaid. */
export function isSchemaFence(lang: string, source: string): boolean {
  return /^schem[ăa]$/i.test(lang.trim()) && !MERMAID_HEADER_RE.test(source);
}

type Mark = '?' | '!' | '+' | '~' | '.' | '=';

const MARK_STYLE: Record<Mark, { shape: NodeShape; tone: NodeTone }> = {
  '?': { shape: 'decision', tone: 'neutral' },
  '!': { shape: 'process', tone: 'danger' },
  '+': { shape: 'process', tone: 'ok' },
  '~': { shape: 'process', tone: 'info' },
  '.': { shape: 'process', tone: 'neutral' },
  '=': { shape: 'terminal', tone: 'neutral' },
};

interface Step {
  id: string;
  label: string;
  mark: Mark;
  note?: string;
}

interface Entry {
  indent: number;
  /** One step, or several for a `A -> B -> C` line. */
  steps: Step[];
  branch?: string;
  children: Entry[];
}

function decodeEntities(value: string) {
  return value
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function cleanText(value: string, max: number) {
  const text = value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/[*`_]{2,}|[*`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function indentOf(line: string) {
  let width = 0;
  for (const char of line) {
    if (char === ' ') width += 1;
    else if (char === '\t') width += 4;
    else break;
  }
  return width;
}

// `da> `, `nu> ` or `[eticheta]> ` at the start of a line.
const BRANCH_RE = /^(?:\[([^\]]{1,32})\]|(da|nu))\s*>\s*/i;
// Bullets models add out of habit.
const BULLET_RE = /^(?:[-*•–]\s+|\d{1,2}[.)]\s+)/;
const MARK_RE = /^([?!+~.=])(?:\s+|$)/;
const ARROW_RE = /\s*(?:->|→|=>)\s*/;

function parseStep(raw: string, defaultMark: Mark | null): Omit<Step, 'id'> | null {
  let text = raw.trim();
  let mark: Mark | null = null;
  const markMatch = MARK_RE.exec(text);
  if (markMatch) {
    mark = markMatch[1] as Mark;
    text = text.slice(markMatch[0].length);
  }

  const pipe = text.indexOf('|');
  const labelRaw = pipe === -1 ? text : text.slice(0, pipe);
  const noteRaw = pipe === -1 ? '' : text.slice(pipe + 1);

  const label = cleanText(labelRaw, MAX_LABEL);
  if (!label) return null;
  const note = cleanText(noteRaw, MAX_NOTE);

  // A question with no marker is almost certainly a decision.
  const resolved: Mark = mark ?? defaultMark ?? (label.endsWith('?') ? '?' : '.');
  return { label, mark: resolved, ...(note ? { note } : {}) };
}

interface Draft {
  title?: string;
  roots: Entry[];
  stepCount: number;
  truncated: boolean;
}

function readEntries(source: string): Draft {
  const lines = decodeEntities(source).replace(/\r/g, '').split('\n');
  const draft: Draft = { roots: [], stepCount: 0, truncated: false };
  const stack: Entry[] = [];
  let seq = 0;

  for (const rawLine of lines) {
    if (!rawLine.trim()) continue;
    const indent = indentOf(rawLine);
    let text = rawLine.trim();

    if (text.startsWith('//') || text.startsWith('%%')) continue;

    const heading = /^#{1,3}\s+(.+)$/.exec(text);
    if (heading && draft.title === undefined && draft.stepCount === 0) {
      draft.title = cleanText(heading[1], 90);
      continue;
    }
    if (heading) text = heading[1];

    text = text.replace(BULLET_RE, '');

    let branch: string | undefined;
    const branchMatch = BRANCH_RE.exec(text);
    if (branchMatch) {
      const label = branchMatch[1] ?? branchMatch[2];
      branch = cleanText(branchMatch[2] ? label.charAt(0).toUpperCase() + label.slice(1).toLowerCase() : label, 28);
      text = text.slice(branchMatch[0].length);
    }
    if (text.startsWith('>')) text = text.slice(1);

    // A stray arrow at the start ("-> pas") only means "then".
    text = text.replace(/^(?:->|→|=>)\s*/, '');

    const parts = text.split(ARROW_RE).filter((part) => part.trim());
    if (parts.length === 0) continue;

    const steps: Step[] = [];
    for (const part of parts) {
      const parsed = parseStep(part, null);
      if (!parsed) continue;
      steps.push({ ...parsed, id: `n${seq + steps.length + 1}` });
    }
    if (steps.length === 0) continue;

    if (draft.stepCount + steps.length > SCHEMA_MAX_NODES) {
      draft.truncated = true;
      break;
    }
    seq += steps.length;
    draft.stepCount += steps.length;

    const entry: Entry = { indent, steps, ...(branch ? { branch } : {}), children: [] };
    // Irregular indentation: anything not deeper than the open line is a sibling
    // of the nearest shallower ancestor.
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1];
    (parent ? parent.children : draft.roots).push(entry);
    stack.push(entry);
  }

  return draft;
}

function toNode(step: Step): DiagramNode {
  const style = MARK_STYLE[step.mark];
  return {
    id: step.id,
    label: step.label,
    shape: style.shape,
    tone: style.tone,
    ...(step.note ? { note: step.note } : {}),
  };
}

/** Builds nodes and edges from the indentation tree. */
function buildGraph(draft: Draft) {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const seen = new Set<string>();

  const link = (from: string, to: string, label?: string) => {
    const key = `${from}>${to}`;
    if (from === to || seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, ...(label ? { label } : {}), dashed: false });
  };

  const tailOf = (entry: Entry) => entry.steps[entry.steps.length - 1];
  const isResult = (stepId: string) => nodes.find((node) => node.id === stepId)?.shape === 'terminal';

  /** Wires a line's own chain and returns the open ends after its children. */
  const place = (entry: Entry): Step[] => {
    for (const step of entry.steps) nodes.push(toNode(step));
    for (let i = 1; i < entry.steps.length; i += 1) link(entry.steps[i - 1].id, entry.steps[i].id);

    if (entry.children.length === 0) return [tailOf(entry)];

    const tail = tailOf(entry);
    const fan = tail.mark === '?' || entry.children.some((child) => child.branch);
    return group(entry.children, tail, fan);
  };

  /** `from`: where the group hangs. Returns the open ends of the group. */
  const group = (entries: Entry[], from: Step | null, fan: boolean): Step[] => {
    if (fan) {
      const ends: Step[] = [];
      for (const entry of entries) {
        const head = entry.steps[0];
        if (from) link(from.id, head.id, entry.branch);
        ends.push(...place(entry));
      }
      return ends;
    }

    let open: Step[] = from ? [from] : [];
    for (const entry of entries) {
      const head = entry.steps[0];
      // The next line continues from every open end except finished results.
      const sources = open.filter((step) => !isResult(step.id));
      const from2 = sources.length ? sources : open.slice(0, 1);
      for (const step of from2) link(step.id, head.id, entry.branch);
      open = place(entry);
    }
    return open;
  };

  group(draft.roots, null, false);
  return { nodes, edges };
}

/**
 * Parses the compact schema format. Returns null only when there is nothing to
 * draw (fewer than two steps), so the caller can show the code instead.
 */
export function parseSchema(source: string): ParsedDiagram | null {
  const draft = readEntries(source);
  if (draft.stepCount < 2) return null;

  const { nodes, edges } = buildGraph(draft);
  if (nodes.length < 2 || edges.length === 0) return null;

  // A schema that is a single "A -> B -> C" line reads best left to right.
  const singleChain = draft.roots.length === 1 && draft.roots[0].children.length === 0 && draft.roots[0].steps.length > 1;

  return {
    direction: singleChain ? 'LR' : 'TD',
    nodes,
    edges,
    ...(draft.title ? { title: draft.title } : {}),
    ...(draft.truncated ? { notice: `Schemă prescurtată la primii ${SCHEMA_MAX_NODES} pași` } : {}),
  };
}
