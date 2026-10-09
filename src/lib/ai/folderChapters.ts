import { getVaultChunksBySource } from '../../ai/vectorStore';
import { groupChunksIntoChapters } from './chapterGrouping';

export interface AggregatedChapter {
  sourceId: string;
  sourceName: string;
  heading: string;
  label: string;
  chunkCount: number;
}

export interface FolderChapterSource {
  id: string;
  name: string;
  addedAt: number;
}

/**
 * Aggregates chapters across every source directly in a Knowledge Vault
 * folder (no subfolder recursion — matches KnowledgeVault.tsx's own
 * non-recursive folder filtering), ordered by when each document was added
 * so the result follows the order material was introduced, closest to a
 * natural syllabus order.
 */
export async function getFolderChapters(sources: FolderChapterSource[]): Promise<AggregatedChapter[]> {
  const ordered = [...sources].sort((a, b) => a.addedAt - b.addedAt);
  const perSource = await Promise.all(ordered.map(async (source) => {
    try {
      const chunks = await getVaultChunksBySource(source.id);
      return groupChunksIntoChapters(chunks).map((chapter) => ({
        ...chapter,
        sourceId: source.id,
        sourceName: source.name,
      }));
    } catch {
      console.warn(`[folderChapters] Failed to load chapters for source "${source.name}" (${source.id})`);
      return [];
    }
  }));
  return perSource.flat();
}
