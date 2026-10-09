import type { Folder } from '../../types';

/** Spreads retrieved chunks across sources instead of letting one document dominate the citation list. */
export function diversifyChunks<T extends { source: string; score: number }>(
  chunks: T[],
  limit: number,
): T[] {
  const bySource = new Map<string, T[]>();
  for (const chunk of chunks) {
    const group = bySource.get(chunk.source) ?? [];
    group.push(chunk);
    bySource.set(chunk.source, group);
  }
  const result: T[] = [];
  for (const group of bySource.values()) {
    if (result.length >= Math.min(3, limit)) break;
    result.push(group[0]);
  }
  for (const chunk of chunks) {
    if (result.length >= limit) break;
    if (!result.includes(chunk)) result.push(chunk);
  }
  return result;
}

/** Best-matching sentence excerpt from a chunk, for the citation preview. */
export function extractRelevantExcerpt(chunkText: string, query: string, maxLen = 220): string {
  const clean = chunkText.replace(/\s+/g, ' ').trim();
  const sentences = clean.match(/[^.!?]+[.!?]*/g) ?? [clean];
  const queryWords = new Set(
    query.toLowerCase().split(/\s+/).filter((w) => w.length > 3),
  );
  let bestSentence = sentences[0];
  let bestScore = -1;
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    const matches = [...queryWords].filter((w) => lower.includes(w)).length;
    if (matches > bestScore) {
      bestScore = matches;
      bestSentence = sentence;
    }
  }
  const idx = clean.indexOf(bestSentence);
  if (idx >= 0) {
    return clean.slice(Math.max(0, idx - 10), idx + bestSentence.length + 60).slice(0, maxLen);
  }
  return clean.slice(0, maxLen);
}

/** Folder breadcrumb string, e.g. "Rezidențiat / Cardiologie / Aritmii". */
export function formatFolderPath(folders: Folder[], folder: Folder) {
  const byId = new Map(folders.map((item) => [item.id, item]));
  const names = [folder.name];
  let parent = folder.parentId ? byId.get(folder.parentId) : undefined;
  const guard = new Set([folder.id]);
  while (parent && !guard.has(parent.id)) {
    guard.add(parent.id);
    names.unshift(parent.name);
    parent = parent.parentId ? byId.get(parent.parentId) : undefined;
  }
  return names.join(' / ');
}
