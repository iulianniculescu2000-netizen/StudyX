import { render, screen } from '@testing-library/react';
import { BookOpen } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import type { Question, Quiz, QuizSession } from '../../types';
import ResultHero from './ResultHero';
import { countUnanswered, disciplineBreakdownWithUnanswered, isUnanswered } from './unanswered';

const q = (id: string, discipline: string): Question => ({
  id, text: id, tags: [`disc:${discipline}`],
  options: [{ id: `${id}a`, text: 'a', isCorrect: true }, { id: `${id}b`, text: 'b', isCorrect: false }],
});

describe('unanswered questions', () => {
  const questions = [q('q1', 'Anatomie'), q('q2', 'Anatomie'), q('q3', 'Anatomie')];
  const answers = { q1: ['q1a'], q3: [] as string[] };

  it('treats missing and empty answers as unanswered', () => {
    expect(isUnanswered(answers, questions[0])).toBe(false);
    expect(isUnanswered(answers, questions[1])).toBe(true);
    expect(isUnanswered(answers, questions[2])).toBe(true);
    expect(countUnanswered(answers, questions)).toBe(2);
  });

  it('keeps the discipline total out of all questions and reports unanswered separately', () => {
    const rows = disciplineBreakdownWithUnanswered(questions, answers, (question) => (answers[question.id as 'q1'] ?? []).includes(`${question.id}a`));
    expect(rows).toEqual([expect.objectContaining({ discipline: 'Anatomie', correct: 1, total: 3, unanswered: 2 })]);
  });

  it('shows Fără răspuns in the hero metrics and does not count it as wrong', () => {
    const session: QuizSession = { id: 's', quizId: 'q', answers: { q1: ['q1a'] }, score: 1, total: 14, mode: 'exam', startedAt: 1, finishedAt: 2 };
    const quiz = { id: 'q', title: 'Examen', questions: [], penaltyMode: false } as unknown as Quiz;
    render(
      <ResultHero quiz={quiz} session={session} sessions={[]} pct={7} grade={{ label: 'x', Icon: BookOpen, color: '#000' }}
        duration={1} formatTime={(s) => `${s}s`} wrongCount={0} unansweredCount={13} disciplineResults={[]} />,
    );
    expect(screen.getByText('Greșite').previousElementSibling?.textContent ?? screen.getByText('Greșite').nextElementSibling?.textContent).toBe('0');
    expect(screen.getByText('Fără răspuns', { selector: 'dt' }).nextElementSibling?.textContent).toBe('13');
    expect(screen.getByText('0 greșeli de revizuit')).toBeTruthy();
    expect(screen.getByText('13 fără răspuns')).toBeTruthy();
  });
});
