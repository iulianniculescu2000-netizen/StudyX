import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestStructured = vi.fn();
vi.mock('./structured', () => ({ requestStructured: (...args: unknown[]) => requestStructured(...args) }));

import {
  cleanAndDedupe,
  flashcardsReplySchema,
  generateFlashcardDeck,
  isSelfContainedFront,
  normalizeLevel,
  orderByLevel,
  pickSpread,
  planBatches,
  splitIntoWindows,
  type DraftCard,
} from './flashcardAuthor';

const card = (front: string, back: string, level: DraftCard['level'] = 'medium'): DraftCard => ({ front, back, level });
const ok = (cards: DraftCard[]) => ({ ok: true, data: cards, repaired: false, raw: '' });

beforeEach(() => requestStructured.mockReset());

describe('flashcardAuthor — piese pure', () => {
  it('recunoaște nivelurile în română și engleză', () => {
    expect(normalizeLevel('Ușor')).toBe('easy');
    expect(normalizeLevel('dificil')).toBe('hard');
    expect(normalizeLevel('MEDIUM')).toBe('medium');
    expect(normalizeLevel('altceva')).toBeNull();
  });

  it('taie textul pe limite de paragraf, fără ferestre peste limită', () => {
    const paragraph = 'Propoziție despre sepsis. '.repeat(40).trim();
    const windows = splitIntoWindows(`${paragraph}\n\n${paragraph}\n\n${paragraph}`, 1200);
    expect(windows.length).toBeGreaterThan(1);
    expect(windows.every((window) => window.length <= 1250)).toBe(true);
  });

  it('alege ferestre răspândite pe tot textul', () => {
    expect(pickSpread([1, 2, 3, 4, 5, 6, 7, 8], 4)).toEqual([1, 3, 5, 7]);
    expect(pickSpread([1, 2], 5)).toEqual([1, 2]);
  });

  it('fără text împarte cererea pe aspecte diferite, în loturi de cel mult 10', () => {
    const plans = planBatches(25, []);
    expect(plans.map((plan) => plan.n)).toEqual([10, 10, 5]);
    expect(new Set(plans.map((plan) => plan.facet)).size).toBe(3);
    expect(plans.every((plan) => plan.window === null)).toBe(true);
  });

  it('cu text distribuie exact numărul cerut, cu ferestre diferite', () => {
    const windows = Array.from({ length: 10 }, (_, i) => `fereastra ${i} despre mecanism ${i}`);
    const plans = planBatches(18, windows);
    expect(plans.reduce((sum, plan) => sum + plan.n, 0)).toBe(18);
    expect(plans.every((plan) => plan.n <= 10 && plan.window)).toBe(true);
    expect(new Set(plans.map((plan) => plan.window)).size).toBe(3);
  });

  it('la un topic precis, ferestrele care îl conțin trec înaintea celorlalte', () => {
    const windows = ['text despre ficat', 'text despre rinichi', 'text despre ficat și hepatită', 'alt text'];
    const plans = planBatches(6, windows, 'hepatită');
    expect(plans.every((plan) => plan.window?.includes('hepatită'))).toBe(true);
  });

  it('elimină duplicatele, spatele identice și cardurile prea lungi', () => {
    const out = cleanAndDedupe(
      [
        card('Ce este sepsisul?', 'Disfuncție de organ prin răspuns dereglat la infecție.'),
        card('Ce este sepsisul?', 'Altă formulare'),
        card('Ce înseamnă sepsis?', 'Disfuncție de organ prin răspuns dereglat la infecție.'),
        card('Cum se tratează?', 'x'.repeat(900)),
        card('Care sunt criteriile qSOFA?', 'FR, stare mentală, TAS.'),
      ],
      [],
    );
    expect(out.map((entry) => entry.front)).toEqual(['Ce este sepsisul?', 'Care sunt criteriile qSOFA?']);
  });

  it('respectă fronturile deja existente', () => {
    const out = cleanAndDedupe([card('Ce este sepsisul?', 'a'), card('Care este alt card?', 'b')], ['Ce este sepsisul?']);
    expect(out.map((entry) => entry.front)).toEqual(['Care este alt card?']);
  });

  it('ordonează de la ușor la dificil, stabil', () => {
    const ordered = orderByLevel([card('1', 'a', 'hard'), card('2', 'b', 'easy'), card('3', 'c', 'medium'), card('4', 'd', 'easy')]);
    expect(ordered.map((entry) => entry.front)).toEqual(['2', '4', '3', '1']);
  });

  it('schema răspunsului acceptă obiect sau listă și aruncă cardurile goale', () => {
    const parsed = flashcardsReplySchema.parse({ cards: [{ front: 'Ce este HTA?', back: 'Tensiune crescută.', difficulty: 'ușor' }, { front: '', back: 'x' }, 'gunoi'] });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].level).toBe('easy');
    expect(flashcardsReplySchema.parse([{ question: 'Ce este DZ?', answer: 'Boală metabolică.' }])).toHaveLength(1);
    expect(() => flashcardsReplySchema.parse({ cards: [] })).toThrow();
  });
});

describe('generateFlashcardDeck', () => {
  const text = Array.from({ length: 8 }, (_, i) => `Paragraful ${i}. ${'Informație medicală relevantă despre subiect. '.repeat(30)}`).join('\n\n');

  it('construiește un pachet de rezidențiat, ancorat în text, cu nivelul cerut pe fiecare card', async () => {
    requestStructured.mockResolvedValueOnce(ok([card('Care este definiția sepsisului?', 'Disfuncție de organ prin răspuns dereglat la infecție.', 'hard'), card('Ce scor se folosește pentru triajul rapid?', 'qSOFA.', 'easy')]));
    const result = await generateFlashcardDeck({
      scope: { kind: 'text', text, topic: 'Sepsis' },
      count: 2,
      difficulty: 'medium',
      folderId: 'f1',
      space: 'rezidentiat',
    });
    expect(result.grounded).toBe(true);
    expect(result.deck.kind).toBe('flashcard');
    expect(result.deck.folderId).toBe('f1');
    expect(result.deck.tags).toContain('rezidentiat');
    expect(result.deck.questions.map((question) => question.difficulty)).toEqual(['medium', 'medium']);
    expect(result.deck.title).toBe('Sepsis · Mediu');
  });

  it('în modul mixt păstrează nivelul fiecărui card și îl ordonează de la ușor la dificil', async () => {
    requestStructured.mockResolvedValueOnce(ok([card('Care este capcana frecventă?', 'g', 'hard'), card('Ce este sepsisul?', 'e', 'easy'), card('Care sunt criteriile qSOFA?', 'm', 'medium')]));
    const result = await generateFlashcardDeck({ scope: { kind: 'text', text, topic: 'Sepsis' }, count: 3, difficulty: 'auto', folderId: null, space: 'general' });
    expect(result.deck.questions.map((question) => question.difficulty)).toEqual(['easy', 'medium', 'hard']);
    expect(result.deck.tags).not.toContain('rezidentiat');
  });

  it('nu depășește numărul cerut și avertizează când iese mai puțin', async () => {
    requestStructured.mockResolvedValue(ok([card('Care este primul criteriu?', 'a'), card('Ce urmează în conduită?', 'b')]));
    const fewer = await generateFlashcardDeck({ scope: { kind: 'text', text, topic: 'Sepsis' }, count: 6, difficulty: 'medium', folderId: null, space: 'general' });
    expect(fewer.produced).toBeLessThan(6);
    expect(fewer.warnings.some((warning) => warning.includes('din 6'))).toBe(true);
  });

  it('aruncă o eroare clară când nu iese niciun card', async () => {
    requestStructured.mockResolvedValue({ ok: false, error: 'invalid', raw: '' });
    await expect(generateFlashcardDeck({ scope: { kind: 'text', text, topic: 'Sepsis' }, count: 3, difficulty: 'medium', folderId: null, space: 'general' })).rejects.toThrow(/nu am reușit/i);
  });

  it('trimite modelului nivelul, textul din carte și fronturile de evitat', async () => {
    requestStructured.mockResolvedValueOnce(ok([card('Care este un card nou?', 'n')]));
    await generateFlashcardDeck({
      scope: { kind: 'text', text, topic: 'Sepsis' },
      count: 1,
      difficulty: 'hard',
      folderId: null,
      space: 'general',
      avoidFronts: ['Ce este sepsisul?'],
    });
    const messages = requestStructured.mock.calls[0][0].messages as Array<{ role: string; content: string }>;
    const user = messages.find((message) => message.role === 'user')!.content;
    expect(user).toContain('NIVEL CERUT: DIFICIL');
    expect(user).toContain('FRAGMENT DIN CARTE');
    expect(user).toContain('Ce este sepsisul?');
    expect(messages.find((message) => message.role === 'system')!.content).toContain('UN CARD BUN');
  });
});

describe('fețe care se înțeleg singure', () => {
  it('respinge fețele fără context sau cu etichetă de specialitate', () => {
    expect(isSelfContainedFront('AVRT?')).toBe(false);
    expect(isSelfContainedFront('[Cardiologie] Un semn precoce al BC?')).toBe(false);
    expect(isSelfContainedFront('Care este cea mai frecventă cauză de pancreatită acută?')).toBe(true);
  });

  it('cleanAndDedupe le scoate din pachet', () => {
    const out = cleanAndDedupe([card('AVRT?', 'Ortodromică.'), card('Care este tratamentul de elecție în AVNRT?', 'Manevre vagale, apoi adenozină.')], []);
    expect(out.map((entry) => entry.front)).toEqual(['Care este tratamentul de elecție în AVNRT?']);
  });

  it('schema pune literă mare la începutul răspunsului', () => {
    const parsed = flashcardsReplySchema.parse({ cards: [{ front: 'Care este tratamentul de elecție?', back: 'tahipneea.' }] });
    expect(parsed[0].back).toBe('Tahipneea.');
  });
});
