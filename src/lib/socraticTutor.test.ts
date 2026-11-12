import { describe, expect, it } from 'vitest';
import type { Question } from '../types';
import { SOCRATIC_WRAP_UP_REQUEST } from '../ai/promptKit';
import { MAX_STUDENT_TURNS, buildSocraticMessages, parseSocraticVerdict, socraticCaseFor, type SocraticTurn } from './socraticTutor';
import { useStatsStore } from '../store/statsStore';

const question: Question = {
  id: 'q1',
  text: 'Care este tratamentul de primă linie în X?',
  tags: ['cardio', 'distractori:externa'],
  explanation: 'Medicamentul A este indicat. Varianta C este greșită deoarece aparține altei boli.',
  options: [
    { id: 'a', text: 'Medicament A', isCorrect: true },
    { id: 'b', text: 'Medicament B', isCorrect: false },
    { id: 'c', text: 'Medicament C', isCorrect: false },
  ],
};

describe('socraticTutor', () => {
  it('cazul poartă indiciile din tag și din explicație', () => {
    const c = socraticCaseFor({ question });
    expect(c.distractorTags?.[0]).toContain('din afara temei');
    expect(c.distractorReasons?.[0]).toContain('Varianta C');
  });

  it('mesajele încep cu sistemul, apoi dialogul; încheierea se cere abia după 3 răspunsuri', () => {
    const turns: SocraticTurn[] = [
      { role: 'assistant', text: 'Ce cere enunțul?' },
      { role: 'student', text: 'Tratamentul.' },
    ];
    const early = buildSocraticMessages({ question }, turns);
    expect(early[0].role).toBe('system');
    expect(early.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(JSON.stringify(early)).not.toContain(SOCRATIC_WRAP_UP_REQUEST);

    const full: SocraticTurn[] = Array.from({ length: MAX_STUDENT_TURNS }, (_, i): SocraticTurn[] => [
      { role: 'assistant', text: `Întrebarea ${i + 1}?` },
      { role: 'student', text: `Răspuns ${i + 1}` },
    ]).flat();
    const last = buildSocraticMessages({ question }, full).at(-1);
    expect(last).toEqual({ role: 'user', content: SOCRATIC_WRAP_UP_REQUEST });
  });

  it('parsează concluzia, chiar înconjurată de text, și respinge tipurile necunoscute', () => {
    expect(parseSocraticVerdict('Iată: {"tip":"vecin","motiv":"Ai ales o variantă adevărată, dar pentru altă boală."}')).toEqual({
      type: 'vecin',
      reason: 'Ai ales o variantă adevărată, dar pentru altă boală.',
    });
    expect(parseSocraticVerdict('{"tip":"altceva","motiv":"x"}')).toBeNull();
    expect(parseSocraticVerdict('Și ce ai înțeles din asta?')).toBeNull();
    expect(parseSocraticVerdict('{ nu e json }')).toBeNull();
  });
});

describe('statsStore.setErrorType', () => {
  const base = { questionId: 'q', quizId: 'z', timesCorrect: 0, timesWrong: 1, lastSeen: 1, nextReview: 0, interval: 1 };

  it('salvează, păstrează la răspunsuri noi și șterge cu null; fără statistică nu face nimic', () => {
    useStatsStore.setState({ questionStats: { 'z:q': { ...base } } });
    const { setErrorType, recordAnswer } = useStatsStore.getState();
    setErrorType('z:q', 'exceptie');
    expect(useStatsStore.getState().questionStats['z:q']).toMatchObject({ errorType: 'exceptie', timesWrong: 1 });
    expect(useStatsStore.getState().questionStats['z:q'].errorTypeAt).toBeTypeOf('number');

    recordAnswer('z', 'q', false);
    expect(useStatsStore.getState().questionStats['z:q']).toMatchObject({ errorType: 'exceptie', timesWrong: 2 });

    setErrorType('z:q', null);
    expect(useStatsStore.getState().questionStats['z:q']).not.toHaveProperty('errorType');

    setErrorType('lipsa:x', 'vecin');
    expect(useStatsStore.getState().questionStats).not.toHaveProperty('lipsa:x');
    useStatsStore.getState().reset();
  });

  it('profilurile vechi, fără câmp, se încarcă neschimbate', () => {
    useStatsStore.getState()._hydrate({ questionStats: { 'z:q': { ...base } }, streak: { currentStreak: 0, longestStreak: 0, lastStudyDate: '', studyDates: [] }, totalStudyTime: 0 });
    expect(useStatsStore.getState().questionStats['z:q']).not.toHaveProperty('errorType');
    useStatsStore.getState().reset();
  });
});
