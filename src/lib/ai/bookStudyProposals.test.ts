import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestStructured = vi.fn();
const hasAIKey = vi.fn(() => true);
vi.mock('./structured', () => ({ requestStructured: (...args: unknown[]) => requestStructured(...args) }));
vi.mock('../organizare/analysis', () => ({ hasAIKey: () => hasAIKey() }));

import {
  MAX_PROPOSED_CARDS,
  NO_AI_KEY_MESSAGE,
  NoAIKeyError,
  buildAcceptedDeck,
  buildPageWindows,
  citedCardsReplySchema,
  clampPageRange,
  clampProposalCount,
  finalizeCards,
  generateBookProposals,
  keepCitedCards,
  keepCitedSchema,
  verifyCitation,
  type CardProposal,
  type PageText,
  type RawCitedCard,
} from './bookStudyProposals';
import { buildFlashcardUserPrompt } from '../../ai/flashcardPrompts';
import { CITED_CARDS_OUTPUT_SPEC } from '../../ai/bookStudyPrompts';

const PAGES: PageText[] = [
  { page: 10, text: 'Sepsisul este disfuncția de organ cauzată de un răspuns dereglat al gazdei la infecție. Lactatul seric crește în șoc.' },
  { page: 11, text: 'Tratamentul inițial al șocului septic include resuscitare volemică și antibiotice administrate în prima oră.' },
  { page: 12, text: 'Criteriile qSOFA sunt frecvența respiratorie, alterarea stării mentale și tensiunea arterială sistolică scăzută.' },
];

const card = (over: Partial<RawCitedCard> = {}): RawCitedCard => ({
  front: 'Ce este sepsisul în definiția actuală?',
  back: 'Disfuncție de organ produsă de un răspuns dereglat la infecție',
  level: 'easy',
  page: 10,
  quote: 'disfuncția de organ cauzată de un răspuns dereglat al gazdei',
  ...over,
});

describe('verifyCitation', () => {
  it('acceptă un citat care apare în pagina citată (fără diacritice și majuscule)', () => {
    const check = verifyCitation('K', 10, 'DISFUNCTIA DE ORGAN cauzata de un raspuns dereglat', 'Disfuncție de organ', PAGES);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.citation).toMatchObject({ book: 'K', page: 10 });
  });

  it('respinge cardul fără pagină sau fără citat', () => {
    expect(verifyCitation('K', undefined, 'disfuncția de organ cauzată', 'x', PAGES)).toEqual({ ok: false, reason: 'fara-citare' });
    expect(verifyCitation('K', 10, '', 'x', PAGES)).toEqual({ ok: false, reason: 'fara-citare' });
    expect(verifyCitation('K', 'zece', 'disfuncția de organ cauzată', 'x', PAGES)).toEqual({ ok: false, reason: 'fara-citare' });
  });

  it('respinge o pagină din afara intervalului ales', () => {
    expect(verifyCitation('K', 99, 'disfuncția de organ cauzată', 'x', PAGES)).toEqual({ ok: false, reason: 'pagina-in-afara-intervalului' });
  });

  it('respinge un citat inventat', () => {
    expect(verifyCitation('K', 10, 'Sepsisul se tratează exclusiv cu repaus la pat', 'Repaus', PAGES)).toEqual({ ok: false, reason: 'citat-negasit' });
  });

  it('corectează pagina când citatul real e pe altă pagină din interval', () => {
    const check = verifyCitation('K', 10, 'resuscitare volemică și antibiotice administrate', 'Resuscitare volemică și antibiotice', PAGES);
    expect(check.ok && check.citation.page).toBe(11);
  });

  it('respinge un răspuns fără legătură cu pagina, chiar dacă citatul e real', () => {
    const check = verifyCitation('K', 10, 'disfuncția de organ cauzată de un răspuns dereglat', 'Cirotica hepatică decompensată', PAGES);
    expect(check).toEqual({ ok: false, reason: 'raspuns-fara-legatura' });
  });
});

describe('keepCitedCards', () => {
  it('numără și aruncă cardurile fără citare verificată', () => {
    const { cards, rejected } = keepCitedCards(
      [card(), card({ front: 'Care e tratamentul inițial al șocului septic?', quote: undefined }), card({ front: 'Ce măsoară lactatul seric în șoc?', page: 77 })],
      'K',
      PAGES,
    );
    expect(cards).toHaveLength(1);
    expect(rejected).toBe(2);
    expect(cards[0].citation.page).toBe(10);
  });
});

describe('finalizeCards', () => {
  const many = (n: number): CardProposal[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `c${i}`,
      front: `Întrebarea numărul ${i} despre sepsis și șoc septic?`,
      back: `Răspunsul distinct ${i} pentru cardul curent`,
      level: 'medium',
      citation: { book: 'K', page: 10 + (i % 3), quote: 'disfuncția de organ cauzată' },
    }));

  it('taie la numărul cerut (slice(0, count)) când modelul întoarce mai multe', () => {
    expect(finalizeCards(many(30), 12)).toHaveLength(12);
  });

  it('numărul cerut se limitează la 10–20', () => {
    expect(finalizeCards(many(30), 50)).toHaveLength(MAX_PROPOSED_CARDS);
    expect(clampProposalCount(3)).toBe(10);
    expect(clampProposalCount(Number.NaN)).toBe(12);
  });

  it('scoate duplicatele și ordonează după pagină', () => {
    const list = many(4);
    const out = finalizeCards([...list, { ...list[0], id: 'dup' }], 20);
    expect(out).toHaveLength(4);
    expect(out.map((c) => c.citation.page)).toEqual([...out.map((c) => c.citation.page)].sort((a, b) => a - b));
  });
});

describe('citedCardsReplySchema', () => {
  it('păstrează pagina și citatul din răspuns', () => {
    const out = citedCardsReplySchema.parse({ cards: [{ front: 'Ce este sepsisul?', back: 'disfuncție de organ', difficulty: 'dificil', page: 10, quote: 'x' }] });
    expect(out[0]).toMatchObject({ page: 10, level: 'hard', back: 'Disfuncție de organ' });
  });
});

describe('keepCitedSchema', () => {
  const code = '# Sepsis\n! Infecție\n~ Lactat seric\n? Hipotensiune?\n  da> + Resuscitare volemică\n  nu> . Observare';

  it('păstrează schema cu cel puțin un citat verificat', () => {
    const schema = keepCitedSchema({ title: 'Sepsis', schema: code, quotes: [{ page: 11, quote: 'resuscitare volemică și antibiotice' }] }, 'K', 'x', PAGES);
    expect(schema?.citations).toHaveLength(1);
  });

  it('respinge schema fără citat verificat sau care nu se desenează', () => {
    expect(keepCitedSchema({ title: 'Sepsis', schema: code, quotes: [{ page: 11, quote: 'text care nu există în pagină' }] }, 'K', 'x', PAGES)).toBeNull();
    expect(keepCitedSchema({ title: 'x', schema: 'doar o linie', quotes: [{ page: 11, quote: 'resuscitare volemică și antibiotice' }] }, 'K', 'x', PAGES)).toBeNull();
  });
});

describe('ferestre și intervale', () => {
  it('fiecare fereastră poartă marcajul [p. N] al paginilor ei', () => {
    const windows = buildPageWindows(PAGES, 140);
    expect(windows.length).toBeGreaterThan(1);
    expect(windows[0].text.startsWith('[p. 10]')).toBe(true);
  });

  it('intervalul se taie la 40 de pagini și la cartea reală', () => {
    expect(clampPageRange({ first: 1, last: 100 }, 391)).toEqual({ range: { first: 1, last: 40 }, trimmed: true });
    expect(clampPageRange({ first: 380, last: 500 }, 391)?.range).toEqual({ first: 380, last: 391 });
    expect(clampPageRange({ first: 500, last: 520 }, 391)).toBeNull();
  });
});

describe('promptul cardurilor cu citare', () => {
  it('înlocuiește formatul implicit fără să-l repete (un singur contract de ieșire)', () => {
    const prompt = buildFlashcardUserPrompt({ topic: 'Sepsis', difficulty: 'auto', count: 5, context: '[p. 10]\ntext', outputSpec: CITED_CARDS_OUTPUT_SPEC });
    expect(prompt).toContain('"page"');
    expect(prompt.match(/Răspunde DOAR cu JSON/g)).toHaveLength(1);
  });
});

describe('generateBookProposals', () => {
  beforeEach(() => {
    requestStructured.mockReset();
    hasAIKey.mockReturnValue(true);
  });
  const loadPages = async () => ['', '', '', '', '', '', '', '', '', PAGES[0].text, PAGES[1].text, PAGES[2].text];

  it('fără cheie AI aruncă un mesaj clar, fără să apeleze modelul', async () => {
    hasAIKey.mockReturnValue(false);
    const error = await generateBookProposals({ book: 'K', range: { first: 10, last: 12 }, topic: 'Sepsis', count: 12, loadPages }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NoAIKeyError);
    expect((error as Error).message).toBe(NO_AI_KEY_MESSAGE);
    expect(requestStructured).not.toHaveBeenCalled();
  });

  it('taie la numărul cerut și aruncă cardurile fără citare verificată', async () => {
    const valid = Array.from({ length: 25 }, (_, i) => card({ front: `Întrebarea ${i} despre sepsis și lactatul seric?`, back: `Disfuncție de organ, răspunsul ${i}` }));
    const invalid = [card({ front: 'Card fără citare despre sepsis și șoc?', quote: '' }), card({ front: 'Card cu citat inventat despre sepsis?', quote: 'o frază care nu apare nicăieri în pagină' })];
    requestStructured.mockImplementation(async (req: { label: string }) =>
      req.label === 'bookStudySchema'
        ? { ok: true, data: { title: 'Sepsis', schema: '# Sepsis\n! Infecție\n~ Lactat seric\n? Hipotensiune?\n  da> + Resuscitare volemică\n  nu> . Observare', quotes: [{ page: 11, quote: 'resuscitare volemică și antibiotice' }] }, repaired: false, raw: '' }
        : { ok: true, data: [...invalid, ...valid], repaired: false, raw: '' });

    const set = await generateBookProposals({ book: 'K', range: { first: 10, last: 12 }, topic: 'Sepsis', count: 12, loadPages });
    expect(set.cards).toHaveLength(12);
    expect(set.cards.every((c) => c.citation.page >= 10 && c.citation.page <= 12 && c.citation.quote.length > 0)).toBe(true);
    expect(set.cards.some((c) => c.front.startsWith('Card fără citare') || c.front.startsWith('Card cu citat inventat'))).toBe(false);
    expect(set.rejected).toBeGreaterThanOrEqual(2);
    expect(set.schema?.citations[0].page).toBe(11);
  });

  it('aruncă o eroare clară când nicio propunere nu are citare verificată', async () => {
    requestStructured.mockResolvedValue({ ok: true, data: [card({ quote: 'inventat complet și neexistent în text' })], repaired: false, raw: '' });
    await expect(generateBookProposals({ book: 'K', range: { first: 10, last: 12 }, topic: 'Sepsis', count: 10, loadPages })).rejects.toThrow(/citări verificate/);
  });
});

describe('buildAcceptedDeck', () => {
  const accepted: CardProposal = { id: 'a', front: 'Ce este sepsisul în definiția actuală?', back: 'Disfuncție de organ', level: 'easy', citation: { book: 'K', page: 10, quote: 'disfuncția de organ cauzată' } };

  it('construiește pachetul doar din ce a fost acceptat, cu sursa pe fiecare card', () => {
    const deck = buildAcceptedDeck({ cards: [accepted], schema: null }, { title: 'Sepsis', topic: 'Sepsis', book: 'K', folderId: null });
    expect(deck.questions).toHaveLength(1);
    expect(deck.questions[0].explanation).toBe('Sursă: Kumar, p. 10');
    expect(deck.tags).toContain('ai-book-proposals');
  });

  it('refuză să salveze când nu e nimic acceptat', () => {
    expect(() => buildAcceptedDeck({ cards: [], schema: null }, { title: 'x', topic: 'x', book: 'K', folderId: null })).toThrow();
  });
});
