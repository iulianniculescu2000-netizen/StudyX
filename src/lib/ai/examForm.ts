/**
 * Controalele de formă ale grilelor generate (agentul „de-polish” din proiectul Grile rezidentiat, ca cod):
 * semnele prin care o grilă se recunoaște că e „făcută de AI”, măsurate pe 1200 de grile reale.
 *
 * Rulează local, gratis, pe fiecare lot, înaintea verificatorului medical. Respinge doar greșelile sigure
 * (trimiteri la carte, opțiuni-paragraf); restul sunt avertismente pentru raportul de conformitate.
 * Nu atinge cheia și nu rescrie nimic din text: singura modificare permisă e poziția opțiunilor (reechilibrarea
 * literei cheii la complementul simplu), și doar când nicio opțiune nu depinde de ordine.
 */
import type { Question } from '../../types';
import type { ExamStyle } from './examStyle';
import { EXAM_PARAMS, apportion, shuffled } from './examBlueprint';

export type FormIssueSeverity = 'error' | 'warn';

export interface FormIssue {
  code:
    | 'metaReference'
    | 'paragraphOption'
    | 'keyGloss'
    | 'uniformLength'
    | 'keyLengthRatio'
    | 'antonymPairs'
    | 'genericStem'
    | 'unsupportedKey';
  severity: FormIssueSeverity;
  message: string;
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Enunț sau opțiune care trimite la sursă: real 0 din 1200 de grile, la generat 22% (Hematologie, Gemini). */
const META_REFERENCE_RE =
  /\bconform\s+(?:cursului|cartii|documentului|textului|capitolului|cadranului|tabelului|figurii|paginii|materialului)\b|\b(?:din|in|dupa)\s+(?:curs(?!\s+de)|carte|textul furnizat|documentul furnizat)\b|\bcadranul\s+\d|\b(?:kumar|lawrence|sinopsis)\b/;

const ANTONYMS: Array<[RegExp, RegExp]> = [
  [/\bcresc|\bcrestere|\bmai mare\b|\bsupra/, /\bscad|\bscadere|\bmai mic\b|\bsub\b/],
  [/\bprecoc/, /\btardiv/],
  [/\banterior/, /\bposterior/],
  [/\bfrecvent/, /\brar\b/],
  [/\bindicat/, /\bcontraindicat/],
  [/\bacut/, /\bcronic/],
];

/** Cel puțin 2 perechi de antonime între opțiunile aceleiași grile (antiteze didactice). */
function antonymPairCount(options: string[]): number {
  const folded = options.map(fold);
  let pairs = 0;
  for (const [a, b] of ANTONYMS) {
    if (folded.some((o) => a.test(o)) && folded.some((o) => b.test(o))) pairs += 1;
  }
  return pairs;
}

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/** Controalele pe o singură grilă. `style` decide cât de strict: pe pista simplă contează doar trimiterile la sursă. */
export function findFormIssues(question: Question, style: ExamStyle = 'residency'): FormIssue[] {
  const issues: FormIssue[] = [];
  const texts = question.options.map((o) => o.text.trim());

  if ([question.text, ...texts].some((t) => META_REFERENCE_RE.test(fold(t)))) {
    issues.push({ code: 'metaReference', severity: 'error', message: 'trimite la carte sau la curs în loc să fie o afirmație de sine stătătoare' });
  }
  if (style !== 'residency') return issues;

  const lengths = texts.map(wordCount);
  if (lengths.some((n) => n > 25) || lengths.filter((n) => n > 14).length >= 3) {
    issues.push({ code: 'paragraphOption', severity: 'error', message: 'opțiuni-paragraf: la examen o opțiune e o afirmație scurtă' });
  }

  const correct = question.options.filter((o) => o.isCorrect);
  const wrong = question.options.filter((o) => !o.isCorrect);

  // O glosă între paranteze doar la cheie o dă de gol (testul orb: recunoscută de 3 din 3 judecători).
  if (correct.length === 1 && wrong.length >= 3 && /\(.+\)/.test(correct[0].text) && !wrong.some((o) => /\(.+\)/.test(o.text))) {
    issues.push({ code: 'keyGloss', severity: 'warn', message: 'doar cheia are paranteză explicativă' });
  }
  if (texts.length >= 4 && lengths.every((n) => n >= 5) && coefficientOfVariation(lengths) < 0.12) {
    issues.push({ code: 'uniformLength', severity: 'warn', message: 'opțiuni de lungime aproape identică' });
  }
  if (correct.length >= 1 && wrong.length >= 2) {
    const keyAvg = correct.reduce((s, o) => s + wordCount(o.text), 0) / correct.length;
    const wrongAvg = wrong.reduce((s, o) => s + wordCount(o.text), 0) / wrong.length;
    if (wrongAvg > 0 && (keyAvg / wrongAvg < 0.45 || keyAvg / wrongAvg > 2.3)) {
      issues.push({ code: 'keyLengthRatio', severity: 'warn', message: 'cheia are lungime foarte diferită de distractori' });
    }
  }
  if (antonymPairCount(texts) >= 2) {
    issues.push({ code: 'antonymPairs', severity: 'warn', message: 'perechi de opuse simetrice între opțiuni' });
  }
  if (/^despre\b.+\b(?:sunt|este)\s+adevărat/i.test(question.text.trim())) {
    issues.push({ code: 'genericStem', severity: 'warn', message: 'enunț generic; examenul întreabă o proprietate anume' });
  }
  return issues;
}

const STOP = new Set(['este', 'sunt', 'care', 'sau', 'prin', 'din', 'pentru', 'cand', 'unei', 'unui', 'mai', 'dar', 'fara', 'sub', 'peste', 'intre', 'dupa', 'cele', 'cel', 'cea', 'lui', 'ale', 'nu', 'si', 'la', 'de', 'in', 'cu', 'pe', 'un', 'o', 'a']);

/** Cuvinte de conținut, fără diacritice, tăiate la 5 litere (potrivește „stenoza”/„stenozei”). */
function contentStems(text: string): string[] {
  return fold(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map((w) => w.slice(0, 5));
}

/**
 * Cât din cuvintele unui răspuns corect se regăsesc în textul sursă (0–1). La examenul real cheile sunt aproape
 * literale (≈64% literale; suprapunere mediană 0,58), deci o cheie fără nicio legătură cu sursa e aproape sigur inventată.
 * Returnează null când nu se poate judeca (răspuns fără cuvinte de conținut sau sursă prea scurtă).
 */
export function keySupport(keyText: string, sourceText: string): number | null {
  if (sourceText.trim().length < 400) return null;
  const words = Array.from(new Set(contentStems(keyText)));
  if (words.length === 0) return null;
  const source = new Set(contentStems(sourceText));
  return words.filter((w) => source.has(w)).length / words.length;
}

/** Sub acest prag o cheie dintr-o grilă din carte e respinsă. Jos de tot, ca parafrazele cinstite să treacă. */
export const MIN_KEY_SUPPORT = 0.2;

/** Opțiuni care depind de ordine sau de celelalte: nu le mutăm. */
const POSITIONAL_RE = /\b(?:ambele|toate|niciuna|nici una|primele|ultimele|de mai sus|de mai jos|prima|ultima)\b|\b[A-Ea-e]\s*(?:și|si|\+|,)\s*[A-Ea-e]\b|\b[A-E]\)/i;

export function isReorderable(question: Question): boolean {
  return question.options.length === 5 && !question.options.some((o) => POSITIONAL_RE.test(fold(o.text)));
}

/**
 * Mută cheia fiecărei grile cu un singur răspuns pe litera trasă din profilul real (C > D > B > E ≈ A), exact pe lot
 * (cu 20 de grile: ~2 pe A, 4 pe B, 6 pe C, 5 pe D, 3 pe E). Modelele pun cheia pe B sau C mult mai des decât examenul.
 * Mutarea e un schimb de locuri între cheie și opțiunea de pe litera-țintă; restul rămân neatinse.
 */
export function rebalanceKeyLetters(questions: Question[], rng: () => number = Math.random): Question[] {
  const eligible = questions
    .map((q, index) => ({ q, index }))
    .filter(({ q }) => q.options.filter((o) => o.isCorrect).length === 1 && isReorderable(q));
  if (eligible.length < 3) return questions;

  const counts = apportion(eligible.length, [...EXAM_PARAMS.singleKeyLetter]);
  const targets = shuffled(counts.flatMap((n, letter) => Array<number>(n).fill(letter)), rng);

  const result = questions.slice();
  eligible.forEach(({ q, index }, i) => {
    const from = q.options.findIndex((o) => o.isCorrect);
    const to = targets[i];
    if (from === to) return;
    const options = q.options.slice();
    [options[from], options[to]] = [options[to], options[from]];
    result[index] = { ...q, options };
  });
  return result;
}

export interface PolishResult {
  questions: Question[];
  /** Grile respinse pentru greșeli sigure de formă, cu motivul. */
  rejected: Array<{ text: string; reasons: string[] }>;
  /** Avertismente pe grilele păstrate (pentru raportul de conformitate). */
  warnings: number;
}

/** Filtrul de formă + reechilibrarea literei cheii, pe un lot generat. Nu apelează niciun model. */
export function polishGeneratedQuestions(
  questions: Question[],
  style: ExamStyle,
  options: { rng?: () => number; rebalance?: boolean; sourceText?: string } = {},
): PolishResult {
  const kept: Question[] = [];
  const rejected: PolishResult['rejected'] = [];
  let warnings = 0;
  for (const question of questions) {
    const issues = findFormIssues(question, style);
    if (style === 'residency' && options.sourceText) {
      const weak = question.options.filter((o) => o.isCorrect).some((o) => {
        const support = keySupport(o.text, options.sourceText ?? '');
        return support !== null && support < MIN_KEY_SUPPORT;
      });
      if (weak) issues.push({ code: 'unsupportedKey', severity: 'error', message: 'răspunsul corect nu se regăsește în textul sursă' });
    }
    const errors = issues.filter((i) => i.severity === 'error');
    if (errors.length > 0) {
      rejected.push({ text: question.text, reasons: errors.map((e) => e.message) });
      continue;
    }
    warnings += issues.length;
    kept.push(question);
  }
  // Dacă filtrul ar goli tot lotul, e mai probabil o regulă prea aspră pentru acest material decât 100% grile proaste.
  if (kept.length === 0 && questions.length > 0) return { questions, rejected: [], warnings };
  const finalQuestions = style === 'residency' && options.rebalance !== false ? rebalanceKeyLetters(kept, options.rng) : kept;
  return { questions: finalQuestions, rejected, warnings };
}
