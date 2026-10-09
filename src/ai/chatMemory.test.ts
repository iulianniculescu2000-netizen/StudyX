import { beforeEach, describe, expect, it } from 'vitest';
import {
  MEMORY_LIMIT,
  PERSISTED_MESSAGE_LIMIT,
  addMemoryManually,
  buildContinuityRecap,
  deleteMemory,
  deriveConversationTone,
  fitHistoryToBudget,
  formatMemoryBlock,
  loadMemories,
  loadThreadSummary,
  markMemoriesUsed,
  mergeMemories,
  needsClinicalVerification,
  rebaseCoveredCount,
  saveMemories,
  saveThreadSummary,
  selectRelevantMemories,
  stemTokens,
  updateMemory,
  type MemoryItem,
} from './chatMemory';
import { parseMemoryCandidates, parseVerificationIssues } from './chatMemoryAI';

const DAY = 24 * 3600 * 1000;

function item(partial: Partial<MemoryItem> & { text: string }): MemoryItem {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    kind: 'fact', createdAt: 1, updatedAt: 1, lastUsedAt: null, uses: 0, pinned: false,
    ...partial,
  };
}

describe('stemTokens', () => {
  it('ignores diacritics, stopwords and inflection endings', () => {
    expect(stemTokens('Hipertensiunea arterială')).toEqual(stemTokens('hipertensiunii arteriale'));
    expect(stemTokens('și în și pe').size).toBe(0);
  });
});

describe('mergeMemories', () => {
  it('appends new facts and folds near-duplicates into the existing entry', () => {
    const first = mergeMemories([], [{ kind: 'goal', text: 'Se pregătește pentru rezidențiat în iulie' }], 100);
    expect(first).toHaveLength(1);
    const second = mergeMemories(first, [{ kind: 'goal', text: 'Se pregătește pentru rezidențiat în iulie 2026' }], 200);
    expect(second).toHaveLength(1);
    expect(second[0].text).toContain('2026');
    expect(second[0].id).toBe(first[0].id);
    expect(second[0].updatedAt).toBe(200);
  });

  it('keeps the same wording apart when the kind differs', () => {
    const merged = mergeMemories([], [
      { kind: 'struggle', text: 'Nu înțelege axa renină-angiotensină' },
      { kind: 'commitment', text: 'Nu înțelege axa renină-angiotensină' },
    ]);
    expect(merged).toHaveLength(2);
  });

  it('drops invalid candidates', () => {
    const merged = mergeMemories([], [
      { kind: 'goal', text: 'x' },
      { kind: 'nope' as never, text: 'Ceva suficient de lung' },
    ]);
    expect(merged).toHaveLength(0);
  });

  it('trims to the limit, evicting unpinned stale entries first and never a pinned one', () => {
    const existing = Array.from({ length: MEMORY_LIMIT }, (_, i) =>
      item({ id: `m${i}`, text: `Informatie distincta numarul ${i} despre subiectul ${'abcdefghij'[i % 10]}${i}`, updatedAt: 1000 + i }));
    existing[0] = { ...existing[0], pinned: true };
    const merged = mergeMemories(existing, [{ kind: 'fact', text: 'Complet nou și diferit față de toate celelalte' }], 5000);
    expect(merged).toHaveLength(MEMORY_LIMIT);
    expect(merged.some((m) => m.id === 'm0')).toBe(true);
    expect(merged.some((m) => m.id === 'm1')).toBe(false);
    expect(merged.some((m) => m.text.startsWith('Complet nou'))).toBe(true);
  });
});

describe('selectRelevantMemories', () => {
  const now = 100 * DAY;
  const items = [
    item({ id: 'goal', kind: 'goal', text: 'Se pregătește pentru rezidențiat în iulie', updatedAt: now }),
    item({ id: 'pref', kind: 'preference', text: 'Preferă explicații scurte cu scheme', updatedAt: now }),
    item({ id: 'nefro', kind: 'struggle', text: 'Nu înțelege sindromul nefrotic', updatedAt: now }),
    item({ id: 'cardio', kind: 'struggle', text: 'Confundă tipurile de blocuri atrioventriculare', updatedAt: now }),
  ];

  it('always keeps goals and preferences, but struggles only when the topic matches', () => {
    const ids = selectRelevantMemories(items, 'Explică-mi sindromul nefrotic', 6, now).map((m) => m.id);
    expect(ids).toContain('goal');
    expect(ids).toContain('pref');
    expect(ids).toContain('nefro');
    expect(ids).not.toContain('cardio');
  });

  it('ranks the topical struggle above the always-on entries', () => {
    const ids = selectRelevantMemories(items, 'sindromul nefrotic', 6, now).map((m) => m.id);
    expect(ids[0]).toBe('nefro');
  });

  it('respects the limit and returns nothing for an empty store', () => {
    expect(selectRelevantMemories(items, 'orice', 1, now)).toHaveLength(1);
    expect(selectRelevantMemories([], 'orice')).toEqual([]);
  });

  it('formats a compact block', () => {
    expect(formatMemoryBlock([items[0]])).toBe('- [obiectiv] Se pregătește pentru rezidențiat în iulie');
  });
});

describe('persistence', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips, edits, pins, deletes and counts usage', () => {
    const added = addMemoryManually('p1', 'preference', 'Preferă tabele comparative');
    expect(loadMemories('p1')).toHaveLength(1);
    const id = added[0].id;

    updateMemory('p1', id, { pinned: true, text: 'Preferă tabele comparative și scheme' });
    markMemoriesUsed('p1', [id], 777);
    const [stored] = loadMemories('p1');
    expect(stored).toMatchObject({ pinned: true, uses: 1, lastUsedAt: 777, text: 'Preferă tabele comparative și scheme' });

    deleteMemory('p1', id);
    expect(loadMemories('p1')).toEqual([]);
  });

  it('is scoped per profile and survives corrupt storage', () => {
    addMemoryManually('a', 'goal', 'Obiectiv pentru profilul A');
    expect(loadMemories('b')).toEqual([]);
    localStorage.setItem('studyx-chat-memory-a', '{not json');
    expect(loadMemories('a')).toEqual([]);
    saveMemories('a', [item({ text: 'Ok din nou' })]);
    expect(loadMemories('a')).toHaveLength(1);
  });

  it('keeps thread summaries separate', () => {
    saveThreadSummary('p', 'general', { summary: 'despre cardio', covered: 10, total: 14 });
    expect(loadThreadSummary('p', 'general')?.summary).toBe('despre cardio');
    expect(loadThreadSummary('p', 'rezidentiat')).toBeNull();
  });
});

describe('rebaseCoveredCount', () => {
  it('shifts the covered index by the head trimmed from persisted history', () => {
    expect(rebaseCoveredCount({ covered: 90, total: 100 }, PERSISTED_MESSAGE_LIMIT)).toBe(50);
    expect(rebaseCoveredCount({ covered: 10, total: 20 }, 20)).toBe(10);
  });
  it('never exceeds what was actually loaded, nor goes negative', () => {
    expect(rebaseCoveredCount({ covered: 50, total: 50 }, 8)).toBe(8);
    expect(rebaseCoveredCount({ covered: 5, total: 200 }, 60)).toBe(0);
  });
});

describe('fitHistoryToBudget', () => {
  const turn = (role: 'user' | 'assistant', n: number) => ({ role, content: 'x'.repeat(n) });

  it('keeps recent turns within the budget but never fewer than the minimum', () => {
    const history = [turn('user', 3000), turn('assistant', 3000), turn('user', 100), turn('assistant', 4000), turn('user', 50)];
    const fitted = fitHistoryToBudget(history, { maxChars: 4000, minMessages: 2 });
    expect(fitted.length).toBeLessThan(history.length);
    expect(fitted.at(-1)).toBe(history.at(-1));
    expect(fitHistoryToBudget(history, { maxChars: 1, minMessages: 2 })).toHaveLength(2);
  });

  it('uses many short turns instead of stopping at a fixed count', () => {
    const history = Array.from({ length: 14 }, (_, i) => turn(i % 2 ? 'assistant' : 'user', 80));
    expect(fitHistoryToBudget(history)).toHaveLength(14);
  });

  it('does not open the window on an orphan assistant reply', () => {
    const history = [turn('user', 10), turn('assistant', 10), turn('user', 10), turn('assistant', 10), turn('user', 10)];
    const fitted = fitHistoryToBudget(history, { maxChars: 30, minMessages: 2 });
    expect(fitted[0].role).toBe('user');
  });
});

describe('deriveConversationTone', () => {
  it('detects frustration, confusion and late hours', () => {
    expect(deriveConversationTone('Nu mai pot, iar am greșit aceeași grilă', 14).state).toBe('frustrated');
    expect(deriveConversationTone('Nu înțeleg de ce apare edemul', 14).state).toBe('confused');
    expect(deriveConversationTone('Explică-mi ciclul Krebs', 14).state).toBe('normal');
    expect(deriveConversationTone('salut', 2).late).toBe(true);
    expect(deriveConversationTone('salut', 15).late).toBe(false);
  });
});

describe('needsClinicalVerification', () => {
  const pad = ' '.repeat(220);
  it('flags answers with doses, thresholds or named scores', () => {
    expect(needsClinicalVerification(`Doza de amiodaronă este 150 mg iv în 10 minute.${pad}`)).toBe(true);
    expect(needsClinicalVerification(`Scorul CHA2DS2-VASc; CHADS este folosit.${pad}`)).toBe(true);
  });
  it('ignores short or number-free answers', () => {
    expect(needsClinicalVerification('Doza este 5 mg.')).toBe(false);
    expect(needsClinicalVerification(`Mecanismul implică activarea sistemului renină-angiotensină.${pad}`)).toBe(false);
  });
});

describe('buildContinuityRecap', () => {
  const base = { summary: '', dueCount: 0, now: 100 * DAY };
  it('stays quiet during an active session or with nothing to resume', () => {
    expect(buildContinuityRecap({ ...base, memories: [], lastActiveAt: base.now - 3600 * 1000 })).toBeNull();
    expect(buildContinuityRecap({ ...base, memories: [], lastActiveAt: null })).toBeNull();
    expect(buildContinuityRecap({ ...base, memories: [], lastActiveAt: base.now - DAY })).toBeNull();
  });
  it('resumes a commitment first, then difficulties and due items', () => {
    const recap = buildContinuityRecap({
      ...base, dueCount: 12, lastActiveAt: base.now - DAY,
      memories: [
        item({ kind: 'struggle', text: 'Confundă tipurile de diabet' }),
        item({ kind: 'commitment', text: 'Reluăm nefrologia mâine' }),
      ],
    });
    expect(recap?.lines[0]).toContain('nefrologia');
    expect(recap?.lines.join(' ')).toContain('12 itemi');
    expect(recap?.prompt).toContain('nefrologia');
  });
});

describe('response parsers', () => {
  it('accepts valid candidates, rejects bad kinds/short text, caps the count', () => {
    const raw = JSON.stringify({ items: [
      { kind: 'goal', text: 'Examen de rezidențiat în iulie' },
      { kind: 'weird', text: 'Nu contează deloc asta' },
      { kind: 'fact', text: 'ab' },
      { kind: 'preference', text: '- Preferă scheme' },
      { kind: 'fact', text: 'Fapt numărul trei valid' },
      { kind: 'fact', text: 'Fapt numărul patru valid' },
      { kind: 'fact', text: 'Fapt numărul cinci valid' },
    ] });
    const out = parseMemoryCandidates(`Iată:\n\`\`\`json\n${raw}\n\`\`\``);
    expect(out.map((c) => c.kind)).toEqual(['goal', 'preference', 'fact', 'fact']);
    expect(out[1].text).toBe('Preferă scheme');
    expect(parseMemoryCandidates('nu e json')).toEqual([]);
  });

  it('parses verification issues and ignores malformed ones', () => {
    const out = parseVerificationIssues('{"issues":[{"claim":"150 mg","reason":"Corect e 300 mg"},{"claim":"","reason":"x"},{"oops":1}]}');
    expect(out).toEqual([{ claim: '150 mg', reason: 'Corect e 300 mg' }]);
    expect(parseVerificationIssues('{"issues":[]}')).toEqual([]);
  });
});
