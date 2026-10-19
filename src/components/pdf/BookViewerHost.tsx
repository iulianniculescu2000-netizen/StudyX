import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import BookChapterReaderModal from '../BookChapterReaderModal';
import type { BookViewRequest } from './BookPdfReader';
import { OPEN_BOOK_EVENT, requestForCitation, type OpenBookDetail } from './bookRequest';
import { useAIStore } from '../../store/aiStore';
import { BOOK_SHORT } from '../../lib/curriculum';
import { extraPageAt } from '../../lib/bookText';
import { findCitationSource, loadSourceCitationText, type SourceCitationTarget } from './sourceCitation';

/** Gazdele montate; doar prima ascultă evenimentul, ca o citare să nu deschidă două cititoare. */
const hosts: symbol[] = [];

/** O pagină din folderul cărții care lipsește din PDF-ul inclus: se arată textul ei, cu pagina tipărită. */
type ExtraPage = { title: string; printed: number; text: string };

/**
 * Ascultă `studyx:open-book` (detaliu: {book, pdfPage?, printedPage?, chapterIndex?, topicIndex?}) și deschide cartea la
 * pagina cerută, cu paginile desenate ca în PDF. Se montează o dată, la nivel de aplicație.
 */
export default function BookViewerHost() {
  const [request, setRequest] = useState<BookViewRequest | null>(null);
  const [sourceTarget, setSourceTarget] = useState<(SourceCitationTarget & { sourceId: string; sourceName: string }) | null>(null);
  const [extraPage, setExtraPage] = useState<ExtraPage | null>(null);

  useEffect(() => {
    const id = Symbol('book-viewer-host');
    hosts.push(id);
    let latest = 0;
    const open = (detail: Partial<OpenBookDetail> & SourceCitationTarget) => {
      setExtraPage(null);
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
    const onOpen = (event: Event) => {
      if (hosts[0] !== id) return;
      const detail = (event as CustomEvent<Partial<OpenBookDetail> & SourceCitationTarget>).detail ?? {};
      const turn = ++latest;
      const book = detail.book;
      // Lawrence are pagini indexate după ultima pagină a PDF-ului (vezi bookText): cititorul de PDF le-ar strânge la ultima pagină.
      if (book === 'L' && typeof detail.pdfPage === 'number') {
        extraPageAt(book, detail.pdfPage).then(
          (extra) => {
            if (turn !== latest) return;
            if (!extra) { open(detail); return; }
            setRequest(null);
            setSourceTarget(null);
            setExtraPage({ title: BOOK_SHORT[book], printed: extra.printed, text: extra.text.trim() });
          },
          () => { if (turn === latest) open(detail); },
        );
        return;
      }
      open(detail);
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
      {extraPage && (
        <BookChapterReaderModal
          key={`extra:${extraPage.printed}`}
          title={extraPage.title}
          pageLabel={`p. ${extraPage.printed}`}
          modeLabel="Pagină din carte · nu e în PDF-ul din aplicație"
          content={extraPage.text}
          onClose={() => setExtraPage(null)}
        />
      )}
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
