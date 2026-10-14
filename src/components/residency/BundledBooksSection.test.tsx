import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../../theme/ThemeContext';
import { useAIStore, type AIKnowledgeSource } from '../../store/aiStore';
import { REZIDENTIAT_LIBRARY_BOOKS } from '../../lib/rezidentiatLibrary';
import { OPEN_BOOK_EVENT } from '../pdf/bookRequest';
import type { RezidentiatOverview } from '../../lib/rezidentiatOverview';
import type { PlanProgress } from './useResidencyData';

vi.mock('./PlanChapters', () => ({ default: () => <div>capitole</div> }));

import BundledBooksSection from './BundledBooksSection';

const source = (name: string, extra: Partial<AIKnowledgeSource> = {}): AIKnowledgeSource => ({
  id: `id-${name}`, name, type: 'pdf', preview: '', charCount: 1, wordCount: 1, chunkCount: 12, qualityScore: 1, addedAt: 1, indexStatus: 'ready', ...extra,
}) as unknown as AIKnowledgeSource;

const plan = { profileId: 'p', state: null, phase: 1, focus: null } as PlanProgress;
const mount = () => render(
  <MemoryRouter><ThemeProvider><BundledBooksSection overview={{} as RezidentiatOverview} plan={plan} /></ThemeProvider></MemoryRouter>,
);

beforeEach(() => useAIStore.setState({ knowledgeSources: [], libraryFolders: [] }));
afterEach(() => vi.restoreAllMocks());

describe('Cărțile de bază în Rezidențiat', () => {
  it('arată cele trei cărți, marcate incluse, fără buton de adăugare sau ștergere', () => {
    mount();
    expect(screen.getAllByText(/Inclusă în aplicație/i)).toHaveLength(3);
    expect(screen.getByRole('article', { name: /Kumar/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Adaugă|Șterge/ })).toBeNull();
  });

  it('deschide cartea imediat, chiar dacă încă nu e indexată (fără folder ales)', () => {
    const handler = vi.fn();
    window.addEventListener(OPEN_BOOK_EVENT, handler as EventListener);
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Deschide Lawrence/ }));
    window.removeEventListener(OPEN_BOOK_EVENT, handler as EventListener);
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toMatchObject({ book: 'L', pdfPage: 1 });
  });

  it('arată progresul pregătirii și „Reîncearcă” la eroare, doar în cardul cărții', () => {
    const [kumar, lawrence, sinopsis] = REZIDENTIAT_LIBRARY_BOOKS;
    useAIStore.setState({
      knowledgeSources: [
        source(kumar.name, { indexStatus: 'indexing', indexProgress: 42 }),
        source(lawrence.name, { indexStatus: 'error' }),
        source(sinopsis.name),
      ],
    });
    mount();
    expect(screen.getByText(/Se pregătește pentru căutare · 42%/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Reîncearcă/ })).toHaveLength(1);
    expect(screen.getByText(/Gata pentru căutare și AI/)).toBeTruthy();
  });
});
