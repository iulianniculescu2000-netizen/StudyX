import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import StudyXHandCursor, { CURSOR_ACTIVE_CLASS } from '../components/cursor/StudyXHandCursor';
import { buildCursorVars } from '../components/cursor/cursorImages';
import { useCursorStore } from '../store/cursorStore';
import { ThemeProvider } from '../theme/ThemeContext';

const renderCursor = () => render(
  <ThemeProvider>
    <StudyXHandCursor />
  </ThemeProvider>,
);

describe('StudyXHandCursor', () => {
  beforeEach(() => {
    useCursorStore.setState({ enabled: true, gesture: 'idle' });
  });

  it('dă cursorul sistemului prin variabile CSS și nu desenează nimic în pagină', () => {
    const { container, unmount } = renderCursor();
    const root = document.documentElement;

    expect(root.classList.contains(CURSOR_ACTIVE_CLASS)).toBe(true);
    expect(root.style.getPropertyValue('--sx-cursor-arrow')).toContain('image-set(');
    expect(root.style.getPropertyValue('--sx-cursor-hand')).toContain('data:image/svg+xml');
    expect(container.firstChild).toBeNull();

    unmount();
    expect(root.classList.contains(CURSOR_ACTIVE_CLASS)).toBe(false);
    expect(root.style.getPropertyValue('--sx-cursor-arrow')).toBe('');
  });

  it('dezactivat: rămâne cursorul nativ', () => {
    useCursorStore.setState({ enabled: false });
    const { container } = renderCursor();

    expect(document.documentElement.classList.contains(CURSOR_ACTIVE_CLASS)).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--sx-cursor-arrow')).toBe('');
    expect(container.firstChild).toBeNull();
  });

  it('fiecare cursor are variantă 2x, punct activ și cursor nativ de rezervă', () => {
    const vars = buildCursorVars('#0a84ff', false);
    expect(vars['--sx-cursor-arrow']).toMatch(/ 1x, url\(.+\) 2x\) 4 3, default$/);
    expect(vars['--sx-cursor-hand']).toMatch(/\) 9 2, pointer$/);
    expect(vars['--sx-cursor-text']).toMatch(/\) 12 12, text$/);
  });

  it('în lucru: săgeata primește indicatorul în culoarea temei', () => {
    const idle = buildCursorVars('#0a84ff', false)['--sx-cursor-arrow'];
    const busy = buildCursorVars('#0a84ff', true)['--sx-cursor-arrow'];
    expect(busy).not.toBe(idle);
    expect(busy).toContain(encodeURIComponent('#0a84ff'));
    expect(busy).toMatch(/, progress$/);
  });
});
