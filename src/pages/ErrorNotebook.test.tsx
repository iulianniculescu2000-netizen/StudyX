import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import ErrorNotebook from './ErrorNotebook';
import { useQuizStore } from '../store/quizStore';
import { useStatsStore } from '../store/statsStore';
import type { Quiz } from '../types';

const quiz: Quiz = {
  id: 'z', title: 'Set cardio', description: '', emoji: '', category: 'Cardiologie', kind: 'quiz', createdAt: 0, color: 'blue',
  questions: [{ id: 'q1', text: 'Tratament în FiA?', explanation: 'Anticoagulare.', options: [{ id: 'a', text: 'DOAC', isCorrect: true }, { id: 'b', text: 'Nimic', isCorrect: false }] }],
};

const renderPage = () => render(<MemoryRouter><ErrorNotebook /></MemoryRouter>);

describe('ErrorNotebook', () => {
  beforeEach(() => {
    useQuizStore.setState({ quizzes: [], sessions: [], _hasHydrated: true });
    useStatsStore.getState().reset();
  });

  it('arată starea goală fără greșeli', () => {
    renderPage();
    expect(screen.getByText('Nicio greșeală deschisă')).toBeTruthy();
  });

  it('listează greșeala pe disciplină și îi arată răspunsul și explicația la deschidere', () => {
    useQuizStore.setState({ quizzes: [quiz] });
    useStatsStore.setState({ questionStats: { 'z:q1': { quizId: 'z', questionId: 'q1', timesCorrect: 0, timesWrong: 2, lastSeen: 1, nextReview: 0, interval: 1 } } });
    renderPage();
    expect(screen.getByText(/Cardiologie · 1/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Tratament în FiA/ }));
    expect(screen.getByText('Anticoagulare.')).toBeTruthy();
    expect(screen.getByText(/DOAC/)).toBeTruthy();
    expect(screen.getByRole('searchbox', { name: 'Caută în greșeli' })).toBeTruthy();
  });
});
