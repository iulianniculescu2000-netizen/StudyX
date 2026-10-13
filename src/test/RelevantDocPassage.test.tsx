import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RelevantDocModal from '../pages/quiz-play/RelevantDocModal';
import { ThemeProvider } from '../theme/ThemeContext';
import type { BookPassage } from '../lib/bookPassage';
import { expectNoA11yViolations } from './a11y';

const passage: BookPassage = {
  book: 'K',
  source: 'Kumar și Clark – Medicină Clinică',
  page: 57,
  heading: 'Tratament',
  blocks: [
    { kind: 'heading', text: 'Tratament' },
    { kind: 'paragraph', text: 'Fierul oral este suficient în majoritatea cazurilor. Cel mai eficient preparat de fier este sulfatul feros.' },
    { kind: 'paragraph', text: 'Cele mai frecvente cauze ale eșecului tratamentului sunt:' },
    { kind: 'list', items: ['lipsa complianței', 'pierderi continue de sânge'] },
  ],
  chapter: 'Hematologie',
  topic: 'Anemia feriprivă',
  highlights: [
    { quote: 'Cel mai eficient preparat de fier este sulfatul feros.', role: 'answer' },
    { quote: 'Fierul oral este suficient în majoritatea cazurilor.', role: 'question' },
  ],
  verified: true,
  why: 'Cartea indică fierul oral (sulfat feros) ca tratament uzual.',
};

const renderModal = (onClose = vi.fn(), value: BookPassage = passage) =>
  render(<ThemeProvider><RelevantDocModal open chunk={null} passage={value} onClose={onClose} /></ThemeProvider>);

describe('RelevantDocModal cu pasaj curat din carte', () => {
  it('arată cartea, secțiunea, pagina, motivul, lista și evidențiază doar propoziția-cheie', () => {
    renderModal();
    expect(screen.getByText('Kumar și Clark – Medicină Clinică')).toBeInTheDocument();
    expect(screen.getByText('Pasaj verificat')).toBeInTheDocument();
    expect(screen.getByText('Hematologie · Anemia feriprivă · Pagina 57')).toBeInTheDocument();
    expect(screen.getByText(/Cartea indică fierul oral/)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').filter((item) => !item.closest('[aria-label="Legenda evidențierilor"]')).map((item) => item.textContent)).toEqual(['lipsa complianței', 'pierderi continue de sânge']);
    const marks = [...document.querySelectorAll('mark')];
    expect(marks.map((mark) => [mark.getAttribute('data-role'), mark.textContent])).toEqual([
      ['question', 'Fierul oral este suficient în majoritatea cazurilor.'],
      ['answer', 'Cel mai eficient preparat de fier este sulfatul feros.'],
    ]);
    // Legenda arată doar rolurile folosite.
    const legend = screen.getByRole('list', { name: 'Legenda evidențierilor' });
    expect(legend.textContent).toContain('Susține răspunsul corect');
    expect(legend.textContent).toContain('Contextul din enunț');
    expect(legend.textContent).not.toContain('greșite');
  });

  it('un pasaj neverificat se anunță ca „posibil relevant”, fără motiv inventat', () => {
    renderModal(vi.fn(), { ...passage, verified: false, why: undefined, highlights: [] });
    expect(screen.getByText('Pasaj posibil relevant')).toBeInTheDocument();
    expect(document.querySelectorAll('mark')).toHaveLength(0);
    expect(screen.queryByRole('list', { name: 'Legenda evidențierilor' })).toBeNull();
  });

  it('deschide manualul exact la pagina pasajului', () => {
    const open = vi.fn();
    window.addEventListener('studyx:open-book', open);
    renderModal();
    fireEvent.click(screen.getByText('Deschide în manualul PDF'));
    expect(open.mock.calls[0][0].detail).toMatchObject({ book: 'K', pdfPage: 57 });
    window.removeEventListener('studyx:open-book', open);
  });

  it('nu are probleme de accesibilitate (axe)', async () => {
    const { baseElement } = renderModal();
    await expectNoA11yViolations(baseElement);
  }, 30_000);
});
