import type { Folder, Quiz, QuestionStat, QuizSession } from '../types';
import { isRezidentiatQuiz } from './rezidentiatBank';
import { findRezidentiatRootFolder } from './rezidentiatRoot';
import { findDuplicatesCached, memberKey, type DuplicateReport } from './bankDedup';

export interface SpecialtyOverview {
  folder: Folder;
  /** Display name — the folder's own, or "Alte grile" for quizzes filed straight into a discipline. */
  name: string;
  /** True when these quizzes sit directly in the discipline folder rather than in a specialty subfolder. */
  loose: boolean;
  quizzes: Quiz[];
  questionCount: number;
  answered: number;
  /** Rounded 0–100 share of this specialty's questions answered at least once. */
  progress: number;
}

export interface DisciplineOverview {
  folder: Folder;
  specialties: SpecialtyOverview[];
  quizCount: number;
  questionCount: number;
  answered: number;
  progress: number;
}

export interface ResumeTarget {
  quiz: Quiz;
  disciplineId: string | null;
  lastPlayedAt: number;
}

export interface RezidentiatOverview {
  disciplines: DisciplineOverview[];
  totalQuestions: number;
  totalSpecialties: number;
  resume: ResumeTarget | null;
  /** Duplicate questions among the bank's tests; every group is counted once in the totals above. */
  duplicates: DuplicateReport;
}

const NO_DUPLICATES: DuplicateReport = { groups: [], conflicts: [], duplicateCount: 0, groupOf: new Map() };

const FOLDER_SESSION_PREFIX = 'folder-session:';

/** Stable id of the combined "play everything" session for a folder, so its answers stay attributable. */
export const quizMixId = (folderId: string) => `mix-${folderId}`;

/** A combined session is a way of playing the tests, not a test of its own. */
export const isFolderSessionQuiz = (quiz: Pick<Quiz, 'tags'>) =>
  (quiz.tags ?? []).some((tag) => tag.startsWith(FOLDER_SESSION_PREFIX));

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Natural order so "Test 2" sorts before "Test 10". */
const byTitle = (a: Quiz, b: Quiz) => a.title.localeCompare(b.title, 'ro', { numeric: true });

interface Placement {
  disciplineId: string;
  /** null = the quiz sits directly in the discipline (or in the root). */
  specialtyId: string | null;
}

/**
 * Derives the Rezidențiat → discipline → specialty tree straight from the
 * folders the bank importer already builds, plus how much of it the user has
 * touched (a question counts once it has any recorded attempt).
 *
 * Membership is by *where a quiz is filed*, not only by tag, so a test made
 * with "Grilă nouă" inside a specialty, one an AI agent put in the root, or one
 * whose folder was deleted still shows up (under "Alte grile") instead of
 * vanishing.
 */
export function buildRezidentiatOverview(
  folders: Folder[],
  quizzes: Quiz[],
  questionStats: Record<string, QuestionStat>,
  sessions: QuizSession[],
): RezidentiatOverview {
  const root = findRezidentiatRootFolder(folders);
  if (!root) return { disciplines: [], totalQuestions: 0, totalSpecialties: 0, resume: null, duplicates: NO_DUPLICATES };

  const folderById = new Map(folders.map((f) => [f.id, f]));

  /** Where a folder sits in the tree, or null when it isn't inside Rezidențiat at all. */
  const placeFolder = (folderId: string | null | undefined): Placement | null => {
    if (!folderId) return null;
    if (folderId === root.id) return { disciplineId: root.id, specialtyId: null };
    const chain: Folder[] = [];
    const seen = new Set<string>();
    let current = folderById.get(folderId);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      chain.unshift(current);
      if (current.parentId === root.id) {
        // chain[0] is the discipline; chain[1], when present, the specialty (deeper folders roll up into it).
        return { disciplineId: chain[0].id, specialtyId: chain[1]?.id ?? null };
      }
      current = current.parentId ? folderById.get(current.parentId) : undefined;
    }
    return null;
  };

  const specialtyQuizzes = new Map<string, Quiz[]>(); // specialty folder id → quizzes
  const looseQuizzes = new Map<string, Quiz[]>(); // discipline (or root) folder id → quizzes filed directly in it
  const push = (map: Map<string, Quiz[]>, key: string, quiz: Quiz) => {
    const bucket = map.get(key);
    if (bucket) bucket.push(quiz);
    else map.set(key, [quiz]);
  };

  const bankQuizzes: Quiz[] = [];
  /** Folder whose combined session carries a quiz's answers (its specialty, or the discipline/root when filed loose). */
  const sessionFolderOf = new Map<string, string>();
  for (const quiz of quizzes) {
    if (quiz.archived || quiz.kind === 'flashcard' || isFolderSessionQuiz(quiz)) continue;
    const placement = placeFolder(quiz.folderId);
    if (placement) {
      bankQuizzes.push(quiz);
      sessionFolderOf.set(quiz.id, placement.specialtyId ?? placement.disciplineId);
      if (placement.specialtyId) push(specialtyQuizzes, placement.specialtyId, quiz);
      else push(looseQuizzes, placement.disciplineId, quiz);
    } else if (
      isRezidentiatQuiz(quiz)
      && ((quiz.tags ?? []).some((t) => t.startsWith('rezidentiat-bank:')) || !quiz.folderId || !folderById.has(quiz.folderId))
    ) {
      // A Rezidențiat quiz whose folder was deleted (a bank quiz, or one the AI generated): keep it reachable.
      bankQuizzes.push(quiz);
      sessionFolderOf.set(quiz.id, root.id);
      push(looseQuizzes, root.id, quiz);
    }
  }

  const seen = (key: string) => { const stat = questionStats[key]; return !!stat && stat.timesCorrect + stat.timesWrong > 0; };
  const answeredIn = (quizId: string, questionId: string, folderId: string | undefined) =>
    seen(`${quizId}:${questionId}`)
    || (folderId !== undefined && [quizMixId(folderId), quizMixId(root.id)].some((mixId) => seen(`${mixId}:${questionId}`)));

  // View-level dedupe: a duplicate group counts once, at its primary copy, and is answered when any copy was.
  // Answers given in a combined session are filed under that folder's mix id; sets moved out of the
  // Rezidențiat root (adoptStrayResidencyQuizzes) keep the progress made in the root's session.
  const duplicates = findDuplicatesCached(bankQuizzes);
  const redundant = new Set<string>();
  const groupAnswered = new Set<string>(); // primary keys
  for (const group of duplicates.groups) {
    const primaryKey = memberKey(group.primary.quizId, group.primary.questionId);
    for (const member of group.members) {
      const key = memberKey(member.quizId, member.questionId);
      if (key !== primaryKey) redundant.add(key);
      if (answeredIn(member.quizId, member.questionId, sessionFolderOf.get(member.quizId))) groupAnswered.add(primaryKey);
    }
  }
  /** Questions that count: not a redundant copy, and not hidden on its own (nothing could ever answer it). */
  const counted = (quiz: Quiz) => quiz.questions.filter((question) => {
    const key = memberKey(quiz.id, question.id);
    return !redundant.has(key) && !(question.hidden && !duplicates.groupOf.has(key));
  });

  const summarize = (folder: Folder, name: string, loose: boolean, list: Quiz[]): SpecialtyOverview => {
    const sorted = list.slice().sort(byTitle);
    let questionCount = 0;
    let answered = 0;
    for (const quiz of sorted) {
      for (const question of counted(quiz)) {
        questionCount += 1;
        if (answeredIn(quiz.id, question.id, folder.id) || groupAnswered.has(memberKey(quiz.id, question.id))) answered += 1;
      }
    }
    return { folder, name, loose, quizzes: sorted, questionCount, answered, progress: percent(answered, questionCount) };
  };

  const totals = (specialties: SpecialtyOverview[]) => {
    const questionCount = specialties.reduce((sum, s) => sum + s.questionCount, 0);
    const answered = specialties.reduce((sum, s) => sum + s.answered, 0);
    return {
      quizCount: specialties.reduce((sum, s) => sum + s.quizzes.length, 0),
      questionCount,
      answered,
      progress: percent(answered, questionCount),
    };
  };

  const disciplines: DisciplineOverview[] = folders
    .filter((f) => f.parentId === root.id)
    .map((disciplineFolder) => {
      const specialties: SpecialtyOverview[] = folders
        .filter((f) => f.parentId === disciplineFolder.id)
        .map((specialtyFolder) => summarize(specialtyFolder, specialtyFolder.name, false, specialtyQuizzes.get(specialtyFolder.id) ?? []))
        .filter((s) => s.quizzes.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name, 'ro'));
      // Quizzes filed straight into a discipline (e.g. a hand-made "Grile" folder)
      // would otherwise vanish from this view — surface them as one entry.
      const loose = looseQuizzes.get(disciplineFolder.id) ?? [];
      if (loose.length > 0) specialties.push(summarize(disciplineFolder, 'Alte grile', true, loose));
      return { folder: disciplineFolder, specialties, ...totals(specialties) };
    })
    .filter((d) => d.specialties.length > 0)
    .sort((a, b) => a.folder.name.localeCompare(b.folder.name, 'ro'));

  // Anything filed in the Rezidențiat root itself (or orphaned from a deleted folder) gets its own entry.
  const rootLoose = looseQuizzes.get(root.id) ?? [];
  if (rootLoose.length > 0) {
    const rootEntry = summarize(root, 'Alte grile', true, rootLoose);
    disciplines.push({ folder: { ...root, name: 'Alte grile' }, specialties: [rootEntry], ...totals([rootEntry]) });
  }

  const quizById = new Map(bankQuizzes.map((q) => [q.id, q]));
  const disciplineOfQuiz = new Map<string, string>();
  for (const discipline of disciplines) {
    for (const specialty of discipline.specialties) {
      for (const quiz of specialty.quizzes) disciplineOfQuiz.set(quiz.id, discipline.folder.id);
    }
  }
  let resume: ResumeTarget | null = null;
  for (const session of sessions) {
    const quiz = quizById.get(session.quizId);
    if (!quiz) continue;
    const at = session.finishedAt ?? session.startedAt;
    if (!resume || at > resume.lastPlayedAt) {
      resume = { quiz, disciplineId: disciplineOfQuiz.get(quiz.id) ?? null, lastPlayedAt: at };
    }
  }

  return {
    disciplines,
    totalQuestions: disciplines.reduce((sum, d) => sum + d.questionCount, 0),
    // "Alte grile" is a catch-all entry, not a specialty.
    totalSpecialties: disciplines.reduce((sum, d) => sum + d.specialties.filter((s) => !s.loose).length, 0),
    resume,
    duplicates,
  };
}

type DisciplineId = 'chirurgie' | 'medicina-interna';

const plain = (value: string) => value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Which discipline a reference book belongs to, by its name — null when it spans several (e.g. Sinopsis). */
export function bookDisciplineHint(bookName: string): DisciplineId | null {
  const name = plain(bookName);
  if (/lawrence|chirurg/.test(name)) return 'chirurgie';
  if (/kumar|clark|medicina intern/.test(name)) return 'medicina-interna';
  return null;
}

/** The same key for a discipline folder name, so books and folders compare without diacritics. */
export function disciplineKey(name: string): DisciplineId | null {
  const n = plain(name);
  if (/chirurg/.test(n)) return 'chirurgie';
  if (/medicina intern/.test(n)) return 'medicina-interna';
  return null;
}
