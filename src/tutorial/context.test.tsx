import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTourContext, readTourContext, useTourContext } from './useTourContext';
import { isTourRouteCurrent } from './navigation';
import { TOURS } from './registry';
import { useAIStore } from '../store/aiStore';
import { useQuizStore } from '../store/quizStore';
import { useStatsStore } from '../store/statsStore';
import { useFolderStore } from '../store/folderStore';
import { useUserStore } from '../store/userStore';
import { useOrganizareStore } from '../store/organizareStore';
import type { Quiz, QuestionStat } from '../types';

const ai = { provider: 'groq' as const, apiKey: '', providerKeys: {}, knowledgeSources: [] };
const quiz = (id: string, patch: Partial<Quiz> = {}): Quiz => ({
  id, title: id, description: '', emoji: '', category: 'Medicină', createdAt: 0,
  color: 'blue', kind: 'quiz', questions: [{ id: 'q', text: 'Q', options: [] }], ...patch,
});
const stat = (quizId: string, patch: Partial<QuestionStat> = {}): QuestionStat => ({
  quizId, questionId: 'q', timesCorrect: 0, timesWrong: 1, lastSeen: 1,
  nextReview: 10, interval: 1, consecutiveCorrect: 0, ...patch,
});
const empty = () => buildTourContext(ai, [], [], {}, undefined, '/');

beforeEach(() => {
  useAIStore.setState(ai);
  useQuizStore.setState({ quizzes: [] });
  useFolderStore.setState({ folders: [] });
  useStatsStore.setState({ questionStats: {} });
  useUserStore.setState({ activeProfileId: 'p1' });
  useOrganizareStore.setState({ byProfile: {} });
});

describe('tutorial context', () => {
  it('separates ready, indexing, failed and legacy documents, and active provider configuration', () => {
    const sources = [undefined, 'ready', 'indexing', 'error'].map((indexStatus, i) => ({
      id: String(i), name: 'Curs', indexStatus,
    })) as ReturnType<typeof useAIStore.getState>['knowledgeSources'];
    const ctx = buildTourContext({ ...ai, knowledgeSources: sources, providerKeys: { google: 'saved' } }, [], [], {}, undefined, '/');
    expect(ctx).toMatchObject({ sourceCount: 4, readySourceCount: 2, indexingSourceCount: 1,
      failedSourceCount: 1, aiKeyCount: 1, aiReady: false });
    expect(buildTourContext({ ...ai, apiKey: 'saved' }, [], [], {}, undefined, '/').aiReady).toBe(true);
  });

  it('uses eligible questions and keeps residency and general counts separate', () => {
    const quizzes = [quiz('general'), quiz('rez', { folderId: 'child', tags: ['rezidentiat'] }),
      quiz('deck', { kind: 'flashcard' }), quiz('rez-deck', { kind: 'flashcard', folderId: 'child' }),
      quiz('archived', { archived: true }), quiz('mix', { tags: ['folder-session:child'] })];
    const folders = [{ id: 'root', name: 'Rezidențiat', emoji: '', color: 'blue' as const, createdAt: 0 },
      { id: 'child', name: 'Medicină', parentId: 'root', emoji: '', color: 'blue' as const, createdAt: 0 }];
    const stats = { 'general:q': stat('general'), 'deck:q': stat('deck'),
      'archived:q': stat('archived'), 'ghost:q': stat('ghost') };
    const ctx = buildTourContext(ai, quizzes, folders, stats, undefined, '/', '', 20);
    expect(ctx).toMatchObject({ quizCount: 2, deckCount: 2, residencyQuizCount: 1,
      residencyDeckCount: 1, dueQuizCount: 1, dueCardCount: 1, newCardCount: 1,
      generalDeckCount: 1, generalDueCardCount: 1, generalNewCardCount: 0,
      residencyDueCardCount: 0, residencyNewCardCount: 1, errorCount: 1, simulationQuestionCount: 1 });
    expect(buildTourContext(ai, quizzes, folders, { ...stats, 'general:q': stat('general', { consecutiveCorrect: 3 }) }, undefined, '/').errorCount).toBe(0);
  });

  it('tracks the active profile plan and uses stable hook snapshots', () => {
    const summary = { ts: 0, exam: '2026-11-15', phase: 1, done: 2, total: 10, pct: 20, streak: 0, today: null };
    useOrganizareStore.setState({ byProfile: { p1: { state: null, root: null, summary } } });
    const { result, rerender } = renderHook(useTourContext, {
      wrapper: ({ children }) => <MemoryRouter initialEntries={['/settings?s=ai']}>{children}</MemoryRouter>,
    });
    expect(result.current).toMatchObject({ hasPlan: true, planDoneCount: 2, planTopicCount: 10, search: '?s=ai' });
    const previous = result.current;
    rerender();
    expect(result.current).toBe(previous);
    expect(readTourContext('/settings', '?s=ai')).toEqual(result.current);
    act(() => useUserStore.setState({ activeProfileId: 'p2' }));
    expect(result.current).toMatchObject({ hasPlan: false, planDoneCount: 0 });
  });

  it('refreshes due counts when time passes without another store update', () => {
    vi.useFakeTimers();
    try {
      const now = Date.now();
      useQuizStore.setState({ quizzes: [quiz('general')] });
      useStatsStore.setState({ questionStats: { 'general:q': stat('general', { nextReview: now + 30_000 }) } });
      const { result, unmount } = renderHook(useTourContext, { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
      expect(result.current.dueQuizCount).toBe(0);
      act(() => vi.advanceTimersByTime(60_000));
      expect(result.current.dueQuizCount).toBe(1);
      unmount();
    } finally { vi.useRealTimers(); }
  });
});

describe('contextual steps', () => {
  it('all registered tours adapt wording and stay readable across relevant states', () => {
    const contexts = [empty(), { ...empty(), aiReady: true, aiKeyCount: 2, quizCount: 2,
      deckCount: 1, errorCount: 2, hasPlan: true, planDoneCount: 2, planTopicCount: 10,
      sourceCount: 3, readySourceCount: 1, indexingSourceCount: 1, failedSourceCount: 1,
      dueCardCount: 2, newCardCount: 1, residencyQuizCount: 1, residencyDeckCount: 1,
      simulationQuestionCount: 20 }];
    expect(Object.keys(TOURS)).toHaveLength(23);
    for (const tour of Object.values(TOURS)) {
      expect(tour.steps.some((step) => typeof step.body === 'function'), tour.id).toBe(true);
      for (const ctx of contexts) for (const step of tour.steps) {
        const body = typeof step.body === 'function' ? step.body(ctx) : step.body;
        expect(body, step.id).not.toMatch(/undefined|NaN|[?][a-zăâîșț]/i);
      }
    }
  });

  it('skips unavailable errors, residency decks and simulation controls', () => {
    const ctx = { ...empty(), quizCount: 5, deckCount: 3 };
    for (const [tour, id] of [['errors', 'errors-entry'], ['residency', 'residency-disciplines'],
      ['residencyFlashcards', 'rez-flash-due'], ['simulation', 'simulation-lengths']] as const) {
      expect(TOURS[tour].steps.find((step) => step.id === id)?.when?.(ctx)).toBe(false);
    }
    expect(TOURS.residency.steps.find((step) => step.id === 'residency-import')?.when?.(ctx)).toBe(true);
    for (const tour of Object.values(TOURS)) for (const step of tour.steps) {
      if (step.completeWhen) expect(tour.id).toBe('onboarding');
    }
  });
});

describe('tour navigation', () => {
  it('compares pathname and query and clears stale query destinations', () => {
    expect(isTourRouteCurrent('/settings?s=ai', '/settings', '?s=ai')).toBe(true);
    expect(isTourRouteCurrent('/settings?s=ai', '/settings', '?s=date')).toBe(false);
    expect(isTourRouteCurrent('/settings?s=ai', '/quizzes', '?s=ai')).toBe(false);
    expect(isTourRouteCurrent('/quizzes', '/quizzes', '?search=old')).toBe(false);
    expect(isTourRouteCurrent('/quizzes', '/quizzes', '')).toBe(true);
  });
});
