import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createSafePersistStorage } from './safeStorage';

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #0A84FF, #5E5CE6)',
  'linear-gradient(135deg, #AF52DE, #FF375F)',
  'linear-gradient(135deg, #FF9F0A, #FF6B00)',
  'linear-gradient(135deg, #30D158, #32ADE6)',
  'linear-gradient(135deg, #FF453A, #FF375F)',
  'linear-gradient(135deg, #5AC8FA, #5E5CE6)',
];

/**
 * A study profile. It no longer carries a theme: Luminos / Întunecat / Automat is a
 * per-device preference (store/themeStore.ts). Older saves and backups may still have a
 * `themeId` on each profile — it is simply ignored.
 */
export interface Profile {
  id: string;
  username: string;
  gradient: string;
  createdAt: number;
}

interface UserStore {
  profiles: Profile[];
  activeProfileId: string | null;
  pendingTutorialProfileId: string | null;
  // Synced from active profile — kept for backward compat across all components
  username: string | null;
  // Actions
  addProfile: (name: string) => string;
  setUsername: (name: string) => void; // legacy: used by Welcome, creates + activates profile
  switchProfile: (id: string) => void;
  removeProfile: (id: string) => void;
  logout: () => void;
  clearPendingTutorialProfile: (id?: string) => void;
  reset: () => void;
}

function newProfile(name: string, existingCount: number): Profile {
  return {
    id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
    username: name.trim(),
    gradient: AVATAR_GRADIENTS[existingCount % AVATAR_GRADIENTS.length],
    createdAt: Date.now(),
  };
}

export const useUserStore = create<UserStore>()(
  persist(
    (set, get) => ({
      profiles: [],
      activeProfileId: null,
      pendingTutorialProfileId: null,
      username: null,

      addProfile: (name) => {
        const profile = newProfile(name, get().profiles.length);
        set((s) => ({ profiles: [...s.profiles, profile] }));
        return profile.id;
      },

      setUsername: (name) => {
        // Creates a new profile and activates it
        const profile = newProfile(name, get().profiles.length);
        set((s) => ({
          profiles: [...s.profiles, profile],
          activeProfileId: profile.id,
          pendingTutorialProfileId: profile.id,
          username: profile.username,
        }));
      },

      switchProfile: (id) => {
        const profile = get().profiles.find((p) => p.id === id);
        if (!profile) return;
        set({ activeProfileId: id, username: profile.username });
      },

      removeProfile: (id) => {
        const wasActive = get().activeProfileId === id;
        set((s) => ({
          profiles: s.profiles.filter((p) => p.id !== id),
          ...(wasActive ? { activeProfileId: null, username: null } : {}),
          pendingTutorialProfileId: s.pendingTutorialProfileId === id ? null : s.pendingTutorialProfileId,
        }));
      },

      logout: () => set({ activeProfileId: null, username: null }),
      clearPendingTutorialProfile: (id) => set((s) => ({
        pendingTutorialProfileId: !id || s.pendingTutorialProfileId === id ? null : s.pendingTutorialProfileId,
      })),
      reset: () => set({
        profiles: [],
        activeProfileId: null,
        pendingTutorialProfileId: null,
        username: null,
      }),
    }),
    {
      name: 'studyx-user',
      version: 4,
      // A corrupt blob is quarantined instead of being overwritten (it holds the profile list).
      storage: createSafePersistStorage(),
      // v4: themes left the profile. Drop the old per-profile / global theme fields; the
      // theme now lives in store/themeStore.ts (new installs and upgrades start on "Automat").
      migrate: (persisted) => {
        const state = persisted as (Partial<UserStore> & { themeId?: unknown }) | null;
        if (!state || typeof state !== 'object') return persisted as unknown;
        const { themeId: _legacyTheme, ...rest } = state;
        void _legacyTheme;
        return {
          ...rest,
          profiles: (Array.isArray(state.profiles) ? state.profiles : []).filter((profile) => profile && typeof profile === 'object').map((profile) => {
            const { themeId: _profileTheme, ...profileRest } = profile as Profile & { themeId?: unknown };
            void _profileTheme;
            return profileRest;
          }),
        } as unknown;
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Migrate old single-user format to profiles array
        if (state.username && (!state.profiles || state.profiles.length === 0)) {
          const profile = newProfile(state.username, 0);
          state.profiles = [profile];
          state.activeProfileId = profile.id;
          // Mutating `state` does not persist. Without this the random id above is regenerated on every
          // launch until something else writes the store, orphaning the profile's data folder each time.
          // Deferred: `useUserStore` is not assigned yet when hydration is synchronous.
          const migrated = { profiles: state.profiles, activeProfileId: profile.id, username: state.username };
          queueMicrotask(() => useUserStore.setState(migrated));
        }
        // Sync username from active profile
        if (state.activeProfileId && state.profiles) {
          const active = state.profiles.find((p) => p.id === state.activeProfileId);
          if (active) state.username = active.username;
        }
      },
    }
  )
);
