/**
 * Recunoaște în mesajul din chat o cerere de „fă-mi flashcarduri / grile” și scoate din ea ce s-a spus deja
 * (subiect, număr, nivel, folder, tip), ca „cartea de opțiuni” să întrebe doar ce lipsește. Pur: fără rețea și fără store.
 */
import type { FlashcardDifficulty } from '../../ai/flashcardPrompts';
import type { StudyKind } from './studyDestinations';

export type MissingField = 'topic' | 'count' | 'difficulty' | 'folder';

export interface StudyRequest {
  kind: StudyKind;
  /** Subiectul cerut, așa cum l-a scris utilizatorul; gol când nu l-a spus. */
  topic: string;
  count: number | null;
  difficulty: FlashcardDifficulty | null;
  folderName: string | null;
  questionType: 'single' | 'multiple' | null;
  missing: MissingField[];
}

export const MAX_COUNT: Record<StudyKind, number> = { flashcards: 60, quiz: 60 };
export const DEFAULT_COUNT: Record<StudyKind, number> = { flashcards: 15, quiz: 10 };

/** Mapare 1:1 pe caractere (fără diacritice, litere mici), ca pozițiile să rămână valabile și în textul original. */
function fold(text: string): string {
  return Array.from(text).map((char) => (char.normalize('NFD').replace(/[̀-ͯ]/g, '')[0] ?? char).toLowerCase()).join('');
}

const CREATE_VERB = /\b(fa|faci|face|facem|creeaza|creaza|creezi|genereaza|generezi|vreau|imi trebuie|am nevoie|pregateste|construieste|adauga|alcatuieste|scrie|propune)\b/;
// „fișa de observație” nu e o cerere de flashcarduri: doar „fișe de studiu / memorare / recapitulare”.
const FLASHCARD_WORD = /\b(flash ?card\w*|carduri|cartonase|fise de (?:studiu|memor\w+|recapitulare))\b/;
// „teste” singur înseamnă și analize („ce teste se fac pentru lupus”): grile doar cu număr, „un test”, „mini-test” sau „teste grilă”.
const QUIZ_WORD = /\b(gril[aeă]|grile|intrebari|chestionar\w*|\d+\s+(?:de\s+)?teste?|un\s+test|mini-?test\w*|teste?\s+gril\w*)\b/;
const BLOCKERS = /\b(sterge|stergi|muta|redenumeste|arhiveaza|elimina|din documentul|din cursul|din pdf|din fisier\w*|din notite|din textul)\b/;

const NUMBER_WORDS: Record<string, number> = {
  cinci: 5, zece: 10, cincisprezece: 15, douazeci: 20, treizeci: 30, patruzeci: 40, cincizeci: 50, saizeci: 60,
};

function detectCount(folded: string, kind: StudyKind): number | null {
  const objects = '(?:de\\s+)?(?:flash ?card\\w*|carduri|cartonase|fise|gril\\w+|intrebari|teste?)';
  const digits = folded.match(new RegExp(`\\b(\\d{1,3})\\s*${objects}`));
  if (digits) return Math.max(1, Math.min(MAX_COUNT[kind], Number(digits[1])));
  const words = folded.match(new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\s*${objects}`));
  if (words) return NUMBER_WORDS[words[1]];
  return null;
}

/** Nivelul cerut într-un mesaj (și când cererea e din document, unde `detectStudyRequest` se abține). */
export function detectDifficultyInText(text: string): FlashcardDifficulty | null {
  return detectDifficulty(fold(text));
}

function detectDifficulty(folded: string): FlashcardDifficulty | null {
  // „simple” lipsește intenționat: în „grile simple” înseamnă formatul (4 variante), nu nivelul.
  if (/\b(usor|usoare|incepator|de baza|elementar\w*)\b/.test(folded)) return 'easy';
  if (/\b(dificil\w*|greu|grele|grea|avansat\w*|de nivel inalt)\b/.test(folded)) return 'hard';
  if (/\b(mediu|medie|medii|intermediar\w*)\b/.test(folded)) return 'medium';
  if (/\b(mixt\w*|amestecat\w*|variat\w*|de toate nivelurile)\b/.test(folded)) return 'auto';
  return null;
}

function detectFolder(original: string, folded: string): string | null {
  const match = folded.match(/\b(?:in|la|pe)\s+folder(?:ul)?\s+(?:numit\s+|denumit\s+|cu numele\s+)?["„”']?/);
  if (!match || match.index === undefined) return null;
  const start = match.index + match[0].length;
  const tail = original.slice(start);
  const end = tail.search(/["”'](?:\s|$)|[,.;!?]|\s+(?:si|cu|despre|pe|de|la|nivel|dificultate)\b/i);
  const name = (end === -1 ? tail : tail.slice(0, end)).replace(/["„”']/g, '').trim();
  return name.length > 0 && name.length <= 60 ? name : null;
}

const TOPIC_MARKER = /\b(despre|pe tema|pe subiectul|pe subiect|referitoare la|referitor la|legate de|privind|la tema|din capitolul|din capitol|din tema)\b/;
const TOPIC_STOP = /\s+(?:in|la|pe)\s+folder|\s+(?:cu|de)\s+(?:nivel|dificultate)|\s+nivel\s|\s+dificultate|\s+de\s+\d|\s+\d+\s+(?:de\s+)?(?:carduri|flash|gril|intreb)|\s+(?:te rog|please|mersi)|[,;.!?]/;
const VAGUE_TOPIC = /^(asta|aceasta|acest subiect|ce am discutat|ce am vorbit|raspunsul(?: de mai sus| anterior)?|ultimul raspuns|conversatia|tema asta)$/;

const nameWords = (name: string) => fold(name.replace(/\.(pdf|docx|txt|md)$/i, '')).split(/[^a-z0-9]+/).filter((word) => word.length >= 5);

/** „din Kumar” numește o carte din bibliotecă, nu un subiect: acolo cererea se rezolvă pe sursă. */
function namesLibrarySource(foldedTopic: string, sourceNames: readonly string[]): boolean {
  const topicWords = new Set(foldedTopic.split(/[^a-z0-9]+/).filter(Boolean));
  return sourceNames.some((name) => nameWords(name).some((word) => topicWords.has(word)));
}

function detectTopic(original: string, folded: string, sourceNames: readonly string[]): string {
  const match = folded.match(TOPIC_MARKER) ?? matchFrom(folded);
  if (!match || match.index === undefined) return '';
  const prefix = match[1].startsWith('din ') ? match[1].replace(/^din\s+/, '') : '';
  const start = match.index + match[0].length;
  const foldedTail = folded.slice(start);
  const stop = foldedTail.search(TOPIC_STOP);
  const raw = (stop === -1 ? original.slice(start) : original.slice(start, start + stop)).replace(/^[\s:„"'-]+|[\s„"'.,;:!?]+$/g, '');
  const topic = prefix ? `${prefix} ${raw}`.trim() : raw.trim();
  if (topic.length < 3 || VAGUE_TOPIC.test(fold(topic))) return '';
  if (match[1] === 'din' && namesLibrarySource(fold(topic), sourceNames)) return '';
  return topic.length > 120 ? topic.slice(0, 120).trim() : topic;
}

/** Fără niciun „despre / pe tema”, un „din <subiect>” e subiectul; potrivire în forma celorlalți marcatori, cu grupul 1 = „din”. */
function matchFrom(folded: string): RegExpMatchArray | null {
  const match = folded.match(/\b(din)\s+(?=\S)/);
  return match && match.index !== undefined ? match : null;
}

/**
 * Cererea de generare din mesaj, sau `null` dacă mesajul e altceva (întrebare, explicație, o comandă pe care o face planificatorul).
 * `sourceNames`: cărțile din bibliotecă, ca „din Kumar” să rămână cerere pe sursă și nu un subiect numit „Kumar”.
 */
export function detectStudyRequest(text: string, sourceNames: readonly string[] = []): StudyRequest | null {
  const original = (text ?? '').trim();
  if (original.length < 6 || original.length > 600) return null;
  const folded = fold(original);

  if (BLOCKERS.test(folded) || !CREATE_VERB.test(folded)) return null;
  const wantsCards = FLASHCARD_WORD.test(folded);
  const wantsQuiz = QUIZ_WORD.test(folded);
  // „și grile, și flashcarduri” într-un singur mesaj o face planificatorul, pas cu pas.
  if (wantsCards === wantsQuiz) return null;
  // „cum fac flashcarduri?” sau „ce sunt grilele?” sunt întrebări, nu cereri de generare.
  if (/^(cum|ce|cat|care|de ce|cand|unde)\b/.test(folded) && !/\b(fa-mi|fa mi|vreau|genereaza|creeaza)\b/.test(folded)) return null;

  const kind: StudyKind = wantsCards ? 'flashcards' : 'quiz';
  const topic = detectTopic(original, folded, sourceNames);
  const count = detectCount(folded, kind);
  const difficulty = detectDifficulty(folded);
  const folderName = detectFolder(original, folded);
  const questionType = /\b(complement multiplu|raspunsuri multiple|mai multe raspunsuri)\b/.test(folded)
    ? 'multiple'
    : /\bcomplement simplu\b/.test(folded) ? 'single' : null;

  const missing: MissingField[] = [];
  if (!topic) missing.push('topic');
  if (count === null) missing.push('count');
  if (difficulty === null) missing.push('difficulty');
  if (folderName === null) missing.push('folder');
  return { kind, topic, count, difficulty, folderName, questionType, missing };
}
