import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../theme/ThemeContext';
import TitleTooltips from './TitleTooltips';
import { TOOLTIP_DELAY_MS } from './titleTooltip';

function mount() {
  return render(
    <ThemeProvider>
      <TitleTooltips />
      <button type="button" title="Verifică cu alt model" data-testid="target">?</button>
      <span data-testid="plain">fără titlu</span>
    </ThemeProvider>,
  );
}

const hover = (el: Element) => { fireEvent.pointerOver(el, { pointerType: 'mouse' }); };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('TitleTooltips: tooltip armonizat în loc de cel nativ', () => {
  it('arată un tooltip după o scurtă întârziere și scoate title-ul nativ', () => {
    mount();
    const target = screen.getByTestId('target');
    hover(target);
    expect(target.hasAttribute('title')).toBe(false);
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => { vi.advanceTimersByTime(TOOLTIP_DELAY_MS + 10); });
    expect(screen.getByRole('tooltip').textContent).toBe('Verifică cu alt model');
  });

  it('nu apare la o trecere grăbită', () => {
    mount();
    const target = screen.getByTestId('target');
    hover(target);
    act(() => { vi.advanceTimersByTime(100); });
    fireEvent.pointerOut(target, { relatedTarget: document.body });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('dispare la ieșire, la clic și la Esc', () => {
    mount();
    const target = screen.getByTestId('target');
    for (const close of [
      () => fireEvent.pointerOut(target, { relatedTarget: document.body }),
      () => fireEvent.pointerDown(target),
      () => fireEvent.keyDown(document, { key: 'Escape' }),
    ]) {
      hover(target);
      act(() => { vi.advanceTimersByTime(TOOLTIP_DELAY_MS + 10); });
      expect(screen.getByRole('tooltip')).toBeTruthy();
      act(() => { close(); });
      expect(screen.queryByRole('tooltip')).toBeNull();
    }
  });

  it('apare imediat la focus de la tastatură', () => {
    mount();
    act(() => { fireEvent.focusIn(screen.getByTestId('target')); });
    expect(screen.getByRole('tooltip')).toBeTruthy();
  });

  it('ignoră ecranele tactile și elementele fără title', () => {
    mount();
    fireEvent.pointerOver(screen.getByTestId('target'), { pointerType: 'touch' });
    hover(screen.getByTestId('plain'));
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
