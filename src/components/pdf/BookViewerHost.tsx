import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import BookChapterReaderModal from '../BookChapterReaderModal';
import type { BookViewRequest } from './BookPdfReader';
import { OPEN_BOOK_EVENT, requestForCitation, type OpenBookDetail } from './bookRequest';
import { useAIStore } from '../../store/aiStore';
import { findCitationSource, loadSourceCitationText, type SourceCitationTarget } from './sourceCitation';

/** Gazdele montate; doar prima ascultă evenimentul, ca o citare să nu deschidă două cititoare. */
const hosts: symbol[] = [];

/**
 * Ascultă `studyx:open-book` (detaliu: {book, pdfPage?, printedPage?, chapterIndex?, topicIndex?}) și deschide cartea la
 * pagina cerută, cu paginile desenate ca în PDF. Se montează o dată, la nivel de aplicație.
 */
export default function BookViewerHost() {
  const [request, setRequest] = useState<BookViewRequest | null>(null);
  const [sourceTarget, setSourceTarget] = useState<(SourceCitationTarget & { sourceId: string; sourceName: string }) | null>(null);

  useEffect(() => {
    const id = Symbol('book-viewer-host');
    hosts.push(id);
    const onOpen = (event: Event) => {
      if (hosts[0] !== id) return;
      const detail = (event as CustomEvent<Partial<OpenBookDetail> & SourceCitationTarget>).detail ?? {};
      const next = requestForCitation(detail);
      if (next) {
        setSourceTarget(null);
        setRequest(next);
        return;
      }
      const source = findCitationSource(useAIStore.getState().knowledgeSources, detail);
      setRequest(null);
      setSourceTarget({ ...detail, sourceId: source?.id ?? detail?.sourceId ?? '', sourceName: source?.name ?? detail?.sourceName ?? 'Documentul citat' });
    };
    window.addEventListener(OPEN_BOOK_EVENT, onOpen);
    return () => {
      window.removeEventListener(OPEN_BOOK_EVENT, onOpen);
      const at = hosts.indexOf(id);
      if (at !== -1) hosts.splice(at, 1);
    };
  }, []);

  return (
    <AnimatePresence>
      {request && <BookChapterReaderModal key={`${request.title}:${request.pdfPage}`} title={request.title} request={request} onClose={() => setRequest(null)} />}
      {sourceTarget && (
        <BookChapterReaderModal
          key={`${sourceTarget.sourceId}:${sourceTarget.pdfPage ?? sourceTarget.printedPage ?? ''}`}
          title={sourceTarget.sourceName}
          pageLabel={sourceTarget.pdfPage !== undefined ? `p. PDF ${sourceTarget.pdfPage}` : sourceTarget.printedPage !== undefined ? `p. ${sourceTarget.printedPage}` : undefined}
          modeLabel="Document · text indexat"
          loadText={() => sourceTarget.sourceId
            ? loadSourceCitationText(sourceTarget.sourceId, sourceTarget)
            : Promise.resolve(sourceTarget.excerpt?.trim() || 'Sursa nu mai este disponibilă în Biblioteca AI.')}
          onClose={() => setSourceTarget(null)}
        />
      )}
    </AnimatePresence>
  );
}
