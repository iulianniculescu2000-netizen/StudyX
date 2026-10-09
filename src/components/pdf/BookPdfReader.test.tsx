import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./PdfPageViewer', () => ({
  default: ({ initialPage, data }: { initialPage: number; data: Uint8Array }) => <div data-testid="viewer">p{initialPage}:{data.length}</div>,
}));

import BookPdfReader from './BookPdfReader';
import { requestForCitation, requestForTopic } from './bookRequest';
import { basePlan } from '../../lib/curriculum';
import { ThemeProvider } from '../../theme/ThemeContext';
import { useOrganizareStore } from '../../store/organizareStore';

const setApi = (api: Record<string, unknown>) => Object.assign(window.electronAPI as object, { organizareReadPdf: undefined, organizarePickRoot: undefined }, api);
const topic = basePlan().topics[1];

beforeEach(() => {
  vi.useRealTimers();
  useOrganizareStore.setState({ byProfile: { default: { state: null, summary: null, root: '/root' } } });
});

const mount = (onUnavailable?: () => void) =>
  render(<ThemeProvider><BookPdfReader request={requestForTopic(topic)} onUnavailable={onUnavailable} /></ThemeProvider>);

describe('requests', () => {
  it('opens a Kumar topic at its first page with the book own chapter number in the title', () => {
    const r = requestForTopic(topic);
    expect(r.title).toContain('Cap. 8');
    expect(r.pdfPage).toBe(8);
    expect(r.sources.at(-1)).toMatchObject({ kind: 'book', page: 8 });
  });
  it('resolves a citation event detail', () => {
    expect(requestForCitation({ book: 'L', pdfPage: 14 })?.pdfPage).toBe(14);
    expect(requestForCitation({ book: 'K', printedPage: 156 })?.pdfPage).toBe(10);
    expect(requestForCitation({ book: 'X' as never })).toBeNull();
  });
});

describe('BookPdfReader', () => {
  it('reads the first available source through the Electron bridge and opens at its page', async () => {
    const read = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: 'lipsă' })
      .mockResolvedValueOnce({ ok: true, data: new Uint8Array(4) });
    setApi({ organizareReadPdf: read, organizarePickRoot: vi.fn() });
    mount();
    expect(await screen.findByTestId('viewer')).toHaveTextContent('p1:4');
    expect(read.mock.calls[0][0]).toBe('/root');
  });

  it('reports when no source exists', async () => {
    setApi({ organizareReadPdf: vi.fn().mockResolvedValue({ ok: false, error: 'Fișierul nu a putut fi citit.' }) });
    const onUnavailable = vi.fn();
    mount(onUnavailable);
    expect(await screen.findByText('Fișierul nu a putut fi citit.')).toBeInTheDocument();
    expect(onUnavailable).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Deschide în aplicația de PDF/ })).toBeInTheDocument();
  });

  it('asks for the folder when none is chosen', async () => {
    useOrganizareStore.setState({ byProfile: {} });
    setApi({ organizareReadPdf: vi.fn(), organizarePickRoot: vi.fn().mockResolvedValue('/picked') });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Alege folderul/ }));
    await waitFor(() => expect(useOrganizareStore.getState().byProfile.default?.root).toBe('/picked'));
  });

  it('offers a file picker on the web build', () => {
    setApi({ organizareReadPdf: undefined });
    mount();
    expect(screen.getByRole('button', { name: /Alege PDF-ul/ })).toBeInTheDocument();
  });
});
