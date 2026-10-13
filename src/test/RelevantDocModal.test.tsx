import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RelevantDocModal from '../pages/quiz-play/RelevantDocModal';
import type { RetrievedChunk } from '../ai/types';
import { ThemeProvider } from '../theme/ThemeContext';
import { formatRelevantDoc } from '../pages/quiz-play/relevantDocFormatting';
import { expectNoA11yViolations } from './a11y';

const mockChunk: RetrievedChunk = {
  id: 'chunk-123',
  sourceId: 'src-kumar',
  source: 'Kumar 10th ed RO',
  text: 'Sepsisul este definit ca o disfunctie de organ amenintatoare de viata.',
  score: 0.85,
  page: 154,
  printedPage: 142,
  chapter: 'Capitolul 8 - Infectii',
};

describe('RelevantDocModal', () => {
  it('randează fragmentul și datele sursei când este deschis', () => {
    render(
      <ThemeProvider>
        <RelevantDocModal open={true} chunk={mockChunk} onClose={vi.fn()} />
      </ThemeProvider>
    );

    expect(screen.getByText('Kumar 10th ed RO')).toBeInTheDocument();
    expect(screen.getByText(/Sepsisul este definit ca o disfunctie de organ/)).toBeInTheDocument();
    expect(screen.getByText(/Pagina 142/)).toBeInTheDocument();
    expect(screen.getByText(/Capitolul 8 - Infectii/)).toBeInTheDocument();
  });

  it('apelează onClose la apăsarea butonului "Continuă grila"', () => {
    const handleClose = vi.fn();
    render(
      <ThemeProvider>
        <RelevantDocModal open={true} chunk={mockChunk} onClose={handleClose} />
      </ThemeProvider>
    );

    const continueBtn = screen.getByText('Continuă grila');
    fireEvent.click(continueBtn);
    expect(handleClose).toHaveBeenCalled();
  });

  it('emite evenimentul studyx:open-book la apăsarea "Deschide în manualul PDF"', () => {
    const eventSpy = vi.fn();
    const handleClose = vi.fn();
    window.addEventListener('studyx:open-book', eventSpy);

    render(
      <ThemeProvider>
        <RelevantDocModal open={true} chunk={mockChunk} onClose={handleClose} />
      </ThemeProvider>
    );

    const openPdfBtn = screen.getByText('Deschide în manualul PDF');
    fireEvent.click(openPdfBtn);

    expect(eventSpy).toHaveBeenCalled();
    expect(handleClose).toHaveBeenCalledOnce();
    const eventDetail = eventSpy.mock.calls[0][0].detail;
    expect(eventDetail.book).toBe('K');
    expect(eventDetail.printedPage).toBe(142);

    window.removeEventListener('studyx:open-book', eventSpy);
  });

  it('prezintă separat titluri, paragrafe și liste fără să piardă textul extras', () => {
    const text = 'TABLOU CLINIC\nFebra poate apărea în prima săptămână\nși poate persista.\n\nSemne:\n• febră mare\n• erupție cutanată\n  cu evoluție lentă';
    const blocks = formatRelevantDoc(text);
    expect(blocks.map((block) => block.kind)).toEqual(['heading', 'paragraph', 'heading', 'list']);
    expect(blocks[1]).toEqual({ kind: 'paragraph', text: 'Febra poate apărea în prima săptămână și poate persista.' });
    expect(blocks[3]).toEqual({ kind: 'list', items: ['• febră mare', '• erupție cutanată cu evoluție lentă'] });
    const content = blocks.flatMap((block) => block.kind === 'list' ? block.items : [block.text]).join(' ');
    expect(content.replace(/\s+/g, ' ')).toBe(text.replace(/\s+/g, ' ').trim());
  });

  it('împarte proza lungă fără rânduri goale la limite de propoziție', () => {
    const sentence = 'Simptomele pot apărea treptat și necesită o evaluare atentă a evoluției clinice, a contextului și a rezultatelor disponibile.';
    const text = Array(5).fill(sentence).join('\n');
    const blocks = formatRelevantDoc(text);
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.every((block) => block.kind === 'paragraph')).toBe(true);
    expect(blocks.map((block) => block.kind === 'list' ? block.items.join(' ') : block.text).join(' ').replace(/\s+/g, ' '))
      .toBe(text.replace(/\s+/g, ' '));
  });

  it('nu are probleme de accesibilitate (axe)', async () => {
    const { baseElement } = render(
      <ThemeProvider>
        <RelevantDocModal open={true} chunk={mockChunk} onClose={vi.fn()} />
      </ThemeProvider>
    );
    await expectNoA11yViolations(baseElement);
  }, 30_000);
});
