import { isTopicPracticeQuiz } from '../../lib/topicMastery';
import { useEffect, useMemo, useState } from 'react';
import { useFolderStore } from '../../store/folderStore';
import { useQuizStore } from '../../store/quizStore';
import { useStatsStore } from '../../store/statsStore';
import { withoutFlashcardFolders } from '../../lib/folderScope';
import { isFlashcardDeck } from '../../lib/deckKind';
import { isRezidentiatQuiz } from '../../lib/rezidentiatBank';
import { isRezidentiatRootFolder } from '../../lib/rezidentiatRoot';
import { buildDueItems } from '../../lib/dueItems';

/** Derived numbers and the flattened folder tree shown by the sidebar. */
export function useSidebarData() {
  const folders = useFolderStore((s) => s.folders);
  const quizzes = useQuizStore((s) => s.quizzes);
  // Primitive selectors: the sidebar re-renders only when these numbers change,
  // not on every questionStats update.
  const totalAnswered = useStatsStore((s) =>
    Object.values(s.questionStats).reduce((a, q) => a + q.timesCorrect + q.timesWrong, 0));

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Aceeași sursă ca /review și /daily-review: doar grile existente, fără intrări retrase, ascunse sau de pachete șterse.
  // Selector primitiv: numărul scadent se recalculează la fiecare schimbare din statistici, dar sidebar-ul se redesenează doar dacă numărul diferă.
  const dueCount = useStatsStore((s) => buildDueItems(s.questionStats, quizzes, now).length);

  // Rezidențiat content (real bank + exam-style AI packs) is browsed only from
  // the Rezidențiat page — every sidebar count for "Toate grilele"/folders
  // stays scoped to the year's coursework, matching what QuizList itself shows.
  const activeQuizCount = useMemo(() => quizzes.filter(q => !q.archived && !isFlashcardDeck(q) && !isRezidentiatQuiz(q) && !isTopicPracticeQuiz(q)).length, [quizzes]);
  const newQuizCount = useMemo(() => quizzes.filter(q => now - q.createdAt < 86400000 * 2 && !isRezidentiatQuiz(q)).length, [quizzes, now]);
  const uncategorizedCount = useMemo(() => quizzes.filter(q => !q.folderId && !isRezidentiatQuiz(q)).length, [quizzes]);
  const folderQuizCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const quiz of quizzes) {
      if (!quiz.folderId || isRezidentiatQuiz(quiz)) continue;
      counts.set(quiz.folderId, (counts.get(quiz.folderId) ?? 0) + 1);
    }
    return counts;
  }, [quizzes]);

  const visibleFolders = useMemo(() => {
    // The "Rezidențiat" quiz folder holds only content already browsable (and
    // now exclusively so) from the dedicated Rezidențiat page — listing it
    // here too would show a folder whose quiz count reads 0 (folderQuizCount
    // excludes rezidențiat quizzes on purpose), which looks like a bug.
    const regularFolders = withoutFlashcardFolders(folders).filter((folder) => !isRezidentiatRootFolder(folder));
    const byParent = new Map<string, typeof folders>();
    regularFolders.forEach((folder) => {
      const key = folder.parentId ?? '__root__';
      byParent.set(key, [...(byParent.get(key) ?? []), folder]);
    });

    const walk = (parentId: string, depth: number): Array<{ folder: typeof folders[number]; depth: number }> => (
      (byParent.get(parentId) ?? []).flatMap((folder) => [
        { folder, depth },
        ...walk(folder.id, depth + 1),
      ])
    );

    return walk('__root__', 0);
  }, [folders]);

  return { dueCount, totalAnswered, activeQuizCount, newQuizCount, uncategorizedCount, folderQuizCount, visibleFolders };
}
