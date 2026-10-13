import type { Question, Quiz } from '../types';
import { TOPIC_PRACTICE_TAG } from './topicMastery';

const uid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

export const AI_PRACTICE_COUNT = 5;

/** Un set per subiect, refolosit la fiecare lansare: separat de „Exersare: …”, ca să nu șteargă întrebările tale proprii. */
export const aiPracticeTitle = (topic: string) => `Grile noi: ${topic}`;

/** Setul de grile generate pe un subiect: etichetat `topic-practice`, ca răspunsurile să mute scorul subiectului. */
export function buildAiPracticeQuiz(topic: string, questions: readonly Question[]): Quiz | null {
  if (questions.length === 0) return null;
  return {
    id: uid(),
    title: aiPracticeTitle(topic),
    description: `${questions.length} grile generate de AI despre „${topic}”.`,
    emoji: '✨',
    color: 'blue',
    category: 'Altele',
    kind: 'quiz',
    folderId: null,
    shuffleQuestions: true,
    shuffleAnswers: true,
    tags: ['ai', 'recovery', TOPIC_PRACTICE_TAG],
    questions: questions.map((question) => ({ ...question, id: uid(), tags: [topic], options: question.options.map((option) => ({ ...option, id: uid() })) })),
    createdAt: Date.now(),
  };
}

/**
 * Generează grile noi pe subiect, doar pe subiect (fără topicuri slabe sau greșeli din alte teme: vezi `generateQuestionsFromTopic`).
 * Aruncă dacă AI-ul nu livrează nimic; apelantul arată motivul în clar.
 */
export async function generateAiPracticeQuiz(topic: string, profileId: string | null, count = AI_PRACTICE_COUNT): Promise<Quiz> {
  const { generateQuestionsFromTopic, getUserProfile } = await import('../ai/AIEngine');
  const profile = profileId ? getUserProfile(profileId) : null;
  const result = await generateQuestionsFromTopic(topic, count, profile?.currentDifficulty ?? 'medium', 'single', profile);
  const quiz = buildAiPracticeQuiz(topic, result.questions);
  if (!quiz) throw new Error(`Nu am putut genera grile despre „${topic}”.`);
  return quiz;
}
