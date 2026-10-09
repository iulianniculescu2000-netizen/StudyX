import type { QuestionStat, Quiz } from '../types';

/**
 * Profilele împărțite pe capitole de o versiune mai veche au istoricul copiat pe pachetele de capitol, dar copia
 * veche nu e marcată `retired`, deci statisticile o numără de două ori. Marchează acele intrări (idempotent).
 * Întoarce același obiect dacă nu s-a schimbat nimic.
 */
export function retireSplitSourceStats(
  stats: Record<string, QuestionStat>,
  quizzes: Pick<Quiz, 'id' | 'archived' | 'questions'>[],
): Record<string, QuestionStat> {
  const byId = new Map(quizzes.map((quiz) => [quiz.id, quiz]));
  const copiesBySource = new Map<string, Pick<Quiz, 'id' | 'questions'>[]>();
  for (const quiz of quizzes) {
    const cut = quiz.id.indexOf('--');
    if (cut <= 0) continue;
    const sourceId = quiz.id.slice(0, cut);
    const list = copiesBySource.get(sourceId);
    if (list) list.push(quiz);
    else copiesBySource.set(sourceId, [quiz]);
  }

  let next: Record<string, QuestionStat> | null = null;
  for (const [key, stat] of Object.entries(stats)) {
    if (!stat || stat.retired) continue;
    const source = byId.get(stat.quizId);
    if (!source?.archived) continue;
    const copies = copiesBySource.get(stat.quizId);
    if (!copies) continue;
    const hasCopy = copies.some(
      (deck) => deck.questions.some((q) => q.id === stat.questionId) && !!stats[`${deck.id}:${stat.questionId}`],
    );
    if (!hasCopy) continue;
    next ??= { ...stats };
    next[key] = { ...stat, retired: true, nextReview: 0 };
  }
  return next ?? stats;
}
