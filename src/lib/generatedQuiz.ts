import { useQuizStore } from '../store/quizStore';
import type { Quiz } from '../types';

const sameTags = (a: string[] = [], b: string[] = []) =>
  a.length === b.length && a.every((tag) => b.includes(tag));

/**
 * Seturile generate din greșeli („Caiet de erori", „Quiz din greșeli", recuperare) au același
 * titlu și aceleași etichete la fiecare lansare. În loc să adauge un set nou de fiecare dată
 * (biblioteca și contorul de grile creșteau la infinit), refolosim setul existent al profilului:
 * îi înlocuim întrebările și îl mutăm în față. Returnează id-ul de rulat.
 */
export function upsertGeneratedQuiz(fresh: Quiz): string {
  const store = useQuizStore.getState();
  const existing = store.quizzes.find(
    (quiz) => quiz.title === fresh.title && (quiz.kind ?? 'quiz') === (fresh.kind ?? 'quiz') && sameTags(quiz.tags, fresh.tags),
  );
  if (!existing) {
    store.addQuiz(fresh);
    return fresh.id;
  }
  // O întrebare cu același text păstrează id-ul, ca statisticile ei (questionStats) să nu rămână orfane la fiecare reîmprospătare.
  const idsByText = new Map<string, string[]>();
  for (const question of existing.questions) idsByText.set(question.text, [...(idsByText.get(question.text) ?? []), question.id]);
  const questions = fresh.questions.map((question) => {
    const reusable = idsByText.get(question.text)?.shift();
    return reusable ? { ...question, id: reusable } : question;
  });
  store.updateQuiz(existing.id, {
    description: fresh.description,
    questions,
    createdAt: fresh.createdAt,
  });
  return existing.id;
}
