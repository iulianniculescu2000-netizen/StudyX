/**
 * Ranking guards for the retriever.
 *
 * Personalization should decide the order *among* chunks that answer the query.
 * It must never put an unrelated chunk in front of the one that does — the
 * retrieved chunks become the grounding context for the AI's answer, so a bad
 * ordering turns into a confidently wrong explanation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfileData } from './types';

const CARDIO_TEXT = 'Fibrilatia atriala impune anticoagulare pentru reducerea riscului embolic la pacientii cu scor CHA2DS2-VASc crescut.';
const CAT_TEXT = 'Pisica a sarit gardul si a fugit prin gradina vecinului in dupa-amiaza aceea.';

const chunks = [
  { id: 'c-cardio', text: CARDIO_TEXT, topic: 'cardiologie', sourceId: 's1' },
  { id: 'c-cat', text: CAT_TEXT, topic: 'poveste', sourceId: 's1' },
];

vi.mock('./vectorStore', async () => {
  const { embedText } = await import('./embeddings');
  return {
    getVaultChunks: async () => Promise.all(chunks.map(async (chunk) => ({
      ...chunk,
      embedding: await embedText(chunk.text),
    }))),
  };
});

/** A profile whose weak topic is the IRRELEVANT chunk's topic. */
function profileWeakOn(topic: string): UserProfileData {
  return {
    topicAccuracy: { [topic]: { correct: 0, total: 10, accuracy: 10, recent: [], lastSeen: 0 } },
    recentMistakes: [{ topic, questionId: 'q', answer: '', correctAnswer: '', timestamp: 0 }],
    mistakeBank: [{ topic, questionId: 'q', wrongCount: 3 }],
  } as unknown as UserProfileData;
}

beforeEach(() => {
  vi.resetModules();
});

describe('retrieveRelevantChunks ranking', () => {
  it('does not let a weak-topic boost float an irrelevant chunk to the top', async () => {
    const { retrieveRelevantChunks } = await import('./retriever');
    const results = await retrieveRelevantChunks(
      'fibrilatie atriala anticoagulare risc embolic',
      profileWeakOn('poveste'),
      2,
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('c-cardio');
  });

  it('still ranks the relevant chunk first when no profile is present', async () => {
    const { retrieveRelevantChunks } = await import('./retriever');
    const results = await retrieveRelevantChunks(
      'fibrilatie atriala anticoagulare risc embolic',
      null,
      2,
    );

    expect(results[0].id).toBe('c-cardio');
  });

  it('still promotes a weak topic when the chunk is genuinely relevant', async () => {
    const { retrieveRelevantChunks } = await import('./retriever');
    const query = 'fibrilatie atriala anticoagulare risc embolic';

    const neutral = await retrieveRelevantChunks(query, null, 2);
    const boosted = await retrieveRelevantChunks(query, profileWeakOn('cardiologie'), 2);

    const scoreOf = (list: Array<{ id: string; score: number }>) =>
      list.find((entry) => entry.id === 'c-cardio')?.score ?? 0;

    expect(scoreOf(boosted)).toBeGreaterThan(scoreOf(neutral));
  });
});
