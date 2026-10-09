import { useEffect } from 'react';
import { useFolderStore } from '../store/folderStore';
import { useNotesStore } from '../store/notesStore';
import { useQuizStore } from '../store/quizStore';
import { useStatsStore } from '../store/statsStore';
import { useUserStore } from '../store/userStore';
import { useOrganizareStore } from '../store/organizareStore';
import { useAIStore } from '../store/aiStore';

const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours (Daily)
const LAST_BACKUP_KEY = 'studyx-last-auto-backup';

/**
 * Runs a weekly auto-backup of all localStorage data to
 * Documents/StudyX-Backups (Electron only).
 * The backup is triggered once per week, on app startup.
 *
 * @param activeProfileId – backup only fires when a profile is active
 */
export function useAutoBackup(activeProfileId: string | null) {
  useEffect(() => {
    if (!activeProfileId) return;

    if (!window.electronAPI?.autoBackup) return; // not Electron
    const electronAPI = window.electronAPI;

    const lastBackup = parseInt(localStorage.getItem(LAST_BACKUP_KEY) ?? '0', 10);
    const now = Date.now();

    if (now - lastBackup < BACKUP_INTERVAL_MS) return; // not yet due

    const { quizzes, sessions } = useQuizStore.getState();
    const { folders } = useFolderStore.getState();
    const { questionStats, streak, totalStudyTime } = useStatsStore.getState();
    const { notes } = useNotesStore.getState();
    const { knowledgeSources, libraryFolders } = useAIStore.getState();
    const { profiles, activeProfileId: currentProfileId, username } = useUserStore.getState();

    const payload = JSON.stringify({
      exportedAt: new Date().toISOString(),
      appVersion: '1.0.0',
      profileId: activeProfileId,
      user: {
        profiles,
        activeProfileId: currentProfileId,
        username,
      },
      stores: {
        quizzes: { quizzes, sessions },
        folders: { folders },
        stats: { questionStats, streak, totalStudyTime },
        notes: { notes },
        ai: { knowledgeSources, libraryFolders },
        organizare: { state: useOrganizareStore.getState().byProfile[activeProfileId]?.state ?? null },
      },
    }, null, 2);

    electronAPI.autoBackup(payload)
      .then((result) => {
        if (result.success) {
          localStorage.setItem(LAST_BACKUP_KEY, String(now));
          console.info('[StudyX] Auto-backup saved to', result.path);
        } else {
          // Silent fail for auto-backup - user notified via toast if needed
        }
      })
      .catch((e: unknown) => {
        // Auto-backup errors are non-critical, logged silently
        void e;
      });
  }, [activeProfileId]);
}
