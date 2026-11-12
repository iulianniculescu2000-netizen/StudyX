import type { ErrorTypeId, Question } from '../types';
import type { ErrorEntry } from './errorNotebook';

export type { ErrorTypeId } from '../types';

export interface ErrorTypeInfo {
  id: ErrorTypeId;
  label: string;
  /** O frază: ce înseamnă tipul pentru student. */
  description: string;
  /** Întrebare-șablon pentru varianta fără AI: caută exact acest tip de rupere. */
  probe: string;
}

/** Ordinea e și ordinea din interfață. */
export const ERROR_TYPES: readonly ErrorTypeInfo[] = [
  {
    id: 'definitie',
    label: 'Definiție',
    description: 'Ai confundat sau nu ai știut sensul exact al unui termen, criteriu sau prag.',
    probe: 'Cum ai defini, în cuvintele tale, termenul-cheie din enunț?',
  },
  {
    id: 'mecanism',
    label: 'Mecanism',
    description: 'Știi termenii, dar lanțul cauză-efect (fiziopatologia) s-a rupt undeva.',
    probe: 'Care este primul pas al mecanismului și ce urmează din el, pe rând?',
  },
  {
    id: 'exceptie',
    label: 'Excepție',
    description: 'Ai aplicat regula generală unde întrebarea cerea excepția sau cazul particular.',
    probe: 'Regula generală este valabilă aici? Ce din enunț ar putea face cazul o excepție?',
  },
  {
    id: 'vecin',
    label: 'Vecin adevărat',
    description: 'Varianta aleasă e adevărată în sine, dar aparține altei entități sau nu răspunde la întrebarea pusă.',
    probe: 'Varianta ta ar fi corectă pentru o altă întrebare? Pentru care afecțiune sau situație ar fi adevărată?',
  },
  {
    id: 'inversare',
    label: 'Inversare',
    description: 'Ai citit invers sensul: crește/scade, cauză/consecință, NU/EXCEPTÂND sau „corect” cu „greșit”.',
    probe: 'Ce anume cere enunțul: ce este adevărat, ce este fals sau ce este exceptat? Recitește ultima propoziție.',
  },
];

const BY_ID = new Map<ErrorTypeId, ErrorTypeInfo>(ERROR_TYPES.map((type) => [type.id, type]));

export function errorTypeInfo(id: ErrorTypeId): ErrorTypeInfo {
  return BY_ID.get(id) as ErrorTypeInfo;
}

/** Citire sigură: profilurile mai vechi nu au câmpul, iar un fișier editat de mână poate avea o valoare necunoscută. */
export function normalizeErrorType(value: unknown): ErrorTypeId | undefined {
  return typeof value === 'string' && BY_ID.has(value as ErrorTypeId) ? (value as ErrorTypeId) : undefined;
}

/* ── Indicii din tag-uri și din explicație ─────────────────────────────────────────────────── */

const DISTRACTOR_TAG = /^distractori?:(.+)$/i;

/** Valorile `distractori:<tip>` cunoscute; restul se transmit așa cum sunt, ca indiciu brut. */
const DISTRACTOR_LABELS: Record<string, string> = {
  externa: 'distractori din afara temei (variante din alt capitol sau altă specialitate)',
  externă: 'distractori din afara temei (variante din alt capitol sau altă specialitate)',
  interna: 'distractori din aceeași temă (variante apropiate, ușor de confundat)',
  internă: 'distractori din aceeași temă (variante apropiate, ușor de confundat)',
};

/** Tag-urile `distractori:...` ale întrebării, ca texte scurte de pus în prompt. */
export function distractorTagHints(question: Pick<Question, 'tags'>): string[] {
  const hints: string[] = [];
  for (const tag of question.tags ?? []) {
    const match = DISTRACTOR_TAG.exec(tag.trim());
    if (!match) continue;
    const value = match[1].trim();
    if (!value) continue;
    hints.push(DISTRACTOR_LABELS[value.toLowerCase()] ?? `distractori: ${value}`);
  }
  return [...new Set(hints)];
}

/** Propozițiile din explicație care vorbesc despre de ce altă variantă e greșită (motivul distractorului). */
const DISTRACTOR_SENTENCE = /(distractor|variant[aăe]\s+[A-E]\b|opțiun\w+\s+[A-E]\b|\b[A-E]\)?\s+(?:este|e|nu)\s+(?:greșit|fals|incorect)|nu este corect[ăa]? deoarece|este greșit[ăa]? deoarece|se confund[ăa])/i;

export function distractorExplanationHints(question: Pick<Question, 'explanation'>, max = 2): string[] {
  const text = (question.explanation ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.filter((sentence) => DISTRACTOR_SENTENCE.test(sentence)).slice(0, max).map((sentence) => sentence.slice(0, 220));
}

/* ── Varianta locală (fără cheie AI) ───────────────────────────────────────────────────────── */

/**
 * Trei întrebări-șablon, fără răspunsul corect. Prima ancorează în enunț, a doua în varianta aleasă (dacă o știm),
 * a treia caută mecanismul. Indiciul din tag-ul `distractori:` schimbă a doua întrebare.
 */
export function localSocraticQuestions(question: Pick<Question, 'tags'>): string[] {
  const hints = distractorTagHints(question);
  const second = hints.length > 0
    ? 'Cum ai ales varianta ta? Era una dintre variantele care sună apropiat de întrebare, dar țin de altă temă?'
    : 'De ce ai ales varianta ta? Ce din enunț te-a făcut să o crezi corectă?';
  return [
    'Ce anume cere enunțul? Spune-o în cuvintele tale, fără să te uiți la variante.',
    second,
    'Care este mecanismul sau regula pe care te-ai sprijinit? Spune-o pas cu pas.',
  ];
}

/* ── Agregare ──────────────────────────────────────────────────────────────────────────────── */

export interface ErrorTypeRow {
  type: ErrorTypeId;
  label: string;
  /** Câte întrebări au tipul acesta. */
  questions: number;
  /** Suma greșelilor pe acele întrebări. */
  wrong: number;
  /** 0–100, din totalul întrebărilor categorisate. */
  share: number;
}

export interface ErrorTypeSummary {
  rows: ErrorTypeRow[];
  typed: number;
  untyped: number;
}

/** Numără pe tipuri doar intrările categorisate; cele fără tip rămân într-un contor separat. */
export function summarizeErrorTypes(entries: readonly ErrorEntry[]): ErrorTypeSummary {
  const acc = new Map<ErrorTypeId, { questions: number; wrong: number }>();
  let untyped = 0;
  for (const entry of entries) {
    const type = normalizeErrorType(entry.stat.errorType);
    if (!type) {
      untyped += 1;
      continue;
    }
    const row = acc.get(type) ?? { questions: 0, wrong: 0 };
    row.questions += 1;
    row.wrong += entry.wrong;
    acc.set(type, row);
  }
  const typed = [...acc.values()].reduce((sum, row) => sum + row.questions, 0);
  const rows = ERROR_TYPES.filter((info) => acc.has(info.id))
    .map((info): ErrorTypeRow => {
      const row = acc.get(info.id)!;
      return { type: info.id, label: info.label, questions: row.questions, wrong: row.wrong, share: typed > 0 ? Math.round((row.questions / typed) * 100) : 0 };
    })
    .sort((a, b) => b.questions - a.questions || b.wrong - a.wrong);
  return { rows, typed, untyped };
}
