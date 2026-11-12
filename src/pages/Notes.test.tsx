import { render, screen, fireEvent } from '@testing-library/react';
import { expectNoA11yViolations } from '../test/a11y';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider } from '../theme/ThemeContext';
import { useNotesStore } from '../store/notesStore';
import { useQuizStore } from '../store/quizStore';
import Notes from './Notes';

describe('Notes question links', () => {
  beforeEach(() => {
    useNotesStore.getState()._hydrate({ notes: {} });
    useQuizStore.setState({ quizzes: [], sessions: [], _hasHydrated: true });
  });

  it('links a note to its exact question instead of the quiz overview', () => {
    useNotesStore.getState().setNote('q2', 'De revizuit');
    useQuizStore.setState({ quizzes: [{
      id: 'quiz 1', title: 'Cardiologie', description: '', emoji: '📚',
      category: 'Medicină', kind: 'quiz', createdAt: 0, color: 'blue',
      questions: [{ id: 'q2', text: 'Care este semnul clinic?', options: [
        { id: 'a', text: 'A', isCorrect: true }, { id: 'b', text: 'B', isCorrect: false },
      ] }],
    }] });
    render(<MemoryRouter><ThemeProvider><Notes /></ThemeProvider></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Deschide întrebarea: Care este semnul clinic?' }).getAttribute('href'))
      .toBe('/play/quiz%201?question=q2');
  });

  it('renders quiz header link without underlining emoji', () => {
    useNotesStore.getState().setNote('q2', 'De revizuit');
    useQuizStore.setState({ quizzes: [{
      id: 'quiz-1', title: 'Cardiologie', description: '', emoji: '✨',
      category: 'Medicină', kind: 'quiz', createdAt: 0, color: 'blue',
      questions: [{ id: 'q2', text: 'Care este semnul clinic?', options: [
        { id: 'a', text: 'A', isCorrect: true }, { id: 'b', text: 'B', isCorrect: false },
      ] }],
    }] });
    render(<MemoryRouter><ThemeProvider><Notes /></ThemeProvider></MemoryRouter>);
    const quizLink = screen.getByRole('link', { name: /Cardiologie/ });
    expect(quizLink.getAttribute('href')).toBe('/quiz/quiz-1');
    expect(quizLink.textContent).toContain('Cardiologie');
    expect(quizLink.textContent).toContain('✨');
  });

  it('renders virtualized notes list with data-tutorial anchor on the first note', () => {
    useNotesStore.getState().setNote('q1', 'Notiță 1');
    useNotesStore.getState().setNote('q2', 'Notiță 2');
    useQuizStore.setState({ quizzes: [{
      id: 'quiz-1', title: 'Pneumologie', description: '', emoji: '🫁',
      category: 'Medicină', kind: 'quiz', createdAt: 0, color: 'blue',
      questions: [
        { id: 'q1', text: 'Întrebare 1', options: [{ id: 'a', text: 'A', isCorrect: true }] },
        { id: 'q2', text: 'Întrebare 2', options: [{ id: 'a', text: 'A', isCorrect: true }] },
      ],
    }] });
    const { container } = render(<MemoryRouter><ThemeProvider><Notes /></ThemeProvider></MemoryRouter>);
    const firstEntry = container.querySelector('[data-tutorial="notes-entry"]');
    expect(firstEntry).not.toBeNull();
    expect(screen.getByText('Notiță 1')).toBeInTheDocument();
  });

  it('filters notes via search input and resets properly', async () => {
    useNotesStore.getState().setNote('q1', 'Notiță despre pneumonie');
    useNotesStore.getState().setNote('q2', 'Notiță despre cardiologie');
    useQuizStore.setState({ quizzes: [{
      id: 'quiz-1', title: 'Medicină Generală', description: '', emoji: '🩺',
      category: 'Medicină', kind: 'quiz', createdAt: 0, color: 'blue',
      questions: [
        { id: 'q1', text: 'Întrebare Pneumo', options: [{ id: 'a', text: 'A', isCorrect: true }] },
        { id: 'q2', text: 'Întrebare Cardio', options: [{ id: 'a', text: 'A', isCorrect: true }] },
      ],
    }] });
    const { fireEvent } = await import('@testing-library/react');
    render(<MemoryRouter><ThemeProvider><Notes /></ThemeProvider></MemoryRouter>);

    expect(screen.getByText('Notiță despre pneumonie')).toBeInTheDocument();
    expect(screen.getByText('Notiță despre cardiologie')).toBeInTheDocument();

    const searchInput = screen.getByLabelText('Caută în notițe');
    fireEvent.change(searchInput, { target: { value: 'pneumonie' } });

    expect(screen.getByText('Notiță despre pneumonie')).toBeInTheDocument();
    expect(screen.queryByText('Notiță despre cardiologie')).toBeNull();

    fireEvent.change(searchInput, { target: { value: 'negasit_xyz' } });
    expect(screen.getByText('Nicio notiță nu corespunde')).toBeInTheDocument();
  });
});

describe('Notes schemes', () => {
  const code = 'graph TD\n  A[Start] --> B[Final]';
  const id = 'schema-abc';
  beforeEach(() => {
    useNotesStore.getState()._hydrate({ notes: { [id]: `Schema mea\n\n\`\`\`schema\n${code}\n\`\`\`` } });
    useQuizStore.setState({ quizzes: [], sessions: [], _hasHydrated: true });
  });
  const view = () => render(<MemoryRouter><ThemeProvider><Notes /></ThemeProvider></MemoryRouter>);

  it('shows a schema note under Scheme, not Grilă ștearsă, without open link', async () => {
    const { container } = view();
    expect(screen.getByRole('heading', { name: 'Scheme' })).toBeInTheDocument();
    expect(screen.queryByText('Grilă ștearsă')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Schema mea')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('edits the source and saves it', () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: /Editează schema/ }));
    fireEvent.change(screen.getByLabelText(/Sursa schemei/), { target: { value: 'graph TD\n  A[Nou] --> B[Final]' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(useNotesStore.getState().notes[id]).toContain('A[Nou]');
  });

  it('asks for confirmation before deleting', () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Șterge notița' }));
    expect(useNotesStore.getState().notes[id]).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Șterge' }));
    expect(useNotesStore.getState().notes[id]).toBeUndefined();
  });
});
