import { describe, expect, it } from 'vitest';
import {
  CATEGORY_LABELS,
  DIFFICULTY_LABELS,
  EMPTY_METRICS,
  RARITY_LABELS,
  LIVE_STATE_NOTE,
  UNIT_LABELS,
  buildAchievements,
  buildChallenges,
  comparisonMessage,
  type GamificationMetrics,
} from './gamificationCatalog';

const metrics = (patch: Partial<GamificationMetrics> = {}): GamificationMetrics => ({ ...EMPTY_METRICS, ...patch });

describe('buildAchievements', () => {
  it('has four locked achievements with zero metrics', () => {
    const list = buildAchievements(EMPTY_METRICS);
    expect(list).toHaveLength(4);
    expect(list.every((item) => !item.done && item.current === 0 && item.percent === 0)).toBe(true);
  });

  it('unlocks the subject badge at 100 questions held at 90%', () => {
    const mastery = {
      category: 'Anatomie',
      answeredQuestions: 100,
      nearest: { category: 'Anatomie', answeredQuestions: 100, accuracy: 90 },
    };
    const item = buildAchievements(metrics({ mastery }))[0];
    expect(item.done).toBe(true);
    expect(item.title).toBe('Maestru — Anatomie');
    expect(item.hint).toBeUndefined();
  });

  it('explains how close the nearest subject is', () => {
    const mastery = {
      category: null,
      answeredQuestions: 0,
      nearest: { category: 'Anatomie', answeredQuestions: 64, accuracy: 85 },
    };
    const item = buildAchievements(metrics({ mastery }))[0];
    expect(item.done).toBe(false);
    expect(item.title).toBe('Maestru pe o materie');
    expect(item.current).toBe(64);
    expect(item.hint).toBe('Anatomie: 64/100 întrebări, acuratețe 85% (mai trebuie 36 întrebări și 90% acuratețe)');
  });

  it('120 questions at 88%: bar and hint describe the same subject and say what is missing', () => {
    const mastery = {
      category: null,
      answeredQuestions: 0,
      nearest: { category: 'Anatomie', answeredQuestions: 120, accuracy: 88 },
    };
    const item = buildAchievements(metrics({ mastery }))[0];
    expect(item.done).toBe(false);
    expect(item.current).toBe(100);
    expect(item.title).toBe('Maestru pe o materie');
    expect(item.hint).toBe('Anatomie: 100/100 întrebări, acuratețe 88%: mai trebuie 90%');
  });

  it('a tiny qualifying subject neither renames the badge nor hides the real one', () => {
    const mastery = {
      category: 'Fiziologie',
      answeredQuestions: 3,
      nearest: { category: 'Anatomie', answeredQuestions: 120, accuracy: 88 },
    };
    const item = buildAchievements(metrics({ mastery }))[0];
    expect(item.done).toBe(false);
    expect(item.title).toBe('Maestru pe o materie');
    expect(item.current).toBe(100);
    expect(item.hint).toContain('Anatomie');
    expect(item.hint).not.toContain('Fiziologie');
  });

  it('only names the subject once the badge is unlocked, and drops the hint', () => {
    const mastery = {
      category: 'Anatomie',
      answeredQuestions: 130,
      nearest: { category: 'Anatomie', answeredQuestions: 130, accuracy: 93 },
    };
    const item = buildAchievements(metrics({ mastery }))[0];
    expect(item.done).toBe(true);
    expect(item.title).toBe('Maestru — Anatomie');
    expect(item.current).toBe(100);
    expect(item.hint).toBeUndefined();
  });

  it('says when only questions are missing', () => {
    const mastery = { category: 'Anatomie', answeredQuestions: 99, nearest: { category: 'Anatomie', answeredQuestions: 99, accuracy: 95 } };
    expect(buildAchievements(metrics({ mastery }))[0].hint).toBe('Anatomie: 99/100 întrebări, acuratețe 95% (mai trebuie 1 întrebare)');
  });

  it('tells in every "Cum se măsoară" that the state follows the current data', () => {
    for (const item of buildAchievements(EMPTY_METRICS)) expect(item.how).toContain(LIVE_STATE_NOTE);
    expect(LIVE_STATE_NOTE).toContain('recalculează');
  });

  it('says which sets the bank badge counts', () => {
    expect(buildAchievements(EMPTY_METRICS)[1].how).toContain('create sau importate de tine');
  });

  it('unlocks the week badge from a longest streak of 7', () => {
    const week = buildAchievements(metrics({ bestStreak: 7 }))[2];
    expect(week.done).toBe(true);
    expect(week.percent).toBe(100);
  });

  it('never goes past the target', () => {
    const bank = buildAchievements(metrics({ quizCount: 400 }))[1];
    expect(bank.current).toBe(10);
    expect(bank.percent).toBe(100);
  });

  it('says what the bank badge counts', () => {
    expect(buildAchievements(EMPTY_METRICS)[1].description).toContain('10 seturi (grile sau carduri)');
    expect(buildAchievements(EMPTY_METRICS)[3].description).toContain('(minim 5 întrebări)');
  });
});

describe('buildChallenges', () => {
  it('reaches done at 75 minutes and caps the percent', () => {
    const marathon = buildChallenges(metrics({ studyMinutesThisWeek: 75 }))[1];
    expect(marathon.done).toBe(true);
    const over = buildChallenges(metrics({ studyMinutesThisWeek: 400 }))[1];
    expect(over.percent).toBe(100);
    expect(over.current).toBe(75);
  });

  it('says it counts quiz sessions only, on every card', () => {
    const [rhythm, marathon, streak] = buildChallenges(EMPTY_METRICS);
    expect(rhythm.description).toContain('sesiuni de grile');
    expect(marathon.title).toBe('Maraton de grile');
    expect(marathon.description).toContain('sesiuni de grile');
    expect(rhythm.how).toContain('Se numără doar sesiunile de grile încheiate în ultimele 7 zile');
    expect(marathon.how).toContain('Se numără doar sesiunile de grile încheiate în ultimele 7 zile');
    expect(streak.how.length).toBeGreaterThan(0);
  });

  it('measures the weekly rhythm in sessions and the streak in days', () => {
    const [rhythm, , streak] = buildChallenges(metrics({ sessionsThisWeek: 4, liveStreak: 5 }));
    expect(rhythm).toMatchObject({ current: 4, target: 10, unit: 'sessions', percent: 40, done: false });
    expect(streak).toMatchObject({ current: 5, target: 5, unit: 'days', done: true });
  });

  it('links to a place that exists', () => {
    expect(buildChallenges(EMPTY_METRICS).map((item) => item.to)).toEqual(['/quizzes', '/quizzes', '/daily-review']);
  });

  it('is empty-safe', () => {
    const list = buildChallenges(metrics({ studyMinutesThisWeek: Number.NaN }));
    expect(list.every((item) => item.current === 0 && Number.isFinite(item.percent))).toBe(true);
  });
});

describe('visible text', () => {
  const texts = [
    ...buildAchievements(EMPTY_METRICS).flatMap((item) => [item.title, item.description, item.how]),
    ...buildChallenges(EMPTY_METRICS).flatMap((item) => [item.title, item.description, item.how]),
    ...Object.values(RARITY_LABELS),
    ...Object.values(CATEGORY_LABELS),
    ...Object.values(DIFFICULTY_LABELS),
    ...Object.values(UNIT_LABELS),
  ];

  it('has no emoji, no English left over and no AI claims', () => {
    for (const text of texts) {
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(text).not.toMatch(/\bAI\b/);
      expect(text).not.toContain('Saptamana');
      // Unicode-aware boundaries: "Epică" is Romanian, "EPIC" is the old English label.
      expect(text).not.toMatch(/(?<!\p{L})(legendary|epic|milestone|study)(?!\p{L})/iu);
    }
  });

  it('labels the rarities in Romanian, in order', () => {
    expect(Object.values(RARITY_LABELS)).toEqual(['Comună', 'Rară', 'Epică', 'Legendară']);
  });

  it('titles the weekly challenge properly', () => {
    expect(buildChallenges(EMPTY_METRICS).map((item) => item.title)).toEqual(['Ritm săptămânal', 'Maraton de grile', 'Serie zilnică']);
  });
});

describe('comparisonMessage', () => {
  it('gives the delta in percentage points', () => {
    expect(comparisonMessage(88, 80)).toEqual({ tone: 'up', text: '+8 puncte procentuale față de ieri' });
    expect(comparisonMessage(70, 80).tone).toBe('down');
    expect(comparisonMessage(81, 80).text).toBe('+1 punct procentual față de ieri');
    expect(comparisonMessage(80, 80).tone).toBe('flat');
  });

  it('does not compare with a day that has no data', () => {
    expect(comparisonMessage(80, null).text).toBe('Ieri nu ai răspuns la întrebări, nu avem cu ce compara.');
    expect(comparisonMessage(null, 80).tone).toBe('none');
  });
});
