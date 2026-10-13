import { describe, expect, it } from 'vitest';
import { hasSiblingFolderNamed } from './folderStore';

const folders = [
  { name: 'Anatomie', parentId: null },
  { name: 'Cardiologie', parentId: 'a' },
];

describe('hasSiblingFolderNamed', () => {
  it('matches same parent ignoring case, diacritics and spaces', () => {
    expect(hasSiblingFolderNamed(folders, '  anatomie ', null)).toBe(true);
    expect(hasSiblingFolderNamed(folders, 'ANATOMIE', undefined)).toBe(true);
  });
  it('allows the same name under another parent or an empty name', () => {
    expect(hasSiblingFolderNamed(folders, 'Cardiologie', null)).toBe(false);
    expect(hasSiblingFolderNamed(folders, 'Cardiologie', 'a')).toBe(true);
    expect(hasSiblingFolderNamed(folders, '  ', null)).toBe(false);
  });
});
