import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import QuizPlay from './QuizPlay';
import { useQuizStore } from '../store/quizStore';
import { useStatsStore } from '../store/statsStore';
import { useUserStore } from '../store/userStore';
import type { Question, Quiz, QuizSession } from '../types';

// Exit animations run on rAF, which the global fake timers (and clearAllTimers between tests)
// leave in an unreliable state; rendering presence children directly keeps the tests deterministic.
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</> };
});

const question = (id: string, extra: Partial<Question> = {}): Question => ({
  id,
  text: `Întrebarea ${id}`,
  options: [
    { id: `${id}a`, text: `${id} corect`, isCorrect: true },
    { id: `${id}b`, text: `${id} greșit`, isCorrect: false },
    { id: `${id}c`, text: `${id} altul`, isCorrect: false },
  ],
  ...extra,
});

const makeQuiz = (questions: Question[], extra: Partial<Quiz> = {}): Quiz => ({
  id: 'z', title: 'Set', description: '', emoji: '', category: 'Cat', kind: 'quiz', questions, createdAt: 0, color: 'blue', ...extra,
});

interface ResultsState { session: QuizSession; orderedQuestions: Question[] }
function ResultsProbe() {
  const loc = useLocation();
  return <div>REZULTATE<pre data-testid="results-state">{JSON.stringify(loc.state)}</pre></div>;
}

/** What the results route received as router state (null while still playing). */
const getResults = (): ResultsState | null => {
  const node = screen.queryByTestId('results-state');
  return node ? (JSON.parse(node.textContent ?? 'null') as ResultsState) : null;
};

const renderPlay = (state: Record<string, unknown> | null = null, pathname = '/play/z') =>
  render(
    <MemoryRouter initialEntries={[{ pathname: new URL(pathname, 'http://studyx.local').pathname, search: new URL(pathname, 'http://studyx.local').search, state }]}>
      <Routes>
        <Route path="/play/:id" element={<QuizPlay />} />
        <Route path="/results/:id" element={<ResultsProbe />} />
      </Routes>
    </MemoryRouter>,
  );

/** Lets framer-motion finish exit animations (rAF runs on the fake clock). Stays well under 12s, the hint-nudge delay. */
const settle = async () => {
  for (let i = 0; i < 4; i += 1) await act(async () => { await vi.advanceTimersByTimeAsync(250); });
};
const pick = (text: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^[A-E✓×] ${text}[0-9]?$`) }));
const check = () => fireEvent.click(screen.getAllByRole('button', { name: /Verifică răspunsul|Verifică selecția/ }).at(-1)!);
const rate = async (name: string) => { fireEvent.click(screen.getAllByRole('button', { name: new RegExp(name) }).at(-1)!); await settle(); };
const key = (k: string) => fireEvent.keyDown(window, { key: k });
const counter = (i: number, n: number) => screen.getAllByText(`Întrebarea ${i} din ${n}`).length > 0;

describe('QuizPlay (characterization)', () => {
  beforeEach(() => {
    useQuizStore.setState({ quizzes: [], sessions: [], _hasHydrated: true });
    useStatsStore.getState().reset();
    useUserStore.setState({ activeProfileId: null });
  });

  it('shows the not-found state when the quiz does not exist', async () => {
    renderPlay();
    expect(screen.getByText('Grila nu a fost găsită')).toBeTruthy();
  });

  it('opens only the exact linked question and records a one-question session', async () => {
    useQuizStore.setState({ quizzes: [makeQuiz([question('q1'), question('q2'), question('q3')], { shuffleQuestions: true })] });
    renderPlay(null, '/play/z?question=q2');
    expect(counter(1, 1)).toBe(true);
    expect(screen.getAllByText('Întrebarea q2').length).toBeGreaterThan(0);
    expect(screen.queryByText('Întrebarea q1')).toBeNull();
    pick('q2 corect');
    check();
    await rate('Știam sigur');
    expect(getResults()!.session).toMatchObject({ score: 1, total: 1, answers: { q2: ['q2a'] } });
    expect(getResults()!.orderedQuestions.map((q) => q.id)).toEqual(['q2']);
    expect(useQuizStore.getState().quizzes[0].questions).toHaveLength(3);
    expect(useQuizStore.getState().sessions).toHaveLength(0);
    expect(Object.keys(useStatsStore.getState().questionStats)).toEqual(['z:q2']);
  });

  it('shows an explicit missing-question state for a stale note link', () => {
    useQuizStore.setState({ quizzes: [makeQuiz([question('q1')])] });
    renderPlay(null, '/play/z?question=deleted');
    expect(screen.getByText('Întrebarea nu a fost găsită')).toBeTruthy();
    expect(screen.queryByText('Întrebarea q1')).toBeNull();
  });

  it('does not turn an empty question parameter into a full quiz attempt', () => {
    useQuizStore.setState({ quizzes: [makeQuiz([question('q1')])] });
    renderPlay(null, '/play/z?question=');
    expect(screen.getByText('Întrebarea nu a fost găsită')).toBeTruthy();
  });

  describe('study flow', () => {
    it('select -> confirm -> reveal -> rate -> next -> finish navigates to results with session + orderedQuestions', async () => {
      const qs = [question('q1', { explanation: 'Pentru că da.' }), question('q2')];
      useQuizStore.setState({ quizzes: [makeQuiz(qs)] });
      renderPlay();

      expect(counter(1, 2)).toBe(true);
      expect(screen.queryByText(/Explicație:/)).toBeNull();
      pick('q1 corect');
      check();
      expect(screen.getByText(/Explicație:/)).toBeTruthy();
      expect(screen.getByText('Notița mea')).toBeTruthy();
      await rate('Știam sigur');
      expect(counter(2, 2)).toBe(true);

      pick('q2 greșit');
      check();
      await rate('Nu știam');
      expect(screen.getByText('REZULTATE')).toBeTruthy();

      expect(getResults()!.orderedQuestions.map((q) => q.id)).toEqual(['q1', 'q2']);
      expect(getResults()!.session).toMatchObject({
        quizId: 'z', score: 1, total: 2, mode: 'study',
        answers: { q1: ['q1a'], q2: ['q2b'] },
      });
      expect(getResults()!.session.penalizedScore).toBeUndefined();
      expect(useQuizStore.getState().sessions).toHaveLength(1);
      const stats = useStatsStore.getState().questionStats;
      expect(Object.keys(stats).sort()).toEqual(['z:q1', 'z:q2']);
    });

    it('records partially correct multi-select as partialAnswers and not as correct', async () => {
      const multi = question('m', {
        multipleCorrect: true,
        options: [
          { id: 'ma', text: 'ma', isCorrect: true },
          { id: 'mb', text: 'mb', isCorrect: true },
          { id: 'mc', text: 'mc', isCorrect: false },
        ],
      });
      useQuizStore.setState({ quizzes: [makeQuiz([multi])] });
      renderPlay();
      expect(screen.getAllByText('Răspunsuri multiple').length).toBeGreaterThan(0);
      pick('ma');
      check();
      await rate('Ghiceam');
      expect(getResults()!.session.score).toBe(0);
      expect(getResults()!.session.partialAnswers).toEqual(['m']);
    });

    it('the Confirm button stays disabled until something is selected', async () => {
      useQuizStore.setState({ quizzes: [makeQuiz([question('q1'), question('q2')])] });
      renderPlay();
      const btn = screen.getAllByRole('button', { name: /Verifică răspunsul/ }).at(-1) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('"Anterior" restores the previous answer in revealed state; "Amână" moves the question to the end', async () => {
      useQuizStore.setState({ quizzes: [makeQuiz([question('q1'), question('q2'), question('q3')])] });
      renderPlay();
      fireEvent.click(screen.getByRole('button', { name: /Amână/ }));
      await settle();
      expect(screen.getAllByText('Întrebarea q2').length).toBeGreaterThan(0);
      pick('q2 corect');
      check();
      await rate('Știam sigur');
      expect(screen.getAllByText('Întrebarea q3').length).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole('button', { name: /Anterior/ }));
      await settle();
      expect(screen.getAllByText('Întrebarea q2').length).toBeGreaterThan(0);
      expect(screen.getByText('Notița mea')).toBeTruthy(); // revealed again
    });
  });

  describe('auto-advance', () => {
    it('moves on 3.2s after reveal, unless the user interacts first (pointerdown holds it)', async () => {
      useQuizStore.setState({ quizzes: [makeQuiz([question('q1'), question('q2'), question('q3')])] });
      renderPlay();
      fireEvent.click(screen.getByRole('button', { name: /^Auto$/ }));
      pick('q1 corect');
      check();
      await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
      expect(counter(1, 3)).toBe(true);
      await act(async () => { await vi.advanceTimersByTimeAsync(200); });
      expect(counter(2, 3)).toBe(true);

      pick('q2 corect');
      check();
      fireEvent.pointerDown(window);
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(counter(2, 3)).toBe(true);
    });
  });

  describe('penalty scoring', () => {
    it('+1 correct, -0.25 per wrong option, clamped at 0, unanswered neutral', async () => {
      const multi = question('m', {
        multipleCorrect: true,
        options: [
          { id: 'ma', text: 'ma', isCorrect: true },
          { id: 'mb', text: 'mb', isCorrect: false },
          { id: 'mc', text: 'mc', isCorrect: false },
        ],
      });
      useQuizStore.setState({ quizzes: [makeQuiz([question('q1'), multi], { penaltyMode: true })] });
      renderPlay();
      expect(screen.getByText('Scor cu penalizare')).toBeTruthy();
      pick('q1 corect');
      check();
      await rate('Știam sigur');
      pick('mb');
      pick('mc');
      check();
      await rate('Nu știam');
      // 1 - 2*0.25 = 0.5
      expect(getResults()!.session.penalizedScore).toBe(0.5);
    });

    it('clamps a negative net score to 0', async () => {
      useQuizStore.setState({ quizzes: [makeQuiz([question('q1')], { penaltyMode: true })] });
      renderPlay();
      pick('q1 greșit');
      check();
      await rate('Nu știam');
      expect(getResults()!.session.penalizedScore).toBe(0);
      expect(getResults()!.session.score).toBe(0);
    });
  });

  describe('exam mode', () => {
    it('answers advance immediately, no explanation, no reveal, finishes with mode exam', async () => {
      const qs = [question('q1', { explanation: 'secret' }), question('q2')];
      useQuizStore.setState({ quizzes: [makeQuiz(qs)] });
      renderPlay({ mode: 'exam' });
      expect(screen.getAllByText('Simulare examen').length).toBeGreaterThan(0);
      pick('q1 corect');
      await settle();
      expect(counter(2, 2)).toBe(true);
      expect(screen.queryByText(/Explicație:/)).toBeNull();
      expect(screen.queryByText('Notița mea')).toBeNull();
      pick('q2 greșit');
      expect(screen.getByText('REZULTATE')).toBeTruthy();
      expect(getResults()!.session).toMatchObject({ mode: 'exam', score: 1, total: 2, answers: { q1: ['q1a'], q2: ['q2b'] } });
    });

    it('examMinutes countdown auto-finishes at 0 with the answers so far', async () => {
      useQuizStore.setState({ quizzes: [makeQuiz([question('q1'), question('q2'), question('q3')])] });
      renderPlay({ mode: 'exam', examMinutes: 1 });
      expect(screen.getByText('Timp rămas')).toBeTruthy();
      expect(screen.getByText('01:00')).toBeTruthy();
      pick('q1 corect');
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
      expect(screen.getByText('00:30')).toBeTruthy();
      expect(screen.queryByText('REZULTATE')).toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
      expect(screen.getByText('REZULTATE')).toBeTruthy();
      expect(getResults()!.session.mode).toBe('exam');
      expect(getResults()!.session.answers).toEqual({ q1: ['q1a'] });
      expect(getResults()!.session.total).toBe(3);
    });

    it('without examMinutes there is no countdown', async () => {
      useQuizStore.setState({ quizzes: [makeQuiz([question('q1')])] });
      renderPlay({ mode: 'exam' });
      expect(screen.queryByText('Timp rămas')).toBeNull();
    });
  });

  describe('timed mode', () => {
    it('auto-advances after 30s, blanking only the expired question, and finishes with mode test', async () => {
      useQuizStore.setState({ quizzes: [makeQuiz([question('q1'), question('q2')])] });
      renderPlay({ mode: 'timed' });
      expect(screen.getAllByText(/30s/).length).toBeGreaterThan(0);
      await act(async () => { await vi.advanceTimersByTimeAsync(29_000); });
      expect(counter(1, 2)).toBe(true);
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
      expect(counter(2, 2)).toBe(true);
      expect(screen.getAllByText(/30s/).length).toBeGreaterThan(0); // re-armed, not instantly blanked
      await act(async () => { await vi.advanceTimersByTimeAsync(29_000); });
      expect(screen.queryByText('REZULTATE')).toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
      expect(screen.getByText('REZULTATE')).toBeTruthy();
      expect(getResults()!.session).toMatchObject({ mode: 'test', score: 0, total: 2, answers: { q1: [], q2: [] } });
    });

    it('keeps a partial selection when the timer expires', async () => {
      useQuizStore.setState({ quizzes: [makeQuiz([question('q1', { multipleCorrect: true }), question('q2')])] });
      renderPlay({ mode: 'timed' });
      pick('q1 corect');
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
      expect(counter(2, 2)).toBe(true);
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
      expect(getResults()!.session.answers).toEqual({ q1: ['q1a'], q2: [] });
    });
  });

  describe('keyboard shortcuts', () => {
    it('1-5 / A-E select, Enter confirms, 1/2/3 rate after reveal, Enter/Space continue', async () => {
      useQuizStore.setState({ quizzes: [makeQuiz([question('q1'), question('q2'), question('q3')])] });
      renderPlay();
      key('a');
      key('Enter');
      expect(screen.getByText('Notița mea')).toBeTruthy();
      key('3'); // rate confident -> next
      expect(counter(2, 3)).toBe(true);
      key('2'); // select second option (b)
      key(' ');
      expect(screen.getByText('Notița mea')).toBeTruthy();
      key('Enter'); // revealed + Enter -> next without rating
      expect(counter(3, 3)).toBe(true);
      key('ArrowLeft');
      expect(counter(2, 3)).toBe(true);
    });

    it('ignores shortcuts while typing in a text field', async () => {
      useQuizStore.setState({ quizzes: [makeQuiz([question('q1'), question('q2')])] });
      renderPlay();
      key('a');
      key('Enter');
      const area = screen.getByPlaceholderText(/Adaugă o notiță/) as HTMLTextAreaElement;
      area.focus();
      fireEvent.keyDown(area, { key: '3' });
      expect(counter(1, 2)).toBe(true);
    });

    it('in exam mode a key press answers and advances', async () => {
      useQuizStore.setState({ quizzes: [makeQuiz([question('q1'), question('q2')])] });
      renderPlay({ mode: 'exam' });
      key('b');
      expect(counter(2, 2)).toBe(true);
      key('c');
      expect(getResults()!.session.answers).toEqual({ q1: ['q1b'], q2: ['q2c'] });
    });

    it('finishing twice in the same tick saves one session and records answers once', async () => {
      useQuizStore.setState({ quizzes: [makeQuiz([question('q1')])] });
      renderPlay({ mode: 'exam' });
      act(() => {
        // Two events before React commits: the second one still sees the pre-finish handlers.
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      });
      expect(useQuizStore.getState().sessions).toHaveLength(1);
      expect(useStatsStore.getState().questionStats['z:q1'].timesCorrect).toBe(1);
    });

    it('a key press followed by Enter on the last exam question saves one session', async () => {
      useQuizStore.setState({ quizzes: [makeQuiz([question('q1')])] });
      renderPlay({ mode: 'exam' });
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      });
      expect(useQuizStore.getState().sessions).toHaveLength(1);
    });

    it('ignores auto-repeated keydown events', async () => {
      useQuizStore.setState({ quizzes: [makeQuiz([question('q1'), question('q2')])] });
      renderPlay({ mode: 'exam' });
      fireEvent.keyDown(window, { key: 'a', repeat: true });
      expect(counter(1, 2)).toBe(true);
    });
  });

  describe('router state', () => {
    it('wrongQuestionsOnly filters (deduped), practiceCount/blockStart slice', async () => {
      const qs = ['q1', 'q2', 'q3', 'q4', 'q5'].map((i) => question(i));
      useQuizStore.setState({ quizzes: [makeQuiz(qs)] });
      renderPlay({ wrongQuestionsOnly: ['q2', 'q4', 'q4', 'q5'], practiceCount: 2, blockStart: 1 });
      expect(screen.getAllByText('Recuperare greșeli').length).toBeGreaterThan(0);
      expect(counter(1, 2)).toBe(true);
      expect(screen.getAllByText('Întrebarea q4').length).toBeGreaterThan(0);
      key('a'); key('Enter'); key('3');
      key('a'); key('Enter'); key('3');
      expect(getResults()!.orderedQuestions.map((q) => q.id)).toEqual(['q4', 'q5']);
    });

    it('practiceCount with blockStart clamps to the last question', async () => {
      const qs = ['q1', 'q2', 'q3'].map((i) => question(i));
      useQuizStore.setState({ quizzes: [makeQuiz(qs)] });
      renderPlay({ practiceCount: 2, blockStart: 99 });
      expect(counter(1, 1)).toBe(true);
      expect(screen.getAllByText('Întrebarea q3').length).toBeGreaterThan(0);
    });
  });
});
