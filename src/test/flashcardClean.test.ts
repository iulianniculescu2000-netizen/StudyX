import { describe, expect, it } from 'vitest';
import {
  buildFlashcardDeck,
  cleanText,
  parseKumarText,
  repairSplitWords,
  splitQuestionAnswer,
  stableId,
} from '../../scripts/lib/flashcardClean.mjs';

const SAMPLE = `
<<PAGE 1>>
@tobi.creta
 1
 SEPSIS
 1.   Terapia   antibiotica   in   sepsis   trebuie   initiata   in:   PRIMA   ORA   de   la
 recunoasterea sepsisului.
 2.   Semn cheie al deteriorarii clinice: tahipneea.
 3.   Cel mai des la pacientii hemato - oncologici, sepsisul apare dupa: chimioterapie.
<<PAGE 2>>
@tobi.creta
 2
 4.   Rezultatul poate fi 1.000 de cazuri: nu se despica.
 E HE/DAB
 1.   Factorul determinant principal al distributiei apei: presiunea osmotica.
 2.   Edemul periferic este datorat VEC expansionat.
<<PAGE 3>>
 CARDIOLOGIE
 1.   Tratamentul contraindicatiilor: - > inchiderea percutanata a urechiusei AS
 2.   Raport barbati-femei de 3:1: predomina femeile.
 DIABET   ZAHARAT
 1.   Prima intrebare a capitolului urmator: raspuns.
 2.   A doua.
 1.   Restart fara titlu: alt continut.
`;

describe('parseKumarText', () => {
  const cards = parseKumarText(SAMPLE);

  it('assigns each card to the heading it actually sits under', () => {
    expect(cards.filter((c) => c.chapter === 'Sepsis')).toHaveLength(4);
    expect(cards.filter((c) => c.chapter === 'Echilibru hidro-electrolitic și acido-bazic')).toHaveLength(2);
    expect(cards.filter((c) => c.chapter === 'Cardiologie')).toHaveLength(2);
    // the heading line must not be swallowed by the card above it
    expect(cards[3].answer).not.toMatch(/E HE\/DAB/);
  });

  it('joins wrapped lines, drops page markers and watermarks, collapses spacing', () => {
    expect(cards[0].question).toBe('Terapia antibiotica in sepsis trebuie initiata in');
    expect(cards[0].answer).toBe('PRIMA ORA de la recunoasterea sepsisului.');
    expect(JSON.stringify(cards)).not.toMatch(/tobi\.creta|<<PAGE/);
  });

  it('tightens " - " between words and turns "- >" into an arrow', () => {
    expect(cards[2].question).toContain('hemato-oncologici');
    expect(cards.find((c) => c.chapter === 'Cardiologie')?.answer).toBe('→ inchiderea percutanata a urechiusei AS');
  });

  it('does not treat "1.000" inside an item as a new item', () => {
    expect(cards[3].question).toContain('1.000 de cazuri');
    expect(cards[3].answer).toBe('nu se despica.');
  });

  it('does not split a ratio like 3:1 at the colon inside it', () => {
    const ratio = cards.find((c) => c.question.startsWith('Raport'));
    expect(ratio?.question).toBe('Raport barbati-femei de 3:1');
    expect(ratio?.answer).toBe('predomina femeile.');
  });

  it('labels a numbering restart with no heading from the previous chapter', () => {
    expect(cards.at(-1)?.chapter).toBe('Diabet zaharat (continuare)');
  });

  it('treats an item with no delimiter as a statement card', () => {
    const statement = cards.find((c) => c.answer.startsWith('Edemul periferic'));
    expect(statement?.statement).toBe(true);
    expect(statement?.question).toBe('');
  });

  it('never lets the numbering skip: a wrapped "9. " line inside item 2 stays part of item 2', () => {
    const tricky = parseKumarText(' SEPSIS\n 1.   Prima: a\n 2.   A doua: b\n 9.   text ramas pe rand nou\n 3.   A treia: c');
    expect(tricky).toHaveLength(3);
    expect(tricky[1].answer).toContain('9. text ramas');
  });
});

describe('splitQuestionAnswer / cleanText', () => {
  it('prefers ":" then "=" then "?"', () => {
    expect(splitQuestionAnswer('Semn: tahipneea')).toMatchObject({ question: 'Semn', answer: 'tahipneea' });
    expect(splitQuestionAnswer('LTNP = pacienti stabili')).toMatchObject({ question: 'LTNP', answer: 'pacienti stabili' });
    expect(splitQuestionAnswer('Ce este? bila')).toMatchObject({ question: 'Ce este?', answer: 'bila' });
  });
  it('cleans PDF spacing', () => {
    expect(cleanText('a   b  ( c )  3 - 5 ani .')).toBe('a b (c) 3-5 ani.');
  });
});

describe('repairSplitWords', () => {
  const corpus: Record<string, number> = { chimioterapie: 40, chimioterap: 0, ie: 2, este: 900, est: 1, e: 0, de: 3000, del: 9 };
  const freq = (word: string) => corpus[word] ?? 0;

  it('rejoins a word the PDF cut in two, keeping capitalisation and trailing punctuation', () => {
    expect(repairSplitWords('dupa chimioterap ie.', freq).text).toBe('dupa chimioterapie.');
    expect(repairSplitWords('Sunt est e bine', freq).text).toBe('Sunt este bine');
  });

  it('never fuses two real words, nor "a"/"o", nor two abbreviations', () => {
    expect(repairSplitWords('de l', freq).text).toBe('de l');
    expect(repairSplitWords('manifestare a bolii', (w) => (w === 'manifestarea' ? 50 : 0)).text).toBe('manifestare a bolii');
    expect(repairSplitWords('IM A', (w) => (w === 'ima' ? 50 : 0)).text).toBe('IM A');
  });
});

describe('buildFlashcardDeck', () => {
  const parsed = parseKumarText(SAMPLE);

  it('gives every card a unique, deterministic id and a "?"-terminated front', () => {
    const { deck } = buildFlashcardDeck(parsed);
    const again = buildFlashcardDeck(parseKumarText(SAMPLE)).deck;
    expect(deck.questions.map((q) => q.id)).toEqual(again.questions.map((q) => q.id));
    expect(new Set(deck.questions.map((q) => q.id)).size).toBe(deck.questions.length);
    expect(deck.questions.every((q) => /[?:]$/.test(q.text))).toBe(true);
    expect(stableId('x')).toBe(stableId('x'));
  });

  it('prefixes short fronts with their chapter and gives statement cards a chapter-aware stem', () => {
    const { deck } = buildFlashcardDeck(parsed);
    const short = buildFlashcardDeck(parseKumarText(' SEPSIS\n 1.   Sdr Wilson: boala cuprului')).deck;
    expect(short.questions[0].text).toBe('[Sepsis] Sdr Wilson?');
    expect(deck.questions.find((q) => q.text.includes('Semn cheie'))?.text).toBe('Semn cheie al deteriorarii clinice?');
    expect(deck.questions.find((q) => q.options[0].text.startsWith('Edemul'))?.text)
      .toBe('Afirmație adevărată — Echilibru hidro-electrolitic și acido-bazic:');
  });

  it('reuses the ids of the previous deck so study progress stays attached', () => {
    const previous = {
      createdAt: 1,
      questions: [
        { id: 'OLD-1', text: '2.   Semn cheie al deteriorarii clinice?', options: [{ text: 'tahipneea.' }] },
        { id: 'OLD-2', text: 'Completează informația / Afirmație adevărată:', options: [{ text: 'Edemul periferic este datorat VEC expansionat.' }] },
      ],
    };
    const { deck, stats } = buildFlashcardDeck(parsed, previous);
    expect(deck.questions.find((q) => q.text.includes('Semn cheie'))?.id).toBe('OLD-1');
    expect(deck.questions.find((q) => q.options[0].text.startsWith('Edemul'))?.id).toBe('OLD-2');
    expect(stats.reused).toBe(2);
    expect(stats.created).toBe(stats.total - 2);
    expect(deck.createdAt).toBe(1);
  });

  it('is idempotent: rebuilding from its own output changes nothing', () => {
    const first = buildFlashcardDeck(parsed).deck;
    const second = buildFlashcardDeck(parsed, first).deck;
    expect(second.questions.map((q) => q.id)).toEqual(first.questions.map((q) => q.id));
    expect(buildFlashcardDeck(parsed, first).stats.created).toBe(0);
  });
});
