import { useUIStore } from '../store/uiStore';
import type { QuestionStat, Quiz } from '../types';
import { MIN_TOPIC_N, countsAsGrile, shrunkRate, topicsOfQuestion } from './analyticsStats';
import { isFolderSessionQuiz } from './rezidentiatOverview';

/** Deschide asistentul cu întrebarea despre topic scrisă, gata de trimis. Singura cale din Perspective AI care apelează AI-ul. */
export function askAiAboutTopic(topic: string): void {
  const prompt = `Explică-mi, pentru rezidențiat: ${topic}. Unde greșesc cel mai des?`;
  window.dispatchEvent(new CustomEvent('studyx:ai-prompt', { detail: { open: true, prompt } }));
  useUIStore.getState().setChatOpen(true);
}

/**
 * Setul în care ai cea mai slabă acuratețe la topic, cu același prior ca la topicuri (trasă spre 65%). Seturile cu
 * cel puțin 5 încercări în topic au prioritate: un set cu o singură încercare la 0% nu trece înaintea unuia cu
 * 20 de încercări la 55%. Dacă niciun set nu are 5 încercări, se alege cel mai slab dintre toate.
 * Sesiunile combinate (`folder-session:*`, id `mix-…`), pachetele de flashcarduri, seturile arhivate și cele
 * derivate sunt sărite: nu sunt seturi de sine stătătoare. Returnează null dacă niciun set nu se potrivește.
 */
export function findQuizForTopic(
  topic: string,
  quizzes: Quiz[],
  questionStats: Record<string, QuestionStat>,
  folderNameById: ReadonlyMap<string, string>,
): string | null {
  let best: { id: string; rate: number; attempts: number; solid: boolean } | null = null;
  for (const quiz of quizzes) {
    if (!countsAsGrile(quiz) || isFolderSessionQuiz(quiz)) continue;
    let correct = 0;
    let attempts = 0;
    for (const question of quiz.questions) {
      const stat = questionStats[`${quiz.id}:${question.id}`];
      if (!stat || stat.timesCorrect + stat.timesWrong <= 0) continue;
      if (!topicsOfQuestion(quiz, question, folderNameById).includes(topic)) continue;
      correct += stat.timesCorrect;
      attempts += stat.timesCorrect + stat.timesWrong;
    }
    if (attempts === 0) continue;
    const rate = shrunkRate(correct, attempts);
    const solid = attempts >= MIN_TOPIC_N;
    const better = !best
      || (solid && !best.solid)
      || (solid === best.solid && (rate < best.rate || (rate === best.rate && attempts > best.attempts)));
    if (better) {
      best = { id: quiz.id, rate, attempts, solid };
    }
  }
  return best ? best.id : null;
}

/** Ruta pentru „Deschide grile”: setul cel mai slab la topic, altfel recapitularea generală. */
export function quizHrefForTopic(
  topic: string,
  quizzes: Quiz[],
  questionStats: Record<string, QuestionStat>,
  folderNameById: ReadonlyMap<string, string>,
): string {
  const id = findQuizForTopic(topic, quizzes, questionStats, folderNameById);
  return id ? `/quiz/${id}` : '/review';
}
