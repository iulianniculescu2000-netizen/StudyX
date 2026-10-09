import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../theme/ThemeContext';
import KeyboardShortcuts from './KeyboardShortcuts';

describe('KeyboardShortcuts', () => {
  it('se deschide cu ?, este dialog modal cu scurtăturile reale și se închide cu Esc', async () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <KeyboardShortcuts />
        </ThemeProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(window, { key: '?' });
    const dialog = screen.getByRole('dialog', { name: 'Scurtături tastatură' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('Căutare în tot conținutul')).toBeTruthy();
    expect(screen.getByText('Chat în ecran complet')).toBeTruthy();
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document, { key: 'Escape' });
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
