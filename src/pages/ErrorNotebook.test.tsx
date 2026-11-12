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

  it('închide explicația la al doilea click (expandare/colapsare)', () => {
    useQuizStore.setState({ quizzes: [quiz] });
    useStatsStore.setState({ questionStats: { 'z:q1': { quizId: 'z', questionId: 'q1', timesCorrect: 0, timesWrong: 2, lastSeen: 1, nextReview: 0, interval: 1 } } });
    renderPage();
    const trigger = screen.getByRole('button', { name: /Tratament în FiA/ });
    fireEvent.click(trigger);
    expect(screen.getByText('Anticoagulare.')).toBeTruthy();
    fireEvent.click(trigger);
    expect(screen.queryByText('Anticoagulare.')).toBeNull();
  });

  it('Tutor socratic fără cheie AI: întrebări-șablon, alegere manuală, tipul se salvează și apare în caiet', () => {
    useQuizStore.setState({ quizzes: [quiz] });
    useStatsStore.setState({ questionStats: { 'z:q1': { quizId: 'z', questionId: 'q1', timesCorrect: 0, timesWrong: 2, lastSeen: 1, nextReview: 0, interval: 1 } } });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Tratament în FiA/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tutor socratic/ }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/Întrebarea 1 din 3/)).toBeTruthy();
    // răspunsul corect nu apare în dialog (DOAC e doar în lista din caiet, în afara dialogului)
    expect(screen.getByRole('dialog').textContent).not.toContain('DOAC');
    fireEvent.click(screen.getByRole('button', { name: 'Mai departe' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mai departe' }));
    fireEvent.click(screen.getByRole('button', { name: 'Alege tipul' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Mecanism' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvează tipul erorii' }));
    expect(useStatsStore.getState().questionStats['z:q1'].errorType).toBe('mecanism');
    expect(screen.getByText(/Eroare de mecanism/)).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Tipuri de erori' }).textContent).toContain('Mecanism · 1 (100%)');
  });

  it('filtrează greșelile prin căutare și resetează lista', () => {
    useQuizStore.setState({ quizzes: [quiz] });
    useStatsStore.setState({ questionStats: { 'z:q1': { quizId: 'z', questionId: 'q1', timesCorrect: 0, timesWrong: 2, lastSeen: 1, nextReview: 0, interval: 1 } } });
    renderPage();
    const searchInput = screen.getByRole('searchbox', { name: 'Caută în greșeli' });
    fireEvent.change(searchInput, { target: { value: 'termen_inexistent' } });
    expect(screen.getByText('Nicio greșeală nu se potrivește căutării.')).toBeTruthy();
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getByText(/Tratament în FiA/)).toBeTruthy();
  });
});
