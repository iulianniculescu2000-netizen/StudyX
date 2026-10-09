/**
 * Pulling JSON out of a model reply.
 *
 * Two failure modes this exists to survive:
 *
 * 1. A conversational preamble. Slicing from the first `{` anywhere in the text
 *    breaks the moment the model writes "Sigur! Iată {desigur} rezultatul:" —
 *    the slice then starts inside the chit-chat.
 * 2. A reply cut off by `max_tokens`. Slicing to the last `]` lands on some
 *    inner array, so the whole batch fails to parse and every complete item in
 *    it is thrown away, even though they were perfectly usable.
 */

function stripFences(raw: string): string {
  return raw.replace(/```(?:json)?/gi, '```').replace(/```/g, '').trim();
}

/**
 * Index just past the balanced value starting at `start`, or -1 if it never
 * closes. String contents are skipped so braces inside text don't count.
 */
function findBalancedEnd(text: string, start: number): number {
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { if (inString) escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * The longest self-contained JSON value in the reply that actually parses.
 * Longest rather than first, because a preamble can itself contain something
 * technically parseable while the real payload is the substantial one.
 */
export function extractBalancedJson(raw: string): string | null {
  const cleaned = stripFences(raw);
  let best: string | null = null;

  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    if (ch !== '{' && ch !== '[') continue;
    const end = findBalancedEnd(cleaned, i);
    if (end === -1) continue;
    const candidate = cleaned.slice(i, end);
    if (best !== null && candidate.length <= best.length) continue;
    try {
      JSON.parse(candidate);
      best = candidate;
    } catch {
      // Not JSON — keep scanning.
    }
  }
  return best;
}

/**
 * Index of the first `[` that opens an array of objects (`[{` or `[ {`), or -1.
 * A preamble can hold a stray `[note]`, and a cut-off reply can end inside an
 * inner `"options": [...]`, so the outermost array of objects is the one to keep.
 */
function findArrayOfObjectsStart(text: string): number {
  const match = /\[\s*\{/.exec(text);
  return match ? match.index : -1;
}

/**
 * Rebuilds an array from the complete objects of a truncated one. A reply cut
 * mid-object still usually carries several finished questions before the cut;
 * this keeps those instead of discarding the batch.
 */
export function salvageJsonArrayObjects(raw: string): string | null {
  const cleaned = stripFences(raw);
  const start = findArrayOfObjectsStart(cleaned);
  if (start === -1) return null;

  const objects: string[] = [];
  let i = start + 1;
  while (i < cleaned.length) {
    const ch = cleaned[i];
    if (ch === ']') break;
    if (ch !== '{') { i += 1; continue; }

    const end = findBalancedEnd(cleaned, i);
    if (end === -1) break; // cut off mid-object — keep whatever came before it
    const candidate = cleaned.slice(i, end);
    try {
      JSON.parse(candidate);
      objects.push(candidate);
    } catch {
      // Malformed entry — skip it rather than lose the rest.
    }
    i = end;
  }

  return objects.length > 0 ? `[${objects.join(',')}]` : null;
}

/**
 * A JSON array string ready to parse: the intact array when the reply is whole,
 * otherwise as many complete elements as survived the truncation.
 */
export function extractJsonArrayLenient(raw: string): string | null {
  const cleaned = stripFences(raw);
  const start = findArrayOfObjectsStart(cleaned);
  if (start !== -1) {
    const end = findBalancedEnd(cleaned, start);
    if (end !== -1) {
      const whole = cleaned.slice(start, end);
      try {
        JSON.parse(whole);
        return whole;
      } catch {
        // Balanced but malformed — fall through to salvage.
      }
    }
    return salvageJsonArrayObjects(raw) ?? extractBalancedJson(raw);
  }
  const balanced = extractBalancedJson(raw);
  if (balanced && balanced.trimStart().startsWith('[')) return balanced;
  return salvageJsonArrayObjects(raw) ?? balanced;
}

// ── Loose parsing for structured outputs ─────────────────────────────────────

/** Reasoning models prepend a `<think>` block; its braces must not be mistaken for the payload. */
function stripReasoning(raw: string): string {
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/i, '');
}

function tryParse(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    // Trailing commas are the commonest slip; retry once with them removed.
    try {
      return { ok: true, value: JSON.parse(text.replace(/,\s*([}\]])/g, '$1')) };
    } catch {
      return { ok: false };
    }
  }
}

/**
 * Best-effort closing of a value cut off by `max_tokens`: ends an open string,
 * drops a dangling comma or key and appends the missing brackets. Only
 * meaningful for flat-ish objects — arrays of objects are better served by
 * `salvageJsonArrayObjects`, which discards the half-written last element.
 */
export function closeTruncatedJson(text: string): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (escaped) { escaped = false; continue; }
    if (inString) {
      if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  if (stack.length === 0 && !inString) return text;
  let out = text;
  if (inString) out = (escaped ? out.slice(0, -1) : out) + '"';
  out = out.replace(/\s+$/, '');
  // A key written without its value ("rule") cannot be repaired honestly.
  if (/[{,]\s*"[^"]*"$/.test(out) && stack[stack.length - 1] === '}') return null;
  if (out.endsWith(',')) out = out.slice(0, -1);
  else if (out.endsWith(':')) out += 'null';
  return out + stack.reverse().join('');
}

export interface LooseJson {
  value: unknown;
  /** True when the reply was cut off and only part of it could be recovered. */
  truncated: boolean;
}

/**
 * The JSON value a model reply carries, as a parsed value — or null when there
 * is none. Survives code fences, `<think>` blocks, chatty preambles/epilogues,
 * trailing commas and replies cut off mid-way (complete array elements are kept).
 *
 * The OUTERMOST value wins, not the longest inner one: for a truncated
 * `{"questions":[q1,q2,q3…` the longest closed region is a single question, and
 * returning that would silently discard the rest of the batch.
 */
export function parseJsonLoose(raw: string): LooseJson | null {
  const cleaned = stripFences(stripReasoning(raw));
  if (!cleaned) return null;

  const direct = tryParse(cleaned);
  if (direct.ok && direct.value !== null && typeof direct.value === 'object') {
    return { value: direct.value, truncated: false };
  }

  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    if (ch !== '{' && ch !== '[') continue;
    const end = findBalancedEnd(cleaned, i);

    if (end !== -1) {
      const slice = cleaned.slice(i, end);
      const parsed = tryParse(slice);
      if (parsed.ok) return { value: parsed.value, truncated: false };
      // Balanced but malformed: keep its finished elements if it holds an array of objects.
      const salvaged = salvageJsonArrayObjects(slice);
      if (salvaged) return { value: JSON.parse(salvaged), truncated: false };
      continue; // e.g. a "{desigur}" in the preamble
    }

    // Never closes: the reply was cut off.
    const tail = cleaned.slice(i);
    const salvaged = salvageJsonArrayObjects(tail);
    if (salvaged) return { value: JSON.parse(salvaged), truncated: true };
    const closed = closeTruncatedJson(tail);
    if (closed) {
      const parsed = tryParse(closed);
      if (parsed.ok && parsed.value !== null && typeof parsed.value === 'object') {
        return { value: parsed.value, truncated: true };
      }
    }
  }
  return null;
}

/** True when the reply holds anything that could even be a JSON value — nothing to repair otherwise. */
export function looksLikeJson(raw: string): boolean {
  return /[{[]/.test(stripReasoning(raw));
}
