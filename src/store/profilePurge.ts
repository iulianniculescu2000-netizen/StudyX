import { idbGet, idbRemove } from '../lib/idb';
import { markProfilePurged } from './profileStorage';
import { useOrganizareStore } from './organizareStore';
import { useTutorialStore } from './tutorialStore';

/** localStorage keys that belong to one profile, by exact name or by prefix. */
function profileKeyPrefixes(profileId: string): string[] {
  return [
    `studyx-p-${profileId}-`, // quizzes / folders / stats / notes / ai, including `__corrupt-` and `__session-` copies
    `studyx-chat-summary-${profileId}-`,
    `studyx-chat-lastactive-${profileId}-`,
  ];
}

function profileExactKeys(profileId: string): string[] {
  return [
    `studyx-ai-profile:${profileId}`,
    `studyx-legacy-memory-ported:${profileId}`,
    `studyx-chat-memory-${profileId}`,
  ];
}

function removeLocalKeys(profileId: string) {
  const prefixes = profileKeyPrefixes(profileId);
  const doomed: string[] = [...profileExactKeys(profileId)];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && prefixes.some((prefix) => key.startsWith(prefix))) doomed.push(key);
  }
  doomed.forEach((key) => localStorage.removeItem(key));
}

/** The knowledge vault lives in IndexedDB under keys derived from the profile id (see ai/vectorStore.ts). */
async function removeVectorData(profileId: string) {
  const indexKey = `studyx-vectors-index-v2:${profileId}`;
  const index = await idbGet<unknown>(indexKey);
  if (Array.isArray(index)) {
    await Promise.all(index.map((entry) => (
      entry && typeof (entry as { key?: unknown }).key === 'string' ? idbRemove((entry as { key: string }).key) : undefined
    )));
  }
  await idbRemove(indexKey);
}

/**
 * Removes everything stored for a deleted profile: localStorage data and quarantined copies, the AI profile,
 * the per-profile entries of the persisted organizare/tutorial stores, the vector vault and, on desktop,
 * the profile folder on disk. Autosave is switched off for the id first so a pending save cannot bring the keys back.
 * Every step is independent: one failing does not stop the others.
 */
export async function purgeProfileData(profileId: string): Promise<void> {
  if (!profileId) return;
  markProfilePurged(profileId);

  try { removeLocalKeys(profileId); } catch (err) { console.error('[Purge] localStorage failed:', err); }

  useOrganizareStore.setState((s) => {
    if (!(profileId in s.byProfile)) return s;
    const { [profileId]: _removed, ...rest } = s.byProfile;
    void _removed;
    return { byProfile: rest };
  });
  useTutorialStore.setState((s) => {
    if (!(profileId in s.seen)) return s;
    const { [profileId]: _removed, ...rest } = s.seen;
    void _removed;
    return { seen: rest };
  });

  try { await removeVectorData(profileId); } catch (err) { console.error('[Purge] vector data failed:', err); }

  try {
    await window.electronAPI?.storageDeleteProfile?.(profileId);
  } catch (err) {
    console.error('[Purge] disk folder failed:', err);
  }
  // A save that was already in flight may have landed meanwhile.
  try { removeLocalKeys(profileId); } catch { /* best effort */ }
}
