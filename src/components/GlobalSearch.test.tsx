import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../theme/ThemeContext';
import { useFolderStore } from '../store/folderStore';
import { useQuizStore } from '../store/quizStore';
import GlobalSearch from './GlobalSearch';
import type { Folder, Quiz } from '../types';

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
}

const folders: Folder[] = [
  { id: 'root', name: 'Rezidențiat', emoji: '🩺', color: 'red', createdAt: 1, parentId: null },
  { id: 'disc-cardio', name: 'Cardiologie', emoji: '❤️', color: 'red', createdAt: 2, parentId: 'root' },
  { id: 'spec-aritmii', name: 'Aritmii', emoji: '⚡', color: 'orange', createdAt: 3, parentId: 'disc-cardio' },
];

const quiz: Quiz = {
  id: 'q1',
  title: 'Aritmii test 1',
  description: '',
  emoji: '⚡',
  category: 'Rezidențiat',
  folderId: 'spec-aritmii',
  color: 'orange',
  createdAt: 1,
  questions: [{ id: 'qq1', text: 'Fibrilația atrială are ritm neregulat', options: [] }],
};

function setup() {
  render(
    <MemoryRouter>
      <ThemeProvider>
        <GlobalSearch />
        <Where />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

function openSearch(key = 'k') {
  fireEvent.keyDown(window, { key, ctrlKey: true });
}

function type(value: string) {
  fireEvent.change(screen.getByRole('combobox'), { target: { value } });
}

describe('GlobalSearch (Ctrl+K)', () => {
  beforeEach(() => {
    useFolderStore.setState({ folders });
    useQuizStore.setState({ quizzes: [quiz] });
  });

  // Primul test din fișier: după ce un test lasă o animație neterminată (ceasul e fals), bucla framer-motion rămâne blocată.
  it('se navighează cu săgeți + Enter, iar Esc închide', async () => {
    setup();
    openSearch();
    type('organizare');
    const input = screen.getByRole('combobox');
    const options = screen.getAllByRole('option');
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const afterDown = screen.getAllByRole('option');
    expect(afterDown[1].getAttribute('aria-selected')).toBe('true');
    expect(input.getAttribute('aria-activedescendant')).toBe(afterDown[1].id);

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('where').textContent).toBe('/rezidentiat/organizare');
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(screen.queryByRole('dialog')).toBeNull();

    openSearch();
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('se deschide cu Ctrl+K, inclusiv cu K mare (Caps Lock), ca dialog modal cu combobox și listbox', () => {
    setup();
    expect(screen.queryByRole('dialog')).toBeNull();
    openSearch('K');
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const input = screen.getByRole('combobox');
    expect(input.getAttribute('aria-controls')).toBe(screen.getByRole('listbox').id);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it.each([
    ['organizare', 'Organizare', '/rezidentiat/organizare'],
    ['saptamani', 'Organizare · Săptămâni', '/rezidentiat/organizare?t=saptamani'],
    ['cardio', 'Cardiologie', '/rezidentiat/disc-cardio'],
    ['aritmii', 'Aritmii', '/rezidentiat/disc-cardio?s=spec-aritmii'],
    ['realizari', 'Realizări', '/gamification'],
    ['perspective', 'Perspective AI', '/analytics'],
    ['statistici', 'Statistici', '/stats'],
  ])('„%s” găsește „%s” și duce la %s', (term, label, href) => {
    setup();
    openSearch();
    type(term);
    const option = screen.getAllByRole('option').find((node) => node.textContent?.includes(label));
    expect(option).toBeTruthy();
    fireEvent.click(option!);
    expect(screen.getByTestId('where').textContent).toBe(href);
  });

  it('găsește fără diacritice și limitează rezultatele din conținut', () => {
    useQuizStore.setState({
      quizzes: [{
        ...quiz,
        kind: 'quiz',
        questions: Array.from({ length: 40 }, (_, index) => ({ id: `x${index}`, text: `Fibrilație ${index}`, options: [] })),
      }],
    });
    setup();
    openSearch();
    type('fibrilatie');
    expect(screen.getAllByRole('option').length).toBe(10);
  });

  it('arată „Nu am găsit rezultate” când nimic nu se potrivește', () => {
    setup();
    openSearch();
    type('zzzzqqqq');
    expect(screen.getByText('Nu am găsit rezultate')).toBeTruthy();
  });

  it('caută în opțiuni, explicații, carduri și notițe, cu grupuri și fragment marcat', () => {
    useQuizStore.setState({
      quizzes: [
        { ...quiz, kind: 'quiz', questions: [{ id: 'qq1', text: 'Despre pancreas', options: [{ id: 'o', text: 'Pancreatita acută', isCorrect: true }, { id: 'p', text: 'Alta', isCorrect: false }], explanation: 'Amilaza crescută' }] },
        { ...quiz, id: 'deck', title: 'Carduri', kind: 'flashcard', questions: [{ id: 'cc1', text: 'Amilaza', options: [{ id: 'o', text: 'Enzimă pancreatică', isCorrect: true }] }] },
      ],
    });
    setup();
    openSearch();
    type('pancreatita');
    const option = screen.getAllByRole('option').find((node) => node.textContent?.includes('Opțiune'));
    expect(option?.querySelector('mark')?.textContent?.toLowerCase()).toContain('pancreatita');
    expect(option?.id).toBeTruthy();
    type('enzima');
    expect(screen.getByText('Flashcarduri')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('option')[0]);
    expect(screen.getByTestId('where').textContent).toBe('/flashcards/session/deck?mode=all');
  });
});
