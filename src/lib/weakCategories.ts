import type { Quiz, QuizSession } from '../types';
import { MIN_ANSWERS, type TopicMastery } from './topicMastery';

export interface WeakCategory {
  name: string;
  /** Media acurateței seturilor din categorie, rotunjită. */
  accuracy: number;
  /** Sesiunile rezolvate în categorie. */
  quizCount: number;
}

/**
 * Categoriile cu cea mai mică acuratețe, doar cele în care s-a rezolvat ceva. Același calcul pentru raportul „Ce nu știu?” și
 * pentru chip-urile de deasupra lui, ca textul AI și cifrele afișate să nu se contrazică. Media e pe toate seturile categoriei
 * (nu „perechi de perechi”, care dădea un rezultat diferit după ordinea seturilor).
 */
export function weakCategoriesFrom(
  quizzes: readonly Quiz[],
  sessions: readonly QuizSession[],
  accuracyByQuiz: ReadonlyMap<string, number>,
  limit = 6,
): WeakCategory[] {
  const groups = new Map<string, { accuracies: number[]; sessions: number }>();
  for (const quiz of quizzes) {
    const count = sessions.filter((session) => session.quizId === quiz.id).length;
    if (count === 0) continue;
    const name = quiz.category?.trim() || 'Altele';
    const group = groups.get(name) ?? { accuracies: [], sessions: 0 };
    group.accuracies.push(accuracyByQuiz.get(quiz.id) ?? 0);
    group.sessions += count;
    groups.set(name, group);
  }
  return [...groups.entries()]
    .map(([name, group]) => ({
      name,
      accuracy: Math.round(group.accuracies.reduce((sum, value) => sum + value, 0) / group.accuracies.length),
      quizCount: group.sessions,
    }))
    .sort((a, b) => a.accuracy - b.accuracy || a.name.localeCompare(b.name, 'ro'))
    .slice(0, limit);
}

/**
 * Subiectele de reluat, pe aceleași răspunsuri ca „Pentru tine” din panou. Pe date reale, categoriile seturilor sunt prea
 * largi („AI Studio”, „Altele”), iar subiectul întrebării (anemie feriprivă, cardiologie) spune ce are de recitit studentul.
 * Fără destule răspunsuri pe subiecte, revine la categorii. `quizCount` e numărul de răspunsuri.
 */
export function weakTopicsFrom(
  topics: readonly TopicMastery[],
  fallback: readonly WeakCategory[],
  limit = 6,
): WeakCategory[] {
  const rows = topics
    .filter((topic) => topic.answered >= MIN_ANSWERS && topic.wrong > 0)
    .map((topic) => ({
      name: topic.topic,
      accuracy: Math.round((100 * (topic.answered - topic.wrong)) / topic.answered),
      quizCount: topic.answered,
    }))
    .sort((a, b) => a.accuracy - b.accuracy || b.quizCount - a.quizCount || a.name.localeCompare(b.name, 'ro'))
    .slice(0, limit);
  return rows.length > 0 ? rows : [...fallback];
}
