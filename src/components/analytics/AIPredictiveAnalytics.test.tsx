import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import AIPredictiveAnalytics from './AIPredictiveAnalytics';
import DailyReview from '../../pages/DailyReview';
import { useFolderStore } from '../../store/folderStore';
import { useOrganizareStore, type PlanSummary } from '../../store/organizareStore';
import { useQuizStore } from '../../store/quizStore';
import { useStatsStore } from '../../store/statsStore';
import { useUIStore } from '../../store/uiStore';
import { useUserStore } from '../../store/userStore';
import type { Question, QuestionStat, Quiz, QuizSession } from '../../types';

const DAY = 86_400_000;

const renderPage = () => render(
  <MemoryRouter>
    <AIPredictiveAnalytics userId="test" currentLevel={3} subjects={[]} />
  </MemoryRouter>,
);

const question = (id: string, tags?: string[]): Question => ({
  id, text: id, tags, options: [{ id: 'a', text: 'a', isCorrect: true }, { id: 'b', text: 'b', isCorrect: false }],
});

const quiz = (id: string, questions: Question[], extra: Partial<Quiz> = {}): Quiz => ({
  id, title: id, description: '', emoji: '', category: '', kind: 'quiz', questions, createdAt: 0, color: 'blue', ...extra,
});

const stat = (quizId: string, questionId: string, timesCorrect: number, timesWrong: number, nextReview = 0): QuestionStat => ({
  quizId, questionId, timesCorrect, timesWrong, lastSeen: 0, nextReview, interval: 1,
});

/** A quiz of `count` questions, every one answered once (correct for the first `correct` of them). */
function answered(count: number, correct = count, tag = 'Cardiologie') {
  const questions = Array.from({ length: count }, (_, i) => question(`q${i}`, [tag]));
  const stats: Record<string, QuestionStat> = {};
  questions.forEach((q, i) => { stats[`big:${q.id}`] = stat('big', q.id, i < correct ? 1 : 0, i < correct ? 0 : 1); });
  useQuizStore.setState({ quizzes: [quiz('big', questions)] });
  useStatsStore.setState({ questionStats: stats });
}

const session = (daysAgo: number, score: number, total: number): QuizSession => ({
  id: `s-${daysAgo}-${score}-${total}`, quizId: 'big', answers: {}, startedAt: Date.now() - daysAgo * DAY,
  finishedAt: Date.now() - daysAgo * DAY, score, total, mode: 'test',
});

const tileValue = (label: string) => screen.getByText(label).nextElementSibling?.textContent ?? '';

const summary = (ts: number, today: PlanSummary['today'] = { n: 'Aritmii', g: 'Cardiologie', src: 'Kumar p.151-153', pages: 3 }): PlanSummary => ({
  ts, exam: '2027-11-21', phase: 1, done: 1, total: 10, pct: 10, streak: 0, today,
});

describe('Perspective AI', () => {
  beforeEach(() => {
    useQuizStore.setState({ quizzes: [], sessions: [], _hasHydrated: true });
    useStatsStore.getState().reset();
    useOrganizareStore.setState({ byProfile: {} });
    useFolderStore.setState({ folders: [] });
    useUserStore.setState({ activeProfileId: null });
    useUIStore.setState({ chatOpen: false });
    window.localStorage.clear();
  });

  it('shows only the empty state, with actions, when there are no answers', () => {
    renderPage();
    expect(screen.getByText('Perspective AI')).toBeTruthy();
    expect(screen.getByText(/Rezolvă cel puțin 10 grile/)).toBeTruthy();
    expect(screen.getByText('Nu ai setat data examenului')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Rezolvă grile' }).getAttribute('href')).toBe('/rezidentiat');
    expect(screen.getByRole('link', { name: 'Setează data examenului' }).getAttribute('href')).toBe('/rezidentiat/organizare');
    expect(screen.queryByText(/Ritm necesar/)).toBeNull();
    expect(screen.queryByText(/Explică cu AI/)).toBeNull();
  });

  it('offers the analysis periods, 30 days by default', () => {
    renderPage();
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual(['7 zile', '30 de zile', '6 luni']);
    expect(radios[1].getAttribute('aria-checked')).toBe('true');
    expect(radios.map((r) => r.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
  });

  it('moves the period with the arrow keys', () => {
    renderPage();
    const radios = screen.getAllByRole('radio');
    fireEvent.keyDown(radios[1], { key: 'ArrowLeft' });
    expect(screen.getAllByRole('radio')[0].getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(screen.getAllByRole('radio')[0], { key: 'ArrowLeft' });
    expect(screen.getAllByRole('radio')[2].getAttribute('aria-checked')).toBe('true');
  });

  it('waits for the profile to load', () => {
    useQuizStore.setState({ _hasHydrated: false });
    const { container } = renderPage();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  describe('estimate by number of distinct questions', () => {
    it('shows no estimate with 1 or 9 questions', () => {
      for (const count of [1, 9]) {
        answered(count);
        const { unmount } = renderPage();
        expect(screen.getByText(/Rezolvă cel puțin 10 grile/)).toBeTruthy();
        expect(screen.queryByText('Acuratețe pe grilele rezolvate')).toBeNull();
        unmount();
      }
    });

    it('shows the estimate with its interval from 10 questions', () => {
      answered(10, 7);
      renderPage();
      expect(screen.getByText('Acuratețe pe grilele rezolvate')).toBeTruthy();
      expect(screen.getByText('Date puține')).toBeTruthy();
      expect(screen.getByText(/70%, probabil între 40% și 89%, din 10 grile distincte/)).toBeTruthy();
      expect(screen.queryByText(/Rezolvă cel puțin 10 grile/)).toBeNull();
    });

    it('labels 30 questions as moderate data', () => {
      answered(30, 24);
      renderPage();
      expect(screen.getByText('Date moderate')).toBeTruthy();
      expect(screen.queryByText(/presupune că grilele rezolvate/)).toBeNull();
    });

    it('adds the coverage caveat at 100 questions', () => {
      answered(100, 80);
      renderPage();
      expect(screen.getByText('Date suficiente')).toBeTruthy();
      expect(screen.getByText(/Intervalul presupune că grilele rezolvate reprezintă toată materia; acoperirea e 100%/)).toBeTruthy();
    });
  });

  describe('analysis period', () => {
    it('recomputes solved questions for 7 days, 30 days and 6 months', () => {
      answered(10, 7);
      useQuizStore.setState({ sessions: [session(3, 8, 10), session(20, 5, 10), session(100, 9, 10)] });
      renderPage();
      expect(tileValue('Grile rezolvate')).toBe('20');
      fireEvent.click(screen.getByRole('radio', { name: '7 zile' }));
      expect(tileValue('Grile rezolvate')).toBe('10');
      fireEvent.click(screen.getByRole('radio', { name: '6 luni' }));
      expect(tileValue('Grile rezolvate')).toBe('30');
      expect(screen.getAllByText('În ultimele 6 luni').length).toBeGreaterThan(0);
    });

    it('hides the session accuracy under 10 questions and the delta under 30 per window', () => {
      answered(10, 7);
      useQuizStore.setState({ sessions: [session(3, 3, 9)] });
      renderPage();
      expect(tileValue('Acuratețe în sesiuni')).toBe('—');
      expect(screen.getByText(/Prea puține grile în perioadă/)).toBeTruthy();
    });

    it('shows the delta with the number of questions in each window', () => {
      answered(10, 7);
      useQuizStore.setState({ sessions: [session(3, 17, 30), session(40, 16, 30)] });
      renderPage();
      expect(tileValue('Acuratețe în sesiuni')).toBe('57%');
      expect(screen.getByText(/\+3 puncte față de perioada anterioară/)).toBeTruthy();
      expect(screen.getByText(/30 de grile în perioadă · 30 de grile în cea anterioară/)).toBeTruthy();
    });
  });

  describe('knowledge gaps', () => {
    it('lists a weak topic with accessible actions that open the set and the assistant', () => {
      const questions = Array.from({ length: 5 }, (_, i) => question(`g${i}`, ['Aritmii']));
      useQuizStore.setState({ quizzes: [quiz('aritmii-set', questions)] });
      useStatsStore.setState({
        questionStats: Object.fromEntries(questions.map((q, i) => [`aritmii-set:${q.id}`, stat('aritmii-set', q.id, i < 2 ? 1 : 0, i < 2 ? 0 : 1, 1)])),
      });
      renderPage();
      expect(screen.getByText('Prioritate mare')).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Deschide grile: Aritmii' }).getAttribute('href')).toBe('/quiz/aritmii-set');
      expect(screen.getByRole('link', { name: 'Recapitulare, după Aritmii' }).getAttribute('href')).toBe('/daily-review');

      let prompt = '';
      const listener = (event: Event) => { prompt = (event as CustomEvent<{ prompt: string }>).detail.prompt; };
      window.addEventListener('studyx:ai-prompt', listener);
      fireEvent.click(screen.getByRole('button', { name: 'Explică cu AI: Aritmii' }));
      window.removeEventListener('studyx:ai-prompt', listener);
      expect(prompt).toBe('Explică-mi, pentru rezidențiat: Aritmii. Unde greșesc cel mai des?');
      expect(useUIStore.getState().chatOpen).toBe(true);
    });

    it('does not list a strong topic as a gap', () => {
      answered(20, 16, 'Valve');
      renderPage();
      expect(screen.getByText('Topicuri tari')).toBeTruthy();
      expect(screen.queryByRole('link', { name: 'Deschide grile: Valve' })).toBeNull();
      expect(screen.getByText(/Niciun topic evaluat nu e sub ținta/)).toBeTruthy();
    });

    it('does not turn the tags of a generated set into topics', () => {
      const questions = Array.from({ length: 6 }, (_, i) => question(`c${i}`));
      useQuizStore.setState({ quizzes: [quiz('chat-set', questions, { tags: ['ai', 'chat'], category: 'ai' })] });
      useStatsStore.setState({
        questionStats: Object.fromEntries(questions.map((q) => [`chat-set:${q.id}`, stat('chat-set', q.id, 0, 1)])),
      });
      renderPage();
      expect(screen.queryByRole('link', { name: 'Deschide grile: ai' })).toBeNull();
      expect(screen.getByText(/Încă nu am destule răspunsuri pe topicuri/)).toBeTruthy();
    });
  });

  describe('plan card', () => {
    const put = (s: PlanSummary) => useOrganizareStore.setState({ byProfile: { default: { state: null, summary: s, root: null } } });

    it('shows the next topic of the plan', () => {
      put(summary(Date.now()));
      renderPage();
      expect(screen.getByText('Următorul din plan')).toBeTruthy();
      expect(screen.getByText('Aritmii')).toBeTruthy();
      expect(screen.queryByText(/Planul a fost actualizat acum/)).toBeNull();
      expect(screen.getByRole('link', { name: 'Deschide în Organizare' }).getAttribute('href')).toBe('/rezidentiat/organizare');
    });

    it('says how old a stale plan summary is', () => {
      put(summary(Date.now() - 3 * DAY));
      renderPage();
      expect(screen.getByText(/Planul a fost actualizat acum 3 zile/)).toBeTruthy();
    });

    it('marks the exam date from the base plan as an estimate and offers to confirm it', () => {
      put(summary(Date.now()));
      renderPage();
      expect(screen.getByText('Examen rezidențiat (estimare)')).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Confirmă în Organizare' })).toBeTruthy();
    });

    it('shows a passed exam next to an upcoming one from a folder', () => {
      useOrganizareStore.setState({ byProfile: { default: { state: { exam: '2020-01-10' }, summary: null, root: null } } });
      renderPage();
      expect(screen.getByText(/Examenul a trecut/)).toBeTruthy();
    });
  });

  it('shows the same number of due questions as the daily review page', () => {
    const q = (id: string) => question(id);
    useQuizStore.setState({
      quizzes: [
        quiz('a', [q('a1'), q('a2'), q('a3')]),
        quiz('cards', [q('c1'), q('c2')], { kind: 'flashcard' }),
      ],
    });
    useStatsStore.setState({
      questionStats: {
        'a:a1': stat('a', 'a1', 1, 0, 1),
        'a:a2': stat('a', 'a2', 1, 0, 1),
        'a:a3': stat('a', 'a3', 1, 0, Date.now() + 5 * DAY),
        'a:ghost': stat('a', 'ghost', 1, 0, 1),
        'cards:c1': stat('cards', 'c1', 1, 0, 1),
        'gone:x': stat('gone', 'x', 1, 0, 1),
      },
    });

    const analytics = renderPage();
    const analyticsDue = tileValue('Restante la recapitulare');
    analytics.unmount();

    render(<MemoryRouter><DailyReview /></MemoryRouter>);
    const review = screen.getByText(/de recapitulat azi/).textContent ?? '';
    expect(analyticsDue).toBe('2');
    expect(review).toContain(`${analyticsDue} întrebări de recapitulat azi`);
  });
});
