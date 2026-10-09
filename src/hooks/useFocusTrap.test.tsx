import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFocusTrap } from './useFocusTrap';
import ConfirmDialog from '../components/ConfirmDialog';
import { ThemeProvider } from '../theme/ThemeContext';

function Trapped({ onEscape }: { onEscape: () => void }) {
  const ref = useFocusTrap(true, onEscape);
  // A re-render with a new inline callback must not pull focus out of the field being typed in.
  const [text, setText] = useState('');
  return (
    <div ref={ref}>
      <button>first</button>
      <input aria-label="field" data-autofocus value={text} onChange={(event) => setText(event.target.value)} />
      <button>last</button>
    </div>
  );
}

describe('useFocusTrap', () => {
  it('focuses the data-autofocus element, keeps focus on re-render, and closes on Escape', () => {
    const onEscape = vi.fn();
    render(<Trapped onEscape={() => onEscape()} />);
    const field = screen.getByLabelText('field');
    expect(document.activeElement).toBe(field);

    fireEvent.change(field, { target: { value: 'abc' } });
    expect(document.activeElement).toBe(field);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('wraps Tab from the last element to the first and Shift+Tab the other way', () => {
    render(<Trapped onEscape={() => undefined} />);
    const [first, last] = [screen.getByText('first'), screen.getByText('last')];
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('gives focus back to the element that had it before', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(<Trapped onEscape={() => undefined} />);
    expect(document.activeElement).not.toBe(opener);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

describe('ConfirmDialog', () => {
  it('is an alert dialog named by its title, focuses the safe button, and Esc cancels', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    act(() => {
      render(
        <ThemeProvider>
          <ConfirmDialog open title="Ștergi pachetul?" description="Nu poate fi anulat." confirmLabel="Șterge" onConfirm={onConfirm} onCancel={onCancel} />
        </ThemeProvider>,
      );
    });
    const dialog = screen.getByRole('alertdialog', { name: 'Ștergi pachetul?' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByText('Anulează').closest('button'));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Închide' })).toBeTruthy();
  });

  it('doar capcana de sus tratează Esc și Tab când sunt două active', () => {
    const lower = vi.fn();
    const upper = vi.fn();
    render(<><Trapped onEscape={lower} /><Trapped onEscape={upper} /></>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower).not.toHaveBeenCalled();
  });
});
