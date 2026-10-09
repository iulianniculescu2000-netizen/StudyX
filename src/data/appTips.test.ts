/**
 * Tips have to fit the student's actual state: telling someone with an empty
 * library about chapter-aware imports is noise, and telling someone who has
 * never answered a question about mistake-based revision is worse.
 */
import { describe, expect, it } from 'vitest';
import { APP_TIPS, selectRelevantTips, type AppTipContext } from './appTips';

const empty: AppTipContext = {
  hasQuizzes: false,
  hasFlashcards: false,
  hasLibrary: false,
  hasMistakes: false,
  dueCount: 0,
  mobile: false,
};

const active: AppTipContext = {
  hasQuizzes: true,
  hasFlashcards: true,
  hasLibrary: true,
  hasMistakes: true,
  dueCount: 12,
  mobile: false,
};

describe('tip selection', () => {
  it('offers the import tip to a new user and the chapter tip to a stocked one', () => {
    const ids = (context: AppTipContext) => selectRelevantTips(context).map((tip) => tip.id);
    expect(ids(empty)).toContain('books-empty');
    expect(ids(empty)).not.toContain('books');
    expect(ids(active)).toContain('books');
    expect(ids(active)).not.toContain('books-empty');
  });

  it('hides progress-dependent tips until there is progress', () => {
    const ids = selectRelevantTips(empty).map((tip) => tip.id);
    expect(ids).not.toContain('mistakes');
    expect(ids).not.toContain('due');
    expect(ids).not.toContain('conformance');
  });

  it('always keeps a few universally useful tips, so the strip is never empty', () => {
    expect(selectRelevantTips(empty).length).toBeGreaterThanOrEqual(3);
    expect(selectRelevantTips(active).length).toBeGreaterThan(selectRelevantTips(empty).length);
  });

  it('hides the Ctrl+K palette tip on mobile, where there is no keyboard', () => {
    expect(selectRelevantTips(active).map((tip) => tip.id)).toContain('palette');
    expect(selectRelevantTips({ ...active, mobile: true }).map((tip) => tip.id)).not.toContain('palette');
  });

  it('keeps every tip short enough for one line and uniquely identified', () => {
    const ids = new Set(APP_TIPS.map((tip) => tip.id));
    expect(ids.size).toBe(APP_TIPS.length);
    for (const tip of APP_TIPS) {
      expect(tip.text.length, tip.id).toBeLessThanOrEqual(120);
      expect(tip.emoji.length, tip.id).toBeGreaterThan(0);
    }
  });
});
