import { useEffect, useRef } from 'react';
import { useFolderStore } from '../store/folderStore';
import { useNotesStore } from '../store/notesStore';
import { useQuizStore } from '../store/quizStore';
import { useStatsStore } from '../store/statsStore';
import { useAIStore } from '../store/aiStore';
import { flushProfileDataSync, loadProfileData, saveProfileData, saveProfileNamespace } from '../store/profileStorage';
import { cancelIdleTask, scheduleIdleTask } from '../lib/idleTaskScheduler';

type AddToast = (message: string, type?: 'success' | 'error' | 'warning' | 'info', duration?: number) => void;

type Options = {
  activeProfileId: string | null;
  setIsSwapping: (value: boolean) => void;
  resetSaveStatus: () => void;
  addToast: AddToast;
};

export function useProfileLifecycle({
  activeProfileId,
  setIsSwapping,
  resetSaveStatus,
  addToast,
}: Options) {
  const prevProfileIdRef = useRef<string | null>(null);
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const saveIdleRef = useRef<Record<string, number>>({});
  // Synchronous lock — unlike the `isSwapping` STATE this used to gate on,
  // a ref is readable/writable immediately, not just after the next commit.
  // React 18 StrictMode (dev only) invokes a freshly-mounted effect's setup
  // twice back-to-back before either invocation's `setState` has committed,
  // so both used to read the same stale `isSwapping === false` and both would
  // start swapping concurrently. This still works if a future edit drops
  // `isSwapping` from the dependency array — nothing here depends on it.
  const isSwappingRef = useRef(false);
  const activeProfileIdRef = useRef(activeProfileId);
  activeProfileIdRef.current = activeProfileId;

  useEffect(() => {
    const swapProfile = async () => {
      if (isSwappingRef.current) return;
      const current = activeProfileIdRef.current;
      const prev = prevProfileIdRef.current;
      if (prev === current) return;

      isSwappingRef.current = true;
      setIsSwapping(true);
      try {
        if (prev) {
          await saveProfileData(prev);
        }

        if (current) {
          await loadProfileData(current);
        }

        prevProfileIdRef.current = current;
      } catch {
        addToast('Eroare la schimbarea profilului.', 'error');
      } finally {
        isSwappingRef.current = false;
        setIsSwapping(false);
        resetSaveStatus();
        // `activeProfileId` may have changed again while this swap was in
        // flight — the lock above would have made that render's invocation a
        // no-op, so nothing else will retry it unless done explicitly here.
        if (activeProfileIdRef.current !== prevProfileIdRef.current) {
          void swapProfile();
        }
      }
    };

    void swapProfile();
  }, [activeProfileId, addToast, resetSaveStatus, setIsSwapping]);

  useEffect(() => {
    if (!activeProfileId) return;

    const namespaces: Array<'quizzes' | 'folders' | 'stats' | 'notes' | 'ai'> = ['quizzes', 'folders', 'stats', 'notes', 'ai'];

    const clearScheduledSave = (namespace: 'quizzes' | 'folders' | 'stats' | 'notes' | 'ai') => {
      const key = `${activeProfileId}:${namespace}`;
      const timer = saveTimersRef.current[key];
      if (timer) {
        clearTimeout(timer);
        delete saveTimersRef.current[key];
      }
      const idleHandle = saveIdleRef.current[key];
      if (typeof idleHandle === 'number') {
        cancelIdleTask(idleHandle);
        delete saveIdleRef.current[key];
      }
    };

    const persistNamespace = (namespace: 'quizzes' | 'folders' | 'stats' | 'notes' | 'ai') => {
      const key = `${activeProfileId}:${namespace}`;
      clearScheduledSave(namespace);
      void saveProfileNamespace(activeProfileId, namespace).catch(() => {
        // Auto-save errors handled silently - user sees save status
      }).finally(() => {
        delete saveIdleRef.current[key];
      });
    };

    const scheduleSave = (namespace: 'quizzes' | 'folders' | 'stats' | 'notes' | 'ai') => {
      const key = `${activeProfileId}:${namespace}`;
      clearScheduledSave(namespace);

      saveTimersRef.current[key] = setTimeout(() => {
        delete saveTimersRef.current[key];
        if (document.visibilityState === 'hidden') {
          persistNamespace(namespace);
          return;
        }
        saveIdleRef.current[key] = scheduleIdleTask(
          () => persistNamespace(namespace),
          {
            timeoutMs: namespace === 'stats' ? 1200 : 2400,
            dedupeKey: `profile-save:${key}`,
          },
        );
      }, namespace === 'stats' ? 1600 : 2800);
    };

    const flushPending = async () => {
      namespaces.forEach(clearScheduledSave);
      // Guaranteed synchronous safety net FIRST: pagehide/reload/close does
      // not wait for async work, so anything that must survive the page
      // going away has to land in localStorage before this function does
      // anything else. The async saveProfileData below still runs after (its
      // normal error toasts + Electron disk save) — the matching cached
      // snapshot makes it a cheap no-op when the sync flush already wrote it.
      if (activeProfileId) flushProfileDataSync(activeProfileId);
      // Every caller fires this as `void flushPending()` (unload/visibility
      // paths), so a rejected save must be absorbed here. The user is already
      // warned by the toast profileStorage raises.
      await saveProfileData(activeProfileId).catch(() => undefined);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void flushPending();
      }
    };

    const handlePageHide = () => {
      void flushPending();
    };

    const u1 = useQuizStore.subscribe(() => scheduleSave('quizzes'));
    const u2 = useFolderStore.subscribe(() => scheduleSave('folders'));
    const u3 = useStatsStore.subscribe(() => scheduleSave('stats'));
    const u4 = useNotesStore.subscribe(() => scheduleSave('notes'));
    const u5 = useAIStore.subscribe(() => scheduleSave('ai'));
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      void flushPending();
    };
  }, [activeProfileId]);

  useEffect(() => {
    if (!window.electronAPI?.onAppClose) return;

    const unsub = window.electronAPI.onAppClose(async () => {
      if (activeProfileId) {
        try {
          await saveProfileData(activeProfileId);
        } catch {
          // Silent fail on close - critical path
        }
      }
      window.electronAPI?.destroy();
    });

    return () => unsub();
  }, [activeProfileId]);
}
