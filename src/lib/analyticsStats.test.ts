import { describe, expect, it } from 'vitest';
import type { Question, QuestionStat, Quiz, QuizSession } from '../types';
import {
  analyticsTopicStats,
  buildGaps,
  classifyTopics,
  confidenceLevel,
  countsAsGrile,
  dailyPace,
  DAY_MS,
  distinctQuestionIds,
  isGenericTag,
  loggedWindow,
  mistakesInWindow,
  neededPerDay,
  readiness,
  readLoggedDays,
  roCount,
  shrunkRate,
  studyDaysInWindow,
  summaryAgeDays,
  topicTrend,
  wilson,
  windowStats,
  type TopicStat,
} from './analyticsStats';

const NOW = new Date(2026, 9, 5, 12).getTime();

describe('wilson', () => {
  it('gives the 95% interval in rounded percent', () => {
    expect(wilson(7, 10)).toEqual({ lo: 40, hi: 89 });
    expect(wilson(50, 100)).toEqual({ lo: 40, hi: 60 });
    expect(wilson(0, 10)).toEqual({ lo: 0, hi: 28 });
  });

  it('has no interval without answers', () => {
    expect(wilson(0, 0)).toBeNull();
  });
});

describe('confidenceLevel', () => {
  it('depends on distinct questions answered', () => {
    expect(confidenceLevel(9)).toBe('none');
    expect(confidenceLevel(10)).toBe('low');
    expect(confidenceLevel(29)).toBe('low');
    expect(confidenceLevel(30)).toBe('medium');
    expect(confidenceLevel(99)).toBe('medium');
    expect(confidenceLevel(100)).toBe('high');
  });
});

const stat = (quizId: string, questionId: string, timesCorrect: number, timesWrong: number): QuestionStat => ({
  quizId, questionId, timesCorrect, timesWrong, lastSeen: 0, nextReview: 0, interval: 0,
});

const question = (id: string, tags?: string[]): Question => ({
  id, text: id, options: [{ id: 'a', text: 'a', isCorrect: true }, { id: 'b', text: 'b', isCorrect: false }], tags,
});

const quiz = (id: string, questions: Question[], extra: Partial<Quiz> = {}): Quiz => ({
  id, title: id, description: '', emoji: '', category: '', kind: 'quiz', questions, createdAt: 0, color: 'blue', ...extra,
});

describe('readiness', () => {
  it('averages per distinct question and counts coverage', () => {
    const stats: Record<string, QuestionStat> = {
      'a:q1': stat('a', 'q1', 3, 1),
      'mix-x:q1': stat('mix-x', 'q1', 1, 0),
      'a:q2': stat('a', 'q2', 0, 2),
      'a:q9': stat('a', 'q9', 5, 0),
    };
    const result = readiness(stats, new Set(['q1', 'q2', 'q3', 'q4']));
    expect(result.answered).toBe(2);
    expect(result.total).toBe(4);
    expect(result.attempts).toBe(7);
    expect(result.accuracy).toBe(40);
    expect(result.coverage).toBe(50);
    expect(result.level).toBe('none');
  });

  it('is empty without answers', () => {
    const result = readiness({}, new Set(['q1']));
    expect(result).toMatchObject({ answered: 0, accuracy: 0, interval: null, level: 'none' });
  });

  it('survives corrupted counters instead of producing NaN', () => {
    const broken = {
      'a:q1': { ...stat('a', 'q1', 0, 0), timesCorrect: undefined as unknown as number },
      'a:q2': { ...stat('a', 'q2', 0, 0), timesWrong: Number.NaN },
      'a:q3': stat('a', 'q3', 2, 0),
    };
    const result = readiness(broken, new Set(['q1', 'q2', 'q3']));
    expect(result.answered).toBe(1);
    expect(result.accuracy).toBe(100);
    expect(Number.isFinite(result.coverage)).toBe(true);
  });
});

describe('distinctQuestionIds / countsAsGrile', () => {
  it('counts a question once even when it is also in a combined session', () => {
    const q = question('q1');
    const ids = distinctQuestionIds([quiz('a', [q, question('q2')]), quiz('mix-f', [q], { tags: ['folder-session:f'] })]);
    expect([...ids].sort()).toEqual(['q1', 'q2']);
  });

  it('leaves out archived, derived and flashcard sets', () => {
    const quizzes = [
      quiz('ok', [question('q1')]),
      quiz('arch', [question('q2')], { archived: true }),
      quiz('bank', [question('q3')], { tags: ['mistake-bank'] }),
      quiz('adaptive', [question('q4')], { tags: ['adaptive-exam'] }),
      quiz('cards', [question('q5')], { kind: 'flashcard' }),
    ];
    expect([...distinctQuestionIds(quizzes)]).toEqual(['q1']);
    expect(countsAsGrile(quizzes[0])).toBe(true);
    expect(countsAsGrile(quizzes[1])).toBe(false);
    expect(countsAsGrile(quizzes[2])).toBe(false);
    expect(countsAsGrile(quizzes[4])).toBe(false);
  });
});

describe('neededPerDay', () => {
  it('spreads the unsolved questions over the days left', () => {
    expect(neededPerDay(300, 12)).toBe(25);
    expect(neededPerDay(301, 12)).toBe(26);
    expect(neededPerDay(300, 0)).toBe(300);
    expect(neededPerDay(300, null)).toBeNull();
    expect(neededPerDay(0, 10)).toBe(0);
  });
});

const session = (daysAgo: number, score: number, total = 10, finished = true): QuizSession => ({
  id: `s${daysAgo}-${score}-${total}`,
  quizId: 'q',
  answers: {},
  startedAt: NOW - daysAgo * DAY_MS,
  finishedAt: finished ? NOW - daysAgo * DAY_MS : undefined,
  score,
  total,
  mode: 'test',
});

describe('windowStats', () => {
  it('compares the window with the previous one of the same length', () => {
    const result = windowStats([session(2, 24, 30), session(5, 18, 30), session(10, 27, 30)], NOW, 7);
    expect(result.current).toMatchObject({ solved: 60, correct: 42, accuracy: 70, sessions: 2 });
    expect(result.previous).toMatchObject({ solved: 30, correct: 27, accuracy: 90 });
    expect(result.delta).toBe(-20);
  });

  it('shows the delta only when both windows have at least 30 questions', () => {
    const enough = windowStats([session(2, 24, 30), session(5, 18, 30), session(10, 27, 30)], NOW, 7);
    expect(enough.delta).toBe(-20);
    const fewPrevious = windowStats([session(2, 24, 30), session(10, 9, 29)], NOW, 7);
    expect(fewPrevious.delta).toBeNull();
    const fewCurrent = windowStats([session(2, 8, 20), session(10, 27, 30)], NOW, 7);
    expect(fewCurrent.delta).toBeNull();
    expect(windowStats([session(2, 8), session(5, 6)], NOW, 7).delta).toBeNull();
  });

  it('rounds the delta from the raw rates, like the dashboard', () => {
    // 17/30 = 56,67% și 16/30 = 53,33%: diferența brută 3,33 → 3, dar rotunjind fiecare parte ar ieși 57 − 53 = 4.
    const result = windowStats([session(2, 17, 30), session(10, 16, 30)], NOW, 7);
    expect(result.current.accuracy).toBe(57);
    expect(result.previous.accuracy).toBe(53);
    expect(result.delta).toBe(3);
  });

  it('hides the accuracy of a window with fewer than 10 questions', () => {
    const result = windowStats([session(2, 3, 9)], NOW, 7);
    expect(result.current.solved).toBe(9);
    expect(result.current.accuracy).toBeNull();
    expect(windowStats([session(2, 3, 10)], NOW, 7).current.accuracy).toBe(30);
  });

  it('ignores unfinished sessions', () => {
    const result = windowStats([session(2, 8), session(3, 10, 10, false)], NOW, 7);
    expect(result.current.sessions).toBe(1);
    expect(result.current.solved).toBe(10);
  });

  it('includes the start boundary and excludes now', () => {
    const edge = session(7, 5);
    expect(windowStats([edge], NOW, 7).current.solved).toBe(10);
    const atNow: QuizSession = { ...session(0, 5), finishedAt: NOW };
    expect(windowStats([atNow], NOW, 7).current.solved).toBe(0);
  });

  it('changes the figures when the period changes', () => {
    const sessions = [session(3, 8), session(20, 5), session(100, 9)];
    expect(windowStats(sessions, NOW, 7).current.solved).toBe(10);
    expect(windowStats(sessions, NOW, 30).current.solved).toBe(20);
    expect(windowStats(sessions, NOW, 180).current.solved).toBe(30);
  });
});

describe('dailyPace', () => {
  it('has no pace without a finished session', () => {
    expect(dailyPace([], NOW)).toBeNull();
    expect(dailyPace([session(1, 5, 10, false)], NOW)).toBeNull();
  });

  it('divides by the days since the first session when that is under 14', () => {
    const pace = dailyPace([session(2, 5, 20), session(1, 5, 20)], NOW);
    expect(pace).toEqual({ perDay: 20, days: 2, solved: 40 });
  });

  it('divides by 14 for a longer history and ignores older sessions', () => {
    const pace = dailyPace([session(30, 5, 100), session(5, 5, 28), session(1, 5, 28)], NOW);
    expect(pace).toEqual({ perDay: 4, days: 14, solved: 56 });
  });
});

describe('activity helpers', () => {
  it('counts study days inside the window', () => {
    const dates = ['2026-10-05', '2026-10-04', '2026-09-20', '2026-09-28'];
    expect(studyDaysInWindow(dates, NOW, 7)).toBe(2);
    expect(studyDaysInWindow(dates, NOW, 30)).toBe(4);
  });

  it('reads the Organizare log defensively', () => {
    expect(readLoggedDays(null)).toEqual({});
    expect(readLoggedDays({ log: 'x' })).toEqual({});
    const log = readLoggedDays({ log: { '2026-10-04': { h: 2.5, g: 20, ok: 15 }, bad: { h: 1 }, '2026-10-03': { h: 'a' } } });
    expect(Object.keys(log).sort()).toEqual(['2026-10-03', '2026-10-04']);
    expect(loggedWindow(log, NOW, 7)).toEqual({ entries: 2, hours: 2.5, solved: 20, correct: 15 });
  });

  it('counts the kept mistakes inside the window', () => {
    const mistakes = [{ timestamp: NOW - DAY_MS }, { timestamp: NOW - 10 * DAY_MS }];
    expect(mistakesInWindow(mistakes, NOW, 7)).toBe(1);
    expect(mistakesInWindow(mistakes, NOW, 30)).toBe(2);
  });

  it('flags a plan summary older than 36 hours', () => {
    expect(summaryAgeDays(NOW - 10 * 3_600_000, NOW)).toBeNull();
    expect(summaryAgeDays(NOW - 35 * 3_600_000, NOW)).toBeNull();
    expect(summaryAgeDays(NOW - 37 * 3_600_000, NOW)).toBe(1);
    expect(summaryAgeDays(NOW - 5 * DAY_MS, NOW)).toBe(5);
    expect(summaryAgeDays(undefined, NOW)).toBeNull();
  });
});

describe('roCount', () => {
  it('adds "de" from 20 up and at round hundreds', () => {
    expect(roCount(1, 'zi', 'zile')).toBe('1 zi');
    expect(roCount(0, 'zi', 'zile')).toBe('0 zile');
    expect(roCount(5, 'zi', 'zile')).toBe('5 zile');
    expect(roCount(19, 'zi', 'zile')).toBe('19 zile');
    expect(roCount(20, 'zi', 'zile')).toBe('20 de zile');
    expect(roCount(100, 'zi', 'zile')).toBe('100 de zile');
    expect(roCount(119, 'zi', 'zile')).toBe('119 zile');
    expect(roCount(101, 'zi', 'zile')).toBe('101 zile');
    expect(roCount(121, 'zi', 'zile')).toBe('121 de zile');
    expect(roCount(125, 'zi', 'zile')).toBe('125 de zile');
  });
});

describe('isGenericTag', () => {
  it('treats the app markers and technical labels as non-topics', () => {
    for (const tag of ['rezidentiat', 'rezidentiat-bank:x', 'folder-session:y', 'ai', 'chat', 'remediere', 'greseli', 'Greșeli', 'pdf', 'ai-studio',
      'chapter-pack', 'document-pack', 'mistake-bank', 'recovery', 'weakness', 'adaptive-exam', 'simulation', 'plan-examen', 'anki-import', 'Kumar cap 12.pdf']) {
      expect(isGenericTag(tag), tag).toBe(true);
    }
    expect(isGenericTag('Aritmii')).toBe(false);
  });
});

describe('analyticsTopicStats', () => {
  const folders = new Map([['f1', 'Cardiologie']]);

  it('uses question tags, then the folder name, then the category, and never the quiz tags', () => {
    const quizzes = [
      quiz('a', [question('q1', ['aritmii', 'rezidentiat'])], { tags: ['rezidentiat-bank:x', 'cardio'] }),
      quiz('b', [question('q2')], { tags: ['rezidentiat', 'valve', 'ai'], category: 'Valvulopatii' }),
      quiz('c', [question('q3')], { tags: ['rezidentiat'], folderId: 'f1' }),
      quiz('d', [question('q4')], { tags: ['folder-session:y'], category: 'Pediatrie' }),
    ];
    const stats: Record<string, QuestionStat> = {
      'a:q1': stat('a', 'q1', 1, 1),
      'b:q2': stat('b', 'q2', 2, 0),
      'c:q3': stat('c', 'q3', 0, 3),
      'd:q4': stat('d', 'q4', 1, 0),
    };
    const result = analyticsTopicStats(quizzes, stats, folders);
    const names = result.map((t) => t.topic).sort();
    expect(names).toEqual(['Cardiologie', 'Pediatrie', 'Valvulopatii', 'aritmii']);
    expect(result.find((t) => t.topic === 'aritmii')).toMatchObject({ correct: 1, total: 2, accuracy: 50 });
  });

  it('does not turn technical tags or categories of generated sets into topics', () => {
    const technical = [
      quiz('chat', [question('c1')], { tags: ['ai', 'chat'], category: 'ai' }),
      quiz('fix', [question('c2')], { tags: ['remediere', 'greseli'], category: 'greseli' }),
      quiz('doc', [question('c3', ['pdf'])], { tags: ['ai-studio', 'document-pack', 'Curs 4.pdf'], category: 'Curs 4.pdf' }),
      quiz('plan', [question('c4')], { tags: ['chapter-pack', 'plan-examen', 'simulation', 'anki-import', 'weakness', 'recovery'], category: 'chapter-pack' }),
    ];
    const stats = Object.fromEntries(technical.map((q) => [`${q.id}:${q.questions[0].id}`, stat(q.id, q.questions[0].id, 0, 4)]));
    expect(analyticsTopicStats(technical, stats, folders)).toEqual([]);
  });

  it('skips questions without attempts, flashcard decks, archived and derived sets', () => {
    const quizzes = [
      quiz('a', [question('q1', ['t'])]),
      quiz('deck', [question('q2', ['t'])], { kind: 'flashcard' }),
      quiz('old', [question('q3', ['t'])], { archived: true }),
      quiz('bank', [question('q4', ['t'])], { tags: ['mistake-bank'] }),
    ];
    const stats = {
      'deck:q2': stat('deck', 'q2', 5, 5),
      'old:q3': stat('old', 'q3', 5, 5),
      'bank:q4': stat('bank', 'q4', 5, 5),
    };
    expect(analyticsTopicStats(quizzes, stats, folders)).toEqual([]);
  });
});

const topic = (name: string, correct: number, total: number): TopicStat => ({
  topic: name,
  correct,
  total,
  accuracy: Math.round((correct / total) * 100),
  shrunk: Math.round(shrunkRate(correct, total) * 1000) / 10,
});

describe('classifyTopics and buildGaps', () => {
  it('marks 2/5 as weak with a large gap', () => {
    const t = topic('Aritmii', 2, 5);
    expect(t.shrunk).toBeCloseTo(51.1, 1);
    const { weak } = classifyTopics([t]);
    expect(weak).toHaveLength(1);
    const [gap] = buildGaps([t]);
    expect(gap).toMatchObject({ topic: 'Aritmii', accuracy: 40, gap: 45, priority: 'mare', attempts: 5 });
  });

  it('does not rate a topic with 4 attempts', () => {
    const result = classifyTopics([topic('Mic', 0, 4)]);
    expect(result.weak).toEqual([]);
    expect(result.unrated).toBe(1);
    expect(buildGaps([topic('Mic', 0, 4)])).toEqual([]);
  });

  it('marks 9/10 as strong', () => {
    const result = classifyTopics([topic('Valve', 9, 10), topic('Altul', 4, 5)]);
    expect(result.strong.map((t) => t.topic)).toEqual(['Valve']);
  });

  it('never lists a strong topic as a gap', () => {
    const strong = topic('Tare', 16, 20); // 80%, n ≥ 10: tare, deși sub 85%
    expect(classifyTopics([strong]).strong).toHaveLength(1);
    expect(buildGaps([strong])).toEqual([]);
    const notStrong = topic('Aproape', 15, 20); // 75%
    expect(classifyTopics([notStrong]).strong).toEqual([]);
    expect(buildGaps([notStrong]).map((g) => g.topic)).toEqual(['Aproape']);
    const few = topic('Puține', 4, 5); // 80% dar doar 5 încercări: nu e tare, e gol
    expect(buildGaps([few]).map((g) => g.topic)).toEqual(['Puține']);
  });

  it('sets the priority by distance to the 85% target', () => {
    const gaps = buildGaps([topic('A', 12, 20), topic('B', 15, 20), topic('C', 7, 9)]);
    expect(Object.fromEntries(gaps.map((g) => [g.topic, g.priority]))).toEqual({ A: 'medie', B: 'mica', C: 'mica' });
  });

  it('attaches the trend from the lookup', () => {
    const [gap] = buildGaps([topic('A', 2, 5)], () => 'declining');
    expect(gap.trend).toBe('declining');
  });
});

describe('topicTrend', () => {
  it('compares the first half with the second', () => {
    expect(topicTrend([false, false, false, false, true, true, true, true])).toBe('improving');
    expect(topicTrend([true, true, true, true, false, false, false, false])).toBe('declining');
    expect(topicTrend(Array(10).fill(true))).toBe('stable');
  });

  it('needs a clear change, not one flipped answer', () => {
    // 4 vs 4: 0,25 → 0,5 are the only steps; 3/4 vs 2/4 is 0,25: stabil
    expect(topicTrend([true, true, true, false, true, true, false, false])).toBe('stable');
    // 10 rezultate: 3/5 → 5/5 = 0,4
    expect(topicTrend([true, false, true, false, false, true, true, true, true, true])).toBe('improving');
  });

  it('has no trend below 8 results', () => {
    expect(topicTrend([false, false, false, true, true, true])).toBeNull();
    expect(topicTrend([false, false, true, true, true, true, true])).toBeNull();
    expect(topicTrend(undefined)).toBeNull();
    expect(topicTrend(null)).toBeNull();
  });
});

describe('shrunkRate', () => {
  it('pulls small samples toward 65%', () => {
    expect(shrunkRate(0, 1)).toBeGreaterThan(shrunkRate(11, 20) - 0.3);
    expect(shrunkRate(0, 1)).toBeCloseTo(0.52, 2);
    expect(shrunkRate(11, 20)).toBeCloseTo(0.5667, 3);
  });
});

describe('readiness ignores retired history', () => {
  it('counts a question copied onto a chapter deck once', () => {
    const stat = (quizId: string, retired?: boolean) => ({
      questionId: 'q1', quizId, timesCorrect: 1, timesWrong: 0, lastSeen: 0, nextReview: 0, interval: 0, ...(retired ? { retired } : {}),
    });
    const r = readiness({ 'a:q1': stat('a', true), 'a--ch1:q1': stat('a--ch1') }, new Set(['q1']));
    expect(r.attempts).toBe(1);
    expect(r.answered).toBe(1);
  });
});
