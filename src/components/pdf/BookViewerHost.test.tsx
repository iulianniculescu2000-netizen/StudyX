import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BookViewerHost from './BookViewerHost';

vi.mock('../BookChapterReaderModal', () => ({
  default: ({ title, modeLabel, onClose }: { title: string; modeLabel?: string; onClose: () => void }) => (
    <div role="dialog" aria-label={title}>
      {modeLabel}
      <button onClick={onClose}>Închide</button>
    </div>
  ),
}));

vi.mock('../../store/aiStore', () => ({
  useAIStore: { getState: () => ({ knowledgeSources: [{ id: 'curs-1', name: 'Curs.pdf' }] }) },
}));

// Paginile reale vin dintr-un JSON mare; aici contează doar granița: peste pagina 345 a PDF-ului e o pagină din folder.
vi.mock('../../lib/bookText', () => ({
  extraPageAt: async (_book: string, pdfPage: number) => (pdfPage > 345 ? { printed: 13, text: 'Textul paginii tipărite 13.' } : null),
}));

describe('BookViewerHost', () => {
  it('deschide sursele importate după ID, nu ignoră evenimentul fără cod K/L/S', () => {
    render(<BookViewerHost />);
    act(() => window.dispatchEvent(new CustomEvent('studyx:open-book', {
      detail: { book: undefined, sourceId: 'curs-1', sourceName: 'Curs', pdfPage: 1257 },
    })));
    expect(screen.getByRole('dialog', { name: 'Curs.pdf' })).toHaveTextContent('Document · text indexat');
  });

  it('păstrează cititorul de PDF pentru manualele curriculare', () => {
    render(<BookViewerHost />);
    act(() => window.dispatchEvent(new CustomEvent('studyx:open-book', {
      detail: { book: 'K', pdfPage: 8 },
    })));
    expect(screen.getByRole('dialog', { name: /Kumar/i })).toBeInTheDocument();
  });

  it('Lawrence: pagina citată din afara PDF-ului arată textul paginii, nu ultima pagină a PDF-ului', async () => {
    vi.useRealTimers();
    render(<BookViewerHost />);
    act(() => window.dispatchEvent(new CustomEvent('studyx:open-book', {
      detail: { book: 'L', pdfPage: 346, printedPage: 13 },
    })));
    const dialog = await screen.findByRole('dialog', { name: 'Lawrence' }, { timeout: 3000 });
    expect(dialog).toHaveTextContent('nu e în PDF-ul din aplicație');
  });

  it('Lawrence: o pagină din PDF se deschide în continuare în cititorul cărții', async () => {
    vi.useRealTimers();
    render(<BookViewerHost />);
    act(() => window.dispatchEvent(new CustomEvent('studyx:open-book', {
      detail: { book: 'L', pdfPage: 20 },
    })));
    expect(await screen.findByRole('dialog', { name: /Lawrence ·/ }, { timeout: 3000 })).not.toHaveTextContent('nu e în PDF');
  });
});
