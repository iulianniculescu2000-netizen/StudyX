import { useEffect, useState } from 'react';
import { getFolderChapters, type AggregatedChapter, type FolderChapterSource } from '../lib/ai/folderChapters';

/** Multi-source chapter aggregation for one Knowledge Vault folder — see getFolderChapters. */
export function useFolderChapters(sources: FolderChapterSource[]) {
  const [chapters, setChapters] = useState<AggregatedChapter[]>([]);
  const [loading, setLoading] = useState(false);
  const key = sources.map((s) => s.id).join(',');

  useEffect(() => {
    if (sources.length === 0) {
      setChapters([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void getFolderChapters(sources).then((result) => {
      if (!cancelled) {
        setChapters(result);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setChapters([]);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { chapters, loading };
}
