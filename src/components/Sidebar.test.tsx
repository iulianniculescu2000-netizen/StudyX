import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useFolderStore } from '../store/folderStore';
import { useQuizStore } from '../store/quizStore';
import { useStatsStore } from '../store/statsStore';
import { useUserStore } from '../store/userStore';
import { ThemeProvider } from '../theme/ThemeContext';
import type { Quiz } from '../types';

const quiz: Quiz = {
  id: 'q1', title: 'Grila 1', description: '', emoji: '📘', category: 'Anatomie',
  questions: [], createdAt: 1, color: 'blue', folderId: 'f1',
};

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
}

function resizeViewportWidth(width: number) {
  setViewportWidth(width);
  act(() => {
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(32);
  });
}

function getOverlayBackdrop(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>('div[aria-hidden="true"]'))
    .find((el) => el.style.position === 'fixed') ?? null;
}

function mount(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider><Sidebar /></ThemeProvider>
    </MemoryRouter>,
  );
}

describe('Sidebar (characterization)', () => {
  beforeEach(() => {
    setViewportWidth(1280);
    localStorage.clear();
    useQuizStore.getState().reset();
    useStatsStore.getState().reset();
    useFolderStore.setState({
      folders: [
        { id: 'f1', name: 'Anatomie', emoji: '🦴', color: 'blue', createdAt: 1 },
        { id: 'f2', name: 'Sub', emoji: '🧠', color: 'red', parentId: 'f1', createdAt: 2 },
      ] as never,
    });
    useQuizStore.setState({ quizzes: [quiz] });
    useUserStore.setState({ username: 'Ana' } as never);
  });

  it('renders navigation, tutorial hooks and links', () => {
    const { container } = mount('/quizzes');
    expect(screen.getByRole('navigation', { name: 'Navigare principala' })).toBeTruthy();
    expect(container.querySelector('[data-tutorial="sidebar"]')).toBeTruthy();
    expect(container.querySelector('[data-tutorial="nav-settings"]')).toBeTruthy();
    expect(container.querySelector('[data-tutorial="sidebar-folders"]')).toBeTruthy();
    expect(screen.getByText('Panou').closest('a')?.getAttribute('href')).toBe('/');
    expect(screen.getByText('Toate grilele').closest('a')?.getAttribute('aria-current')).toBe('page');
    expect(screen.getByText('Setări').closest('a')?.getAttribute('href')).toBe('/settings');
    expect(screen.getByText('Ana')).toBeTruthy();
  });

  it('lists nested folders with action buttons', () => {
    mount();
    expect(screen.getByText('Anatomie').closest('a')?.getAttribute('href')).toBe('/folder/f1');
    expect(screen.getByText('Sub').closest('a')?.getAttribute('href')).toBe('/folder/f2');
    expect(screen.getByLabelText('Redenumește folderul Anatomie')).toBeTruthy();
    expect(screen.getByLabelText('Creează folder')).toBeTruthy();
  });

  it('collapses and persists in localStorage', () => {
    mount();
    fireEvent.click(screen.getByLabelText('Restrange sidebar'));
    expect(localStorage.getItem('sidebar-collapsed')).toBe('true');
    expect(screen.getByLabelText('Extinde sidebar')).toBeTruthy();
    expect(screen.queryByText('Foldere')).toBeNull();
    expect(screen.getByLabelText('Panou')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Extinde sidebar'));
    expect(localStorage.getItem('sidebar-collapsed')).toBe('false');
    expect(screen.getByText('Foldere')).toBeTruthy();
  });

  it('renames a folder inline', () => {
    mount();
    fireEvent.click(screen.getByLabelText('Redenumește folderul Anatomie'));
    const input = screen.getByDisplayValue('Anatomie');
    fireEvent.change(input, { target: { value: 'Fiziologie' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useFolderStore.getState().folders.find((f) => f.id === 'f1')?.name).toBe('Fiziologie');
  });

  it('asks for confirmation before deleting a folder', () => {
    mount();
    fireEvent.click(screen.getByLabelText('Șterge folderul Anatomie'));
    expect(screen.getByText('Ștergi folderul "Anatomie"?')).toBeTruthy();
  });

  it('moves a dragged quiz into a folder', () => {
    mount();
    const target = document.querySelector('[data-folder-id="f2"]') as HTMLElement;
    const dataTransfer = {
      types: ['application/x-studyx-quiz-id'],
      getData: (t: string) => (t === 'application/x-studyx-quiz-id' ? 'q1' : ''),
      dropEffect: '',
    };
    act(() => { fireEvent.drop(target, { dataTransfer }); });
    expect(useQuizStore.getState().quizzes[0].folderId).toBe('f2');
  });

  it('resets narrow overlay state across narrow -> wide -> narrow transitions without altering stored preference', () => {
    setViewportWidth(800);
    const { container } = mount();

    // Pe fereastră îngustă pornește restrâns (rail), fără overlay.
    expect(screen.getByLabelText('Extinde sidebar')).toBeTruthy();
    expect(screen.queryByText('Foldere')).toBeNull();
    expect(getOverlayBackdrop(container)).toBeNull();
    expect(localStorage.getItem('sidebar-collapsed')).toBeNull();

    // Extinderea în modul îngust deschide overlay temporar și nu scrie în localStorage.
    fireEvent.click(screen.getByLabelText('Extinde sidebar'));
    expect(screen.getByLabelText('Restrange sidebar')).toBeTruthy();
    expect(screen.getByText('Foldere')).toBeTruthy();
    expect(getOverlayBackdrop(container)).not.toBeNull();
    expect(localStorage.getItem('sidebar-collapsed')).toBeNull();

    // Trecerea pe fereastră lată închide overlay-ul și afișează sidebar-ul extins inline.
    resizeViewportWidth(1280);
    expect(getOverlayBackdrop(container)).toBeNull();
    expect(screen.getByLabelText('Restrange sidebar')).toBeTruthy();
    expect(screen.getByText('Foldere')).toBeTruthy();

    // Reîngustarea trebuie să revină la rail restrâns, nu cu overlay-ul redeschis brusc.
    resizeViewportWidth(800);
    expect(getOverlayBackdrop(container)).toBeNull();
    expect(screen.getByLabelText('Extinde sidebar')).toBeTruthy();
    expect(screen.queryByText('Foldere')).toBeNull();

    // Extindere + restrângere explicită în modul îngust.
    fireEvent.click(screen.getByLabelText('Extinde sidebar'));
    expect(getOverlayBackdrop(container)).not.toBeNull();
    fireEvent.click(screen.getByLabelText('Restrange sidebar'));
    expect(getOverlayBackdrop(container)).toBeNull();
    expect(screen.getByLabelText('Extinde sidebar')).toBeTruthy();
    expect(localStorage.getItem('sidebar-collapsed')).toBeNull();
  });

  it('preserves stored collapsed preference when returning to wide after opening narrow overlay', () => {
    const { container } = mount();

    fireEvent.click(screen.getByLabelText('Restrange sidebar'));
    expect(localStorage.getItem('sidebar-collapsed')).toBe('true');
    expect(screen.getByLabelText('Extinde sidebar')).toBeTruthy();

    resizeViewportWidth(800);
    fireEvent.click(screen.getByLabelText('Extinde sidebar'));
    expect(getOverlayBackdrop(container)).not.toBeNull();
    expect(screen.getByText('Foldere')).toBeTruthy();
    expect(localStorage.getItem('sidebar-collapsed')).toBe('true');

    resizeViewportWidth(1280);
    expect(getOverlayBackdrop(container)).toBeNull();
    expect(screen.getByLabelText('Extinde sidebar')).toBeTruthy();
    expect(screen.queryByText('Foldere')).toBeNull();

    resizeViewportWidth(800);
    expect(getOverlayBackdrop(container)).toBeNull();
    expect(screen.getByLabelText('Extinde sidebar')).toBeTruthy();
  });
});
