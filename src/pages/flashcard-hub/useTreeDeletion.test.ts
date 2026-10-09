import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useFolderStore } from '../../store/folderStore';
import { useQuizStore } from '../../store/quizStore';
import { useToastStore } from '../../store/toastStore';
import type { Folder, Quiz } from '../../types';
import { useFolderDeletion } from './useTreeDeletion';

const folder = (id: string, parentId: string | null = null): Folder => ({
  id, name: id, emoji: '📁', color: 'blue', parentId, createdAt: 0, scope: 'flashcards',
});
const deck = (id: string, folderId: string | null): Quiz => ({
  id, title: id, description: '', emoji: '🃏', category: 'T', kind: 'flashcard', folderId, createdAt: 0, color: 'blue', tags: [],
  questions: [{ id: 'q', text: 'f', options: [{ id: 'a', text: 'b', isCorrect: true }] }],
});

beforeEach(() => {
  useToastStore.setState({ toasts: [] });
  useFolderStore.setState({ folders: [folder('f'), folder('sub', 'f')] });
  useQuizStore.setState({ quizzes: [deck('d1', 'f'), deck('d2', 'sub'), deck('d3', null)], sessions: [], _hasHydrated: true });
});

describe('useFolderDeletion', () => {
  it('calculează impactul când se cere ștergerea', () => {
    const { result } = renderHook(() => useFolderDeletion(useFolderStore.getState().folders));
    expect(result.current.folderImpact).toBeNull();
    act(() => result.current.requestFolderDelete(useFolderStore.getState().folders[0]));
    expect(result.current.folderDeleteOpen).toBe(true);
    expect(result.current.folderImpact?.decks).toBe(2);
    expect(result.current.folderImpact?.subfolders).toBe(1);
  });

  it('șterge doar folderul: pachetele merg la Neclasificate, iar Anulează le readuce', () => {
    const { result } = renderHook(() => useFolderDeletion(useFolderStore.getState().folders));
    act(() => result.current.requestFolderDelete(useFolderStore.getState().folders[0]));
    act(() => result.current.confirmFolderDelete(false));
    expect(useFolderStore.getState().folders).toHaveLength(0);
    expect(useQuizStore.getState().quizzes.map((q) => q.id).sort()).toEqual(['d1', 'd2', 'd3']);
    expect(useQuizStore.getState().quizzes.find((q) => q.id === 'd1')?.folderId).toBeNull();
    const toast = useToastStore.getState().toasts[0] as unknown as { action?: { onClick: () => void } };
    act(() => toast.action?.onClick());
    expect(useFolderStore.getState().folders).toHaveLength(2);
    expect(useQuizStore.getState().quizzes.find((q) => q.id === 'd2')?.folderId).toBe('sub');
  });

  it('șterge folderul împreună cu pachetele lui și ale subfolderelor', () => {
    const { result } = renderHook(() => useFolderDeletion(useFolderStore.getState().folders));
    act(() => result.current.requestFolderDelete(useFolderStore.getState().folders[0]));
    act(() => result.current.confirmFolderDelete(true));
    expect(useFolderStore.getState().folders).toHaveLength(0);
    expect(useQuizStore.getState().quizzes.map((q) => q.id)).toEqual(['d3']);
    expect(JSON.stringify(useToastStore.getState().toasts[0])).toContain('2 pachete');
  });
});
