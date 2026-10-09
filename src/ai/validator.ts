import { extractBalancedJson } from '../lib/jsonExtract';
import type { ValidateJsonResult } from './types';

function extractJson(raw: string) {
  // Previously this sliced from the first `{` or `[` found anywhere, so a
  // conversational opener like "Sigur! Iată {desigur} rezultatul:" made the
  // slice start inside the prose and nothing parsed. The balanced scanner picks
  // the largest region that is actually valid JSON.
  const balanced = extractBalancedJson(raw);
  if (balanced) return balanced;

  // No fully valid region (e.g. trailing commas) — hand the repair pass the
  // widest plausible span rather than giving up here.
  const cleaned = raw.replace(/```json/gi, '```').replace(/```/g, '').trim();
  const starts = [cleaned.indexOf('{'), cleaned.indexOf('[')].filter((value) => value >= 0);
  if (starts.length === 0) return cleaned;
  const start = Math.min(...starts);
  const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  return end < start ? cleaned.slice(start) : cleaned.slice(start, end + 1);
}

function repairJson(raw: string) {
  return extractJson(raw)
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2018|\u2019/g, "'");
}

export function validateJson<T>(raw: string): ValidateJsonResult<T> {
  try {
    return { ok: true, value: JSON.parse(extractJson(raw)) as T };
  } catch {
    const repaired = repairJson(raw);
    try {
      return { ok: true, value: JSON.parse(repaired) as T, repaired };
    } catch (repairError) {
      return {
        ok: false,
        error: repairError instanceof Error ? repairError.message : 'JSON invalid',
        repaired,
      };
    }
  }
}
