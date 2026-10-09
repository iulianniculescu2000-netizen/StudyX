import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import BookChapterReaderModal from '../BookChapterReaderModal';
import type { BookViewRequest } from './BookPdfReader';
import { OPEN_BOOK_EVENT, requestForCitation, type OpenBookDetail } from './bookRequest';

/** Gazdele montate; doar prima ascultă evenimentul, ca o citare să nu deschidă două cititoare. */
const hosts: symbol[] = [];

/**
 * Ascultă `studyx:open-book` (detaliu: {book, pdfPage?, printedPage?, chapterIndex?, topicIndex?}) și deschide cartea la
 * pagina cerută, cu paginile desenate ca în PDF. Se montează o dată, la nivel de aplicație.
 */
export default function BookViewerHost() {
  const [request, setRequest] = useState<BookViewRequest | null>(null);

  useEffect(() => {
    const id = Symbol('book-viewer-host');
    hosts.push(id);
    const onOpen = (event: Event) => {
      if (hosts[0] !== id) return;
      const next = requestForCitation((event as CustomEvent<Partial<OpenBookDetail>>).detail);
      if (next) setRequest(next);
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
    </AnimatePresence>
  );
}
