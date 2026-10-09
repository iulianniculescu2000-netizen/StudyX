import { describe, expect, it, vi } from 'vitest';
import { mapAnkiCollectionToDecks, planFolderChain } from './ankiImport';
import type { AnkiCard, AnkiCollection, AnkiModel, AnkiNote } from './ankiParser';

// The suite's global jsdom `indexedDB` mock (src/test/setup.ts) never invokes its
// onsuccess callback, so real writes would hang forever. Only the pointer-building
// logic is under test here, not IndexedDB persistence itself.
vi.mock('../flashcardImageStore', () => ({
  flashcardImageKey: (quizId: string, tag: string) => `${quizId}:${tag}`,
  flashcardImageRef: (quizId: string, tag: string) => `idb:${quizId}:${tag}`,
  putFlashcardImage: vi.fn(() => Promise.resolve()),
}));

function makeModel(
  id: string,
  isCloze: boolean,
  fieldNames: string[],
  templates: AnkiModel['templates'] = [],
): AnkiModel {
  return { id, name: isCloze ? 'Cloze' : 'Basic', isCloze, fieldNames, templates };
}

/** The stock "Basic" note type: one template, Front on the question side. */
function basicTemplates(): AnkiModel['templates'] {
  return [{ name: 'Card 1', qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr id=answer>{{Back}}' }];
}

/** The stock "Basic (and reversed card)" note type: a forward and a reverse template. */
function reversedTemplates(): AnkiModel['templates'] {
  return [
    { name: 'Card 1', qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr id=answer>{{Back}}' },
    { name: 'Card 2', qfmt: '{{Back}}', afmt: '{{FrontSide}}<hr id=answer>{{Front}}' },
  ];
}

function makeNote(id: string, modelId: string, fields: string[], tags: string[] = []): AnkiNote {
  return { id, modelId, fields, tags };
}

function makeCard(id: string, noteId: string, deckId: string, ord = 0): AnkiCard {
  return { id, noteId, deckId, ord };
}

function makeCollection(overrides: Partial<AnkiCollection>): AnkiCollection {
  return {
    decks: new Map(),
    models: new Map(),
    notes: [],
    cards: [],
    media: new Map(),
    ...overrides,
  };
}

describe('ankiImport / mapAnkiCollectionToDecks', () => {
  it('maps a Basic note to a front/back question', async () => {
    const basicModel = makeModel('1', false, ['Front', 'Back']);
    const collection = makeCollection({
      decks: new Map([['1', 'Cardiologie']]),
      models: new Map([['1', basicModel]]),
      notes: [makeNote('n1', '1', ['Care e cea mai frecventă cauză?', 'Infarctul miocardic.'])],
      cards: [makeCard('c1', 'n1', '1')],
    });

    const result = await mapAnkiCollectionToDecks(collection);

    expect(result.stats.deckCount).toBe(1);
    expect(result.stats.cardCount).toBe(1);
    expect(result.stats.clozeCount).toBe(0);
    expect(result.decks[0].path).toEqual(['Cardiologie']);
    const question = result.decks[0].quiz.questions[0];
    expect(question.text).toBe('Care e cea mai frecventă cauză?');
    expect(question.options[0].text).toBe('Infarctul miocardic.');
    expect(question.options[0].isCorrect).toBe(true);
  });

  it('turns a single-deletion Cloze note into one front/back card', async () => {
    const clozeModel = makeModel('2', true, ['Text']);
    const collection = makeCollection({
      decks: new Map([['1', 'Pneumologie']]),
      models: new Map([['2', clozeModel]]),
      notes: [makeNote('n1', '2', ['Capitala Franței este {{c1::Paris}}.'])],
      cards: [makeCard('c1', 'n1', '1')],
    });

    const result = await mapAnkiCollectionToDecks(collection);

    expect(result.stats.clozeCount).toBe(1);
    const question = result.decks[0].quiz.questions[0];
    expect(question.text).toBe('Capitala Franței este [...].');
    expect(question.options[0].text).toBe('Capitala Franței este Paris.');
  });

  // Regression: iterating cards while building front/back from the note alone
  // produced N identical copies for every multi-card note. Anki's `ord` selects
  // which deletion/template the card is for, and must drive the text.
  it('gives each cloze ordinal its own card, hiding only that deletion', async () => {
    const clozeModel = makeModel('2', true, ['Text']);
    const collection = makeCollection({
      decks: new Map([['1', 'Cardiologie']]),
      models: new Map([['2', clozeModel]]),
      notes: [makeNote('n1', '2', ['Inima are {{c1::4}} camere și {{c2::2}} atrii.'])],
      cards: [makeCard('c1', 'n1', '1', 0), makeCard('c2', 'n1', '1', 1)],
    });

    const result = await mapAnkiCollectionToDecks(collection);
    const questions = result.decks[0].quiz.questions;

    expect(questions).toHaveLength(2);
    expect(questions[0].text).toBe('Inima are [...] camere și 2 atrii.');
    expect(questions[1].text).toBe('Inima are 4 camere și [...] atrii.');
    expect(questions[0].text).not.toBe(questions[1].text);
    // Both backs reveal everything.
    expect(questions[0].options[0].text).toBe('Inima are 4 camere și 2 atrii.');
    expect(questions[1].options[0].text).toBe('Inima are 4 camere și 2 atrii.');
  });

  it('shows the cloze hint on the front when one is given', async () => {
    const clozeModel = makeModel('2', true, ['Text']);
    const collection = makeCollection({
      decks: new Map([['1', 'Default']]),
      models: new Map([['2', clozeModel]]),
      notes: [makeNote('n1', '2', ['Agentul este {{c1::Streptococ::bacterie}}.'])],
      cards: [makeCard('c1', 'n1', '1', 0)],
    });

    const result = await mapAnkiCollectionToDecks(collection);
    const question = result.decks[0].quiz.questions[0];

    expect(question.text).toBe('Agentul este [bacterie].');
    expect(question.options[0].text).toBe('Agentul este Streptococ.');
  });

  // Regression: "Basic (and reversed card)" used to yield the forward card twice.
  it('builds a real reverse card from the second template', async () => {
    const reversedModel = makeModel('1', false, ['Front', 'Back'], reversedTemplates());
    const collection = makeCollection({
      decks: new Map([['1', 'Default']]),
      models: new Map([['1', reversedModel]]),
      notes: [makeNote('n1', '1', ['Cord', 'Heart'])],
      cards: [makeCard('c1', 'n1', '1', 0), makeCard('c2', 'n1', '1', 1)],
    });

    const result = await mapAnkiCollectionToDecks(collection);
    const questions = result.decks[0].quiz.questions;

    expect(questions).toHaveLength(2);
    expect([questions[0].text, questions[0].options[0].text]).toEqual(['Cord', 'Heart']);
    expect([questions[1].text, questions[1].options[0].text]).toEqual(['Heart', 'Cord']);
  });

  it('honours a template that puts a non-first field on the question side', async () => {
    const model = makeModel('1', false, ['Extra', 'Intrebare', 'Raspuns'], [
      { name: 'Card 1', qfmt: '{{Intrebare}}', afmt: '{{FrontSide}}{{Raspuns}}' },
    ]);
    const collection = makeCollection({
      decks: new Map([['1', 'Default']]),
      models: new Map([['1', model]]),
      notes: [makeNote('n1', '1', ['note margine', 'Ce este X?', 'Este Y.'])],
      cards: [makeCard('c1', 'n1', '1', 0)],
    });

    const result = await mapAnkiCollectionToDecks(collection);
    const question = result.decks[0].quiz.questions[0];

    expect(question.text).toBe('Ce este X?');
    expect(question.options[0].text).toBe('Este Y.');
  });

  it('falls back to positional fields when a model ships no templates', async () => {
    const model = makeModel('1', false, ['Front', 'Back']);
    const collection = makeCollection({
      decks: new Map([['1', 'Default']]),
      models: new Map([['1', model]]),
      notes: [makeNote('n1', '1', ['Fata', 'Spatele'])],
      cards: [makeCard('c1', 'n1', '1', 0), makeCard('c2', 'n1', '1', 1)],
    });

    const result = await mapAnkiCollectionToDecks(collection);
    const questions = result.decks[0].quiz.questions;

    expect([questions[0].text, questions[0].options[0].text]).toEqual(['Fata', 'Spatele']);
    expect([questions[1].text, questions[1].options[0].text]).toEqual(['Spatele', 'Fata']);
  });

  it('skips notes with no usable content', async () => {
    const model = makeModel('1', false, ['Front', 'Back'], basicTemplates());
    const collection = makeCollection({
      decks: new Map([['1', 'Default']]),
      models: new Map([['1', model]]),
      notes: [makeNote('n1', '1', ['', '']), makeNote('n2', '1', ['Real', 'Card'])],
      cards: [makeCard('c1', 'n1', '1'), makeCard('c2', 'n2', '1')],
    });

    const result = await mapAnkiCollectionToDecks(collection);

    expect(result.stats.cardCount).toBe(1);
    expect(result.decks[0].quiz.questions[0].text).toBe('Real');
  });

  it('strips [sound:...] refs and counts them as skipped audio', async () => {
    const basicModel = makeModel('1', false, ['Front', 'Back']);
    const collection = makeCollection({
      decks: new Map([['1', 'Default']]),
      models: new Map([['1', basicModel]]),
      notes: [makeNote('n1', '1', ['Întrebare [sound:q.mp3]', 'Răspuns [sound:a.mp3]'])],
      cards: [makeCard('c1', 'n1', '1')],
    });

    const result = await mapAnkiCollectionToDecks(collection);

    expect(result.stats.skippedAudioCount).toBe(2);
    expect(result.decks[0].quiz.questions[0].text).toBe('Întrebare');
  });

  it('strips HTML markup to plain text', async () => {
    const basicModel = makeModel('1', false, ['Front', 'Back']);
    const collection = makeCollection({
      decks: new Map([['1', 'Default']]),
      models: new Map([['1', basicModel]]),
      notes: [makeNote('n1', '1', ['<b>Ce</b> este<br>asta?', 'Un <i>răspuns</i>.'])],
      cards: [makeCard('c1', 'n1', '1')],
    });

    const result = await mapAnkiCollectionToDecks(collection);
    const question = result.decks[0].quiz.questions[0];
    expect(question.text).not.toMatch(/<[^>]+>/);
    expect(question.options[0].text).not.toMatch(/<[^>]+>/);
  });

  it('groups cards by full deck path and produces one quiz per leaf deck', async () => {
    const basicModel = makeModel('1', false, ['Front', 'Back']);
    const collection = makeCollection({
      decks: new Map([
        ['1', 'Rezidențiat::Cardiologie'],
        ['2', 'Rezidențiat::Pneumologie'],
      ]),
      models: new Map([['1', basicModel]]),
      notes: [
        makeNote('n1', '1', ['Q1', 'A1']),
        makeNote('n2', '1', ['Q2', 'A2']),
      ],
      cards: [makeCard('c1', 'n1', '1'), makeCard('c2', 'n2', '2')],
    });

    const result = await mapAnkiCollectionToDecks(collection);

    expect(result.stats.deckCount).toBe(2);
    const paths = result.decks.map((d) => d.path);
    expect(paths).toContainEqual(['Rezidențiat', 'Cardiologie']);
    expect(paths).toContainEqual(['Rezidențiat', 'Pneumologie']);
  });

  it('rehomes embedded images into flashcardImageStore and points imageUrl at them', async () => {
    const basicModel = makeModel('1', false, ['Front', 'Back']);
    const collection = makeCollection({
      decks: new Map([['1', 'Default']]),
      models: new Map([['1', basicModel]]),
      notes: [makeNote('n1', '1', ['<img src="pic.jpg">Vezi imaginea', 'Răspuns'])],
      cards: [makeCard('c1', 'n1', '1')],
      media: new Map([['pic.jpg', new Uint8Array([1, 2, 3])]]),
    });

    const result = await mapAnkiCollectionToDecks(collection);

    expect(result.stats.imageCount).toBe(1);
    const question = result.decks[0].quiz.questions[0];
    expect(question.imageUrl).toMatch(/^idb:/);
  });

  it('does not set imageUrl when the referenced media is missing', async () => {
    const basicModel = makeModel('1', false, ['Front', 'Back']);
    const collection = makeCollection({
      decks: new Map([['1', 'Default']]),
      models: new Map([['1', basicModel]]),
      notes: [makeNote('n1', '1', ['<img src="missing.jpg">Text', 'Răspuns'])],
      cards: [makeCard('c1', 'n1', '1')],
    });

    const result = await mapAnkiCollectionToDecks(collection);

    expect(result.stats.imageCount).toBe(0);
    expect(result.decks[0].quiz.questions[0].imageUrl).toBeUndefined();
  });
});

describe('ankiImport / planFolderChain', () => {
  it('orders parents before children and dedupes shared prefixes', () => {
    const plan = planFolderChain([
      ['Rezidențiat', 'Cardiologie'],
      ['Rezidențiat', 'Pneumologie'],
    ]);

    expect(plan).toEqual([
      ['Rezidențiat'],
      ['Rezidențiat', 'Cardiologie'],
      ['Rezidențiat', 'Pneumologie'],
    ]);
  });

  it('handles single-segment paths and no duplication across unrelated trees', () => {
    const plan = planFolderChain([
      ['Default'],
      ['Altă rădăcină', 'Sub'],
    ]);

    expect(plan).toEqual([
      ['Default'],
      ['Altă rădăcină'],
      ['Altă rădăcină', 'Sub'],
    ]);
  });
});
