import { getVaultChunksBySource } from '../../../ai/vectorStore';
import { type Question } from '../../../types';

export function shortId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

/** Reconstruct a source document's text from its indexed vault chunks (capped). */
export async function loadSourceText(sourceId: string, maxChars = 24000): Promise<string> {
  const chunks = await getVaultChunksBySource(sourceId);
  if (chunks.length === 0) return '';
  let out = '';
  for (const chunk of chunks) {
    if (out.length + chunk.text.length > maxChars) {
      out += chunk.text.slice(0, Math.max(0, maxChars - out.length));
      break;
    }
    out += (out ? '\n\n' : '') + chunk.text;
  }
  return out;
}

export function buildAgentFlashcard(front: string, back: string): Question {
  return {
    id: shortId(),
    text: front.trim(),
    multipleCorrect: false,
    difficulty: 'medium',
    explanation: '',
    options: [{ id: 'a', text: back.trim(), isCorrect: true }],
  };
}

export function normalizeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function tokenize(text: string): string[] {
  return text.split(' ').filter((t) => t.length > 1);
}

export function findByName<T extends { name: string }>(items: T[], query: string | undefined): T | null {
  if (!query) return null;
  const target = normalizeName(query);
  if (!target) return null;
  const targetTokens = tokenize(target);
  let best: T | null = null;
  let bestScore = 0;
  for (const item of items) {
    const candidate = normalizeName(item.name);
    if (!candidate) continue;
    let score = 0;
    if (candidate === target) {
      score = 1000;
    } else if (candidate.includes(target) || target.includes(candidate)) {
      score = 200 + Math.min(candidate.length, target.length);
    } else {
      // Token-level overlap: exact token matches + partial (one contains the other)
      const candidateTokens = tokenize(candidate);
      const exactMatches = targetTokens.filter((t) => candidateTokens.includes(t)).length;
      const partialMatches = targetTokens.filter((t) =>
        candidateTokens.some((c) => c.includes(t) || t.includes(c)),
      ).length;
      const union = new Set([...targetTokens, ...candidateTokens]).size;
      score = exactMatches * 40 + partialMatches * 10 - (union - exactMatches) * 2;
    }
    if (score > bestScore) { best = item; bestScore = score; }
  }
  return bestScore > 0 ? best : null;
}
