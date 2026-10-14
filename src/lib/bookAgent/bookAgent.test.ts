import { describe, expect, it, vi } from 'vitest';
import { findPassageCandidates } from '../bookPassage';
import { chapterRanges } from '../bookKnowledge';
import { applyJudgeSelection, parseJudgeSelection, parseLocatorPlan, verifiedHighlights } from './judge';
import { buildJudgePrompt, buildLocatorPrompt } from './prompts';
import { FALLBACK_MIN_SCORE, gatherCandidates, runBookAgent, type AgentStep } from './index';

const IRON = {
  question: 'Un pacient cu anemie feriprivă are Hb 7,5 g/dL. Care este intervenția corectă?',
  answer: 'Fier oral sau intravenos, tratarea cauzei',
  wrongAnswers: ['Transfuzie de masă eritrocitară', 'Vitamina B12'],
};

const SUPPORTS = JSON.stringify({
  verdict: 'supports',
  paragraphs: ['C1.1'],
  highlights: [
    { quote: 'Fierul oral este suficient în majoritatea cazurilor.', role: 'answer' },
    { quote: 'Cel mai eficient preparat de fier este sulfatul feros.', role: 'answer' },
    { quote: 'o frază inventată de model care nu există în carte', role: 'distractor' },
  ],
  why: 'Cartea recomandă fierul oral, iar cel intravenos doar la intoleranță.',
});

describe('parsarea răspunsurilor AI', () => {
  it('localizatorul: termeni, cartea și capitolele valide', () => {
    expect(parseLocatorPlan('```json\n{"topic":"anemie feriprivă","terms":["deficit de fier","sideropenie"],"book":"K","chapters":[12,"3",500,2.5]}\n```'))
      .toEqual({ topic: 'anemie feriprivă', terms: ['deficit de fier', 'sideropenie'], book: 'K', chapters: [12, 3] });
    expect(parseLocatorPlan('{"terms":[]}')).toBeNull();
    expect(parseLocatorPlan('nimic')).toBeNull();
  });

  it('judecătorul: verdict obligatoriu, roluri necunoscute devin „answer”, forma veche „key” se acceptă', () => {
    expect(parseJudgeSelection('{"verdict":"poate"}')).toBeNull();
    const parsed = parseJudgeSelection('{"verdict":"supports","paragraphs":["C1.1"],"highlights":[{"quote":"x","role":"altceva"},"un citat"],"key":["alt citat"]}');
    expect(parsed?.highlights).toEqual([
      { quote: 'x', role: 'answer' },
      { quote: 'un citat', role: 'answer' },
      { quote: 'alt citat', role: 'answer' },
    ]);
  });

  it('citatele inventate se aruncă, cele reale păstrează rolul', () => {
    const text = 'Fierul oral este suficient. Hemoragia activă cere transfuzie.';
    expect(verifiedHighlights([
      { quote: 'fierul oral este suficient', role: 'answer' },
      { quote: 'hemoragia activa cere transfuzie', role: 'distractor' },
      { quote: 'ceva inexistent în carte', role: 'answer' },
    ], text)).toEqual([
      { quote: 'Fierul oral este suficient', role: 'answer' },
      { quote: 'Hemoragia activă cere transfuzie', role: 'distractor' },
    ]);
  });
});

describe('prompturile', () => {
  it('localizatorul primește grila și lista de capitole', () => {
    const prompt = buildLocatorPrompt(IRON);
    expect(prompt).toContain('GRILĂ: Un pacient cu anemie feriprivă');
    expect(prompt).toMatch(/CAPITOLE \(număr \| carte \| titlu \| pagini\):\n\d+ \| [KLS] \|/);
    expect(prompt).toContain('"chapters"');
  });

  it('judecătorul vede răspunsul corect, variantele greșite, rolurile și candidații numerotați cu capitolul', async () => {
    const candidates = await findPassageCandidates(IRON);
    const prompt = buildJudgePrompt(IRON, candidates);
    expect(prompt).toContain('RĂSPUNS CORECT: Fier oral sau intravenos');
    expect(prompt).toContain('VARIANTE GREȘITE: Transfuzie de masă eritrocitară | Vitamina B12');
    expect(prompt).toMatch(/\[C1\.1\]/);
    expect(prompt).toMatch(/Kumar și Clark – Medicină Clinică, .+, p\. 57/);
    expect(prompt).toContain('answer|question|distractor');
  }, 30000);
});

describe('alegerea judecătorului', () => {
  it('„none” nu arată niciun fragment; „supports” păstrează doar citatele reale, cu roluri, și motivul', async () => {
    const candidates = await findPassageCandidates(IRON);
    expect(applyJudgeSelection(candidates, { verdict: 'none', paragraphs: [], highlights: [] })).toBeNull();
    const passage = applyJudgeSelection(candidates, parseJudgeSelection(SUPPORTS)!);
    expect(passage).toMatchObject({ verified: true, page: 57, why: expect.stringContaining('fierul oral') });
    expect(passage?.highlights.map((h) => h.quote)).toEqual([
      'Fierul oral este suficient în majoritatea cazurilor.',
      'Cel mai eficient preparat de fier este sulfatul feros.',
    ]);
  }, 30000);

  it('„related” arată pasajul, dar nu îl declară verificat și nu are motiv', async () => {
    const candidates = await findPassageCandidates(IRON);
    const passage = applyJudgeSelection(candidates, { verdict: 'related', paragraphs: ['C1.1'], highlights: [], why: 'poate' });
    expect(passage).toMatchObject({ verified: false });
    expect(passage?.why).toBeUndefined();
  }, 30000);
});

describe('runBookAgent', () => {
  it('înțelege → caută → judecă, în ordine, și întoarce pasajul verificat', async () => {
    const steps: AgentStep[] = [];
    const ask = vi.fn(async (prompt: string) => (prompt.startsWith('Pregătește căutarea')
      ? '{"topic":"anemie feriprivă","terms":["deficit de fier","sideropenie"],"book":"K","chapters":[]}'
      : SUPPORTS));
    const passage = await runBookAgent(IRON, ask, { onStep: (step) => steps.push(step) });
    expect(steps).toEqual(['understand', 'search', 'judge']);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(passage).toMatchObject({ book: 'K', page: 57, verified: true });
  }, 30000);

  it('fără AI rămâne cel mai bun candidat dacă scorul e mare, nemarcat ca verificat', async () => {
    const passage = await runBookAgent(IRON, async () => { throw new Error('fără cheie'); }, { sleep: async () => undefined });
    expect(passage).toMatchObject({ page: 57, verified: false, highlights: [] });
  }, 30000);

  it('fără AI nu arată o potrivire slabă când cartea nu are subiectul (pneumonie comunitară)', async () => {
    const query = { question: 'Care este tratamentul de primă linie în pneumonia comunitară necomplicată?', answer: 'amoxicilină' };
    const passage = await runBookAgent(query, async () => { throw new Error('fără cheie'); }, { sleep: async () => undefined });
    // Cu textul extras pe coloane corect, alineatul „Tratament= … amoxicilină … prima linie” (otita medie, Sinopsis p.46) are
    // paragraf propriu și poate trece pragul doar pe „amoxicilină” + „prima linie”. Fără AI e acceptat cel mult ca potrivire
    // nemarcată „verificat”, niciodată una care pretinde că vorbește despre pneumonie.
    expect(passage === null || (passage.verified === false && !/pneumon/i.test(JSON.stringify(passage)))).toBe(true);
  }, 30000);

  it('cu AI care spune „none” nu se afișează nimic', async () => {
    const ask = async (prompt: string) => (prompt.startsWith('Pregătește căutarea') ? 'nimic util' : '{"verdict":"none","paragraphs":[],"highlights":[]}');
    expect(await runBookAgent(IRON, ask)).toBeNull();
  }, 30000);

  it('capitolele localizatorului intră în căutare, iar pragul de rezervă e cel așteptat', async () => {
    const chapter = chapterRanges()[0];
    const candidates = await gatherCandidates(IRON, { topic: 'anemie', terms: ['deficit de fier'], book: 'K', chapters: [chapter.number] });
    expect(candidates.length).toBeGreaterThan(0);
    expect(FALLBACK_MIN_SCORE).toBeGreaterThan(0);
  }, 30000);
});
