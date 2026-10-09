import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import FlashcardSession from './FlashcardSession';
import { useFolderStore } from '../store/folderStore';
import { useQuizStore } from '../store/quizStore';
import { useStatsStore } from '../store/statsStore';
import { curriculumChapters } from '../lib/curriculum';
import type { Question, QuestionStat, Quiz } from '../types';

const DAY = 86_400_000;
const q = (id: string): Question => ({ id, text: `Întrebarea ${id}`, options: [{ id: `${id}a`, text: `Răspuns ${id}`, isCorrect: true }] });
const deck = (id: string, count: number, tags?: string[]): Quiz => ({
  id, title: `Pachet ${id}`, description: '', emoji: '', category: 'Cat', kind: 'flashcard', color: 'blue', createdAt: 0, tags,
  questions: Array.from({ length: count }, (_, i) => q(`${id}${i}`)),
});
const due = (quizId: string, questionId: string, days: number): QuestionStat => ({
  quizId, questionId, timesCorrect: 1, timesWrong: 0, lastSeen: 0, nextReview: Date.now() - days * DAY, interval: 1,
});

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/flashcards/session/:id" element={<FlashcardSession />} />
      <Route path="/flashcards" element={<div>Hub</div>} />
    </Routes>
  </MemoryRouter>,
);

const rate = (name: RegExp) => {
  // Cardul curent e ultimul în DOM cât timp cel vechi își joacă ieșirea.
  fireEvent.keyDown(document.body, { key: ' ', code: 'Space' });
  fireEvent.click(screen.getAllByRole('button', { name }).at(-1)!);
};

describe('FlashcardSession — sesiune „due” peste pachete', () => {
  beforeEach(() => {
    useFolderStore.setState({ folders: [] });
    useQuizStore.setState({ quizzes: [], sessions: [], _hasHydrated: true });
    useStatsStore.getState().reset();
  });

  const seed = () => {
    const a = deck('a', 2, ['rezidentiat', 'chapter:7', 'book:K']);
    const b = deck('b', 2);
    useQuizStore.setState({ quizzes: [a, b] });
    useStatsStore.setState({
      questionStats: {
        'a:a0': due('a', 'a0', 5), 'a:a1': due('a', 'a1', 4),
        'b:b0': due('b', 'b0', 3), 'b:b1': { ...due('b', 'b1', 2), retired: true },
      },
    });
  };

  it('arată „Nimic de repetat” când nu e nimic restant', () => {
    useQuizStore.setState({ quizzes: [deck('a', 1)] });
    useStatsStore.setState({ questionStats: { 'a:a0': { ...due('a', 'a0', 0), nextReview: Date.now() + DAY } } });
    renderAt('/flashcards/session/due');
    expect(screen.getByText('Nimic de repetat')).toBeTruthy();
  });

  it('parcurge coada peste pachete, cu chip de capitol, și scrie statisticile sub cheile reale', () => {
    seed();
    renderAt('/flashcards/session/due');
    const chapter = curriculumChapters()[7];
    expect(screen.getByText('1 / 3')).toBeTruthy();
    expect(screen.getByTestId('card-chapter-chip').textContent).toBe(`Cap. ${chapter.number} · ${chapter.title}`);

    rate(/Bine/);
    expect(screen.getByText('2 / 3')).toBeTruthy();
    // întrețesut: al doilea card e din pachetul fără capitol, iar chip-ul arată titlul pachetului
    expect(screen.getByTestId('card-chapter-chip').textContent).toBe('Pachet b');
    rate(/Greu/);
    rate(/Bine/);

    expect(screen.getByText('Sesiune încheiată')).toBeTruthy();
    expect(screen.getByTestId('chapter-tally').textContent).toContain('2 carduri');
    expect(screen.getByTestId('chapter-tally').textContent).toContain('1 dificil');

    const keys = Object.keys(useStatsStore.getState().questionStats).sort();
    expect(keys).toEqual(['a:a0', 'a:a1', 'b:b0', 'b:b1']);
    expect(keys.some((key) => key.startsWith('due') )).toBe(false);
    expect(useStatsStore.getState().questionStats['a:a0'].nextReview).toBeGreaterThan(Date.now());
    expect(useStatsStore.getState().questionStats['b:b0'].timesWrong).toBe(1);
    // retired rămâne neatins
    expect(useStatsStore.getState().questionStats['b:b1'].retired).toBe(true);
  });

  it('respectă ?ids= și refresh-ul reconstruiește coada din store (cardurile făcute nu mai apar)', () => {
    seed();
    const first = renderAt('/flashcards/session/due?ids=a');
    expect(screen.getByText('1 / 2')).toBeTruthy();
    rate(/Bine/);
    first.unmount();
    renderAt('/flashcards/session/due?ids=a');
    expect(screen.getByText('1 / 1')).toBeTruthy();
  });

  it('cardurile noi sunt opționale', () => {
    useQuizStore.setState({ quizzes: [deck('a', 3)] });
    useStatsStore.setState({ questionStats: { 'a:a0': due('a', 'a0', 1) } });
    renderAt('/flashcards/session/due');
    expect(screen.getByText('1 / 1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /și cardurile noi/ }));
    expect(screen.getByText('1 / 3')).toBeTruthy();
  });

  it('limita de 50 oferă „Continuă” pentru restul', () => {
    const big = deck('big', 52);
    useQuizStore.setState({ quizzes: [big] });
    useStatsStore.setState({
      questionStats: Object.fromEntries(big.questions.map((question, i) => [`big:${question.id}`, due('big', question.id, 60 - i)])),
    });
    renderAt('/flashcards/session/due');
    expect(screen.getByText('1 / 50')).toBeTruthy();
    for (let i = 0; i < 50; i += 1) rate(/Bine/);
    fireEvent.click(screen.getByRole('button', { name: /Continuă · încă 2/ }));
    expect(screen.getByText('1 / 2')).toBeTruthy();
  }, 30_000);
});
