import { beforeEach, describe, expect, it } from 'vitest';
import type { Question, QuestionStat, Quiz } from '../types';
import { useUIStore } from '../store/uiStore';
import { askAiAboutTopic, findQuizForTopic, quizHrefForTopic } from './analyticsActions';

const question = (id: string, tags?: string[]): Question => ({
  id, text: id, tags, options: [{ id: 'a', text: 'a', isCorrect: true }, { id: 'b', text: 'b', isCorrect: false }],
});
const quiz = (id: string, questions: Question[], extra: Partial<Quiz> = {}): Quiz => ({
  id, title: id, description: '', emoji: '', category: '', kind: 'quiz', questions, createdAt: 0, color: 'blue', ...extra,
});
const stat = (quizId: string, questionId: string, timesCorrect: number, timesWrong: number): QuestionStat => ({
  quizId, questionId, timesCorrect, timesWrong, lastSeen: 0, nextReview: 0, interval: 0,
});

const NO_FOLDERS = new Map<string, string>();

describe('askAiAboutTopic', () => {
  beforeEach(() => useUIStore.setState({ chatOpen: false }));

  it('opens the assistant with the question typed in', () => {
    const received: { open: boolean; prompt: string }[] = [];
    const listener = (event: Event) => received.push((event as CustomEvent<{ open: boolean; prompt: string }>).detail);
    window.addEventListener('studyx:ai-prompt', listener);
    askAiAboutTopic('Aritmii');
    window.removeEventListener('studyx:ai-prompt', listener);
    expect(received).toEqual([{ open: true, prompt: 'Explică-mi, pentru rezidențiat: Aritmii. Unde greșesc cel mai des?' }]);
    expect(useUIStore.getState().chatOpen).toBe(true);
  });
});

describe('findQuizForTopic', () => {
  it('picks the set with the weakest accuracy in the topic', () => {
    const quizzes = [quiz('good', [question('g1', ['T']), question('g2', ['T'])]), quiz('bad', [question('b1', ['T']), question('b2', ['T'])])];
    const stats = { 'good:g1': stat('good', 'g1', 4, 1), 'good:g2': stat('good', 'g2', 4, 1), 'bad:b1': stat('bad', 'b1', 1, 4), 'bad:b2': stat('bad', 'b2', 1, 4) };
    expect(findQuizForTopic('T', quizzes, stats, NO_FOLDERS)).toBe('bad');
  });

  it('does not let a single 0% attempt beat a long weak history', () => {
    const many = Array.from({ length: 20 }, (_, i) => question(`m${i}`, ['T']));
    const quizzes = [quiz('one', [question('o1', ['T'])]), quiz('many', many)];
    const stats: Record<string, QuestionStat> = { 'one:o1': stat('one', 'o1', 0, 1) };
    many.forEach((q, i) => { stats[`many:${q.id}`] = stat('many', q.id, i < 11 ? 1 : 0, i < 11 ? 0 : 1); }); // 11/20 = 55%
    expect(findQuizForTopic('T', quizzes, stats, NO_FOLDERS)).toBe('many');
  });

  it('skips combined sessions, flashcard decks and archived sets', () => {
    const quizzes = [
      quiz('mix-f1', [question('x1', ['T'])], { tags: ['folder-session:f1'] }),
      quiz('cards', [question('x2', ['T'])], { kind: 'flashcard' }),
      quiz('old', [question('x3', ['T'])], { archived: true }),
    ];
    const stats = { 'mix-f1:x1': stat('mix-f1', 'x1', 0, 5), 'cards:x2': stat('cards', 'x2', 0, 5), 'old:x3': stat('old', 'x3', 0, 5) };
    expect(findQuizForTopic('T', quizzes, stats, NO_FOLDERS)).toBeNull();
  });

  it('matches topics by folder name for untagged questions', () => {
    const quizzes = [quiz('a', [question('a1')], { folderId: 'f1' })];
    expect(findQuizForTopic('Cardiologie', quizzes, { 'a:a1': stat('a', 'a1', 0, 2) }, new Map([['f1', 'Cardiologie']]))).toBe('a');
  });
});

describe('quizHrefForTopic', () => {
  it('opens the quiz, or the general review when none matches', () => {
    const quizzes = [quiz('a', [question('a1', ['T'])])];
    const stats = { 'a:a1': stat('a', 'a1', 0, 2) };
    expect(quizHrefForTopic('T', quizzes, stats, NO_FOLDERS)).toBe('/quiz/a');
    expect(quizHrefForTopic('Altceva', quizzes, stats, NO_FOLDERS)).toBe('/review');
  });
});
