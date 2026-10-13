import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../theme/ThemeContext';
import Settings from './Settings';

afterEach(() => vi.useFakeTimers());

it('opens reset safely and restores focus and scrolling when dismissed with Escape', async () => {
  vi.useRealTimers();
  const previousOverflow = document.body.style.overflow;
  render(
    <MemoryRouter initialEntries={['/settings?s=periculos']}>
      <ThemeProvider><Settings /></ThemeProvider>
    </MemoryRouter>,
  );
  const trigger = screen.getByRole('button', { name: 'Resetează tot' });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole('alertdialog', { name: 'Resetare totală?' });
  expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
  expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Anulează' }));
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(document.activeElement).toBe(trigger);
  expect(document.body.style.overflow).toBe(previousOverflow);
});
