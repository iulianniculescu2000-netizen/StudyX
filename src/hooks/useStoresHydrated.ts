import { useQuizStore } from '../store/quizStore';
import { useStatsStore } from '../store/statsStore';
import { useNotesStore } from '../store/notesStore';

export type HydratableStore = 'quiz' | 'stats' | 'notes';

/** Doar quizStore expune acum `_hasHydrated`; la celelalte lipsa steagului înseamnă „nu se poate aștepta nimic”, deci true. */
const flag = (state: object): boolean => (state as { _hasHydrated?: boolean })._hasHydrated !== false;

/**
 * Adevărat când toate store-urile cerute sunt hidratate (implicit toate trei).
 * Folosește-l ca paginile să nu afișeze „gol” înainte ca datele profilului să se încarce.
 */
export function useStoresHydrated(...stores: HydratableStore[]): boolean {
  const wanted = stores.length > 0 ? stores : (['quiz', 'stats', 'notes'] as HydratableStore[]);
  const quiz = useQuizStore((s) => (wanted.includes('quiz') ? flag(s) : true));
  const stats = useStatsStore((s) => (wanted.includes('stats') ? flag(s) : true));
  const notes = useNotesStore((s) => (wanted.includes('notes') ? flag(s) : true));
  return quiz && stats && notes;
}
