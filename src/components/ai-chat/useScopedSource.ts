import { useRef, useState } from 'react';

/**
 * The "active document focus" — set when the user jumps into chat from a
 * specific course (via the `studyx:ai-prompt` bridge event) or picks a source
 * in Studio. Read by both the streaming chat's RAG lookup and Studio's
 * generation, which is why it lives outside either.
 *
 * `contextCacheRef` caches retrieved chunks per (text+sourceId) for the
 * session — cleared whenever the scoped source changes, since a cached lookup
 * scoped to the wrong document would silently ground answers in it.
 */
export function useScopedSource() {
  const [scopedSource, setScopedSource] = useState<{ id: string; name: string } | null>(null);
  // Cache context chunks per (text+sourceId) within a session to avoid redundant vault lookups.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contextCacheRef = useRef<Map<string, any[]>>(new Map());

  return { scopedSource, setScopedSource, contextCacheRef };
}
