import { describe, expect, it } from 'vitest';
import { findPassageCandidates, foldText, passageFromCandidate, textOfPassage, verifiedQuotes } from './bookPassage';
import { chapterOutline, chapterRanges, pageContext, rangesOfChapters } from './bookKnowledge';

const IRON = {
  question: 'Un pacient cu anemie feriprivă are Hb 7,5 g/dL. Care este intervenția corectă?',
  answer: 'Fier oral sau intravenos, tratarea cauzei',
};

describe('harta cărților (capitole și topicuri din plan)', () => {
  it('știe capitolul și topicul unei pagini din fiecare carte', () => {
    expect(pageContext('K', 6)).toMatchObject({ chapter: expect.stringMatching(/sepsis/i), topic: expect.stringMatching(/Abilități clinice/) });
    expect(pageContext('K', 9999)).toBeUndefined();
  });

  it('listează capitolele pentru localizator și le găsește după număr', () => {
    expect(chapterRanges().length).toBeGreaterThanOrEqual(30);
    expect(chapterOutline().split('\n')[0]).toMatch(/^\d+ \| [KLS] \| .+\(p\. \d+-\d+\)$/);
    const [first] = chapterRanges();
    expect(rangesOfChapters([first.number])).toEqual([first]);
  });
});

describe('findPassageCandidates', () => {
  it('găsește secțiunea de tratament a anemiei feriprive din Kumar, nu o pagină vecină', async () => {
    const [best] = await findPassageCandidates(IRON);
    expect(best.paras[0]).toMatchObject({ book: 'K', page: 57, heading: 'Tratament' });
    expect(best.paras.map((p) => p.text).join(' ')).toMatch(/sulfatul feros/);
    expect(passageFromCandidate(best).chapter).toBeTruthy();
  }, 30000);

  it('face liste din fragmentele scurte de după „:”', async () => {
    const [best] = await findPassageCandidates({ question: 'Care sunt cauzele eșecului tratamentului cu fier oral?', answer: 'lipsa complianței pierderi continue de sânge diagnostic incorect talasemie' });
    const blocks = passageFromCandidate(best).blocks;
    expect(blocks.some((block) => block.kind === 'list' && block.items.some((item) => /complian/.test(item)))).toBe(true);
  }, 30000);

  it('leflunomida din artrita reumatoidă (Kumar p.74-76) ajunge printre candidați, fără ferestre duplicate din aceeași secțiune', async () => {
    const found = await findPassageCandidates({
      question: 'Care este opțiunea de tratament recomandată când metotrexatul nu poate fi utilizat în artrita reumatoidă?',
      answer: 'Leflunomidă sau hidroxiclorochină ca monoterapie',
      explanation: 'Schema prevede leflunomidă sau hidroxiclorochină ca monoterapie când metotrexatul nu poate fi utilizat.',
    }, 5);
    expect(found.some((candidate) => candidate.paras[0].book === 'K' && candidate.paras[0].page >= 74 && candidate.paras[0].page <= 76)).toBe(true);
    const sections = found.map((candidate) => `${candidate.paras[0].book}:${candidate.paras[0].page}:${candidate.paras[0].heading}`);
    expect(new Set(sections).size).toBe(sections.length);
  }, 30000);

  it('capitolele indicate de localizator cresc scorul pasajelor din ele, fără să excludă restul', async () => {
    const chapter = chapterRanges().find((c) => c.book === 'K')!;
    const plain = await findPassageCandidates(IRON, 3);
    const focused = await findPassageCandidates({ ...IRON, focus: [{ book: chapter.book, first: chapter.first, last: chapter.last }] }, 3);
    expect(plain.length).toBeGreaterThan(0);
    expect(focused.length).toBeGreaterThan(0);
  }, 30000);
});

describe('verificarea citatelor', () => {
  it('foldText păstrează lungimea, ca indicii să rămână valabili în textul original', () => {
    const text = 'Țesutul şi ȘTIINȚA îngrijirii';
    expect(foldText(text)).toHaveLength(text.length);
    expect(foldText(text)).toBe('tesutul si stiinta ingrijirii');
  });

  it('citatele inventate se aruncă, cele reale revin cu forma din text', () => {
    const text = 'Fierul oral este suficient în majoritatea cazurilor. Cel mai eficient preparat de fier este sulfatul feros.';
    expect(verifiedQuotes(['fierul oral este suficient in majoritatea cazurilor', 'Fierul se dă mereu intravenos obligatoriu'], text))
      .toEqual(['Fierul oral este suficient în majoritatea cazurilor']);
    expect(textOfPassage({ blocks: [{ kind: 'paragraph', text: 'a' }, { kind: 'list', items: ['b', 'c'] }] })).toBe('a\n\nb\nc');
  });
});
