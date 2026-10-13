import { useEffect, useState } from 'react';
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

// Like TourEngine, the foreground layer receives bubbling keys on window,
// after the underlying dialog's document listener.
function TourLayer({ interactive, onEscape }: { interactive: boolean; onEscape: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onEscape(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEscape]);
  return <div role="dialog" aria-modal={!interactive} data-tour-keyboard-layer><button>tour control</button></div>;
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

  it('yields Tab and Escape to a tour above the dialog, then resumes after it closes', () => {
    const onDialogEscape = vi.fn();
    const onTourEscape = vi.fn();
    const { rerender } = render(<><Trapped onEscape={onDialogEscape} /><TourLayer interactive={false} onEscape={onTourEscape} /></>);
    const tourControl = screen.getByText('tour control');
    tourControl.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    tourControl.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(tourControl);
    fireEvent.keyDown(tourControl, { key: 'Escape' });
    expect(onTourEscape).toHaveBeenCalledTimes(1);
    expect(onDialogEscape).not.toHaveBeenCalled();

    rerender(<Trapped onEscape={onDialogEscape} />);
    screen.getByText('last').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('first'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDialogEscape).toHaveBeenCalledTimes(1);
  });

  it('lets interactive tour steps reach page controls even while a dialog is open', () => {
    const onDialogEscape = vi.fn();
    const onTourEscape = vi.fn();
    render(<><Trapped onEscape={onDialogEscape} /><button>highlighted action</button><TourLayer interactive onEscape={onTourEscape} /></>);
    const last = screen.getByText('last');
    last.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    last.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    // jsdom has no native tab navigation; verify the handler also leaves the
    // destination alone once the browser has moved focus there.
    const target = screen.getByText('highlighted action');
    target.focus();
    const reverseTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    target.dispatchEvent(reverseTab);
    expect(reverseTab.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(target);
    fireEvent.keyDown(target, { key: 'Escape' });
    expect(onTourEscape).toHaveBeenCalledTimes(1);
    expect(onDialogEscape).not.toHaveBeenCalled();
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
