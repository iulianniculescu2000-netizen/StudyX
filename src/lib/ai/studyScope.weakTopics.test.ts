import { describe, expect, it, vi } from 'vitest';
import type { QuestionStat, Quiz } from '../../types';

vi.mock('../../ai/UserProfile', () => ({
  getWeakTopicsForProfile: () => [
    { topic: 'Cardiologie', accuracy: 50, wrongCount: 10, total: 20, recencyScore: 0 },
    { topic: 'Pneumologie', accuracy: 40, wrongCount: 6, total: 10, recencyScore: 0 },
  ],
}));

import { scopedWeakTopics } from './studyScope';

const question = (id: string, topic: string) => ({ id, text: id, tags: [topic], options: [] });
const quizzes = [
  { id: 'gen', tags: [], questions: [question('1', 'Cardiologie')] },
  { id: 'rez', tags: ['rezidentiat'], questions: [question('1', 'Cardiologie'), question('2', 'Pneumologie')] },
] as unknown as Quiz[];
const stat = (quizId: string, c: number, w: number) => ({ questionId: '1', quizId, timesCorrect: c, timesWrong: w } as QuestionStat);
const stats = { 'gen:1': stat('gen', 9, 1), 'rez:1': stat('rez', 1, 9) };

describe('scopedWeakTopics with a topic present in both spaces', () => {
  it('measures the shared topic from each space own answers', () => {
    const general = scopedWeakTopics('p', 'general', quizzes, 4, stats);
    expect(general).toHaveLength(1);
    expect(general[0]).toMatchObject({ topic: 'Cardiologie', accuracy: 90, wrongCount: 1 });
    const rezi = scopedWeakTopics('p', 'rezidentiat', quizzes, 4, stats);
    expect(rezi.find((t) => t.topic === 'Cardiologie')).toMatchObject({ accuracy: 10, wrongCount: 9 });
    expect(rezi.map((t) => t.topic)).toContain('Pneumologie'); // only in this space: profile numbers kept
  });

  it('drops a shared topic the space has never answered', () => {
    expect(scopedWeakTopics('p', 'general', quizzes, 4, {})).toEqual([]);
  });

  it('without stats keeps the old profile-based behaviour', () => {
    expect(scopedWeakTopics('p', 'general', quizzes, 4).map((t) => t.accuracy)).toEqual([50]);
  });
});
