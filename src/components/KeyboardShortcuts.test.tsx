import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ThemeProvider } from '../theme/ThemeContext';
import KeyboardShortcuts from './KeyboardShortcuts';

describe('KeyboardShortcuts', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    // Setup mock electronAPI
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      setZoomFactor: vi.fn(),
      getZoomFactor: vi.fn(() => 1),
    };
  });

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

  it('gestionează scurtăturile de zoom Ctrl +, Ctrl -, Ctrl 0', () => {
    let currentZoom = 1;
    const setZoomSpy = vi.fn((val: number) => { currentZoom = val; });
    const getZoomSpy = vi.fn(() => currentZoom);
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      setZoomFactor: setZoomSpy,
      getZoomFactor: getZoomSpy,
    };

    render(
      <MemoryRouter>
        <ThemeProvider>
          <KeyboardShortcuts />
        </ThemeProvider>
      </MemoryRouter>,
    );

    // Ctrl + (mărire)
    fireEvent.keyDown(window, { key: '+', ctrlKey: true });
    expect(setZoomSpy).toHaveBeenCalledWith(1.1);
    expect(localStorage.getItem('studyx_zoom_factor')).toBe('1.1');

    // Ctrl = (mărire pe layout US fără Shift)
    fireEvent.keyDown(window, { key: '=', ctrlKey: true });
    expect(setZoomSpy).toHaveBeenCalledWith(1.2);
    expect(localStorage.getItem('studyx_zoom_factor')).toBe('1.2');

    // Ctrl - (micșorare)
    fireEvent.keyDown(window, { key: '-', ctrlKey: true });
    expect(setZoomSpy).toHaveBeenCalledWith(1.1);
    expect(localStorage.getItem('studyx_zoom_factor')).toBe('1.1');

    // Ctrl 0 (reset)
    fireEvent.keyDown(window, { key: '0', ctrlKey: true });
    expect(setZoomSpy).toHaveBeenCalledWith(1);
    expect(localStorage.getItem('studyx_zoom_factor')).toBe('1');
  });

  it('nu interferează când utilizatorul tastează într-un input sau textarea', () => {
    const setZoomSpy = vi.fn();
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      setZoomFactor: setZoomSpy,
      getZoomFactor: vi.fn(() => 1),
    };

    render(
      <MemoryRouter>
        <ThemeProvider>
          <div>
            <input data-testid="test-input" />
            <textarea data-testid="test-textarea" />
            <div data-testid="test-editable" contentEditable="true" />
            <KeyboardShortcuts />
          </div>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const input = screen.getByTestId('test-input');
    const textarea = screen.getByTestId('test-textarea');
    const editable = screen.getByTestId('test-editable');

    // Tastarea caracterului '+' sau '-' într-un input nu trebuie să declanșeze zoom
    fireEvent.keyDown(input, { key: '+' });
    fireEvent.keyDown(input, { key: '-' });
    fireEvent.keyDown(textarea, { key: '+' });
    fireEvent.keyDown(textarea, { key: '-' });
    fireEvent.keyDown(editable, { key: '+' });

    // Scurtăturile Ctrl + / Ctrl - în timp ce utilizatorul e într-un input nu trebuie să intercepteze tastarea
    fireEvent.keyDown(input, { key: '+', ctrlKey: true });
    fireEvent.keyDown(textarea, { key: '-', ctrlKey: true });
    fireEvent.keyDown(editable, { key: '0', ctrlKey: true });

    expect(setZoomSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('nu declanșează zoom la combinații AltGr (tastaturi europene)', () => {
    const setZoomSpy = vi.fn();
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      setZoomFactor: setZoomSpy,
      getZoomFactor: vi.fn(() => 1),
    };

    render(
      <MemoryRouter>
        <ThemeProvider>
          <KeyboardShortcuts />
        </ThemeProvider>
      </MemoryRouter>,
    );

    // Pe Windows, AltGr raportează atât ctrlKey cât și altKey ca fiind true
    fireEvent.keyDown(window, { key: '+', ctrlKey: true, altKey: true });
    fireEvent.keyDown(window, { key: '-', ctrlKey: true, altKey: true });

    expect(setZoomSpy).not.toHaveBeenCalled();
  });

  it('restaurează zoom factor valid din localStorage la mount', () => {
    localStorage.setItem('studyx_zoom_factor', '1.2');
    const setZoomSpy = vi.fn();
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      setZoomFactor: setZoomSpy,
      getZoomFactor: vi.fn(() => 1),
    };

    render(
      <MemoryRouter>
        <ThemeProvider>
          <KeyboardShortcuts />
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(setZoomSpy).toHaveBeenCalledWith(1.2);
  });

  it('curăță valorile invalide sau corupte din localStorage la mount', () => {
    const setZoomSpy = vi.fn();
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      setZoomFactor: setZoomSpy,
      getZoomFactor: vi.fn(() => 1),
    };

    // Valoare coruptă / NaN
    localStorage.setItem('studyx_zoom_factor', 'invalid_zoom');

    render(
      <MemoryRouter>
        <ThemeProvider>
          <KeyboardShortcuts />
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(localStorage.getItem('studyx_zoom_factor')).toBeNull();
    expect(setZoomSpy).toHaveBeenCalledWith(1);
  });

  it('curăță valorile în afara limitelor (prea mici sau prea mari)', () => {
    const setZoomSpy = vi.fn();
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      setZoomFactor: setZoomSpy,
      getZoomFactor: vi.fn(() => 1),
    };

    localStorage.setItem('studyx_zoom_factor', '99.5');

    render(
      <MemoryRouter>
        <ThemeProvider>
          <KeyboardShortcuts />
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(localStorage.getItem('studyx_zoom_factor')).toBeNull();
    expect(setZoomSpy).toHaveBeenCalledWith(1);
  });
});
