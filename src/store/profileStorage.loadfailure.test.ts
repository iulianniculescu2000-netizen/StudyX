/**
 * "Load failed -> do not save": a read that errors must never be mistaken for an empty profile,
 * otherwise the first edit overwrites the good copy on disk with a near-empty snapshot.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  flushProfileDataSync,
  isNamespaceBlocked,
  isProfileStorageError,
  listQuarantinedKeys,
  loadProfileData,
  loadRetryConfig,
  retryBlockedProfileLoad,
  saveProfileData,
  saveProfileNamespace,
} from './profileStorage';
import { useQuizStore } from './quizStore';
import { useToastStore } from './toastStore';
import type { Quiz } from '../types';

const PROFILE = 'p-loadfail';
const QUIZ_KEY = `studyx-p-${PROFILE}-quizzes`;
const electronAPI = window.electronAPI as unknown as Record<string, unknown>;

function makeQuiz(id: string): Quiz {
  return { id, title: id, description: '', emoji: 'q', category: 'c', color: 'blue', questions: [], createdAt: 1 };
}
const goodQuizzes = () => ({ quizzes: [makeQuiz('real-work')], sessions: [] });

let disk: Map<string, string>;
let saves: string[];
let loadImpl: (profile: string, ns: string) => Promise<unknown>;

beforeEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  disk = new Map();
  saves = [];
  loadRetryConfig.delays = [1, 1];
  loadRetryConfig.timeoutMs = 50;
  useQuizStore.getState()._hydrate({ quizzes: [], sessions: [] });
  useToastStore.setState({ toasts: [] });
  loadImpl = async (p, ns) => {
    const raw = disk.get(`${p}:${ns}`);
    return raw ? JSON.parse(raw) : null;
  };
  electronAPI.storageLoad = (p: string, ns: string) => loadImpl(p, ns);
  electronAPI.storageSave = async (p: string, ns: string, serialized: string) => {
    saves.push(`${p}:${ns}`);
    disk.set(`${p}:${ns}`, serialized);
    return true;
  };
});

describe('read outcomes', () => {
  it('ok: loads what is on disk and keeps saving enabled', async () => {
    disk.set(`${PROFILE}:quizzes`, JSON.stringify(goodQuizzes()));
    await loadProfileData(PROFILE);
    expect(useQuizStore.getState().quizzes).toHaveLength(1);
    expect(isNamespaceBlocked(PROFILE, 'quizzes')).toBe(false);
  });

  it('missing: a brand-new profile starts empty, is not blocked and can save', async () => {
    await loadProfileData(PROFILE);
    expect(isNamespaceBlocked(PROFILE, 'quizzes')).toBe(false);
    useQuizStore.getState()._hydrate(goodQuizzes());
    await saveProfileNamespace(PROFILE, 'quizzes');
    expect(saves).toContain(`${PROFILE}:quizzes`);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('transient error then ok: retries and loads normally, no toast', async () => {
    disk.set(`${PROFILE}:quizzes`, JSON.stringify(goodQuizzes()));
    let calls = 0;
    const base = loadImpl;
    loadImpl = async (p, ns) => {
      if (ns === 'quizzes' && calls++ < 2) throw new Error('IPC hiccup');
      return base(p, ns);
    };
    await loadProfileData(PROFILE);
    expect(useQuizStore.getState().quizzes).toHaveLength(1);
    expect(isNamespaceBlocked(PROFILE, 'quizzes')).toBe(false);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('timeout counts as a failure', async () => {
    loadImpl = (_p, ns) => (ns === 'quizzes' ? new Promise(() => undefined) : Promise.resolve(null));
    await loadProfileData(PROFILE);
    expect(isNamespaceBlocked(PROFILE, 'quizzes')).toBe(true);
  });
});

describe('permanent failure: zero writes', () => {
  beforeEach(async () => {
    disk.set(`${PROFILE}:quizzes`, JSON.stringify(goodQuizzes()));
    loadImpl = async (_p, ns) => {
      if (ns === 'quizzes') throw new Error('EIO');
      return null;
    };
    await loadProfileData(PROFILE);
  });

  it('blocks the failed namespace, keeps the original, and tells the user with a retry action', () => {
    expect(isNamespaceBlocked(PROFILE, 'quizzes')).toBe(true);
    expect(isNamespaceBlocked(PROFILE, 'folders')).toBe(false);
    const toast = useToastStore.getState().toasts.find((t) => t.type === 'error');
    expect(toast?.action?.label).toBe('Reîncearcă încărcarea');
    expect(disk.get(`${PROFILE}:quizzes`)).toContain('real-work');
  });

  it('never writes the blocked namespace (autosave, saveProfileData, sync flush)', async () => {
    useQuizStore.getState()._hydrate({ quizzes: [makeQuiz('edited-in-session')], sessions: [] });
    await saveProfileData(PROFILE);
    flushProfileDataSync(PROFILE);
    const err = await saveProfileNamespace(PROFILE, 'quizzes').catch((e: unknown) => e);
    expect(isProfileStorageError(err)).toBe(true);
    expect(saves).not.toContain(`${PROFILE}:quizzes`);
    expect(localStorage.getItem(QUIZ_KEY)).toBeNull();
    expect(disk.get(`${PROFILE}:quizzes`)).toContain('real-work');
    // session edits stay in memory
    expect(useQuizStore.getState().quizzes[0].id).toBe('edited-in-session');
  });

  it('retry that still fails stays blocked', async () => {
    expect(await retryBlockedProfileLoad(PROFILE)).toBe(false);
    expect(isNamespaceBlocked(PROFILE, 'quizzes')).toBe(true);
  });

  it('retry that succeeds loads disk data, preserves session edits aside, and resumes saving', async () => {
    useQuizStore.getState()._hydrate({ quizzes: [makeQuiz('edited-in-session')], sessions: [] });
    loadImpl = async (p, ns) => {
      const raw = disk.get(`${p}:${ns}`);
      return raw ? JSON.parse(raw) : null;
    };
    expect(await retryBlockedProfileLoad(PROFILE)).toBe(true);
    expect(isNamespaceBlocked(PROFILE, 'quizzes')).toBe(false);
    expect(useQuizStore.getState().quizzes.map((q) => q.id)).toEqual(['real-work']);
    const aside = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? '').filter((k) => k.includes('__session-'));
    expect(aside.length).toBe(1);
    expect(localStorage.getItem(aside[0])).toContain('edited-in-session');
    expect(useToastStore.getState().toasts.some((t) => t.type === 'error')).toBe(false);
    useQuizStore.getState().togglePin('real-work');
    await saveProfileNamespace(PROFILE, 'quizzes');
    expect(saves).toContain(`${PROFILE}:quizzes`);
  });
});

describe('quarantine failure must not lead to an overwrite', () => {
  it('unreadable localStorage blob + backup fails -> namespace blocked, original untouched', async () => {
    electronAPI.storageLoad = undefined;
    electronAPI.storageSave = undefined;
    localStorage.setItem(QUIZ_KEY, '{"quizzes":[{"id":"real-work"');
    const original = localStorage.getItem(QUIZ_KEY);
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' });
    });
    try {
      await loadProfileData(PROFILE);
      expect(isNamespaceBlocked(PROFILE, 'quizzes')).toBe(true);
      useQuizStore.getState()._hydrate(goodQuizzes());
      await saveProfileData(PROFILE);
    } finally {
      spy.mockRestore();
    }
    expect(localStorage.getItem(QUIZ_KEY)).toBe(original);
    expect(listQuarantinedKeys(PROFILE)).toHaveLength(0);
  });

  it('corrupt legacy blob is quarantined instead of crashing the whole read', async () => {
    electronAPI.storageLoad = undefined;
    localStorage.setItem('studyx-quizzes-v3', '{ not json');
    await loadProfileData(PROFILE);
    expect(isNamespaceBlocked(PROFILE, 'quizzes')).toBe(false);
    expect(localStorage.getItem('studyx-quizzes-v3')).toBe('{ not json');
    expect(listQuarantinedKeys(PROFILE).length).toBeGreaterThan(0);
  });
});
