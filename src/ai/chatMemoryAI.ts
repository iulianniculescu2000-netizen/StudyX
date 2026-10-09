/**
 * LLM-backed halves of the chat memory: turning a stretch of conversation into
 * durable facts about the student, and double-checking an answer that carries
 * doses/thresholds. Both fail open — a missing key, a network error or an
 * unparseable reply just means "no new memory" / "no warning", never an error
 * surfaced to the student, because they run in the background after the reply.
 */
import { createTtlCache, hashText } from '../lib/ai/tokenBudget';
import { requestStructured } from '../lib/ai/structured';
import { MemoryExtractionSchema, VerificationResultSchema, parseStructuredReply } from '../lib/ai/schemas';
import {
  isValidCandidate,
  cleanCandidateText,
  type HistoryTurn,
  type MemoryCandidate,
  type MemoryItem,
} from './chatMemory';

const MAX_CANDIDATES = 4;
const MAX_TURN_CHARS = 500;

/** Parses the extractor's reply into validated candidates (exported for tests). */
export function parseMemoryCandidates(raw: string): MemoryCandidate[] {
  const parsed = parseStructuredReply(raw, MemoryExtractionSchema);
  if (!parsed.ok) return [];
  const out: MemoryCandidate[] = [];
  for (const entry of parsed.data.items) {
    if (isValidCandidate(entry)) out.push({ kind: entry.kind, text: cleanCandidateText(entry.text) });
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

/**
 * Reads recent turns and returns what is worth remembering about the STUDENT
 * (never medical facts — those come from the library). `known` is passed so the
 * model does not re-emit what is already stored.
 */
export async function extractMemoryCandidates(turns: HistoryTurn[], known: MemoryItem[]): Promise<MemoryCandidate[]> {
  const transcript = turns
    .filter((turn) => turn.content.trim())
    .map((turn) => `${turn.role === 'user' ? 'Student' : 'Asistent'}: ${turn.content.replace(/\s+/g, ' ').slice(0, MAX_TURN_CHARS)}`)
    .join('\n');
  const userChars = turns.filter((t) => t.role === 'user').reduce((sum, t) => sum + t.content.trim().length, 0);
  if (userChars < 40) return [];

  const knownBlock = known.length > 0
    ? `Deja reținut (nu repeta):\n${known.slice(0, 25).map((m) => `- ${m.text}`).join('\n')}\n\n`
    : '';

  try {
    const result = await requestStructured({
      schema: MemoryExtractionSchema,
      schemaHint: '{"items":[{"kind":"goal|preference|struggle|fact|commitment","text":"..."}]}',
      label: 'memoryExtraction',
      task: 'analysis',
      messages: [
        {
          role: 'system',
          content: [
            'Ești modulul de memorie al unui asistent de studiu medical. Din conversația de mai jos extragi DOAR informații durabile despre STUDENT, spuse de student.',
            'Tipuri permise:',
            '- goal: obiective și context (examen, dată, an de studiu, specialitate țintă)',
            '- preference: cum învață/cum vrea explicațiile (scurt, cu scheme, cu exemple clinice, ton)',
            '- struggle: concepte pe care le-a spus explicit că nu le înțelege sau la care greșește repetat',
            '- fact: alte fapte personale utile pentru studiu (program, resurse folosite)',
            '- commitment: ceva ce s-a stabilit să se reia ("mâine repetăm X")',
            'REGULI: nu extrage cunoștințe medicale; nu deduce ce nu s-a spus; nu reține date sensibile fără legătură cu studiul; nu repeta ce e deja reținut; maximum ' + MAX_CANDIDATES + ' intrări; dacă nu e nimic durabil, întoarce lista goală.',
            'Formulează fiecare intrare într-o propoziție scurtă, la persoana a treia, în română (ex. "Se pregătește pentru rezidențiat în iulie", "Preferă scheme și tabele").',
            'Răspunde STRICT JSON: {"items":[{"kind":"goal","text":"..."}]}',
          ].join('\n'),
        },
        { role: 'user', content: `${knownBlock}Conversație:\n${transcript}` },
      ],
      temperature: 0,
      maxTokens: 400,
      skipLibraryContext: true,
      light: true,
    });
    if (!result.ok) return [];
    return parseMemoryCandidates(result.raw);
  } catch {
    return [];
  }
}

export interface VerificationIssue { claim: string; reason: string }

export function parseVerificationIssues(raw: string): VerificationIssue[] {
  const parsed = parseStructuredReply(raw, VerificationResultSchema);
  if (!parsed.ok) return [];
  return parsed.data.issues
    .slice(0, 3)
    .map((issue) => ({ claim: issue.claim.slice(0, 160), reason: issue.reason.slice(0, 240) }));
}

/**
 * Second look at an answer that contains doses / thresholds / scores. Flags only
 * claims the reviewer is confident are wrong or clearly outdated — ambiguity and
 * style are not issues. Returns [] on any failure.
 */
const verificationCache = createTtlCache<VerificationIssue[]>();

export async function verifyClinicalAnswer(answer: string, groundingText: string): Promise<VerificationIssue[]> {
  const cacheKey = hashText(answer) + hashText(groundingText.slice(0, 2200));
  const cached = verificationCache.get(cacheKey);
  if (cached) return cached;
  try {
    const result = await requestStructured({
      schema: VerificationResultSchema,
      schemaHint: '{"issues":[{"claim":"...","reason":"..."}]}',
      label: 'clinicalVerification',
      task: 'analysis',
      messages: [
        {
          role: 'system',
          content: [
            'Ești examinator medical strict. Verifici doar afirmațiile cu valori numerice, doze, praguri, scoruri sau criterii dintr-un răspuns dat unui student.',
            groundingText
              ? `Sursa din biblioteca studentului (referință principală când e relevantă):\n"""\n${groundingText.slice(0, 2200)}\n"""`
              : 'Nu ai o sursă atașată: verifică pe baza cunoștințelor medicale general acceptate și STABILE.',
            'Semnalează o afirmație DOAR când ești sigur că e greșită sau clar depășită. NU semnala nuanțe, variații între ghiduri sau formulări.',
            'Răspunde STRICT JSON: {"issues":[{"claim":"afirmația exactă, scurtă","reason":"o propoziție: ce e greșit și care e varianta corectă"}]} — sau {"issues":[]} dacă totul e în regulă.',
          ].join('\n'),
        },
        { role: 'user', content: `Răspuns de verificat:\n${answer.slice(0, 3600)}` },
      ],
      temperature: 0,
      maxTokens: 500,
      skipLibraryContext: true,
    });
    if (!result.ok) return [];
    const issues = parseVerificationIssues(result.raw);
    verificationCache.set(cacheKey, issues);
    return issues;
  } catch {
    return [];
  }
}
