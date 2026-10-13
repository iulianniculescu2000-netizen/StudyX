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
});
