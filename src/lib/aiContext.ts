/**
 * aiContext.ts
 *
 * Construiește contextul de performanță al utilizatorului pentru apelurile AI,
 * astfel încât răspunsurile să fie mai bine adaptate și mai utile pentru studiu.
 */
import type { Quiz } from '../types';
import { RESIDENCY_STYLE_RULES } from '../ai/prompts';
import { buildRolePrompt } from '../ai/promptKit';

export interface PerformanceSummary {
  totalAnswered: number;
  globalAccuracy: number;
  dueCount: number;
  weakTopics: { tag: string; accuracy: number }[];
  strongTopics: { tag: string; accuracy: number }[];
  streakDays: number;
}

export function buildPerformanceSummary(
  questionStats: Record<string, { timesCorrect: number; timesWrong: number; retired?: boolean }>,
  streak: { currentStreak: number },
  getDueQuestions: () => unknown[],
  getAccuracy: () => number,
  getStatsByTag: (quizzes: Quiz[]) => Record<string, { correct: number; total: number }>,
  quizzes: Quiz[],
): PerformanceSummary {
  const tagStats = getStatsByTag(quizzes);
  const totalAnswered = Object.values(questionStats)
    .reduce((sum, stats) => (stats.retired ? sum : sum + stats.timesCorrect + stats.timesWrong), 0);

  const topicList = Object.entries(tagStats)
    .map(([tag, stats]) => ({
      tag,
      accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
      total: stats.total,
    }))
    .filter((topic) => topic.total >= 3)
    .sort((a, b) => a.accuracy - b.accuracy);

  return {
    totalAnswered,
    globalAccuracy: getAccuracy(),
    dueCount: getDueQuestions().length,
    weakTopics: topicList.slice(0, 3),
    strongTopics: topicList.slice(-3).reverse(),
    streakDays: streak?.currentStreak ?? 0,
  };
}

export function buildUserContextString(summary: PerformanceSummary): string {
  if (summary.totalAnswered === 0) return '';

  const parts: string[] = [
    `Student medical: ${summary.totalAnswered} întrebări rezolvate, acuratețe ${summary.globalAccuracy}%.`,
  ];

  if (summary.streakDays > 0) {
    parts.push(`Streak curent: ${summary.streakDays} ${summary.streakDays === 1 ? 'zi' : 'zile'} consecutive.`);
  }

  if (summary.dueCount > 0) {
    parts.push(`${summary.dueCount} itemi sunt programați pentru recapitulare azi.`);
  }

  if (summary.weakTopics.length > 0) {
    parts.push(`Puncte slabe: ${summary.weakTopics.map((topic) => `${topic.tag} ${topic.accuracy}%`).join(', ')}.`);
  }

  if (summary.strongTopics.length > 0) {
    parts.push(`Puncte forte: ${summary.strongTopics.map((topic) => `${topic.tag} ${topic.accuracy}%`).join(', ')}.`);
  }

  if (summary.globalAccuracy >= 80) {
    parts.push('Poți susține întrebări mai provocatoare și sinteze mai dense.');
  } else if (summary.globalAccuracy < 55) {
    parts.push('Ajută mai mult explicațiile etapizate, recapitularea scurtă și verificările frecvente.');
  }

  return parts.join(' ');
}

export function getMedicalSystemPrompt(
  role: 'tutor' | 'examiner' | 'explainer' | 'advisor',
  userContext?: string,
): string {
  // Persona, rigoarea medicală și contractul de formă vin din promptKit (un singur loc). The
  // examiner returns JSON, so formatting rules would only confuse it; it gets the house style instead.
  const prompt = buildRolePrompt(role, role === 'examiner' ? [RESIDENCY_STYLE_RULES] : []);

  if (userContext && userContext.trim().length > 20) {
    return `${prompt}\n\nPROFIL STUDENT:\n${userContext}`;
  }

  return prompt;
}
