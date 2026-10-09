import { beforeEach, describe, expect, it } from 'vitest';
import { useFolderStore } from '../store/folderStore';
import { useQuizStore } from '../store/quizStore';
import { importRezidentiatBank } from './rezidentiatBank';
import type { RezidentiatBankInfo } from './rezidentiatBank';

const bank = {
  tag: 'rezidentiat-bank:test',
  load: async () => [{
    discipline: 'Chirurgie',
    specialties: [{ specialty: 'Esofag', quizzes: [{ title: 'Test 1', questions: [{ text: 'q', options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }] }] }] }],
  }],
} as unknown as RezidentiatBankInfo;

beforeEach(() => {
  useFolderStore.getState()._hydrate({ folders: [] });
  useQuizStore.getState()._hydrate({ quizzes: [], sessions: [] });
});

describe('importRezidentiatBank', () => {
  it('reuses a root spelled without diacritics instead of creating a second one', async () => {
    const existing = useFolderStore.getState().addFolder('Rezidentiat', '🩺', 'blue', null);
    await importRezidentiatBank(bank);
    const roots = useFolderStore.getState().folders.filter((f) => !f.parentId);
    expect(roots.map((f) => f.id)).toEqual([existing]);
  });

  it('reuses discipline folders that differ only by case or diacritics', async () => {
    const root = useFolderStore.getState().addFolder('Rezidențiat', '🩺', 'blue', null);
    useFolderStore.getState().addFolder('CHIRURGIE', '📚', 'blue', root);
    await importRezidentiatBank(bank);
    const disciplines = useFolderStore.getState().folders.filter((f) => f.parentId === root);
    expect(disciplines).toHaveLength(1);
  });
});
