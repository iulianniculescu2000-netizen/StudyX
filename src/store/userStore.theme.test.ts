import { beforeEach, describe, expect, it } from 'vitest';
import { useUserStore } from './userStore';

describe('profiles no longer carry a theme', () => {
  beforeEach(() => {
    localStorage.clear();
    useUserStore.getState().reset();
  });

  it('migrates a saved v3 state: profiles keep their data, the old theme fields are dropped', () => {
    const migrate = useUserStore.persist.getOptions().migrate!;
    const migrated = migrate(
      {
        themeId: 'glass',
        activeProfileId: 'p1',
        username: 'Ana',
        profiles: [
          { id: 'p1', username: 'Ana', themeId: 'glass', gradient: 'g1', createdAt: 1 },
          { id: 'p2', username: 'Radu', themeId: 'obsidian', gradient: 'g2', createdAt: 2 },
        ],
      },
      3,
    ) as { themeId?: unknown; activeProfileId: string; username: string; profiles: Record<string, unknown>[] };

    expect(migrated).not.toHaveProperty('themeId');
    expect(migrated.activeProfileId).toBe('p1');
    expect(migrated.username).toBe('Ana');
    expect(migrated.profiles).toEqual([
      { id: 'p1', username: 'Ana', gradient: 'g1', createdAt: 1 },
      { id: 'p2', username: 'Radu', gradient: 'g2', createdAt: 2 },
    ]);
  });

  it('creates, switches and removes profiles as before', () => {
    const id = useUserStore.getState().addProfile('Maria');
    useUserStore.getState().switchProfile(id);
    expect(useUserStore.getState().username).toBe('Maria');
    expect(useUserStore.getState().profiles[0]).not.toHaveProperty('themeId');

    useUserStore.getState().removeProfile(id);
    expect(useUserStore.getState().profiles).toHaveLength(0);
    expect(useUserStore.getState().activeProfileId).toBeNull();
  });
});
