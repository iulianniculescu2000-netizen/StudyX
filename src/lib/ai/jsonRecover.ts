/**
 * Tolerant JSON extraction for AI answers. Models routinely return an empty
 * body, wrap JSON in prose/```fences, or get cut off mid-array by the token
 * limit ("Unexpected end of JSON input"). Instead of failing the whole import,
 * we keep every COMPLETE object that arrived before the cut.
 */

/** Raw text -> the complete top-level array items found in it (possibly none). */
export function recoverJsonArray(raw: string | null | undefined): unknown[] {
  if (!raw) return [];
  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
  if (fenced) text = fenced[1].trim();

  // Fast path: the whole thing is valid.
  try {
    const whole = JSON.parse(text);
    if (Array.isArray(whole)) return whole;
    if (whole && typeof whole === 'object') {
      const inner = Object.values(whole as Record<string, unknown>).find(Array.isArray);
      return Array.isArray(inner) ? inner : [whole];
    }
  } catch {
    /* fall through to the salvage scan */
  }

  const start = text.indexOf('[');
  const body = start >= 0 ? text.slice(start + 1) : text;
  const items: unknown[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let objStart = -1;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') {
      if (depth === 0) objStart = i;
      depth += 1;
    } else if (ch === '}') {
      if (depth > 0) depth -= 1;
      if (depth === 0 && objStart >= 0) {
        try {
          items.push(JSON.parse(body.slice(objStart, i + 1)));
        } catch {
          /* skip a malformed object, keep scanning */
        }
        objStart = -1;
      }
    }
  }
  return items;
}

/** Splits text into chunks of at most `maxChars`, breaking on line boundaries
 *  (preferring just before a numbered question so none is cut in half). */
export function chunkLines(lines: string[], maxChars: number): string[] {
  const chunks: string[] = [];
  let cur: string[] = [];
  let len = 0;
  const startsQuestion = (l: string) => /^\s*\d{1,3}\s*[.)]/.test(l);
  for (const line of lines) {
    const over = len + line.length + 1 > maxChars;
    if (cur.length > 0 && (over && (startsQuestion(line) || len + line.length + 1 > maxChars * 1.3))) {
      chunks.push(cur.join('\n'));
      cur = [];
      len = 0;
    }
    cur.push(line);
    len += line.length + 1;
  }
  if (cur.length > 0) chunks.push(cur.join('\n'));
  return chunks;
}
