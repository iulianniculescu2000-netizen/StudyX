import { getVaultChunksBySource } from '../../ai/vectorStore';
import type { ChunkRecord } from '../../ai/types';
import type { AIKnowledgeSource } from '../../store/aiStore';

export interface SourceCitationTarget {
  sourceId?: string;
  sourceName?: string;
  pdfPage?: number;
  printedPage?: number;
  excerpt?: string;
}

export function findCitationSource(sources: readonly AIKnowledgeSource[], target: SourceCitationTarget): AIKnowledgeSource | undefined {
  if (target.sourceId) return sources.find((source) => source.id === target.sourceId);
  const normalized = (name: string) => name.trim().replace(/\.(pdf|docx?|txt|md)$/i, '').toLocaleLowerCase();
  const name = target.sourceName ? normalized(target.sourceName) : '';
  return name ? sources.find((source) => normalized(source.name) === name) : undefined;
}

export function textForCitation(chunks: readonly ChunkRecord[], target: SourceCitationTarget): string {
  const page = target.pdfPage;
  const printedPage = target.printedPage;
  const matched = chunks.filter((chunk) => {
    if (page !== undefined && chunk.page !== undefined) {
      return chunk.page <= page && (chunk.pageEnd ?? chunk.page) >= page;
    }
    return printedPage !== undefined && chunk.printedPage === printedPage;
  });
  const text = matched.map((chunk) => chunk.text.trim()).filter(Boolean).join('\n\n');
  if (text) return text;
  return target.excerpt?.trim() || 'Nu mai există text indexat pentru această pagină. Reindexează documentul în Biblioteca AI.';
}

export async function loadSourceCitationText(sourceId: string, target: SourceCitationTarget): Promise<string> {
  const chunks = await getVaultChunksBySource(sourceId);
  return textForCitation(chunks, target);
}
