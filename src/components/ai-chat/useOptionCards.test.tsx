import { act, renderHook, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFolderStore } from '../../store/folderStore';
import { useQuizStore } from '../../store/quizStore';
import type { Quiz } from '../../types';
import type { ChatMessage } from './shared';

const executeAgentPlan = vi.fn();
vi.mock('../../lib/ai/agent', () => ({ executeAgentPlan: (...args: unknown[]) => executeAgentPlan(...args) }));

import { useOptionCards } from './useOptionCards';

function setup(chatThread: 'general' | 'rezidentiat' = 'rezidentiat') {
  return renderHook(() => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const messagesRef = useRef<ChatMessage[]>(messages);
    messagesRef.current = messages;
    return { messages, ...useOptionCards({ setMessages, messagesRef, chatThread }) };
  });
}

const deck = (id: string, folderId: string | null, tags: string[] = ['flashcard']): Quiz => ({
  id, title: 't', description: '', emoji: '🃏', category: 'c', kind: 'flashcard', folderId, color: 'blue', tags, createdAt: 1,
  questions: [{ id: 'q', text: 'Care este criteriul?', multipleCorrect: false, difficulty: 'medium', explanation: '', options: [{ id: 'a', text: 'Da', isCorrect: true }] }],
});

beforeEach(() => {
  // Testul așteaptă lucru asincron real (generarea simulată); cronometrele false din setup l-ar bloca.
  vi.useRealTimers();
  executeAgentPlan.mockReset();
  useFolderStore.setState({ folders: [] });
  useQuizStore.setState({ quizzes: [] });
});

describe('useOptionCards', () => {
  it('ignoră mesajele care nu sunt cereri de generare', () => {
    const { result } = setup();
    expect(result.current.tryHandleOptionRequest('ce este sepsisul?')).toBe(false);
    expect(result.current.messages).toHaveLength(0);
  });

  it('o cerere incompletă pune o carte de opțiuni, fără să genereze nimic', () => {
    const { result } = setup('rezidentiat');
    act(() => { expect(result.current.tryHandleOptionRequest('Fă-mi flashcarduri despre pancreatita acută')).toBe(true); });
    expect(executeAgentPlan).not.toHaveBeenCalled();
    const card = result.current.messages[0].optionCard!;
    expect(card).toMatchObject({ kind: 'flashcards', status: 'pending', space: 'rezidentiat', topic: 'pancreatita acută', difficulty: 'auto' });
    expect(result.current.messages[0].content).toContain('pancreatita acută');
  });

  it('o cerere completă generează direct, în folderul numit, fără întrebări', async () => {
    useFolderStore.setState({ folders: [] });
    executeAgentPlan.mockImplementation(async (plan: { steps: Array<{ folderId?: string }> }) => {
      useQuizStore.getState().addQuiz(deck('d1', plan.steps[0].folderId ?? null));
      return { summary: '', createdQuizIds: ['d1'], errors: [], undo: null };
    });
    const { result } = setup('rezidentiat');
    act(() => { result.current.tryHandleOptionRequest('fă-mi 15 flashcarduri ușoare despre sepsis în folderul Urgențe'); });
    await waitFor(() => expect(result.current.messages[0].optionCard?.status).toBe('done'));

    const step = executeAgentPlan.mock.calls[0][0].steps[0];
    expect(step).toMatchObject({ action: 'create_flashcards_topic', topic: 'sepsis', count: 15, difficulty: 'easy' });
    const folder = useFolderStore.getState().folders.find((entry) => entry.id === step.folderId)!;
    expect(folder.name).toBe('Urgențe');
    expect(result.current.messages[0].content).toContain('Gata');
    expect(result.current.messages[0].optionCard?.route?.route).toBe('/flashcards/session/d1?mode=all');
  });

  it('trimite după alegerile editate în carte', async () => {
    executeAgentPlan.mockImplementation(async () => {
      useQuizStore.getState().addQuiz(deck('d2', null));
      return { summary: '', createdQuizIds: ['d2'], errors: [], undo: null };
    });
    const { result } = setup('general');
    act(() => { result.current.tryHandleOptionRequest('fă-mi flashcarduri despre HTA'); });
    act(() => { result.current.editOptionCard(0, { count: 30, difficulty: 'hard' }); });
    act(() => { result.current.submitOptionCard(0); });
    await waitFor(() => expect(result.current.messages[0].optionCard?.status).toBe('done'));
    expect(executeAgentPlan.mock.calls[0][0].steps[0]).toMatchObject({ count: 30, difficulty: 'hard' });
    expect(executeAgentPlan.mock.calls[0][1]).toMatchObject({ residencyScope: false });
  });

  it('la eșec arată motivul și nu lasă un folder gol creat pentru cerere', async () => {
    executeAgentPlan.mockResolvedValue({ summary: '', createdQuizIds: [], errors: ['limită de cereri'], undo: null });
    const { result } = setup('rezidentiat');
    act(() => { result.current.tryHandleOptionRequest('fă-mi 10 flashcarduri mixte despre sepsis în folderul Gol'); });
    await waitFor(() => expect(result.current.messages[0].optionCard?.status).toBe('error'));
    expect(result.current.messages[0].content).toContain('Nu a ieșit');
    expect(useFolderStore.getState().folders.some((folder) => folder.name === 'Gol')).toBe(false);
  });

  it('„Renunț” închide cererea fără să genereze', () => {
    const { result } = setup();
    act(() => { result.current.tryHandleOptionRequest('fă-mi grile despre HTA'); });
    act(() => { result.current.cancelOptionCard(0); });
    expect(result.current.messages[0].optionCard?.status).toBe('cancelled');
    expect(executeAgentPlan).not.toHaveBeenCalled();
  });

  it('o cerere de grile cere pasul potrivit, cu stilul spațiului', async () => {
    executeAgentPlan.mockImplementation(async () => {
      useQuizStore.getState().addQuiz({ ...deck('q1', null), kind: 'quiz' });
      return { summary: '', createdQuizIds: ['q1'], errors: [], undo: null };
    });
    const { result } = setup('rezidentiat');
    act(() => { result.current.tryHandleOptionRequest('generează 10 grile dificile cu complement multiplu despre insuficiența cardiacă în folderul Cardio'); });
    await waitFor(() => expect(result.current.messages[0].optionCard?.status).toBe('done'));
    expect(executeAgentPlan.mock.calls[0][0].steps[0]).toMatchObject({
      action: 'generate_quiz_topic', questionsPerPack: 10, difficulty: 'hard', questionType: 'multiple', examStyle: 'residency',
    });
    expect(result.current.messages[0].optionCard?.route?.route).toBe('/play/q1');
  });
});
