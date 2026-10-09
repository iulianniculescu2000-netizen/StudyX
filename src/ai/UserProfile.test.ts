import { beforeEach, describe, expect, it, vi } from 'vitest';

const idbGetMock = vi.fn();
vi.mock('../lib/idb', () => ({ idbGet: (...args: unknown[]) => idbGetMock(...args) }));

import {
  clearStudyPatterns,
  generateFromMistakes,
  getProfileSummaryText,
  getStrongTopicsForProfile,
  getWeakTopicsForProfile,
  loadUserProfile,
  migrateLegacyUserMemory,
  recordQuizSession,
  updateUserProfileAfterAnswer,
} from './UserProfile';
import { useToastStore } from '../store/toastStore';
import type { QuestionStat } from '../types';

const FINISHED = new Date(2026, 5, 10, 21, 30).getTime();

function stat(questionId: string, timesCorrect: number, timesWrong: number, lastSeen = 1000): QuestionStat {
  return { questionId, quizId: 'z', timesCorrect, timesWrong, lastSeen, nextReview: 0, interval: 1 };
}
const q = (id: string, tags?: string[], category?: string) => ({ id, text: `Întrebarea ${id} despre ficat?`, tags, category });

beforeEach(() => {
  localStorage.clear();
  idbGetMock.mockReset();
});

describe('loadUserProfile', () => {
  it('returns an empty current-schema profile when nothing is stored', () => {
    const p = loadUserProfile('u1');
    expect(p).toMatchObject({ profileId: 'u1', globalAccuracy: 0, currentDifficulty: 'medium', schemaVersion: 2, mistakeBank: [] });
  });

  it('fills missing fields of an older stored profile from defaults and forces profileId', () => {
    localStorage.setItem('studyx-ai-profile:u1', JSON.stringify({ profileId: 'other', globalAccuracy: 71, schemaVersion: 1 }));
    const p = loadUserProfile('u1');
    expect(p.profileId).toBe('u1');
    expect(p.globalAccuracy).toBe(71);
    expect(p.schemaVersion).toBe(1);
    expect(p.mistakeBank).toEqual([]);
    expect(p._hourStats).toEqual({});
  });

  it('quarantines corrupt JSON, writes a fresh profile and warns the user', () => {
    localStorage.setItem('studyx-ai-profile:u1', '{not json');
    const p = loadUserProfile('u1');
    expect(p.globalAccuracy).toBe(0);
    expect(localStorage.getItem('studyx-ai-profile:u1')).toContain('"profileId":"u1"');
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    expect(keys.filter((k) => k?.startsWith('studyx-ai-profile:u1__corrupt-'))).toHaveLength(1);
    expect(useToastStore.getState().toasts.some((t) => t.id === 'ai-user-profile-corrupt')).toBe(true);
    // The second load no longer fails.
    expect(loadUserProfile('u1').profileId).toBe('u1');
  });
});

describe('recordQuizSession', () => {
  const questions = [q('a', ['Cardiologie']), q('b', ['Cardiologie']), q('c', ['Hepatologie', 'Gastro']), q('d', undefined, 'Nefrologie')];
  const stats = { a: stat('a', 4, 0), b: stat('b', 3, 0), c: stat('c', 0, 2, 5000), d: stat('d', 1, 1) };

  it('computes accuracy, difficulty, strong topics and the mistake bank', () => {
    const next = recordQuizSession('u1', {
      stats, questions, streak: 3, durationSeconds: 600, finishedAt: FINISHED,
      sessionItems: [
        { questionId: 'a', correct: true, confidence: 'confident' },
        { questionId: 'c', correct: false, userAnswer: 'x', correctAnswer: 'y', confidence: 'guess' },
        { questionId: 'd', correct: false },
      ],
    });
    // (4+3+0+1) correct of (4+3+2+2)=11 answers -> 73%
    expect(next.globalAccuracy).toBe(73);
    expect(next.currentDifficulty).toBe('medium');
    expect(next.streak).toBe(3);
    expect(next.strongTopics).toEqual([{ topic: 'Cardiologie', accuracy: 100, total: 7 }]);
    expect(next.topicAccuracy.Cardiologie).toMatchObject({ correct: 7, total: 7, accuracy: 100, recent: [true], lastSeen: FINISHED });
    // a question with several tags counts toward each, the mistake uses the first
    expect(next.topicAccuracy.Hepatologie.recent).toEqual([false]);
    expect(next.topicAccuracy.Gastro.recent).toEqual([false]);
    expect(next.topicAccuracy.Nefrologie.recent).toEqual([false]);
    expect(next.recentMistakes.map((m) => [m.questionId, m.topic])).toEqual([['d', 'Nefrologie'], ['c', 'Hepatologie']]);
    expect(next.mistakeBank.map((m) => m.questionId)).toEqual(['d', 'c']);
    expect(next.mistakeBank[1]).toMatchObject({ topic: 'Hepatologie', userAnswer: 'x', correctAnswer: 'y', wrongCount: 1, questionText: 'Întrebarea c despre ficat?' });
    expect(next.studyPatterns).toEqual({ preferredSessionLength: 10, bestPerformanceHour: null, averageConfidence: 0.75 });
    expect(next._hourStats[String(new Date(FINISHED).getHours())]).toEqual({ correct: 1, total: 3 });
    expect(JSON.parse(localStorage.getItem('studyx-ai-profile:u1')!).globalAccuracy).toBe(73);
  });

  it('maps global accuracy to difficulty (>=80 hard, <50 easy)', () => {
    const run = (c: number, w: number) => recordQuizSession('d', { stats: { a: stat('a', c, w) }, questions, streak: 0, durationSeconds: 0, finishedAt: FINISHED, sessionItems: [] }).currentDifficulty;
    expect(run(8, 2)).toBe('hard');
    expect(run(79, 21)).toBe('medium');
    expect(run(1, 2)).toBe('easy');
  });

  it('increments wrongCount on an existing bank entry, keeps the rolling windows and caps the lists', () => {
    const many = Array.from({ length: 70 }, (_, i) => q(`m${i}`, ['T']));
    const wrongAll = many.map((m) => ({ questionId: m.id, correct: false }));
    // Topic history is rebuilt from `stats`, so keep one tracked question in it.
    const tracked = { m0: stat('m0', 1, 1) };
    let p = recordQuizSession('u2', { stats: tracked, questions: many, streak: 0, durationSeconds: 120, finishedAt: FINISHED, sessionItems: wrongAll });
    expect(p.mistakeBank).toHaveLength(50);
    expect(p.recentMistakes).toHaveLength(12);
    p = recordQuizSession('u2', { stats: tracked, questions: many, streak: 0, durationSeconds: 120, finishedAt: FINISHED + 1, sessionItems: [{ questionId: 'm69', correct: false }] });
    const entry = p.mistakeBank.find((m) => m.questionId === 'm69');
    expect(entry?.wrongCount).toBe(2);
    expect(p._sessionLengths).toEqual([2, 2]);
    // 11-sample window: recent keeps only the last 10 outcomes per topic
    for (let i = 0; i < 12; i += 1) {
      p = recordQuizSession('u2', { stats: tracked, questions: many, streak: 0, durationSeconds: 0, finishedAt: FINISHED + 10 + i, sessionItems: [{ questionId: 'm0', correct: i % 2 === 0 }] });
    }
    expect(p.topicAccuracy.T.recent).toHaveLength(10);
  });

  it('picks the best hour only once it has at least 5 samples', () => {
    const items = (n: number, ok: boolean) => Array.from({ length: n }, () => ({ questionId: 'a', correct: ok }));
    const morning = new Date(2026, 5, 10, 8, 0).getTime();
    recordQuizSession('u3', { stats, questions, streak: 0, durationSeconds: 0, finishedAt: morning, sessionItems: items(4, true) });
    expect(loadUserProfile('u3').studyPatterns.bestPerformanceHour).toBeNull();
    const p = recordQuizSession('u3', { stats, questions, streak: 0, durationSeconds: 0, finishedAt: morning, sessionItems: items(2, true) });
    expect(p.studyPatterns.bestPerformanceHour).toBe(8);
  });
});

describe('weak / strong topics and summary', () => {
  it('shrinks accuracy toward a 65% prior when ranking (pins current constants: 0/1 -> 52, 12/20 -> 60.8)', () => {
    const questions = [q('one', ['Rar']), q('many', ['Frecvent'])];
    recordQuizSession('w', {
      stats: { one: stat('one', 0, 1, 10), many: stat('many', 12, 8, 20) },
      questions, streak: 0, durationSeconds: 0, finishedAt: FINISHED, sessionItems: [],
    });
    const weak = getWeakTopicsForProfile('w');
    // NOTE: weaknessRank's doc says one wrong answer should not outrank a real pattern
    // (60% on n=20), but with priorWeight=4 the single miss still ranks weakest.
    expect(weak.map((t) => t.topic)).toEqual(['Rar', 'Frecvent']);
    expect(weak[0]).toMatchObject({ accuracy: 0, wrongCount: 1, total: 1 });
    expect(weak[1]).toMatchObject({ accuracy: 60, wrongCount: 8, total: 20 });
    // With a few more misses the established weak topic does come first.
    recordQuizSession('w', {
      stats: { one: stat('one', 0, 1, 10), many: stat('many', 2, 18, 20) },
      questions, streak: 0, durationSeconds: 0, finishedAt: FINISHED, sessionItems: [],
    });
    expect(getWeakTopicsForProfile('w').map((t) => t.topic)).toEqual(['Frecvent', 'Rar']);
  });

  it('limits weak topics to five and exposes strong topics', () => {
    const questions = Array.from({ length: 8 }, (_, i) => q(`k${i}`, [`Tema ${i}`]));
    const stats = Object.fromEntries(questions.map((x, i) => [x.id, stat(x.id, 5 + i, i)]));
    recordQuizSession('w2', { stats, questions, streak: 0, durationSeconds: 0, finishedAt: FINISHED, sessionItems: [] });
    expect(getWeakTopicsForProfile('w2')).toHaveLength(5);
    expect(getStrongTopicsForProfile('w2').every((t) => t.accuracy >= 80 && t.total >= 3)).toBe(true);
  });

  it('writes a short Romanian summary with trends, strong topics and patterns', () => {
    expect(getProfileSummaryText('nobody')).toBe('');
    const questions = [q('a', ['Aritmii']), q('b', ['Anatomie'])];
    recordQuizSession('s', {
      stats: { a: stat('a', 1, 4), b: stat('b', 9, 1) }, questions, streak: 0, durationSeconds: 900, finishedAt: FINISHED,
      sessionItems: [{ questionId: 'a', correct: false, confidence: 'confident' }],
    });
    expect(getProfileSummaryText('s')).toBe(
      'Are dificultăți cu: Aritmii (4 greșeli, stabil), Anatomie (1 greșeli, stabil). '
      + 'Performanță bună la: Anatomie (90%). '
      + 'Tipar de studiu: sesiuni tipice ~15 min, încredere medie 100%.',
    );
  });

  it('clearStudyPatterns resets only the behavioural slice', () => {
    recordQuizSession('c', {
      stats: { a: stat('a', 9, 1) }, questions: [q('a', ['Aritmii'])], streak: 0, durationSeconds: 600, finishedAt: FINISHED,
      sessionItems: [{ questionId: 'a', correct: false, confidence: 'guess' }],
    });
    clearStudyPatterns('c');
    const p = loadUserProfile('c');
    expect(p.studyPatterns).toEqual({ preferredSessionLength: 0, bestPerformanceHour: null, averageConfidence: 0 });
    expect(p.strongTopics).toEqual([]);
    expect(p._sessionLengths).toEqual([]);
    expect(p.topicAccuracy.Aritmii).toBeDefined();
    expect(p.mistakeBank).toHaveLength(1);
  });
});

describe('updateUserProfileAfterAnswer / generateFromMistakes', () => {
  const question = { id: 'x1', text: 'Ce este ciroza?', options: [], tags: ['Hepatologie'] };

  it('creates a safety-net bank entry, then enriches it on the next wrong answer', () => {
    updateUserProfileAfterAnswer('m', { question, isCorrect: false, userAnswer: 'A', correctAnswer: 'B', analysis: { mistakeType: 'confuzie', explanation: 'expl' } as never });
    let p = loadUserProfile('m');
    expect(p.mistakeBank[0]).toMatchObject({ questionId: 'x1', wrongCount: 1, explanation: 'expl', mistakeType: 'confuzie' });
    expect(p.recentQuestions).toEqual(['x1']);
    updateUserProfileAfterAnswer('m', { question, isCorrect: false, userAnswer: '', correctAnswer: 'B2' });
    p = loadUserProfile('m');
    expect(p.mistakeBank).toHaveLength(1);
    expect(p.mistakeBank[0]).toMatchObject({ wrongCount: 2, userAnswer: 'A', correctAnswer: 'B2', explanation: 'expl' });
    expect(p.recentMistakes).toHaveLength(2);
  });

  it('does not log a mistake for a correct answer but moves the question to the front of recents', () => {
    updateUserProfileAfterAnswer('m2', { question: { ...question, id: 'p' }, isCorrect: true, userAnswer: '', correctAnswer: '' });
    updateUserProfileAfterAnswer('m2', { question, isCorrect: true, userAnswer: '', correctAnswer: '' });
    updateUserProfileAfterAnswer('m2', { question: { ...question, id: 'p' }, isCorrect: true, userAnswer: '', correctAnswer: '' });
    const p = loadUserProfile('m2');
    expect(p.recentMistakes).toEqual([]);
    expect(p.recentQuestions).toEqual(['p', 'x1']);
  });

  it('returns at most 10 mistakes, most-wrong first then newest', () => {
    for (let i = 0; i < 12; i += 1) {
      recordQuizSession('g', { stats: {}, questions: [q(`e${i}`, ['T'])], streak: 0, durationSeconds: 0, finishedAt: FINISHED + i, sessionItems: [{ questionId: `e${i}`, correct: false }] });
    }
    recordQuizSession('g', { stats: {}, questions: [q('e3', ['T'])], streak: 0, durationSeconds: 0, finishedAt: FINISHED + 100, sessionItems: [{ questionId: 'e3', correct: false }] });
    const list = generateFromMistakes('g');
    expect(list).toHaveLength(10);
    expect(list[0].questionId).toBe('e3');
    expect(list[1].questionId).toBe('e11');
  });
});

describe('migrateLegacyUserMemory', () => {
  it('ports legacy patterns once and bumps the schema version', async () => {
    localStorage.setItem('studyx-ai-profile:mg', JSON.stringify({ schemaVersion: 1 }));
    idbGetMock.mockResolvedValue({ studyPatterns: { preferredSessionLength: 25, bestPerformanceHour: 7, averageConfidence: 0.5 }, _sessionLengths: [25] });
    await migrateLegacyUserMemory('mg');
    const p = loadUserProfile('mg');
    expect(idbGetMock).toHaveBeenCalledWith('studyx-user-memory-mg');
    expect(p.studyPatterns.preferredSessionLength).toBe(25);
    expect(p._sessionLengths).toEqual([25]);
    expect(p._hourStats).toEqual({});
    expect(p.schemaVersion).toBe(2);
    await migrateLegacyUserMemory('mg');
    expect(idbGetMock).toHaveBeenCalledTimes(1);
  });

  it('ports the legacy record into a brand-new unsaved profile (no schemaVersion gate)', async () => {
    idbGetMock.mockResolvedValue({ _sessionLengths: [33] });
    await migrateLegacyUserMemory('fresh-unsaved');
    expect(idbGetMock).toHaveBeenCalledWith('studyx-user-memory-fresh-unsaved');
    expect(loadUserProfile('fresh-unsaved')._sessionLengths).toEqual([33]);
    await migrateLegacyUserMemory('fresh-unsaved');
    expect(idbGetMock).toHaveBeenCalledTimes(1);
  });

  it('ports into a profile already stamped with the current schema version', async () => {
    localStorage.setItem('studyx-ai-profile:stamped', JSON.stringify({ schemaVersion: 2 }));
    idbGetMock.mockResolvedValue({ _sessionLengths: [18] });
    await migrateLegacyUserMemory('stamped');
    expect(loadUserProfile('stamped')._sessionLengths).toEqual([18]);
  });

  it('keeps the migration pending when the legacy read fails, so the next launch can retry', async () => {
    localStorage.setItem('studyx-ai-profile:mg2', JSON.stringify({ schemaVersion: 1 }));
    idbGetMock.mockRejectedValue(new Error('idb down'));
    await migrateLegacyUserMemory('mg2');
    expect(loadUserProfile('mg2').schemaVersion).toBe(1);
    idbGetMock.mockResolvedValue({ _sessionLengths: [10] });
    await migrateLegacyUserMemory('mg2');
    expect(loadUserProfile('mg2')._sessionLengths).toEqual([10]);
    expect(loadUserProfile('mg2').schemaVersion).toBe(2);
  });

  it('does not undo a profile update that happened while IndexedDB was answering', async () => {
    localStorage.setItem('studyx-ai-profile:mg3', JSON.stringify({ schemaVersion: 1 }));
    idbGetMock.mockImplementation(async () => {
      recordQuizSession('mg3', { stats: {}, questions: [q('late', ['T'])], streak: 4, durationSeconds: 0, finishedAt: FINISHED, sessionItems: [{ questionId: 'late', correct: false }] });
      return { _sessionLengths: [12] };
    });
    await migrateLegacyUserMemory('mg3');
    const p = loadUserProfile('mg3');
    expect(p.streak).toBe(4);
    expect(p.mistakeBank).toHaveLength(1);
    expect(p._sessionLengths).toEqual([12]);
  });

  it('repairs fields of the wrong type instead of crashing later', () => {
    localStorage.setItem('studyx-ai-profile:bad', JSON.stringify({ schemaVersion: 2, mistakeBank: null, topicAccuracy: 'x', streak: 3 }));
    const p = loadUserProfile('bad');
    expect(p.mistakeBank).toEqual([]);
    expect(p.topicAccuracy).toEqual({});
    expect(p.streak).toBe(3);
  });
});
