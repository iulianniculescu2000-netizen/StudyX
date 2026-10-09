import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuizStore } from '../store/quizStore';
import { useStatsStore } from '../store/statsStore';
import { useExamDate } from './examDateHook';
import {
  avgSecondsPerQuestion, buildCrunchQuiz, collectCrunchPool, crunchOptions, shouldShowCrunch, CRUNCH_QUIZ_ID,
} from './examCrunch';

const ENABLED_KEY = 'studyx.crunch.enabled';
const CHANGE_EVENT = 'studyx-crunch-enabled';

function readEnabled(): boolean {
  try { return localStorage.getItem(ENABLED_KEY) === '1'; } catch { return false; }
}

/** Comutatorul „arată modul pe Panou”: o preferință a spectatorului, deci rămâne în browser. */
export function useCrunchEnabled(): [boolean, (value: boolean) => void] {
  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener(CHANGE_EVENT, notify);
    window.addEventListener('storage', notify);
    return () => { window.removeEventListener(CHANGE_EVENT, notify); window.removeEventListener('storage', notify); };
  }, []);
  const enabled = useSyncExternalStore(subscribe, readEnabled, () => false);
  const set = useCallback((value: boolean) => {
    try { localStorage.setItem(ENABLED_KEY, value ? '1' : '0'); } catch { /* fără stocare: comutatorul nu se păstrează */ }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return [enabled, set];
}

/** Totul pentru cardul de pe Panou și pagina /aproape-examen, dintr-o singură sursă. */
export function useExamCrunch() {
  const navigate = useNavigate();
  const quizzes = useQuizStore((state) => state.quizzes);
  const sessions = useQuizStore((state) => state.sessions);
  const questionStats = useStatsStore((state) => state.questionStats);
  const { primary } = useExamDate();
  const [enabled, setEnabled] = useCrunchEnabled();

  const pool = useMemo(() => collectCrunchPool(quizzes, questionStats ?? {}), [quizzes, questionStats]);
  const secondsPerQuestion = useMemo(() => avgSecondsPerQuestion(sessions), [sessions]);
  const options = useMemo(() => crunchOptions(pool, secondsPerQuestion), [pool, secondsPerQuestion]);

  const daysLeft = primary && !primary.passed ? primary.daysLeft : null;
  const visible = shouldShowCrunch(primary ? primary.daysLeft : null, primary?.passed ?? false, enabled);

  const start = useCallback((minutes: number) => {
    const quiz = buildCrunchQuiz(pool, minutes, secondsPerQuestion);
    if (!quiz) return false;
    // Un singur set „aproape de examen”, reîmprospătat pe loc, ca să nu se adune o grămadă de copii.
    const { quizzes: current, addQuiz, updateQuiz } = useQuizStore.getState();
    if (current.some((entry) => entry.id === CRUNCH_QUIZ_ID)) updateQuiz(CRUNCH_QUIZ_ID, quiz);
    else addQuiz(quiz);
    navigate(`/play/${CRUNCH_QUIZ_ID}`);
    return true;
  }, [pool, secondsPerQuestion, navigate]);

  return { pool, options, secondsPerQuestion, daysLeft, exam: primary, visible, enabled, setEnabled, start };
}
