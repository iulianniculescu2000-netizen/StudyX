/**
 * Models sometimes draw a flow as ASCII art in an unlabeled code fence
 * (steps joined by `│` / `▼` lines). This turns such a block into mermaid
 * `flowchart TD` source so it is drawn with boxes and arrows instead of code.
 */

const CONNECTOR_LINE_RE = /^[\s│|▼▽↓⬇↧v┃╎┆]+$/;
const CONNECTOR_MARK_RE = /[▼▽↓⬇↧│┃]/;
const BULLET_RE = /^\s*(?:[-–—•·*]|➔|→)\s+/;
const LEADING_MARK_RE = /^(?:\s|[⃣️]|[0-9#*]️?⃣|\p{Extended_Pictographic}|\d+[.)])+/u;

const MAX_STEPS = 14;
const MAX_DETAILS = 3;
const MAX_DETAIL_CHARS = 64;
const MAX_TITLE_CHARS = 80;

/** Languages a model uses for "just text": the fence carries no real code. */
export function isPlainFenceLang(lang: string): boolean {
  return /^(|text|txt|plain|plaintext|ascii|cod|schema|schem[ăa])$/i.test(lang.trim());
}

function clean(text: string, max: number): string {
  const value = text
    .replace(/\*\*|__|`/g, '')
    .replace(/["“”„]/g, "'")
    .replace(/[[\](){}<>#;|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function stripMarks(line: string): string {
  return line.replace(LEADING_MARK_RE, '').trim();
}

/** Mermaid flowchart source for an ASCII flow, or null when the block is not one. */
export function asciiFlowToMermaid(code: string): string | null {
  const lines = code.replace(/\r/g, '').split('\n');
  const connectors = lines.filter((line) => line.trim() && CONNECTOR_LINE_RE.test(line) && CONNECTOR_MARK_RE.test(line));
  if (connectors.length < 2) return null;

  const groups: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    if (CONNECTOR_LINE_RE.test(line) && CONNECTOR_MARK_RE.test(line)) {
      if (current.length) groups.push(current);
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length) groups.push(current);
  if (groups.length < 3 || groups.length > MAX_STEPS) return null;

  const out = ['flowchart TD'];
  groups.forEach((group, index) => {
    const title = clean(stripMarks(group[0]), MAX_TITLE_CHARS) || `Pasul ${index + 1}`;
    const details = group
      .slice(1)
      .map((line) => clean(line.replace(BULLET_RE, ''), MAX_DETAIL_CHARS))
      .filter(Boolean)
      .slice(0, MAX_DETAILS);
    const label = [title, ...details].join('<br/>');
    out.push(`  N${index}["${label}"]`);
    if (index > 0) out.push(`  N${index - 1} --> N${index}`);
  });
  return out.join('\n');
}
