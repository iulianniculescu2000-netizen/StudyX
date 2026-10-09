import { spaceProse, structureRawText } from './structure';

/**
 * Pure helpers for the markdown pipeline (no React, no heavy imports): text
 * normalisation, splitting into streamable blocks, fence/math detection and
 * URL safety. Kept separate from the renderer so they can be unit-tested and
 * so the lazy chunk boundary stays obvious.
 */

/** Stand-in for a literal `<br>` the model wrote inside a table cell. */
export const BR_MARK = '';

const MATH_OPEN = '';
const MATH_CLOSE = '';

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})(.*)$/;

// ── Fence-aware line mapping ────────────────────────────────────────────────

interface Segment {
  fence: boolean;
  text: string;
}

/** Splits text into alternating prose / fenced-code segments (fences kept verbatim). */
function segmentByFences(text: string): Segment[] {
  const lines = text.split('\n');
  const segments: Segment[] = [];
  let buffer: string[] = [];
  let fence: { char: string; size: number } | null = null;

  const flush = (isFence: boolean) => {
    if (buffer.length) segments.push({ fence: isFence, text: buffer.join('\n') });
    buffer = [];
  };

  for (const line of lines) {
    const match = FENCE_RE.exec(line);
    if (!fence && match) {
      flush(false);
      fence = { char: match[1][0], size: match[1].length };
      buffer.push(line);
      continue;
    }
    if (fence) {
      buffer.push(line);
      const closing = FENCE_RE.exec(line);
      if (closing && closing[1][0] === fence.char && closing[1].length >= fence.size && closing[2].trim() === '') {
        flush(true);
        fence = null;
      }
      continue;
    }
    buffer.push(line);
  }
  flush(Boolean(fence));
  return segments;
}

// ── Normalisation ───────────────────────────────────────────────────────────

const DISPLAY_MATH_RE = /\$\$[\s\S]+?\$\$/g;
const INLINE_MATH_RE = /(?<![\\$])\$(?!\s)([^$\n]+?)(?<![\s\\])\$(?!\d)/g;
// "costă $5 și" is money, not a formula.
const CURRENCY_RE = /(?<![\\$\w])\$(?=\d+(?:[.,]\d+)?(?:\s|[.,;:!?)]|$))/g;

/**
 * Brings model output to something remark understands: LaTeX delimiters
 * `\( \)` / `\[ \]` become `$`/`$$`, money signs stop being math, literal
 * `<br>` survives inside table cells, and structureRawText rescues dense
 * paragraphs. Math is shielded from the rescue pass (it rewrites `\|`, `\[`).
 */
export function normalizeMarkdown(content: string): string {
  if (!content) return '';
  const shielded: string[] = [];
  const shield = (value: string) => {
    shielded.push(value);
    return `${MATH_OPEN}${shielded.length - 1}${MATH_CLOSE}`;
  };

  const prepared = segmentByFences(content)
    .map((segment) => {
      if (segment.fence) return segment.text;
      let text = segment.text
        .replace(/\\\[([\s\S]+?)\\\]/g, (_m, body: string) => `\n\n$$\n${body.trim()}\n$$\n\n`)
        // A formula alone on its line is display math: remark-math wants the fences on their own lines.
        .replace(/^[ \t]*\$\$([^\n$][^\n]*?)\$\$[ \t]*$/gm, (_m, body: string) => `$$\n${body.trim()}\n$$`)
        .replace(/\\\(([^\n]+?)\\\)/g, (_m, body: string) => `$${body.trim()}$`);
      text = text.replace(CURRENCY_RE, '\\$');
      text = text.replace(DISPLAY_MATH_RE, shield).replace(INLINE_MATH_RE, shield);
      return text.replace(/<br\s*\/?>/gi, BR_MARK);
    })
    .join('\n');

  const structured = spaceProse(structureRawText(prepared));
  const restore = new RegExp(`${MATH_OPEN}(\\d+)${MATH_CLOSE}`, 'g');
  return structured.replace(restore, (_m, index: string) => shielded[Number(index)] ?? '');
}

// ── Detection ───────────────────────────────────────────────────────────────

/** Cheap test: is there anything that looks like a formula? */
export function hasMath(content: string): boolean {
  if (!content.includes('$')) return false;
  return /\$\$[\s\S]+?\$\$/.test(content) || new RegExp(INLINE_MATH_RE.source).test(content);
}

export interface FencedBlock {
  lang: string;
  code: string;
  closed: boolean;
}

/** Every fenced code block in the text, in order (used by tests and by "has a diagram?" checks). */
export function extractFences(content: string): FencedBlock[] {
  const out: FencedBlock[] = [];
  for (const segment of segmentByFences(content)) {
    if (!segment.fence) continue;
    const lines = segment.text.split('\n');
    const open = FENCE_RE.exec(lines[0]);
    if (!open) continue;
    const last = lines.length > 1 ? FENCE_RE.exec(lines[lines.length - 1]) : null;
    const closed = Boolean(last && last[1][0] === open[1][0] && last[1].length >= open[1].length && last[2].trim() === '');
    out.push({
      lang: open[2].trim().split(/\s+/)[0] ?? '',
      code: lines.slice(1, closed ? -1 : undefined).join('\n'),
      closed,
    });
  }
  return out;
}

export function hasMermaid(content: string): boolean {
  return extractFences(content).some((fence) => isMermaidSource(fence.lang, fence.code));
}

const MERMAID_HEADER_RE = /^\s*(?:%%[^\n]*\n\s*)*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|quadrantChart|requirementDiagram|gitGraph|C4Context|sankey-beta|xychart-beta|block-beta)\b/;
const DIAGRAM_LANG_RE = /^(mermaid|flowchart|graph|schema|schem[ăa])$/i;

export function isDiagramLang(lang: string): boolean {
  return DIAGRAM_LANG_RE.test(lang.trim());
}

/** True when the fence should be drawn as a diagram rather than shown as code. */
export function isMermaidSource(lang: string, code: string): boolean {
  const l = lang.trim().toLowerCase();
  if (l === 'mermaid') return true;
  if (l === '' || isDiagramLang(l)) return MERMAID_HEADER_RE.test(code);
  return false;
}

// ── Streaming blocks ────────────────────────────────────────────────────────

export interface MdBlock {
  text: string;
  /** The block ends inside an open fence or `$$` (still being written). */
  open: boolean;
}

/**
 * Splits markdown into top-level blocks at blank lines that sit outside code
 * fences and `$$` math. While a reply streams, every finished block keeps the
 * exact same text, so a memoised renderer skips it and only the tail block is
 * parsed again for each token.
 */
export function splitMarkdownBlocks(content: string): MdBlock[] {
  if (!content) return [];
  const lines = content.split('\n');
  const blocks: MdBlock[] = [];
  let current: string[] = [];
  let fence: { char: string; size: number } | null = null;
  let inMath = false;

  const push = () => {
    // Drop pure-blank buffers; keep text verbatim otherwise.
    if (current.some((line) => line.trim() !== '')) {
      const text = current.join('\n');
      // An indented block continues the previous one (nested list after a blank line).
      const continuation = /^\s{2,}\S/.test(text) && blocks.length > 0;
      if (continuation) {
        const previous = blocks[blocks.length - 1];
        previous.text = `${previous.text}\n\n${text}`;
      } else {
        blocks.push({ text, open: false });
      }
    }
    current = [];
  };

  for (const line of lines) {
    const match = FENCE_RE.exec(line);
    if (fence) {
      current.push(line);
      if (match && match[1][0] === fence.char && match[1].length >= fence.size && match[2].trim() === '') fence = null;
      continue;
    }
    if (match) {
      fence = { char: match[1][0], size: match[1].length };
      current.push(line);
      continue;
    }
    const dollars = (line.match(/\$\$/g) ?? []).length;
    if (dollars % 2 === 1) inMath = !inMath;
    if (line.trim() === '' && !inMath) {
      push();
      continue;
    }
    current.push(line);
  }
  const hadOpen = Boolean(fence) || inMath;
  push();
  if (hadOpen && blocks.length) blocks[blocks.length - 1].open = true;
  return blocks;
}

// ── URLs ────────────────────────────────────────────────────────────────────

/** Only absolute http(s) links (and mailto) survive; everything else becomes inert text. */
export function safeUrl(url: string | undefined | null): string {
  if (!url) return '';
  const trimmed = url.trim();
  // Control characters and whitespace inside the scheme are a classic bypass ("java\tscript:").
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return '';
  return /^(?:https?:\/\/|mailto:)/i.test(trimmed) ? trimmed : '';
}
