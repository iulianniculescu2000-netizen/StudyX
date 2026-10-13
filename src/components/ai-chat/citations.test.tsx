import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MarkdownRenderer from './MarkdownRenderer';
import { buildNumberedContext } from '../../ai/contextBuilder';
import { citationFromSource, OPEN_BOOK_EVENT } from './citations';

vi.mock('../../theme/ThemeContext', () => ({
  useTheme: () => ({ border: '#ccc', text3: '#666', surface: '#fff', text2: '#333', accent: '#00f' }),
}));

const { sources } = buildNumberedContext(
  [
    { id: 'a', text: 'HTA se tratează cu IECA.', source: 'Kumar.pdf', sourceId: 's1', page: 1180, printedPage: 1136, heading: 'Hipertensiunea arterială' },
    { id: 'b', text: 'Altceva.', source: 'Notițe.docx' },
  ],
  4000,
);
const citations = sources.map((s) => citationFromSource(s));

afterEach(() => vi.restoreAllMocks());

describe('chip-uri de citare în răspuns', () => {
  it('randează [1] ca buton cu eticheta paginii și îl lasă text în cod', () => {
    render(<MarkdownRenderer content={'IECA sunt prima linie [1]. Cod: `x[1]`'} citations={citations} />);
    const chip = screen.getByRole('button', { name: /Deschide sursa 1/ });
    expect(chip.textContent).toContain('Kumar, p. 1136 (Hipertensiunea arterială)');
    expect(screen.getByText('x[1]').tagName).toBe('CODE');
  });

  it('click trimite studyx:open-book cu cartea și pagina', () => {
    const handler = vi.fn();
    window.addEventListener(OPEN_BOOK_EVENT, handler as EventListener);
    render(<MarkdownRenderer content="Vezi [1]." citations={citations} />);
    fireEvent.click(screen.getByRole('button', { name: /Deschide sursa 1/ }));
    window.removeEventListener(OPEN_BOOK_EVENT, handler as EventListener);
    expect(handler).toHaveBeenCalledTimes(1);
    const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
    expect(detail).toEqual({ book: 'K', pdfPage: 1180, printedPage: 1136, sourceId: 's1', sourceName: 'Kumar', excerpt: 'HTA se tratează cu IECA.' });
  });

  it('o sursă fără pagină sau carte nu e buton; numerele necunoscute rămân text; fără citări nu se schimbă nimic', () => {
    render(<MarkdownRenderer content="Notă [2] și [9]." citations={citations} />);
    expect(screen.getByText(/\[9\]/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('nu injectează HTML', () => {
    const { container } = render(<MarkdownRenderer content={'<img src=x onerror=alert(1)> [1]'} citations={citations} />);
    screen.getByRole('button', { name: /Deschide sursa 1/ });
    expect(container.querySelector('img')).toBeNull();
  });
});
