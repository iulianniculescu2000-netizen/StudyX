import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import DailyReview from './DailyReview';
import { useOrganizareStore, type PlanSummary } from '../store/organizareStore';
import { useQuizStore } from '../store/quizStore';
import { useStatsStore } from '../store/statsStore';
import { useUserStore } from '../store/userStore';
import type { Question, QuestionStat, Quiz } from '../types';

const question = (id: string): Question => ({
  id,
  text: `Întrebarea ${id}`,
  options: [{ id: 'a', text: 'corect', isCorrect: true }, { id: 'b', text: 'greșit', isCorrect: false }],
});

const quiz = (questions: Question[]): Quiz => ({
  id: 'z', title: 'Set', description: '', emoji: '', category: '', kind: 'quiz', questions, createdAt: 0, color: 'blue',
});

const dueStat = (questionId: string): QuestionStat => ({
  quizId: 'z', questionId, timesCorrect: 1, timesWrong: 0, lastSeen: 0, nextReview: 1, interval: 1,
});

const renderPage = () => render(<MemoryRouter><DailyReview /></MemoryRouter>);

describe('DailyReview', () => {
  beforeEach(() => {
    useQuizStore.setState({ quizzes: [], sessions: [], _hasHydrated: true });
    useStatsStore.getState().reset();
    useOrganizareStore.setState({ byProfile: {} });
    useUserStore.setState({ activeProfileId: null });
  });

  it('keeps the same list for the whole session: after each answer the counter total stays put', () => {
    const questions = ['q1', 'q2', 'q3'].map(question);
    useQuizStore.setState({ quizzes: [quiz(questions)] });
    useStatsStore.setState({ questionStats: Object.fromEntries(questions.map((q) => [`z:${q.id}`, dueStat(q.id)])) });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Începe sesiunea/ }));

    const seen: string[] = [];
    for (let i = 1; i <= 3; i += 1) {
      expect(screen.getByText(`${i} / 3`)).toBeTruthy();
      // Cardul anterior poate rămâne în DOM cât timp își joacă ieșirea; cel curent e ultimul.
      seen.push(screen.getAllByText(/^Întrebarea q\d$/).at(-1)?.textContent ?? '');
      fireEvent.click(screen.getAllByRole('button', { name: /greșit/ }).at(-1)!);
      fireEvent.click(screen.getAllByRole('button', { name: /Următor|Vezi rezultatele/ }).at(-1)!);
    }
    expect(new Set(seen).size).toBe(3);
    expect(screen.getByText(/Sesiune SM-2 completă/)).toBeTruthy();
  });

  it('arată litera variantei (A, B…), nu id-ul intern, la întrebările importate cu id-uri de tip cod', () => {
    const coded: Question = {
      id: 'q1', text: 'Întrebarea cu coduri',
      options: [
        { id: '3-1-6976F9', text: 'prima', isCorrect: true },
        { id: '3-2-AB12CD', text: 'a doua', isCorrect: false },
        { id: '3-3-62444C', text: 'a treia', isCorrect: false },
      ],
    };
    useQuizStore.setState({ quizzes: [quiz([coded])] });
    useStatsStore.setState({ questionStats: { 'z:q1': dueStat('q1') } });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Începe sesiunea/ }));
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/3-1-6976F9|3-2-AB12CD|3-3-62444C/);
    const badges = screen.getAllByRole('button', { name: /prima|a doua|a treia/ }).map((button) => button.querySelector('span')?.textContent);
    expect(badges).toEqual(['A', 'B', 'C']);
  });

  it('shows the skeleton instead of "Ești la zi!" before the stores have hydrated', () => {
    useQuizStore.setState({ _hasHydrated: false });
    const { container } = renderPage();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByText('Ești la zi!')).toBeNull();
  });

  it('tells apart "no quizzes yet" from "all caught up"', () => {
    renderPage();
    expect(screen.getByText('Încă nu ai grile')).toBeTruthy();
  });

  it('offers the Organizare plan only when a summary exists', () => {
    useQuizStore.setState({ quizzes: [quiz([question('q1')])] });
    const first = renderPage();
    expect(screen.getByText('Ești la zi!')).toBeTruthy();
    expect(screen.queryByText('Vezi planul în Organizare')).toBeNull();
    expect(screen.getByText('Flashcarduri')).toBeTruthy();
    first.unmount();

    useOrganizareStore.setState({ byProfile: { default: { state: null, summary: {} as PlanSummary, root: null } } });
    renderPage();
    expect(screen.getByText('Vezi planul în Organizare')).toBeTruthy();
  });
});
