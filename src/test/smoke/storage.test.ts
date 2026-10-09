import { describe, it, expect, beforeEach } from 'vitest';
import { loadProfileData, saveProfileData } from '../../store/profileStorage';
import { useFolderStore } from '../../store/folderStore';
import { useNotesStore } from '../../store/notesStore';
import { useQuizStore } from '../../store/quizStore';
import { useStatsStore } from '../../store/statsStore';

type ProfileNamespace = 'quizzes' | 'folders' | 'stats' | 'notes';

describe('Storage Smoke Tests', () => {
  const testProfileId = 'test-profile-id';
  const testNamespaces: ProfileNamespace[] = ['quizzes', 'folders', 'stats', 'notes'];

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  it('should handle profile data loading without crashing', async () => {
    for (const namespace of testNamespaces) {
      void namespace;
      await expect(loadProfileData(testProfileId)).resolves.toBeUndefined();
      expect(useQuizStore.getState().quizzes).toEqual([]);
      expect(useFolderStore.getState().folders).toEqual([]);
      expect(useStatsStore.getState().questionStats).toEqual({});
      expect(useNotesStore.getState().notes).toEqual({});
    }
  });

  it('should handle profile data saving without errors', async () => {
    for (const namespace of testNamespaces) {
      void namespace;
      await expect(
        saveProfileData(testProfileId)
      ).resolves.not.toThrow();
    }
  });

  it('should handle corrupted data gracefully', async () => {
    // Mock localStorage with corrupted data
    localStorage.setItem(`studyx-p-${testProfileId}-quizzes`, 'invalid-json');
    
    await expect(loadProfileData(testProfileId)).resolves.toBeUndefined();
    expect(useQuizStore.getState().quizzes).toEqual([]);
    expect(useQuizStore.getState().sessions).toEqual([]);
  });

  it('should handle missing data gracefully', async () => {
    await expect(loadProfileData('non-existent-profile')).resolves.toBeUndefined();
    expect(useQuizStore.getState().quizzes).toEqual([]);
    expect(useQuizStore.getState().sessions).toEqual([]);
  });
});
