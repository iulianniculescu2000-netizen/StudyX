import { describe, expect, it } from 'vitest';
import { computeTopicMastery, isTopicPracticeQuiz, pickStudyFocus, TOPIC_PRACTICE_TAG, type TopicMastery } from './topicMastery';
import type { QuestionStat, Quiz } from '../types';

const DAY = 86_400_000;
const NOW = 100 * DAY;

const quiz = (id: string, category: string, qids: string[], extra: Partial<Quiz> = {}) =>
  ({
    id, title: `Test ${id}`, category, kind: 'quiz',
    questions: qids.map((q) => ({ id: q, text: `Întrebare ${q}`, options: [{ id: 'o', text: 'x', isCorrect: true }] })),
    ...extra,
  }) as unknown as Quiz;
const stat = (quizId: string, questionId: string, extra: Partial<QuestionStat> = {}): QuestionStat => ({
  quizId, questionId, timesCorrect: 0, timesWrong: 0, lastSeen: NOW, nextReview: 0, interval: 1, ...extra,
});
const topic = (name: string, extra: Partial<TopicMastery> = {}): TopicMastery => ({
  topic: name, mastery: 50, answered: 5, wrong: 2, lastSeen: NOW, daysSince: 0, ...extra,
});

describe('computeTopicMastery', () => {
  it('grupează după categoria pachetului și netezește acuratețea', () => {
    const [row] = computeTopicMastery(
      [quiz('a', 'Aritmii', ['1', '2'])],
      { 'a:1': stat('a', '1', { timesCorrect: 1, timesWrong: 3 }), 'a:2': stat('a', '2', { timesCorrect: 0, timesWrong: 1 }) },
      NOW,
    );
    expect(row).toMatchObject({ topic: 'Aritmii', answered: 5, wrong: 4, daysSince: 0 });
    // (1 + 1) / (5 + 2) = 0,2857…
    expect(row.mastery).toBe(29);
  });

  it('folosește etichetele întrebării înaintea celor ale pachetului, fără etichetele de structură', () => {
    const q = quiz('a', 'Cardiologie', ['1'], { tags: ['chapter:3', 'book:K'] });
    q.questions[0].tags = ['Fibrilație'];
    const rows = computeTopicMastery([q], { 'a:1': stat('a', '1', { timesCorrect: 2 }) }, NOW);
    expect(rows.map((r) => r.topic)).toEqual(['Fibrilație']);
  });

  it('ignoră pachetele arhivate, flashcardurile, sesiunile generate și statisticile retrase', () => {
    const quizzes = [
      quiz('arh', 'X', ['1'], { archived: true }),
      quiz('fc', 'X', ['1'], { kind: 'flashcard' }),
      quiz('gen', 'X', ['1'], { tags: ['recovery'] }),
      quiz('ok', 'X', ['1']),
    ];
    const stats = Object.fromEntries(
      ['arh', 'fc', 'gen', 'ok'].map((id) => [`${id}:1`, stat(id, '1', { timesCorrect: 1, retired: id === 'ok' })]),
    );
    expect(computeTopicMastery(quizzes, stats, NOW)).toEqual([]);
  });

  it('scade stăpânirea odată cu uitarea, dar nu sub trei sferturi', () => {
    const quizzes = [quiz('a', 'Aritmii', ['1'])];
    const fresh = computeTopicMastery(quizzes, { 'a:1': stat('a', '1', { timesCorrect: 8 }) }, NOW)[0];
    const old = computeTopicMastery(quizzes, { 'a:1': stat('a', '1', { timesCorrect: 8, lastSeen: NOW - 90 * DAY }) }, NOW)[0];
    expect(old.daysSince).toBe(90);
    expect(old.mastery).toBeLessThan(fresh.mastery);
    expect(old.mastery).toBe(Math.round(fresh.mastery * 0.75));
  });

  it('nu numără întrebările fără răspunsuri', () => {
    expect(computeTopicMastery([quiz('a', 'X', ['1'])], { 'a:1': stat('a', '1') }, NOW)).toEqual([]);
  });
});

describe('pickStudyFocus', () => {
  it('nu propune subiecte cu prea puține răspunsuri', () => {
    expect(pickStudyFocus([topic('A', { answered: 2, mastery: 10 })])).toEqual([]);
  });

  it('pune întâi cele mai slabe subiecte și lasă un loc pentru reîmprospătare', () => {
    const picks = pickStudyFocus([
      topic('Slab1', { mastery: 20 }),
      topic('Slab2', { mastery: 30 }),
      topic('Slab3', { mastery: 40 }),
      topic('Vechi', { mastery: 80, daysSince: 12, wrong: 0 }),
    ]);
    expect(picks.map((p) => `${p.kind}:${p.topic.topic}`)).toEqual(['weak:Slab1', 'weak:Slab2', 'stale:Vechi']);
  });

  it('completează cu subiecte slabe când nu există nimic de reîmprospătat', () => {
    const picks = pickStudyFocus([topic('A', { mastery: 10 }), topic('B', { mastery: 20 }), topic('C', { mastery: 30 }), topic('D', { mastery: 40 })]);
    expect(picks.map((p) => p.topic.topic)).toEqual(['A', 'B', 'C']);
  });

  it('un subiect stăpânit și proaspăt nu apare deloc', () => {
    expect(pickStudyFocus([topic('Bun', { mastery: 90, wrong: 0, daysSince: 1 })])).toEqual([]);
  });
});

describe('isTopicPracticeQuiz', () => {
  it('recunoaște doar seturile de exersare pe subiect', () => {
    expect(isTopicPracticeQuiz({ tags: ['recovery', TOPIC_PRACTICE_TAG] })).toBe(true);
    expect(isTopicPracticeQuiz({ tags: ['recovery'] })).toBe(false);
    expect(isTopicPracticeQuiz({})).toBe(false);
  });
});
