import { describe, expect, it } from 'vitest';
import { CHAT_MODES, buildRecommendedActions } from '../components/ai-chat/shared';

describe('studio chat modes', () => {
  it('keeps core AI modes separate and includes diagram support', () => {
    const modeIds = CHAT_MODES.map((mode) => mode.id);

    expect(modeIds).toEqual(['grounded', 'explain', 'summarize', 'diagram', 'test', 'mnemonic']);
    expect(CHAT_MODES.find((mode) => mode.id === 'diagram')?.emptyPrompts.join(' ')).toContain('schemă');
  });

  it('recommends both a schema and a summary for a scoped source', () => {
    const actions = buildRecommendedActions([], 0, 'Curs cardio');

    expect(actions.map((action) => action.mode)).toContain('diagram');
    expect(actions.map((action) => action.mode)).toContain('summarize');
  });
});
