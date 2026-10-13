/** Răspunsurile AI-ului din agentul „Vezi în carte”: parsare tolerantă și verificare strictă a citatelor față de textul cărții. */
import {
  passageFromCandidate,
  textOfPassage,
  verifiedQuotes,
  type BookPassage,
  type HighlightRole,
  type PassageCandidate,
  type PassageHighlight,
} from '../bookPassage';
import type { BookCode } from '../bookPages';

const extractJson = (raw: string): Record<string, unknown> | null => {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const data: unknown = JSON.parse(raw.slice(start, end + 1));
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const strings = (value: unknown): string[] =>
  (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []);

export interface LocatorPlan {
  topic: string;
  terms: string[];
  book: BookCode | null;
  /** Numerele capitolelor din plan (1-39) indicate de localizator. */
  chapters: number[];
}

export function parseLocatorPlan(raw: string): LocatorPlan | null {
  const data = extractJson(raw);
  if (!data) return null;
  const terms = strings(data.terms).map((term) => term.trim()).slice(0, 8);
  if (terms.length === 0) return null;
  const book = data.book === 'K' || data.book === 'L' || data.book === 'S' ? data.book : null;
  const chapters = (Array.isArray(data.chapters) ? data.chapters : [])
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 99)
    .slice(0, 3);
  return { topic: typeof data.topic === 'string' ? data.topic.trim() : '', terms, book, chapters };
}

export interface JudgeSelection {
  verdict: 'supports' | 'related' | 'none';
  paragraphs: string[];
  highlights: Array<{ quote: string; role: HighlightRole }>;
  why?: string;
}

const ROLES: readonly HighlightRole[] = ['answer', 'question', 'distractor'];

export function parseJudgeSelection(raw: string): JudgeSelection | null {
  const data = extractJson(raw);
  if (!data) return null;
  const verdict = data.verdict === 'supports' || data.verdict === 'related' || data.verdict === 'none' ? data.verdict : null;
  if (!verdict) return null;
  const highlights = (Array.isArray(data.highlights) ? data.highlights : [])
    .map((item): { quote: string; role: HighlightRole } | null => {
      if (typeof item === 'string') return { quote: item, role: 'answer' };
      if (!item || typeof item !== 'object') return null;
      const { quote, role } = item as { quote?: unknown; role?: unknown };
      if (typeof quote !== 'string') return null;
      return { quote, role: ROLES.includes(role as HighlightRole) ? (role as HighlightRole) : 'answer' };
    })
    .filter((item): item is { quote: string; role: HighlightRole } => !!item);
  // Compatibilitate cu forma veche („key”: [citate]).
  for (const quote of strings(data.key)) highlights.push({ quote, role: 'answer' });
  return { verdict, paragraphs: strings(data.paragraphs), highlights, why: typeof data.why === 'string' ? data.why.trim() : undefined };
}

/** Evidențierile cu citat găsit identic în text (aduse la forma din text), fără suprapuneri; cele inventate se aruncă. */
export function verifiedHighlights(
  highlights: ReadonlyArray<{ quote: string; role: HighlightRole }>,
  text: string,
): PassageHighlight[] {
  const out: PassageHighlight[] = [];
  const seen = new Set<string>();
  for (const { quote, role } of highlights) {
    const [found] = verifiedQuotes([quote], text);
    if (!found || seen.has(found)) continue;
    seen.add(found);
    out.push({ quote: found, role });
  }
  return out;
}

/**
 * Aplică alegerea judecătorului: `null` când spune că nimic nu susține grila; altfel pasajul ales (paragrafele indicate
 * dintr-un singur candidat), cu citatele verificate și motivul, doar când verdictul e „supports”.
 */
export function applyJudgeSelection(candidates: readonly PassageCandidate[], selection: JudgeSelection): BookPassage | null {
  if (selection.verdict === 'none') return null;
  const ids = selection.paragraphs.map((id) => /^C(\d+)\.(\d+)$/.exec(id.trim())).filter((m): m is RegExpExecArray => !!m);
  const candidateIndex = ids.length ? Number(ids[0][1]) - 1 : 0;
  const candidate = candidates[candidateIndex];
  if (!candidate) return null;
  const chosen = ids.filter((m) => Number(m[1]) - 1 === candidateIndex).map((m) => Number(m[2]) - 1);
  // Paragraful care conține un citat intră în pasaj chiar dacă AI-ul a indicat alt ID din aceeași fereastră.
  const wanted = new Set(chosen);
  for (const { quote } of selection.highlights) {
    const at = candidate.paras.findIndex((para) => verifiedQuotes([quote], para.text).length > 0);
    if (at >= 0 && wanted.size > 0) wanted.add(at);
  }
  const picked = candidate.paras.filter((_, index) => wanted.size === 0 || wanted.has(index));
  const passage = passageFromCandidate({ ...candidate, paras: picked.length ? picked : candidate.paras });
  passage.highlights = verifiedHighlights(selection.highlights, textOfPassage(passage));
  passage.verified = selection.verdict === 'supports';
  if (passage.verified && selection.why) passage.why = selection.why;
  return passage;
}
