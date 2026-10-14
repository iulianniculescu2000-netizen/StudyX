import { getVaultChunksBySource } from '../../ai/vectorStore';
import type { ChunkRecord } from '../../ai/types';
import type { AIKnowledgeSource } from '../../store/aiStore';
import { isBundledLibraryBookName } from '../../lib/rezidentiatLibrary';

export interface SourceCitationTarget {
  sourceId?: string;
  sourceName?: string;
  pdfPage?: number;
  printedPage?: number;
  excerpt?: string;
  /** Nivelul sursei citate (carte de bază / material), dacă se știe. */
  tier?: 'book' | 'bank' | 'general';
}

export function findCitationSource(sources: readonly AIKnowledgeSource[], target: SourceCitationTarget): AIKnowledgeSource | undefined {
  const normalized = (name: string) => name.trim().replace(/\.(pdf|docx?|txt|md)$/i, '').toLocaleLowerCase();
  const name = target.sourceName ? normalized(target.sourceName) : '';
  if (target.sourceId) {
    const byId = sources.find((source) => source.id === target.sourceId);
    if (byId) return byId;
    // Id-ul unei cărți de bază se schimbă dacă a fost refăcută (ștearsă și readăugată): numele ei garantează același conținut,
    // deci citările mai vechi din chat tot se deschid. La un document obișnuit un id dispărut rămâne dispărut.
    return name && isBundledLibraryBookName(target.sourceName ?? '') ? sources.find((source) => normalized(source.name) === name) : undefined;
  }
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
