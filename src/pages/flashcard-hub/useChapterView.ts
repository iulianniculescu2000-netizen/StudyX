import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuizStore } from '../../store/quizStore';
import { useToastStore } from '../../store/toastStore';
import { applyChapterSplit, findSplittableDecks, summarizeChapterDecks, undoChapterSplit } from '../../lib/chapterDecks';
import { curriculumChapters, type BookCode } from '../../lib/curriculum';
import type { Quiz } from '../../types';
import type { useStatsStore } from '../../store/statsStore';

/** Vederea „Pe capitole” / „Toate pachetele”: parametrii din URL, împărțirea pe capitole și filtrul de carte. */
export function useChapterView(quizzes: Quiz[], questionStats: ReturnType<typeof useStatsStore.getState>['questionStats']) {
  const [searchParams, setSearchParams] = useSearchParams();
  const addToast = useToastStore((state) => state.addToast);
  const [splitting, setSplitting] = useState(false);
  // „Nu acum” la împărțirea pe capitole: ținut doar pe sesiune, cardul revine data viitoare.
  const [dismissedSplits, setDismissedSplits] = useState<string[]>([]);

  const query = searchParams.get('q') ?? '';

  // ── Pe capitole: pachetele de capitol (taguri chapter:/book:), grupate pe cărți ──
  const chapterSections = useMemo(
    () => summarizeChapterDecks(quizzes, questionStats, Date.now()),
    [quizzes, questionStats],
  );
  const splitPlan = useMemo(
    () => findSplittableDecks(quizzes).find((plan) => !dismissedSplits.includes(plan.sourceId)) ?? null,
    [quizzes, dismissedSplits],
  );
  const bookParam = searchParams.get('book');
  const bookFilter: BookCode | null = bookParam === 'K' || bookParam === 'L' || bookParam === 'S' ? bookParam : null;
  const chapterParam = Number(searchParams.get('chapter'));
  const chapterFilter = searchParams.get('chapter') !== null && Number.isInteger(chapterParam) && chapterParam >= 0 && chapterParam < curriculumChapters().length
    ? chapterParam
    : null;
  // Cartea cerută fie direct (?book=), fie prin capitol (?chapter=).
  const activeBook = bookFilter ?? (chapterFilter !== null ? curriculumChapters()[chapterFilter].book : null);
  const hasChapters = chapterSections.length > 0;
  const requestedView = searchParams.get('v');
  const view: 'capitole' | 'pachete' = hasChapters && (bookFilter || chapterFilter !== null || requestedView !== 'pachete') ? 'capitole' : 'pachete';

  const updateParams = (change: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(searchParams);
    change(next);
    setSearchParams(next, { replace: true });
  };
  const setView = (value: 'capitole' | 'pachete') => updateParams((next) => {
    next.delete('book');
    next.delete('chapter');
    if (value === 'pachete') next.set('v', 'pachete'); else next.delete('v');
  });
  const setBook = (book: BookCode | null) => updateParams((next) => {
    next.delete('chapter');
    if (book) next.set('book', book); else next.delete('book');
  });

  const splitDeck = () => {
    if (!splitPlan || splitting) return;
    const source = useQuizStore.getState().quizzes.find((quiz) => quiz.id === splitPlan.sourceId);
    if (!source) return;
    setSplitting(true);
    try {
      const result = applyChapterSplit(source, { plan: splitPlan });
      updateParams((next) => { next.delete('v'); });
      addToast(
        `„${source.title}" e împărțit în ${result.deckIds.length} pachete. Istoricul tău s-a păstrat.`,
        'success',
        10000,
        {
          label: 'Anulează',
          onClick: () => {
            const undone = undoChapterSplit(source.id);
            addToast(undone.restored ? `Pachetul „${source.title}" a fost readus.` : 'Nu am găsit împărțirea de anulat.', undone.restored ? 'info' : 'warning', 5000);
          },
        },
      );
    } finally {
      setSplitting(false);
    }
  };

  const setQuery = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('q', value); else next.delete('q');
    setSearchParams(next, { replace: true });
  };

  return {
    query, setQuery,
    chapterSections, splitPlan, splitting, splitDeck,
    dismissSplit: (sourceId: string) => setDismissedSplits((list) => [...list, sourceId]),
    hasChapters, view, setView, setBook, activeBook, chapterFilter,
  };
}
