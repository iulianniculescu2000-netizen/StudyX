import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuestionPreviewModal } from './QuestionPreviewModal';
import { THEMES } from '../../theme/themes';
import type { Question } from '../../types';

const question = {
  id: 'q', text: 'Ce este FA?', explanation: '',
  options: [{ id: 'a', text: 'Aritmie', isCorrect: true }, { id: 'b', text: 'Altceva', isCorrect: false }],
} as unknown as Question;

describe('QuestionPreviewModal', () => {
  afterEach(cleanup);

  it('este dialog modal, mută focusul înăuntru și se închide cu Esc', () => {
    const onClose = vi.fn();
    const theme = Object.values(THEMES)[0] as never;
    const { rerender } = render(<QuestionPreviewModal previewQ={null} theme={theme} onClose={onClose} />);
    rerender(<QuestionPreviewModal previewQ={question} theme={theme} onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Previzualizare întrebare' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
