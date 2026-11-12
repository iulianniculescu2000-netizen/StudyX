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
import { SCHEMA_MAX_NODES } from '../../ai/diagramRules';
import { normalizeLooseSchema } from './schemaLoose';

/** Past this many steps a schema stops being readable in a chat bubble (single source: diagramRules). */
export { SCHEMA_MAX_NODES };

/** Safety valve while reading: nothing past this is even looked at. */
const MAX_READ_STEPS = 80;

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
  /** Book page from a trailing `(p. 350)`: "350" or "350–351". */
  page?: string;
  /** `@Etichetă`: not a new node but an arrow to the step already named so (a loop, or branches merging). */
  ref?: string;
}

interface Entry {
  indent: number;
  /** One step, or several for a `A -> B -> C` line. */
  steps: Step[];
  branch?: string;
  /** Lines written as `a | b | c` share a group: they hang from the same parent. */
  together?: number;
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
// Models also write the edge label as `| 1> text` (numbered branch) at the start of a line.
const PIPE_BRANCH_RE = /^\|\s*(?:\[([^\]]{1,32})\]|(\d{1,2}|da|nu))\s*>\s*/i;
// ...or inline, after the step: `Pas | 1> etichetă` (the text after `>` labels the edge into the step).
const INLINE_EDGE_RE = /\s*\|\s*(?:\d{1,2}|da|nu)?\s*>\s*([^|]+?)\s*$/i;
// A `|` segment that starts with a marker is a sibling step, not a note.
const SIBLING_MARK_RE = /^\s*[?!+~=]\s+\S/;
// Bullets models add out of habit.
const BULLET_RE = /^(?:[-*•–]\s+|\d{1,2}[.)]\s+)/;
const MARK_RE = /^([?!+~.=])(?:\s+|$)/;
const ARROW_RE = /\s*(?:->|→|=>)\s*/;

/** Comparison key for labels: no case, no diacritics, no punctuation. */
function labelKey(label: string) {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// `(p. 350)`, `(pag. 350)`, `(p. 350-351)`, `(pp. 350–351)` at the very end of a step's text; parentheses are required,
// so a "p. 350" inside a label or without them stays text.
const PAGE_REF_RE = /\s*\(\s*(?:p|pp|pag)\.?\s*(\d{1,5})(?:\s*[-–—]\s*(\d{1,5}))?\s*\)\s*$/i;

/** Splits a trailing page reference off `text`: "350" or "350–351" (an interval must go forward). */
function takePage(text: string): { text: string; page?: string } {
  const match = PAGE_REF_RE.exec(text);
  if (!match) return { text };
  const from = Number(match[1]);
  const to = match[2] === undefined ? undefined : Number(match[2]);
  if (from < 1 || (to !== undefined && to <= from)) return { text };
  return { text: text.slice(0, match.index), page: to === undefined ? String(from) : `${from}–${to}` };
}

function parseStep(raw: string, defaultMark: Mark | null): Omit<Step, 'id'> | null {
  let text = raw.trim();
  if (text.startsWith('@')) {
    const ref = cleanText(text.slice(1), MAX_LABEL);
    return ref ? { label: ref, mark: '.', ref } : null;
  }
  let mark: Mark | null = null;
  const markMatch = MARK_RE.exec(text);
  if (markMatch) {
    mark = markMatch[1] as Mark;
    text = text.slice(markMatch[0].length);
  }

  const pipe = text.indexOf('|');
  let labelRaw = pipe === -1 ? text : text.slice(0, pipe);
  let noteRaw = pipe === -1 ? '' : text.slice(pipe + 1);

  // The page goes at the end of the step: after the note when there is one, else after the label.
  const fromNote = takePage(noteRaw);
  noteRaw = fromNote.text;
  let page = fromNote.page;
  if (page === undefined) {
    const fromLabel = takePage(labelRaw);
    if (fromLabel.page !== undefined) {
      labelRaw = fromLabel.text;
      page = fromLabel.page;
    }
  }

  const label = cleanText(labelRaw, MAX_LABEL);
  if (!label) return null;
  const note = cleanText(noteRaw, MAX_NOTE);

  // A question with no marker is almost certainly a decision.
  const resolved: Mark = mark ?? defaultMark ?? (label.endsWith('?') ? '?' : '.');
  return { label, mark: resolved, ...(note ? { note } : {}), ...(page ? { page } : {}) };
}

interface Draft {
  title?: string;
  roots: Entry[];
  /** Real steps read (references to existing steps are not counted). */
  stepCount: number;
  truncated: boolean;
}

const realSteps = (entry: Entry) => entry.steps.filter((step) => !step.ref).length;

/**
 * Keeps whole branches, level by level: every branch shows its start before any
 * branch shows its depth, so a schema never ends in the middle of a decision.
 * Returns how many steps were kept.
 */
function pruneToBudget(draft: Draft, budget: number): number {
  let left = budget;
  let level = draft.roots;
  const kept = new Set<Entry>();
  while (level.length) {
    const next: Entry[] = [];
    for (const entry of level) {
      const cost = realSteps(entry);
      if (cost > left) continue;
      left -= cost;
      kept.add(entry);
      next.push(...entry.children);
    }
    level = next;
  }
  const strip = (entries: Entry[]): Entry[] =>
    entries
      .filter((entry) => kept.has(entry))
      .map((entry) => ({ ...entry, children: strip(entry.children) }));
  draft.roots = strip(draft.roots);
  return budget - left;
}

function readEntries(source: string): Draft {
  // Arborii de text cu emoji și ├─► (o greșeală frecventă a modelelor) se convertesc în formatul compact înainte de citire.
  const lines = normalizeLooseSchema(decodeEntities(source).replace(/\r/g, '')).split('\n');
  const draft: Draft = { roots: [], stepCount: 0, truncated: false };
  const stack: Entry[] = [];
  let seq = 0;
  let groupSeq = 0;

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
    const branchMatch = PIPE_BRANCH_RE.exec(text) ?? BRANCH_RE.exec(text);
    if (branchMatch) {
      const label = branchMatch[1] ?? branchMatch[2];
      branch = cleanText(branchMatch[2] && /^(da|nu)$/i.test(label) ? label.charAt(0).toUpperCase() + label.slice(1).toLowerCase() : label, 28);
      text = text.slice(branchMatch[0].length);
    }
    const inlineEdge = INLINE_EDGE_RE.exec(text);
    if (inlineEdge && !branch) {
      branch = cleanText(inlineEdge[1], 28) || undefined;
      text = text.slice(0, inlineEdge.index);
    }
    if (text.startsWith('>')) text = text.slice(1);

    // A stray arrow at the start ("-> pas") only means "then".
    text = text.replace(/^(?:->|→|=>)\s*/, '');

    // `a | b | c`: several steps on one line are siblings (a single `|` stays a note).
    const segments = text.split('|');
    const siblingLike = segments.length >= 3 || (segments.length === 2 && SIBLING_MARK_RE.test(segments[1]));
    const lineTexts = siblingLike ? segments.map((part) => part.trim()).filter(Boolean) : [text];
    const together = lineTexts.length > 1 ? ++groupSeq : undefined;

    let stop = false;
    for (const lineText of lineTexts) {
      const parts = lineText.split(ARROW_RE).filter((part) => part.trim());
      if (parts.length === 0) continue;

      const steps: Step[] = [];
      for (const part of parts) {
        const parsed = parseStep(part, null);
        if (!parsed) continue;
        steps.push({ ...parsed, id: `${parsed.ref ? 'r' : 'n'}${seq + steps.length + 1}` });
      }
      if (steps.length === 0) continue;

      const added = steps.filter((step) => !step.ref).length;
      if (draft.stepCount + added > MAX_READ_STEPS) {
        draft.truncated = true;
        stop = true;
        break;
      }
      seq += steps.length;
      draft.stepCount += added;

      const entry: Entry = {
        indent,
        steps,
        ...(branch ? { branch } : {}),
        ...(together ? { together } : {}),
        children: [],
      };
      // Irregular indentation: anything not deeper than the open line is a sibling
      // of the nearest shallower ancestor.
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      const parent = stack[stack.length - 1];
      (parent ? parent.children : draft.roots).push(entry);
      stack.push(entry);
    }
    if (stop) break;
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
    ...(step.page ? { page: step.page } : {}),
  };
}

/** Builds nodes and edges from the indentation tree. */
function buildGraph(draft: Draft) {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const seen = new Set<string>();

  const byKey = new Map<string, string>();
  /** Placeholder id of a `@ref` step -> the label it points at, resolved once every step exists. */
  const refs = new Map<string, string>();

  const link = (from: string, to: string, label?: string) => {
    const key = `${from}>${to}`;
    if (from === to || seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, ...(label ? { label } : {}), dashed: false });
  };

  const tailOf = (entry: Entry) => entry.steps[entry.steps.length - 1];
  const isResult = (stepId: string) => refs.has(stepId) || nodes.find((node) => node.id === stepId)?.shape === 'terminal';

  /** Wires a line's own chain and returns the open ends after its children. */
  const declared = new Set<Entry>();
  /** Creates the entry's nodes (or points merged outcomes at their twin). Must run before anything links to it. */
  const declare = (entry: Entry) => {
    if (declared.has(entry)) return;
    declared.add(entry);
    for (const step of entry.steps) {
      if (step.ref) {
        refs.set(step.id, step.ref);
        continue;
      }
      const key = labelKey(step.label);
      // The same outcome reached by several branches is one node they all point at.
      const twin = step.mark === '=' ? byKey.get(`=${key}`) : undefined;
      if (twin) {
        step.id = twin;
        continue;
      }
      nodes.push(toNode(step));
      if (!byKey.has(key)) byKey.set(key, step.id);
      if (step.mark === '=') byKey.set(`=${key}`, step.id);
    }
  };

  const place = (entry: Entry): Step[] => {
    declare(entry);
    for (let i = 1; i < entry.steps.length; i += 1) link(entry.steps[i - 1].id, entry.steps[i].id);

    if (entry.children.length === 0 || tailOf(entry).ref) return [tailOf(entry)];

    const tail = tailOf(entry);
    const fan = tail.mark === '?' || entry.children.some((child) => child.branch);
    return group(entry.children, tail, fan);
  };

  /** `from`: where the group hangs. Returns the open ends of the group. */
  const group = (entries: Entry[], from: Step | null, fan: boolean): Step[] => {
    if (fan) {
      const ends: Step[] = [];
      for (const entry of entries) {
        declare(entry);
        const head = entry.steps[0];
        if (from) link(from.id, head.id, entry.branch);
        ends.push(...place(entry));
      }
      return ends;
    }

    let open: Step[] = from ? [from] : [];
    let i = 0;
    while (i < entries.length) {
      // Entries written on one `a | b | c` line hang from the same open ends.
      let j = i + 1;
      const tog = entries[i].together;
      while (tog !== undefined && j < entries.length && entries[j].together === tog) j += 1;
      // The next line continues from every open end except finished results.
      const sources = open.filter((step) => !isResult(step.id));
      const from2 = sources.length ? sources : open.slice(0, 1);
      const next: Step[] = [];
      for (const entry of entries.slice(i, j)) {
        declare(entry);
        for (const step of from2) link(step.id, entry.steps[0].id, entry.branch);
        next.push(...place(entry));
      }
      open = next;
      i = j;
    }
    return open;
  };

  group(draft.roots, null, false);

  // `@Etichetă` arrows: exact label first, then a unique "contains" match.
  const resolve = (label: string) => {
    const key = labelKey(label);
    const exact = byKey.get(key);
    if (exact || key.length < 3) return exact;
    const partial = [...byKey.entries()].filter(([k]) => !k.startsWith('=') && k.includes(key));
    return partial.length === 1 ? partial[0][1] : undefined;
  };
  const resolved: DiagramEdge[] = [];
  const done = new Set<string>();
  for (const edge of edges) {
    if (refs.has(edge.from)) continue;
    const to = refs.has(edge.to) ? resolve(refs.get(edge.to)!) : edge.to;
    if (!to || to === edge.from) continue;
    const key = `${edge.from}>${to}`;
    if (done.has(key)) continue;
    done.add(key);
    resolved.push({ ...edge, to });
  }
  return { nodes, edges: resolved };
}

/**
 * Parses the compact schema format. Returns null only when there is nothing to
 * draw (fewer than two steps), so the caller can show the code instead.
 */
export function parseSchema(source: string): ParsedDiagram | null {
  const draft = readEntries(source);
  if (draft.stepCount < 2) return null;
  const total = draft.stepCount;
  let shown = total;
  if (total > SCHEMA_MAX_NODES) {
    shown = pruneToBudget(draft, SCHEMA_MAX_NODES);
    draft.truncated = true;
  }

  const { nodes, edges } = buildGraph(draft);
  if (nodes.length < 2 || edges.length === 0) return null;

  // A schema that is a single "A -> B -> C" line reads best left to right.
  const singleChain = draft.roots.length === 1 && draft.roots[0].children.length === 0 && draft.roots[0].steps.length > 1;

  return {
    direction: singleChain ? 'LR' : 'TD',
    nodes,
    edges,
    ...(draft.title ? { title: draft.title } : {}),
    ...(draft.truncated
      ? { notice: `Schemă prescurtată: ${shown} din ${total >= MAX_READ_STEPS ? `peste ${MAX_READ_STEPS}` : total} pași` }
      : {}),
  };
}
