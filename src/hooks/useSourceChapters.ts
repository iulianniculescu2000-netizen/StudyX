import { useEffect, useState } from 'react';
import { getVaultChunksBySource } from '../ai/vectorStore';
import { groupChunksIntoChapters } from '../lib/ai/chapterGrouping';
export type { SourceChapter } from '../lib/ai/chapterGrouping';
import type { SourceChapter } from '../lib/ai/chapterGrouping';

/**
 * Per-source chapter detection for the Knowledge Vault. Grouping logic itself
 * lives in `groupChunksIntoChapters` (shared with the multi-source folder
 * aggregator in `useFolderChapters`) — this hook just fetches one source's
 * chunks and wraps it in load state.
 */
export function useSourceChapters(sourceId: string | null) {
  const [chapters, setChapters] = useState<SourceChapter[]>([]);
  const [loading, setLoading] = useState(false);

  const [prevSourceId, setPrevSourceId] = useState(sourceId);

  if (sourceId !== prevSourceId) {
    setPrevSourceId(sourceId);
    if (!sourceId) {
      setChapters([]);
      setLoading(false);
    } else {
      setLoading(true);
    }
  }

  useEffect(() => {
    if (!sourceId) return;
    let cancelled = false;
    void getVaultChunksBySource(sourceId).then((chunks) => {
      if (cancelled) return;
      setChapters(groupChunksIntoChapters(chunks));
      setLoading(false);
    }).catch(() => {
      if (!cancelled) {
        setChapters([]);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [sourceId]);

  return { chapters, loading };
}
