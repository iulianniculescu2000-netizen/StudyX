import type { Question, Quiz } from '../types';
import { useFolderStore } from '../store/folderStore';
import { useQuizStore } from '../store/quizStore';
import { withoutSemicolons } from '../helpers/quizAi';
import { foldText, type PassageQuery } from './bookPassage';
import type { BookCode } from './bookPages';
import type { ErrorEntry } from './errorNotebook';

export const ERROR_CARDS_FOLDER = 'Din caietul de erori';
export const ERROR_CARDS_DECK = 'Din caietul de erori';

const uid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

export const correctAnswersOf = (question: Question): string =>
  question.options.filter((option) => option.isCorrect).map((option) => option.text).join('; ');

/** Fața = întrebarea; verso = răspunsul corect + explicația. Determinist, fără AI. */
export function errorEntryToCard(entry: ErrorEntry): Question {
  const { question } = entry;
  const explanation = question.explanation?.trim();
  const back = [`Răspuns corect: ${correctAnswersOf(question) || '—'}`, explanation ? withoutSemicolons(explanation) : ''].filter(Boolean).join('\n\n');
  return {
    id: uid(),
    text: question.text,
    multipleCorrect: false,
    ...(question.difficulty ? { difficulty: question.difficulty } : {}),
    explanation: '',
    options: [{ id: 'a', text: back, isCorrect: true }],
  };
}

export interface ErrorCardsResult {
  added: number;
  skipped: number;
  deckId: string | null;
}

/**
 * Adaugă cardurile în pachetul „Din caietul de erori” (folder de flashcarduri, creat la prima folosire).
 * O întrebare deja prezentă în pachet (același enunț) nu se dublează la apăsări repetate.
 */
export function addErrorCards(entries: ErrorEntry[]): ErrorCardsResult {
  if (entries.length === 0) return { added: 0, skipped: 0, deckId: null };
  const folders = useFolderStore.getState();
  const folder = folders.folders.find((f) => f.scope === 'flashcards' && !f.parentId && f.name === ERROR_CARDS_FOLDER);
  const folderId = folder?.id ?? folders.addFolder(ERROR_CARDS_FOLDER, '📕', 'red', null, 'flashcards');

  const quizzes = useQuizStore.getState();
  const deck = quizzes.quizzes.find((q) => q.kind === 'flashcard' && q.folderId === folderId && q.title === ERROR_CARDS_DECK);
  const seen = new Set((deck?.questions ?? []).map((q) => foldText(q.text).replace(/\s+/g, ' ').trim()));
  const fresh: Question[] = [];
  let skipped = 0;
  for (const entry of entries) {
    const key = foldText(entry.question.text).replace(/\s+/g, ' ').trim();
    if (seen.has(key)) { skipped += 1; continue; }
    seen.add(key);
    fresh.push(errorEntryToCard(entry));
  }
  if (fresh.length === 0) return { added: 0, skipped, deckId: deck?.id ?? null };

  if (deck) {
    quizzes.updateQuiz(deck.id, { questions: [...deck.questions, ...fresh], updatedAt: Date.now() });
    return { added: fresh.length, skipped, deckId: deck.id };
  }
  const created: Quiz = {
    id: uid(),
    title: ERROR_CARDS_DECK,
    description: 'Carduri din întrebările la care ai greșit.',
    emoji: '📕',
    color: 'red',
    category: 'Altele',
    kind: 'flashcard',
    folderId,
    shuffleQuestions: true,
    shuffleAnswers: false,
    tags: ['flashcards'],
    questions: fresh,
    createdAt: Date.now(),
  };
  quizzes.addQuiz(created);
  return { added: fresh.length, skipped, deckId: created.id };
}

/** Mini-recapitularea: primele `limit` greșeli, în ordinea listei. */
export const pickRecapEntries = (entries: ErrorEntry[], limit = 5): ErrorEntry[] => entries.slice(0, limit);

export const passageQueryOf = (question: Question): PassageQuery => ({
  question: question.text,
  answer: correctAnswersOf(question),
  explanation: question.explanation,
  wrongAnswers: question.options.filter((option) => !option.isCorrect).map((option) => option.text),
});

export interface BookLink { book: BookCode; page: number }

/** „Vezi în carte” fără AI: cea mai bună fereastră locală, doar dacă scorul o justifică. Tăcut (null) la orice eroare. */
export async function findBookLink(question: Question): Promise<BookLink | null> {
  try {
    const [{ findPassageCandidates }, { FALLBACK_MIN_SCORE }] = await Promise.all([import('./bookPassage'), import('./bookAgent')]);
    const [best] = await findPassageCandidates(passageQueryOf(question), 1);
    if (!best || best.score < FALLBACK_MIN_SCORE) return null;
    const first = best.paras[0];
    return { book: first.book, page: first.page };
  } catch {
    return null;
  }
}
