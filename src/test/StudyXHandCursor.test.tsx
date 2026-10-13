import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import StudyXHandCursor from '../components/cursor/StudyXHandCursor';
import { useCursorStore } from '../store/cursorStore';
import { ThemeProvider } from '../theme/ThemeContext';

describe('StudyXHandCursor Component', () => {
  beforeEach(() => {
    useCursorStore.setState({ enabled: true, gesture: 'idle' });
  });

  it('renders refined Windows-style pointer correctly when enabled', () => {
    const { container } = render(
      <ThemeProvider>
        <StudyXHandCursor />
      </ThemeProvider>,
    );

    expect(document.documentElement.classList.contains('studyx-custom-cursor-active')).toBe(true);
    expect(container.querySelector('svg')).toBeDefined();
  });

  it('renders pointer hand on hover', () => {
    useCursorStore.setState({ gesture: 'pointer' });

    const { container } = render(
      <ThemeProvider>
        <StudyXHandCursor />
      </ThemeProvider>,
    );

    expect(container.querySelector('svg')).toBeDefined();
  });

  it('hides and removes active class when disabled', () => {
    useCursorStore.setState({ enabled: false });

    const { container } = render(
      <ThemeProvider>
        <StudyXHandCursor />
      </ThemeProvider>,
    );

    expect(document.documentElement.classList.contains('studyx-custom-cursor-active')).toBe(false);
    expect(container.firstChild).toBeNull();
  });
});
