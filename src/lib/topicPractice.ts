import type { QuestionStat, Quiz } from '../types';
import { MASTERED_STREAK } from './errorNotebook';
import { countsForMastery, questionTopics, TOPIC_PRACTICE_TAG } from './topicMastery';

const uid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

/**
 * Un set pe subiect, refolosit la fiecare lansare (vezi `upsertGeneratedQuiz`): un set comun ar pierde
 * întrebările altor subiecte, iar odată cu ele și progresul înregistrat pe ele.
 */
export const topicPracticeTitle = (topic: string) => `Exersare: ${topic}`;

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Sesiune de exersare pe un subiect, din întrebările proprii: întâi cele greșite și scadente,
 * apoi cele nevăzute. Fără AI. Răspunsurile se înregistrează pe copii etichetate `topic-practice`,
 * ca să mute scorul subiectului fără să dubleze statisticile întrebărilor-sursă.
 */
export function buildTopicPracticeQuiz(
  topic: string,
  quizzes: Quiz[],
  stats: Record<string, QuestionStat>,
  limit = 10,
  now: number = Date.now(),
): Quiz | null {
  const scored: { question: Quiz['questions'][number]; score: number }[] = [];
  const seen = new Set<string>();

  for (const quiz of quizzes) {
    if (!countsForMastery(quiz) || (quiz.tags ?? []).includes(TOPIC_PRACTICE_TAG)) continue;
    for (const question of quiz.questions) {
      if (!questionTopics(quiz, question).includes(topic)) continue;
      if (!question.options.some((option) => option.isCorrect)) continue;
      const fingerprint = normalize(question.text);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);

      const stat = stats[`${quiz.id}:${question.id}`];
      if (stat?.retired) continue;
      const answered = stat ? stat.timesCorrect + stat.timesWrong : 0;
      const wrongShare = answered > 0 ? stat!.timesWrong / answered : 0.35;
      const due = stat && stat.nextReview > 0 && stat.nextReview <= now ? 0.5 : 0;
      const closed = (stat?.consecutiveCorrect ?? 0) >= MASTERED_STREAK ? 0.6 : 0;
      scored.push({ question, score: wrongShare + due + Math.min((stat?.timesWrong ?? 0) * 0.1, 0.5) - closed });
    }
  }

  const picked = scored.sort((a, b) => b.score - a.score).slice(0, limit);
  if (picked.length === 0) return null;

  return {
    id: uid(),
    title: topicPracticeTitle(topic),
    description: `Exersare pe subiectul „${topic}”.`,
    emoji: '🎯',
    color: 'red',
    category: 'Altele',
    kind: 'quiz',
    folderId: null,
    shuffleQuestions: true,
    shuffleAnswers: true,
    tags: ['recovery', TOPIC_PRACTICE_TAG],
    questions: picked.map(({ question }) => ({
      ...question,
      id: uid(),
      tags: [topic],
      options: question.options.map((option) => ({ ...option, id: uid() })),
    })),
    createdAt: Date.now(),
  };
}
