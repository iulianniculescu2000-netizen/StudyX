import { describe, expect, it, vi } from 'vitest';
import { findPassageCandidates } from '../bookPassage';
import { buildJudgePrompt } from './prompts';
import { classifyAiError, runBookAgentDetailed } from './index';

const IRON = {
  question: 'Un pacient cu anemie feriprivă are Hb 7,5 g/dL. Care este intervenția corectă?',
  answer: 'Fier oral sau intravenos, tratarea cauzei',
  wrongAnswers: ['Transfuzie de masă eritrocitară', 'Vitamina B12'],
};

const SUPPORTS = JSON.stringify({
  verdict: 'supports',
  paragraphs: ['C1.1'],
  highlights: [{ quote: 'Fierul oral este suficient în majoritatea cazurilor.', role: 'answer' }],
  why: 'Cartea recomandă fierul oral.',
});
const isLocate = (prompt: string) => prompt.startsWith('Pregătește căutarea');
const LOCATOR_OK = '{"topic":"anemie feriprivă","terms":["deficit de fier","sideropenie"],"book":"K","chapters":[]}';
const noWait = async () => undefined;
const rateLimit = () => new Error('429 Too Many Requests: limită de cereri depășită');

describe('reziliența la AI (fără rețea, cu `ask` simulat)', () => {
  it('429 la localizator: a doua încercare reușește și pasajul iese verificat', async () => {
    let locateCalls = 0;
    const ask = vi.fn(async (prompt: string) => {
      if (isLocate(prompt)) {
        locateCalls += 1;
        if (locateCalls === 1) throw rateLimit();
        return LOCATOR_OK;
      }
      return SUPPORTS;
    });
    const sleep = vi.fn(noWait);
    const outcome = await runBookAgentDetailed(IRON, ask, { sleep });
    expect(locateCalls).toBe(2);
    expect(sleep).toHaveBeenCalledWith(expect.any(Number));
    expect(outcome).toMatchObject({ aiProblem: null, passage: { verified: true, aiChecked: true, page: 57 } });
  }, 30000);

  it('429 la localizator în ambele încercări: continuă local, iar judecătorul poate totuși verifica', async () => {
    const ask = vi.fn(async (prompt: string) => { if (isLocate(prompt)) throw rateLimit(); return SUPPORTS; });
    const outcome = await runBookAgentDetailed(IRON, ask, { sleep: noWait });
    expect(ask.mock.calls.filter(([prompt]) => isLocate(prompt))).toHaveLength(2);
    expect(outcome.passage).toMatchObject({ verified: true, page: 57 });
    expect(outcome.aiProblem).toBeNull();
  }, 30000);

  it('429 la judecător: potrivire locală clară, marcată fără verificare AI și fără evidențieri inventate', async () => {
    const ask = async (prompt: string) => { if (isLocate(prompt)) return LOCATOR_OK; throw rateLimit(); };
    const outcome = await runBookAgentDetailed(IRON, ask, { sleep: noWait });
    expect(outcome.aiProblem).toBe('rate-limit');
    expect(outcome.passage).toMatchObject({ page: 57, verified: false, aiChecked: false, highlights: [] });
    expect(outcome.passage?.why).toBeUndefined();
  }, 30000);

  it('429 la ambele: tot o potrivire locală, iar cauza AI e raportată', async () => {
    const outcome = await runBookAgentDetailed(IRON, async () => { throw rateLimit(); }, { sleep: noWait });
    expect(outcome.aiProblem).toBe('rate-limit');
    expect(outcome.passage).toMatchObject({ page: 57, verified: false, aiChecked: false });
  }, 30000);

  it('nimic local și localizatorul căzut: fără pasaj, dar cu cauza AI (nu „cartea nu are pasajul”)', async () => {
    const query = { question: 'xyzqwertyuiop blorptastic', answer: 'qwzxqwzx' };
    const outcome = await runBookAgentDetailed(query, async () => { throw rateLimit(); }, { sleep: noWait });
    expect(outcome.passage).toBeNull();
    expect(outcome.aiProblem).toBe('rate-limit'); // localizatorul a căzut și local nu e nimic: „nu am găsit” ar fi nedrept
  }, 30000);

  it('răspuns JSON invalid de la judecător: potrivire locală și cauză „indisponibil”', async () => {
    const ask = async (prompt: string) => (isLocate(prompt) ? LOCATOR_OK : 'Îmi pare rău, nu pot răspunde cu JSON.');
    const outcome = await runBookAgentDetailed(IRON, ask, { sleep: noWait });
    expect(outcome.aiProblem).toBe('unavailable');
    expect(outcome.passage).toMatchObject({ verified: false, aiChecked: false });
  }, 30000);

  it('timeout (eșec lent): nu se mai reîncearcă și se trece la căutarea locală', async () => {
    let clock = 0;
    const ask = vi.fn(async () => { clock += 20_000; throw new Error('timeout'); });
    const outcome = await runBookAgentDetailed(IRON, ask, { sleep: noWait, now: () => clock });
    expect(ask).toHaveBeenCalledTimes(2); // câte una pentru localizator și judecător, fără reîncercări
    expect(outcome.aiProblem).toBe('unavailable');
    expect(outcome.passage).toMatchObject({ verified: false, aiChecked: false });
  }, 30000);

  it('AI-ul care spune „none” nu e o problemă de AI: nu se arată nimic', async () => {
    const ask = async (prompt: string) => (isLocate(prompt) ? 'nimic util' : '{"verdict":"none","paragraphs":[],"highlights":[]}');
    expect(await runBookAgentDetailed(IRON, ask, { sleep: noWait })).toEqual({ passage: null, aiProblem: null });
  }, 30000);

  it('un citat inventat de judecător nu ajunge niciodată în pasaj', async () => {
    const lie = JSON.stringify({ verdict: 'supports', paragraphs: ['C1.1'], highlights: [{ quote: 'Fierul se administrează doar intravenos, indiferent de caz.', role: 'answer' }], why: 'x' });
    const outcome = await runBookAgentDetailed(IRON, async (prompt) => (isLocate(prompt) ? LOCATOR_OK : lie), { sleep: noWait });
    expect(outcome.passage?.highlights).toEqual([]);
  }, 30000);

  it('clasifică erorile: 429 / limită = limită de cereri, restul = indisponibil', () => {
    expect(classifyAiError(new Error('HTTP 429'))).toBe('rate-limit');
    expect(classifyAiError(new Error('RESOURCE_EXHAUSTED'))).toBe('rate-limit');
    expect(classifyAiError(new Error('Failed to fetch'))).toBe('unavailable');
    expect(classifyAiError(new Error('timeout'))).toBe('unavailable');
  });
});

describe('citări: ce primește judecătorul', () => {
  it('pasajul trimis conține capitolul și topicul din plan, iar răspunsul corect și variantele sunt în interogare', async () => {
    const candidates = await findPassageCandidates(IRON);
    const prompt = buildJudgePrompt(IRON, candidates);
    const first = candidates[0].paras[0];
    expect(first.chapter).toBeTruthy();
    expect(prompt).toContain(first.chapter);
    if (first.topic) expect(prompt).toContain(first.topic);
    expect(prompt).toContain('RĂSPUNS CORECT');
    expect(prompt).toContain('VARIANTE GREȘITE');
  }, 30000);
});
