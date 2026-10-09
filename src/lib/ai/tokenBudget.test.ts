import { describe, expect, it } from 'vitest';
import { buildChatSystemPrompt } from '../../ai/AIEngine';
import { buildNumberedContext } from '../../ai/contextBuilder';
import { fitHistoryToBudget } from '../../ai/chatMemory';
import {
  compactOldAssistantTurns,
  createTtlCache,
  describePromptBreakdown,
  estimateTextTokens,
  isNearDuplicate,
  lightModelFor,
  textSimilarity,
} from './tokenBudget';

const paragraph = (seed: string) =>
  `${seed}: fibrilația atrială este cea mai frecventă aritmie susținută; riscul embolic se stratifică prin scorul CHA2DS2-VASc, iar anticoagularea se inițiază la ≥2 puncte la bărbați. ` +
  'Controlul frecvenței cu beta-blocante sau verapamil este preferat la pacienții vârstnici asimptomatici, iar cardioversia necesită anticoagulare prealabilă de trei săptămâni. ';

function chunk(id: number, body: string) {
  return { id: `c${id}`, text: body, source: 'Kumar.pdf', page: 100 + id, heading: `Secțiunea ${id}` };
}

function scenario() {
  const topics = ['stenoza aortică', 'insuficiența mitrală', 'cardiomiopatia hipertrofică', 'pericardita acută', 'endocardita infecțioasă'];
  const chunks = topics.map((topic, n) => chunk(n + 1, Array.from({ length: 5 }, (_, k) => `${topic} (${k}): ${paragraph(topic).replace(/fibrilația atrială/g, topic).replace(/anticoagul\w+/g, `tratament${n}${k}`)} Detaliu ${topic} ${k * 7 + n}.`).join(' ')));
  const context = buildNumberedContext(chunks, 7400).context;
  const history = Array.from({ length: 10 }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: i % 2 === 0 ? 'Explică-mi anticoagularea în fibrilația atrială.' : paragraph(`Răspuns ${i}`).repeat(4),
  }));
  const system = buildChatSystemPrompt(context, { mode: 'grounded', hasContext: true, studyContext: 'Acuratețe 72%, 14 zile serie.' }, 'Cum aleg anticoagulantul?');
  return { system, history, context };
}

describe('tokenBudget', () => {
  it('estimează ~3.2 caractere / token', () => {
    expect(estimateTextTokens('a'.repeat(320))).toBe(100);
    expect(estimateTextTokens('')).toBe(0);
  });

  it('defalcă un prompt realist pe părți și raportează cifrele măsurate', () => {
    const { system, history } = scenario();
    const before = describePromptBreakdown([
      { role: 'system', content: system },
      ...fitHistoryToBudget(history),
      { role: 'user', content: 'Cum aleg anticoagulantul?' },
    ]);
    const after = describePromptBreakdown([
      { role: 'system', content: system },
      ...fitHistoryToBudget(compactOldAssistantTurns(history)),
      { role: 'user', content: 'Cum aleg anticoagulantul?' },
    ]);
    console.info('[tokenBudget] înainte', before, 'după', after);
    expect(before.total).toBe(before.system + before.history + before.context + before.user);
    expect(before.context).toBeGreaterThan(1000);
    expect(before.system).toBeGreaterThan(1000);
    expect(after.history).toBeLessThan(before.history);
    expect(after.context).toBe(before.context);
  });

  it('contextul numerotat respectă plafonul și elimină fragmentele aproape identice', () => {
    const base = paragraph('Același text').repeat(3);
    const dup = base.replace('cea mai frecventă', 'cea mai comună');
    const out = buildNumberedContext([chunk(1, base), chunk(2, dup), chunk(3, paragraph('Alt subiect, cu totul diferit despre insuficiența cardiacă').replace(/fibrilația atrială/g, 'cardiomiopatia dilatativă'))], 7400);
    expect(out.sources).toHaveLength(2);
    expect(out.context.length).toBeLessThanOrEqual(7400);
    expect(estimateTextTokens(out.context)).toBeLessThanOrEqual(2400);
  });

  it('similaritatea separă dublurile de texte diferite', () => {
    expect(textSimilarity('a b c d e f', 'a b c d e f')).toBe(1);
    expect(isNearDuplicate('rinichiul filtrează sângele continuu zilnic', ['inima pompează sângele prin corp'])).toBe(false);
  });

  it('taie doar răspunsurile vechi ale asistentului', () => {
    const long = 'Propoziție. '.repeat(200);
    const turns = Array.from({ length: 8 }, (_, i) => ({ role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant', content: i % 2 ? long : long }));
    const out = compactOldAssistantTurns(turns, 4, 700);
    expect(out[1].content.length).toBeLessThan(720);
    expect(out[0].content).toBe(long); // user neatins
    expect(out[7].content).toBe(long); // recent neatins
  });

  it('modelul mic doar acolo unde există unul cunoscut', () => {
    expect(lightModelFor('groq', 'openai/gpt-oss-120b')).toBe('openai/gpt-oss-20b');
    expect(lightModelFor('google', 'gemini-3.8-flash')).toBeNull();
  });

  it('cache-ul expiră după TTL', () => {
    let t = 0;
    const cache = createTtlCache<number>(1000, 2, () => t);
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    t = 1500;
    expect(cache.get('a')).toBeUndefined();
  });
});
