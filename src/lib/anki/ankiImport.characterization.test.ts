import { describe, expect, it, vi } from 'vitest';
import { mapAnkiCollectionToDecks } from './ankiImport';
import type { AnkiCollection, AnkiModel } from './ankiParser';

vi.mock('../flashcardImageStore', () => ({
  flashcardImageKey: (quizId: string, tag: string) => `${quizId}:${tag}`,
  flashcardImageRef: (quizId: string, tag: string) => `idb:${quizId}:${tag}`,
  putFlashcardImage: vi.fn(() => Promise.resolve()),
}));

const basic = (templates: AnkiModel['templates'] = [{ name: 'Card 1', qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr id=answer>{{Back}}' }]): AnkiModel => ({
  id: '1', name: 'Basic', isCloze: false, fieldNames: ['Front', 'Back'], templates,
});

function collection(fields: string[][], over: Partial<AnkiCollection> = {}, model = basic()): AnkiCollection {
  return {
    decks: new Map([['1', 'Rezidențiat::Cardiologie']]),
    models: new Map([['1', model]]),
    notes: fields.map((f, i) => ({ id: `n${i}`, modelId: '1', fields: f, tags: [] })),
    cards: fields.map((_, i) => ({ id: `c${i}`, noteId: `n${i}`, deckId: '1', ord: 0 })),
    media: new Map(),
    ...over,
  };
}

async function firstCard(fields: string[]) {
  const r = await mapAnkiCollectionToDecks(collection([fields]));
  const q = r.decks[0].quiz.questions[0];
  return { front: q.text, back: q.options[0].text };
}

describe('ankiImport characterization', () => {
  it('keeps Romanian diacritics and decodes common HTML entities', async () => {
    expect(await firstCard(['Ce înseamnă <b>ȘI</b>&nbsp;ȚĂ &amp; &lt;5 &quot;mm&quot; &#39;x&#39;?', 'Răspuns&nbsp;corect'])).toEqual({
      front: 'Ce înseamnă ȘI ȚĂ & <5 "mm" \'x\'?',
      back: 'Răspuns corect',
    });
  });

  it('does not double-decode an escaped entity (&amp;lt; stays a literal "&lt;")', async () => {
    expect((await firstCard(['Cod HTML: &amp;lt;br&amp;gt;', 'x'])).front).toBe('Cod HTML: &lt;br&gt;');
  });

  it('turns <br>/<div> into single newlines and collapses blank runs', async () => {
    expect((await firstCard(['a<br><br><br>b<div>c</div><div>d</div>', 'x'])).front).toBe('a\nb\nc\nd');
  });

  it('handles Anki filter syntax and conditional sections in templates', async () => {
    const model = basic([{ name: 'C', qfmt: '{{#Extra}}{{hint:Back}}{{/Extra}}{{type:Front}}', afmt: '{{FrontSide}}{{Tags}}{{Back}}' }]);
    const r = await mapAnkiCollectionToDecks(collection([['F', 'B']], {}, model));
    const q = r.decks[0].quiz.questions[0];
    // Front side shows Back (hint:) then Front; Back side repeats nothing already shown.
    expect(q.text).toBe('B\nF');
    expect(q.options[0].text).toBe('');
  });

  it('skips cards whose note or model is unknown and names an unknown deck "Import Anki"', async () => {
    const col = collection([['A', 'B'], ['C', 'D']], { decks: new Map() });
    col.cards.push({ id: 'cx', noteId: 'missing', deckId: '1', ord: 0 });
    col.notes.push({ id: 'nm', modelId: 'nomodel', fields: ['x', 'y'], tags: [] });
    col.cards.push({ id: 'cm', noteId: 'nm', deckId: '1', ord: 0 });
    const r = await mapAnkiCollectionToDecks(col);
    expect(r.decks).toHaveLength(1);
    expect(r.decks[0].path).toEqual(['Import Anki']);
    expect(r.decks[0].quiz.title).toBe('Import Anki');
    expect(r.stats.cardCount).toBe(2);
  });

  it('stores a picture shared by many cards once, but points every card at it', async () => {
    const img = '<img src="ecg.png">';
    const col = collection([[`${img} Ritm?`, 'FiA'], [`${img} Axă?`, 'Normală'], ['Fără poză', 'x']], { media: new Map([['ecg.png', new Uint8Array([1, 2, 3])]]) });
    const r = await mapAnkiCollectionToDecks(col);
    const [a, b, c] = r.decks[0].quiz.questions;
    expect(r.stats.imageCount).toBe(1);
    expect(a.imageUrl).toBe(b.imageUrl);
    expect(a.imageUrl).toMatch(/^idb:[0-9a-f]{12}:ecg\.png$/);
    expect(c.imageUrl).toBeUndefined();
    expect(a.text).toBe('Ritm?');
  });

  it('imports 5000 cards across decks in reasonable time with exact counts', async () => {
    const N = 5000;
    const col = collection(Array.from({ length: N }, (_, i) => [`Întrebarea ${i} ș ț?`, `Răspunsul ${i}`]));
    col.decks = new Map([['1', 'A::B'], ['2', 'A::C']]);
    col.cards.forEach((c, i) => { c.deckId = i % 2 ? '2' : '1'; });
    const start = Date.now();
    const r = await mapAnkiCollectionToDecks(col);
    expect(Date.now() - start).toBeLessThan(5000);
    expect(r.stats).toMatchObject({ deckCount: 2, cardCount: N, clozeCount: 0, imageCount: 0 });
    expect(r.decks.map((d) => d.path)).toEqual([['A', 'B'], ['A', 'C']]);
    expect(r.decks[1].quiz.questions[0].text).toBe('Întrebarea 1 ș ț?');
    expect(new Set(r.decks.flatMap((d) => d.quiz.questions.map((q) => q.id))).size).toBe(N);
  });
});
