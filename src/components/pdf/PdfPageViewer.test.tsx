import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const renders: number[] = [];
const getDocument = vi.fn();

vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.js' }));
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: {},
  getDocument: (...args: unknown[]) => getDocument(...args),
}));

import PdfPageViewer from './PdfPageViewer';
import { ThemeProvider } from '../../theme/ThemeContext';

const fakeDoc = (numPages: number) => ({
  numPages,
  getPage: async (n: number) => ({
    getViewport: ({ scale }: { scale: number }) => ({ width: 100 * scale, height: 140 * scale }),
    render: () => { renders.push(n); return { promise: Promise.resolve(), cancel: vi.fn() }; },
    cleanup: vi.fn(),
  }),
});

const mount = (props: Partial<React.ComponentProps<typeof PdfPageViewer>> = {}) =>
  render(<ThemeProvider><PdfPageViewer data={new Uint8Array([1, 2, 3])} {...props} /></ThemeProvider>);

beforeEach(() => {
  vi.useRealTimers();
  renders.length = 0;
  getDocument.mockReset();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({})) as never;
});

describe('PdfPageViewer', () => {
  it('shows one placeholder per page and the initial page in the toolbar', async () => {
    getDocument.mockReturnValue({ promise: Promise.resolve(fakeDoc(5)), destroy: vi.fn() });
    mount({ initialPage: 3 });
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(5));
    expect(screen.getByLabelText('Pagina 4 din 5')).toBeInTheDocument();
    expect(screen.getByLabelText('Salt la pagina')).toHaveValue(3);
    expect(screen.getByText('/ 5')).toBeInTheDocument();
  });

  it('jumps to a typed page and disables next on the last page', async () => {
    getDocument.mockReturnValue({ promise: Promise.resolve(fakeDoc(5)), destroy: vi.fn() });
    mount();
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(5));
    const input = screen.getByLabelText('Salt la pagina');
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.submit(input.closest('form')!);
    expect(screen.getByLabelText('Salt la pagina')).toHaveValue(5);
    expect(screen.getByLabelText('Pagina următoare')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Pagina anterioară'));
    expect(screen.getByLabelText('Salt la pagina')).toHaveValue(4);
  });

  it('pages with the keyboard and zooms', async () => {
    getDocument.mockReturnValue({ promise: Promise.resolve(fakeDoc(3)), destroy: vi.fn() });
    mount();
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(3));
    const region = screen.getByRole('region', { name: 'Paginile cărții' });
    fireEvent.keyDown(region, { key: 'PageDown' });
    expect(screen.getByLabelText('Salt la pagina')).toHaveValue(2);
    fireEvent.keyDown(region, { key: 'PageUp' });
    expect(screen.getByLabelText('Salt la pagina')).toHaveValue(1);
    fireEvent.click(screen.getByLabelText('Mărește'));
    expect(screen.getByText('125%')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Potrivește pe lățime'));
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('draws pages to canvas once they are near the viewport and have a width', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    getDocument.mockReturnValue({ promise: Promise.resolve(fakeDoc(2)), destroy: vi.fn() });
    mount();
    await waitFor(() => expect(renders).toEqual(expect.arrayContaining([1, 2])));
    width.mockRestore();
    vi.unstubAllGlobals();
  });

  it('shows a friendly error with the external-open fallback', async () => {
    getDocument.mockReturnValue({ promise: Promise.reject(new Error('bad pdf')), destroy: vi.fn() });
    const onOpenExternal = vi.fn();
    const onError = vi.fn();
    mount({ onOpenExternal, onError });
    expect(await screen.findByRole('alert')).toHaveTextContent('Nu am putut afișa acest PDF');
    fireEvent.click(screen.getByRole('button', { name: /Deschide în aplicația de PDF/ }));
    expect(onOpenExternal).toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
  });
});
