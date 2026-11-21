/**
 * Formatul „Set de grile” (ex. „Astm - Set 1.pdf”): fiecare grilă are antetul „Grila N CS|CM · …”, enunț, variante A–E,
 * „Răspuns corect: …”, o explicație pe variantă („A · adevărat «citat din carte»” / „B · fals …”) și „Sursa: carte, p. N”.
 * Se recunoaște după aceste repere și se citește exact, fără AI. Citatele vin din OCR-ul cărții, deci se curăță înainte să
 * ajungă în explicație (diacritice, cuvinte rupte sau lipite, litere citite greșit în termeni medicali).
 */
import { tidyBookText } from '../../pages/quiz-play/relevantDocFormatting';
import type { ParsedQuestion, SourceLine } from './grileParser';

const HEADER_RE = /^Grila\s+(\d+)\s+(CS|CM)\b/u;
const ANSWER_RE = /^Răspuns\s+corect\s*:\s*(.*)$/iu;
const SOURCE_RE = /^Sursa\s*:\s*(.+)$/iu;
const VERDICT_RE = /^([A-E])\s*[·•]\s*(adevărat|fals)\b\s*(.*)$/iu;
const PAGE_HEADER_RE = /^.{3,80}\s+pagina\s+\d+$/iu;
const PAGE_MARK_RE = /^--\s*\d+\s+of\s+\d+\s*--$/iu;
const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;

/** E formatul „Set”? Cere antetul de grilă, cheia și sursa, ca un document obișnuit cu „Răspuns corect” să nu fie confundat. */
export function isSetFormat(lines: SourceLine[]): boolean {
  let headers = 0;
  let answers = 0;
  let verdicts = 0;
  for (const { text } of lines) {
    const line = text.trim();
    if (HEADER_RE.test(line)) headers += 1;
    else if (ANSWER_RE.test(line)) answers += 1;
    else if (VERDICT_RE.test(line)) verdicts += 1;
  }
  return headers >= 1 && answers >= 1 && verdicts >= 2;
}

/**
 * Curățenie pentru un citat din carte. Repară doar ce e sigur: simbolul β al receptorilor, „IgE” scris „lgE”, „AINS” rupt,
 * ghilimele și paranteze deformate, cifre citite ca litere în valori cunoscute, antete de pagină rămase în mijlocul frazei.
 */
export function cleanBookQuote(raw: string): string {
  let text = tidyBookText(raw.replace(/\s+/g, ' ').trim());
  text = text
    .replace(/^[•●▪*]\s*/u, '')
    // antet de pagină pătruns în frază: „Se Boli respiratorii obstructive 951 administrează”
    .replace(/\s+\p{Lu}\p{Ll}+(?:\s+\p{Ll}+){1,3}\s+\d{3}\s+(?=\p{Ll})/gu, ' ')
    // IgE (litera l sau I mică + g + E)
    .replace(/(?<![\p{L}])[lI]gE\b/gu, 'IgE')
    .replace(/\banti[lI]gE\b/giu, 'anti-IgE')
    .replace(/\bAl\s+NS\b/gu, 'AINS')
    // receptori β-adrenergici: p, P, Pr, p1, p,, β citit ca p/P
    .replace(/(?<![\p{L}\d])[pP]r?([12]|,)?\s?-?(?=adrenergic)/gu, (_m, d: string | undefined) => `β${d === ',' ? '1' : (d ?? '')}-`)
    .replace(/β-{2,}/g, 'β-')
    .replace(/Betaragoni/gu, 'Beta2-agoni')
    .replace(/Wheezmg/gu, 'Wheezing')
    .replace(/\s•\s+/gu, '; ')
    // ghilimele și paranteze
    .replace(/\(,,/g, '(„')
    .replace(/,,/g, '„')
    .replace(/„([^„”"']{1,60})["'']{1,2}/gu, '„$1”')
    .replace(/\{(?=[\p{Lu}\p{Ll}]{2,}[ ,)])/gu, '(')
    .replace(/(\p{Lu}{2,})\s*\{/gu, '$1 (')
    // cuvinte lipite din PDF între un mic și o abreviere: „deCSI” → „de CSI”
    .replace(/(\p{Ll}{2,})(?=(?:CSI|BADLA|BADSA|ARLT|LT|PEF|VEMS)\b)/gu, '$1 ')
    // zero citit ca „Q” între cifre, ex. „4Q-60”
    .replace(/(?<=\d)Q(?=[\d-])/g, '0')
    .replace(/\s+([,.;:)])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return text;
}

/** Sursa taie citatele la ~300 de caractere: un citat lung fără sfârșit de frază se marchează cu „…”; unul scurt (listă, fragment) rămâne cum e. */
function closeQuote(text: string): string {
  return text.length >= 270 && !/[.!?…)"”»]$/u.test(text) ? `${text} …` : text;
}

interface Verdict {
  letter: string;
  ok: boolean;
  note: string;
  quote: string;
}

function describeFalse(note: string): string {
  const lower = note.toLowerCase();
  if (lower.includes('sensul inversat')) return 'propoziția cărții, cu sensul inversat';
  if (lower.includes('alt loc')) return 'adevăr din alt loc al paginii, nu răspunde la enunț';
  return note.trim() || 'nu este susținută de textul citat';
}

function joinLetters(letters: string[]): string {
  return letters.join(', ');
}

function buildExplanation(correct: string[], verdicts: Verdict[], source: string | null): string {
  const parts: string[] = [`Răspuns corect: ${joinLetters(correct)}.`];

  // Variantele care citează același pasaj se grupează, ca citatul să nu se repete de trei ori.
  const groups: Array<{ letters: string[]; quote: string }> = [];
  for (const verdict of verdicts.filter((v) => v.ok && v.quote)) {
    const found = groups.find((g) => g.quote === verdict.quote);
    if (found) found.letters.push(verdict.letter);
    else groups.push({ letters: [verdict.letter], quote: verdict.quote });
  }
  for (const group of groups) parts.push(`${joinLetters(group.letters)} — „${group.quote}”`);

  const byNote = new Map<string, string[]>();
  for (const verdict of verdicts.filter((v) => !v.ok)) {
    const reason = describeFalse(verdict.note);
    byNote.set(reason, [...(byNote.get(reason) ?? []), verdict.letter]);
  }
  for (const [reason, letters] of byNote) parts.push(`${joinLetters(letters)} — fals: ${reason}.`);

  if (source) parts.push(`Sursa: ${source}`);
  return parts.join('\n\n');
}

interface Draft {
  number: number;
  kind: 'CS' | 'CM';
  headerLine: string;
  stem: string[];
  options: string[];
  answerRaw: string | null;
  verdicts: Verdict[];
  source: string | null;
  pages: number[];
}

function finish(draft: Draft): ParsedQuestion {
  const warnings: string[] = [];
  const answer = (draft.answerRaw ?? '').toUpperCase().match(/[A-E]/g) ?? [];
  const correct = [...new Set(answer)];
  const text = draft.stem.join(' ').replace(/\s+/g, ' ').trim();
  const options = draft.options.map((raw, index) => ({
    text: raw.replace(/\s+/g, ' ').trim(),
    isCorrect: correct.includes(LETTERS[index]),
  }));

  if (options.length < 2) warnings.push('Variantele nu au putut fi citite complet.');
  if (correct.length === 0) warnings.push('Nu am găsit „Răspuns corect”.');
  const expected = Number(draft.headerLine.match(/·\s*(\d+)\s+corect/iu)?.[1] ?? 0);
  if (expected && correct.length && expected !== correct.length) warnings.push(`Antetul anunță ${expected} corecte, dar cheia are ${correct.length}.`);
  if (draft.kind === 'CS' && correct.length > 1) warnings.push('Grilă cu complement simplu, dar cheia are mai multe răspunsuri.');
  const verdictTrue = draft.verdicts.filter((v) => v.ok).map((v) => v.letter).sort().join('');
  if (draft.verdicts.length && correct.length && verdictTrue !== [...correct].sort().join('')) {
    warnings.push('Explicația marchează alte variante „adevărat” decât cheia: verifică.');
  }

  return {
    text,
    options,
    multipleCorrect: correct.length > 1,
    answerSource: correct.length ? 'explicit' : 'none',
    confidence: warnings.length === 0 ? 'high' : 'low',
    warnings,
    pages: draft.pages.length ? [...new Set(draft.pages)] : undefined,
    explanation: correct.length ? buildExplanation(correct, draft.verdicts, draft.source) : undefined,
  };
}

/** Citește un document în formatul „Set”. */
export function parseSetFormat(lines: SourceLine[]): ParsedQuestion[] {
  const out: ParsedQuestion[] = [];
  let draft: Draft | null = null;
  let phase: 'stem' | 'options' | 'verdicts' | 'done' = 'stem';
  let currentVerdict: Verdict | null = null;
  let quoteBuffer: string[] = [];

  const flushVerdict = () => {
    if (!currentVerdict) return;
    const joined = quoteBuffer.join(' ');
    const match = joined.match(/«([\s\S]*?)(?:»|$)/u);
    if (currentVerdict.ok) currentVerdict.quote = match ? closeQuote(cleanBookQuote(match[1])) : '';
    else currentVerdict.note = joined.replace(/«[\s\S]*$/u, '').trim();
    draft?.verdicts.push(currentVerdict);
    currentVerdict = null;
    quoteBuffer = [];
  };
  const flushDraft = () => {
    flushVerdict();
    if (draft) out.push(finish(draft));
    draft = null;
  };

  for (const source of lines) {
    const line = source.text.replace(/\s+/g, ' ').trim();
    if (!line || PAGE_MARK_RE.test(line) || PAGE_HEADER_RE.test(line)) continue;

    const header = line.match(HEADER_RE);
    if (header) {
      flushDraft();
      draft = { number: Number(header[1]), kind: header[2] as 'CS' | 'CM', headerLine: line, stem: [], options: [], answerRaw: null, verdicts: [], source: null, pages: [] };
      phase = 'stem';
      if (source.page) draft.pages.push(source.page);
      continue;
    }
    if (!draft) continue;
    if (source.page) draft.pages.push(source.page);

    const answer = line.match(ANSWER_RE);
    if (answer) {
      flushVerdict();
      draft.answerRaw = answer[1];
      phase = 'verdicts';
      continue;
    }
    const src = line.match(SOURCE_RE);
    if (src && phase === 'verdicts') {
      flushVerdict();
      draft.source = src[1].trim();
      phase = 'done';
      continue;
    }

    if (phase === 'stem' || phase === 'options') {
      const expectedLetter = LETTERS[draft.options.length];
      const option = expectedLetter ? line.match(new RegExp(`^${expectedLetter}\\s+(?![·•])(\\S.*)$`, 'u')) : null;
      if (option) {
        draft.options.push(option[1]);
        phase = 'options';
      } else if (phase === 'options') {
        // rând continuat al ultimei variante
        draft.options[draft.options.length - 1] += ` ${line}`;
      } else {
        draft.stem.push(line);
      }
      continue;
    }

    if (phase === 'verdicts') {
      const verdict = line.match(VERDICT_RE);
      if (verdict) {
        flushVerdict();
        currentVerdict = { letter: verdict[1].toUpperCase(), ok: verdict[2].toLowerCase() === 'adevărat', note: '', quote: '' };
        quoteBuffer = [verdict[3]];
      } else if (currentVerdict) {
        quoteBuffer.push(line);
      }
    }
  }
  flushDraft();
  return out;
}
