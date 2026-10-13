import { beforeEach, describe, expect, it, vi } from 'vitest';
import { purgeProfileData } from './profilePurge';
import { saveProfileNamespace, loadProfileData } from './profileStorage';
import { useUserStore } from './userStore';
import { useOrganizareStore } from './organizareStore';
import { useTutorialStore } from './tutorialStore';
import { useQuizStore } from './quizStore';

vi.mock('../lib/idb', () => ({
  idbGet: vi.fn(async () => null),
  idbSet: vi.fn(async () => undefined),
  idbRemove: vi.fn(async () => undefined),
}));

const keysOf = (id: string) => {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.includes(id)) keys.push(key);
  }
  return keys;
};

beforeEach(() => {
  localStorage.clear();
  window.electronAPI = undefined;
});

describe('purgeProfileData', () => {
  it('removes every localStorage key, store entry and disk folder of the profile and keeps the others', async () => {
    const storageDeleteProfile = vi.fn(async () => true);
    window.electronAPI = { storageDeleteProfile } as never;
    for (const id of ['gone', 'kept']) {
      for (const ns of ['quizzes', 'folders', 'stats', 'notes', 'ai']) localStorage.setItem(`studyx-p-${id}-${ns}`, '{}');
      localStorage.setItem(`studyx-p-${id}-quizzes__corrupt-123`, 'x');
      localStorage.setItem(`studyx-ai-profile:${id}`, '{}');
      localStorage.setItem(`studyx-legacy-memory-ported:${id}`, '1');
      localStorage.setItem(`studyx-chat-memory-${id}`, '[]');
      localStorage.setItem(`studyx-chat-summary-${id}-main`, '{}');
    }
    useOrganizareStore.setState({ byProfile: { gone: { state: null, summary: null, root: null }, kept: { state: null, summary: null, root: null } } });
    useTutorialStore.setState({ seen: { gone: { onboarding: '1' }, kept: { onboarding: '1' } } });

    await purgeProfileData('gone');

    expect(keysOf('gone')).toEqual([]);
    expect(keysOf('kept')).toHaveLength(10);
    expect(Object.keys(useOrganizareStore.getState().byProfile)).toEqual(['kept']);
    expect(Object.keys(useTutorialStore.getState().seen)).toEqual(['kept']);
    expect(storageDeleteProfile).toHaveBeenCalledWith('gone');
  });

  it('autosave cannot re-create the keys after the purge, even for the profile that was loaded', async () => {
    await loadProfileData('doomed');
    useQuizStore.getState().addQuiz({ id: 'q', title: 'T', description: '', emoji: '', color: 'blue', category: 'C', kind: 'quiz', questions: [], createdAt: 1 });
    await saveProfileNamespace('doomed', 'quizzes');
    expect(keysOf('doomed').length).toBeGreaterThan(0);

    await purgeProfileData('doomed');
    useQuizStore.getState().addQuiz({ id: 'q2', title: 'T2', description: '', emoji: '', color: 'blue', category: 'C', kind: 'quiz', questions: [], createdAt: 2 });
    await saveProfileNamespace('doomed', 'quizzes');
    expect(keysOf('doomed')).toEqual([]);
  });

  it('removeProfile triggers the purge', async () => {
    localStorage.setItem('studyx-p-p1-quizzes', '{}');
    useUserStore.setState({ profiles: [{ id: 'p1', username: 'A', gradient: '', createdAt: 1 }], activeProfileId: null });
    useUserStore.getState().removeProfile('p1');
    await vi.waitFor(() => expect(localStorage.getItem('studyx-p-p1-quizzes')).toBeNull());
  });
});
