/**
 * (b) answerChecklist — verificare 100% locală a unui răspuns de chat (0 tokeni).
 *
 * Găsește probleme obiective, ieftin de detectat: limbă, sedilă, citări [n] inexistente, liste
 * interminabile, ASCII art, doze fără sursă, text trunchiat, propoziții repetate. Sedila se repară
 * singură (`autoFixed`); restul produc `issues` și, dacă sunt grave, `needsRegeneration` + o
 * instrucțiune scurtă (`fixInstruction`, ~30-45 tokeni) pentru O singură regenerare țintită.
 */
import { HAS_SEDILLA, fixSedilla, normalizeSearchText } from './shared';

export type IssueCode =
  | 'sedilla'
  | 'not-romanian'
  | 'citation-invalid'
  | 'citation-without-sources'
  | 'list-too-long'
  | 'ascii-art'
  | 'dose-unsourced'
  | 'truncated'
  | 'repetition'
  | 'too-long'
  | 'empty';

export interface AnswerIssue {
  code: IssueCode;
  /** error = merită regenerare; warn = doar semnalat / afișat. */
  severity: 'error' | 'warn';
  detail: string;
  /** True dacă `autoFixed` a reparat deja problema fără LLM. */
  autoFixable?: boolean;
}

export interface AnswerCheckInput {
  /** Câte surse numerotate [1..n] a primit modelul în context (0 = fără context). */
  sourceCount: number;
  /** Plafon de elemente de listă (implicit 12). */
  maxListItems?: number;
  /** Plafon de caractere pentru răspuns (implicit 4500; 0 = fără plafon). */
  maxChars?: number;
  /** Răspunsul e în română? (implicit true; false dezactivează testul de limbă, ex. cerere explicită de traducere.) */
  expectRomanian?: boolean;
}

/**
 * Răspunsul pare tăiat la mijloc de propoziție (peste 220 de caractere, fără punctuație la final, ultimul rând nu e un item scurt de
 * listă). Euristică: semnalul sigur e `finish_reason: "length"` al furnizorului; asta e rezerva când el lipsește.
 */
export function looksTruncated(text: string): boolean {
  const trimmed = text.trimEnd();
  return trimmed.length > 220 && !/[.!?:)\]»"”*`]$|```$/.test(trimmed) && !/\n\s*(?:[-*•➔→]|\d+[.)])\s+[^\n]{1,60}$/.test(trimmed);
}

export interface AnswerCheckResult {
  issues: AnswerIssue[];
  /** Răspunsul cu reparațiile gratuite aplicate (sedila). */
  autoFixed: string;
  /** Există cel puțin o problemă „error” care nu se repară local. */
  needsRegeneration: boolean;
  /** Instrucțiune scurtă pentru regenerare țintită (goală dacă nu e nevoie). */
  fixInstruction: string;
}

const RO_MARKERS = new Set([
  'si', 'de', 'la', 'cu', 'in', 'este', 'sunt', 'pentru', 'care', 'nu', 'din', 'pe', 'sau', 'mai', 'se', 'un', 'o', 'ca', 'dar',
  'prin', 'dupa', 'cand', 'ce', 'cel', 'sa', 'au', 'fost', 'poate', 'dintre', 'unui', 'unei', 'doar', 'asa', 'deci',
]);
const EN_MARKERS = new Set([
  'the', 'and', 'of', 'to', 'is', 'are', 'was', 'were', 'in', 'that', 'with', 'for', 'this', 'it', 'as', 'on', 'be', 'by',
  'or', 'which', 'from', 'can', 'will', 'not', 'have', 'has', 'you', 'your', 'but', 'an', 'at', 'these', 'those', 'there',
]);

/** Cuvintele „in” apar în ambele limbi; le ignorăm la numărătoare. */
const AMBIGUOUS = new Set(['in', 'a', 'o', 'un', 'sa', 'ca', 'de']);

function stripCodeAndLinks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ').replace(/https?:\/\/\S+/g, ' ');
}

/** Raport RO/EN pe markeri funcționali; null când textul e prea scurt ca să se judece. */
export function languageBalance(text: string): { ro: number; en: number } | null {
  const words = normalizeSearchText(stripCodeAndLinks(text))
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 15) return null;
  let ro = 0;
  let en = 0;
  for (const w of words) {
    if (AMBIGUOUS.has(w)) continue;
    if (RO_MARKERS.has(w)) ro++;
    if (EN_MARKERS.has(w)) en++;
  }
  return { ro, en };
}

/** Numerele de sursă citate: [1], [2,3], [1-3], [1][2]. */
export function extractCitations(text: string): number[] {
  const nums: number[] = [];
  for (const match of text.matchAll(/\[(\d{1,3}(?:\s*[,–-]\s*\d{1,3})*)\]/g)) {
    const body = match[1];
    if (/[–-]/.test(body)) {
      const [a, b] = body.split(/\s*[–-]\s*/).map(Number);
      if (Number.isFinite(a) && Number.isFinite(b) && b >= a && b - a <= 20) for (let n = a; n <= b; n++) nums.push(n);
      else nums.push(a, b);
    } else {
      body.split(/\s*,\s*/).forEach((n) => nums.push(Number(n)));
    }
  }
  return nums;
}

const DOSE_RE = /\b\d+(?:[.,]\d+)?\s?(?:mg|mcg|µg|ug|g|ml|UI|U|mEq|mmol|mmHg)(?:\s?\/\s?(?:kg|zi|24\s?h|h|dl|l|min))?(?![\p{L}])/gu;
const HEDGE_RE = /verific[aă]|ghid(?:ul)?|din cuno[sș]tin[tț]e generale|conform (?:sursei|ghidului)|\[\d/i;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function listItemCount(text: string): number {
  return text.split('\n').filter((l) => /^\s*(?:[-*•➔→]|\d+[.)])\s+\S/.test(l)).length;
}

function hasAsciiArt(text: string): boolean {
  const lines = text.replace(/```mermaid[\s\S]*?```/g, '').split('\n');
  let run = 0;
  for (const line of lines) {
    const boxy = /[│┌┐└┘├┤┬┴┼═║╔╗╚╝]|^\s*\+[-=]{2,}\+|-{2,}>|<-{2,}|\|\s{2,}\|/.test(line);
    run = boxy ? run + 1 : 0;
    if (run >= 2) return true;
  }
  return false;
}

export function checkAnswer(answer: string, input: AnswerCheckInput): AnswerCheckResult {
  const { sourceCount, maxListItems = 12, maxChars = 4500, expectRomanian = true } = input;
  const issues: AnswerIssue[] = [];
  const text = answer ?? '';

  if (!text.trim()) {
    return {
      issues: [{ code: 'empty', severity: 'error', detail: 'Răspuns gol.' }],
      autoFixed: text,
      needsRegeneration: true,
      fixInstruction: 'Răspunde la întrebare.',
    };
  }

  let autoFixed = text;
  if (HAS_SEDILLA.test(text)) {
    autoFixed = fixSedilla(text);
    issues.push({ code: 'sedilla', severity: 'warn', detail: 'Sedilă (ş/ţ) înlocuită cu virgulă (ș/ț).', autoFixable: true });
  }

  if (expectRomanian) {
    const balance = languageBalance(text);
    if (balance && balance.en >= 6 && balance.en > balance.ro * 1.5) {
      issues.push({ code: 'not-romanian', severity: 'error', detail: `Răspuns în altă limbă (markeri EN ${balance.en} vs RO ${balance.ro}).` });
    }
  }

  const cited = extractCitations(stripCodeAndLinks(text));
  if (cited.length > 0) {
    if (sourceCount <= 0) {
      issues.push({ code: 'citation-without-sources', severity: 'error', detail: `Citări [${[...new Set(cited)].join(', ')}] deși nu există surse.` });
    } else {
      const bad = [...new Set(cited.filter((n) => n < 1 || n > sourceCount))];
      if (bad.length > 0) {
        issues.push({ code: 'citation-invalid', severity: 'error', detail: `Citări inexistente: ${bad.map((n) => `[${n}]`).join(', ')} (sunt doar ${sourceCount} surse).` });
      }
    }
  }

  const items = listItemCount(text);
  if (items > maxListItems) {
    issues.push({ code: 'list-too-long', severity: 'warn', detail: `Listă de ${items} elemente (maxim ${maxListItems}).` });
  }

  if (hasAsciiArt(text)) {
    issues.push({ code: 'ascii-art', severity: 'warn', detail: 'Schemă ASCII; se cere listă cu ➔ sau bloc mermaid.' });
  }

  const unsourced: string[] = [];
  for (const sentence of splitSentences(stripCodeAndLinks(text))) {
    const doses = sentence.match(DOSE_RE);
    if (doses && !HEDGE_RE.test(sentence)) unsourced.push(...doses.map((d) => d.trim()));
  }
  if (unsourced.length > 0) {
    issues.push({
      code: 'dose-unsourced',
      severity: 'warn',
      detail: `Doze/valori fără sursă sau avertisment: ${[...new Set(unsourced)].slice(0, 5).join(', ')}.`,
    });
  }

  if (looksTruncated(text)) {
    issues.push({ code: 'truncated', severity: 'warn', detail: 'Răspunsul pare tăiat la mijloc de propoziție.' });
  }

  const sentences = splitSentences(text).map((s) => normalizeSearchText(s)).filter((s) => s.length > 25);
  if (sentences.length - new Set(sentences).size >= 2) {
    issues.push({ code: 'repetition', severity: 'error', detail: 'Propoziții repetate.' });
  }

  if (maxChars > 0 && text.length > maxChars) {
    issues.push({ code: 'too-long', severity: 'warn', detail: `${text.length} caractere (plafon ${maxChars}).` });
  }

  const blocking = issues.filter((i) => i.severity === 'error' && !i.autoFixable);
  return {
    issues,
    autoFixed,
    needsRegeneration: blocking.length > 0,
    fixInstruction: blocking.length > 0 ? buildFixInstruction(blocking) : '',
  };
}

/** Instrucțiune de regenerare țintită: doar problemele grave, ~30-45 tokeni. */
export function buildFixInstruction(issues: readonly AnswerIssue[]): string {
  const parts: string[] = [];
  const codes = new Set(issues.map((i) => i.code));
  if (codes.has('not-romanian')) parts.push('scrie exclusiv în română');
  if (codes.has('citation-without-sources')) parts.push('scoate toate citările [n]: nu există surse');
  if (codes.has('citation-invalid')) parts.push('citează doar sursele existente [n] din context');
  if (codes.has('repetition')) parts.push('elimină repetițiile');
  if (codes.has('empty')) parts.push('răspunde la întrebare');
  return parts.length ? `Rescrie răspunsul de mai sus: ${parts.join('; ')}. Păstrează conținutul corect.` : '';
}
