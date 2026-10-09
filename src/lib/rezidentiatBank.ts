/**
 * One-time import of real, verified rezidențiat question banks — extracted
 * from the user's own reference books (text + answer cross-referenced,
 * diacritics restored), not AI-generated. Lazily loaded per-bank so none of
 * these multi-MB datasets touch the main bundle.
 *
 * Every bank file shares one schema: an array of disciplines, each holding
 * specialties, each holding quizzes (one per pathology/chapter). Import
 * builds real nested folders for it — Rezidențiat → discipline → specialty —
 * reusing folders across banks (two banks both containing "Cardiologie" land
 * in the SAME specialty folder), so any future bank just needs a new data
 * file in this shape, no new import logic.
 */
import type { Quiz, QuizImportData } from '../types';
import { parseImportedQuiz } from './quizImport';
import { useQuizStore } from '../store/quizStore';
import { useFolderStore } from '../store/folderStore';
import { REZIDENTIAT_ROOT_NAME } from './rezidentiatRoot';

/** Generic marker on ANY rezidențiat-scoped quiz — every real bank, and AI packs generated in exam style from Residency chapters. */
export const REZIDENTIAT_TAG = 'rezidentiat';

interface BankSpecialty {
  specialty: string;
  quizzes: QuizImportData[];
}
interface BankDiscipline {
  discipline: string;
  specialties: BankSpecialty[];
}

export interface RezidentiatBankInfo {
  id: string;
  tag: string;
  label: string;
  sourceLabel: string;
  description: string;
  load: () => Promise<BankDiscipline[]>;
}

export const REZIDENTIAT_BANKS: RezidentiatBankInfo[] = [
  {
    id: 'lawrence-kumar-v1',
    tag: 'rezidentiat-bank:lawrence-kumar-v1',
    label: 'Lawrence + Kumar',
    sourceLabel: 'Lawrence (chirurgie) + Kumar (medicină internă)',
    description: '~2050 de grile reale de rezidențiat, verificate',
    load: async () => (await import('../data/rezidentiat/lawrence-kumar.json')).default as unknown as BankDiscipline[],
  },
  {
    id: 'modele-grile-v1',
    tag: 'rezidentiat-bank:modele-grile-v1',
    label: 'Modele Grile',
    sourceLabel: 'Cardiologie, Neurologie, Chirurgie, Pediatrie și alte 20+ discipline',
    description: '~2175 de grile reale, organizate pe patologie',
    load: async () => (await import('../data/rezidentiat/modele-grile.json')).default as unknown as BankDiscipline[],
  },
];

/** True for anything that belongs only in the Rezidențiat page, never "Toate grilele" — keep every exclusion filter (QuizList, Sidebar counts, ...) reading this one place. */
export function isRezidentiatQuiz(quiz: Pick<Quiz, 'tags'>): boolean {
  return (quiz.tags ?? []).some((t) => t === REZIDENTIAT_TAG || t.startsWith('rezidentiat-bank:'));
}

export function isBankImported(bank: RezidentiatBankInfo): boolean {
  return useQuizStore.getState().quizzes.some((q) => q.tags?.includes(bank.tag));
}

/** Finds a same-name child folder under `parentId`, or creates one — the reuse that lets two banks share one "Cardiologie" folder instead of duplicating it. */
function findOrCreateFolder(name: string, parentId: string | null, emoji: string): string {
  const { folders, addFolder } = useFolderStore.getState();
  const plainName = (value: string) => value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const existing = folders.find(
    (f) => (f.parentId ?? null) === parentId && plainName(f.name) === plainName(name),
  );
  if (existing) return existing.id;
  return addFolder(name, emoji, 'blue', parentId);
}

export async function importRezidentiatBank(bank: RezidentiatBankInfo): Promise<{ quizzes: number; questions: number }> {
  const disciplines = await bank.load();
  const rootId = findOrCreateFolder(REZIDENTIAT_ROOT_NAME, null, '🩺');

  const created: Quiz[] = [];
  let quizCount = 0;
  let totalQuestions = 0;
  for (const disc of disciplines) {
    const discId = findOrCreateFolder(disc.discipline, rootId, '📚');
    for (const spec of disc.specialties) {
      const specId = findOrCreateFolder(spec.specialty, discId, '🩹');
      for (const quizData of spec.quizzes) {
        const quiz = parseImportedQuiz(quizData, specId);
        // Real exam scoring, not the app's default: -0.25/wrong option, +1/correct.
        quiz.penaltyMode = true;
        quiz.tags = [REZIDENTIAT_TAG, bank.tag];
        quiz.category = spec.specialty;
        created.push(quiz);
        quizCount += 1;
        totalQuestions += quiz.questions.length;
      }
    }
  }
  useQuizStore.getState().addQuizzes(created);
  return { quizzes: quizCount, questions: totalQuestions };
}
