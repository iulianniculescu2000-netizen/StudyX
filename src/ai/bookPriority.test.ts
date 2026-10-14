/**
 * Întâietatea cărților de bază în Rezidențiat: bonus moderat, cotă minimă, antete de nivel și `tier` în citări.
 */
import { describe, expect, it } from 'vitest';
import { applyBookQuota, BOOK_MIN_SLOTS, BOOK_SCORE_BONUS, rankChunks, type RankableChunk } from './retriever';
import { buildNumberedContext } from './contextBuilder';
import { diversifyChunks } from '../components/ai-chat/chatHelpers';
import { citationFromSource } from '../components/ai-chat/citations';
import { BUNDLED_BOOK_NAMES } from '../lib/bundledBookNames';
import type { RetrievedChunk } from './types';

const KUMAR = BUNDLED_BOOK_NAMES.kumar;
const NO_EMBEDDING: number[] = [];

function chunk(id: string, source: string, text: string, extra: Partial<RankableChunk> = {}): RankableChunk {
  return { id, source, text, topic: 'cardiologie', embedding: NO_EMBEDDING, sourceId: source, ...extra };
}

const QUERY = 'fibrilatie atriala anticoagulare risc embolic';
const GOOD = 'Fibrilatia atriala impune anticoagulare pentru reducerea riscului embolic la pacientii cu scor CHA2DS2-VASc crescut.';
/** Variante cu același conținut esențial, dar suficient de diferite ca să nu fie tratate drept dublură. */
const TAILS = [
  'Warfarina necesita INR monitorizat lunar.', 'Apixabanul se dozeaza redus la varstnici fragili.', 'Rivaroxabanul se administreaza seara cu masa.',
  'Dabigatranul are antidot specific idarucizumab.', 'Edoxabanul scade riscul hemoragiei intracraniene.', 'Heparina fractionata ramane optiune la gravide.',
  'Ablatia cateter evita recurenta simptomatica.', 'Cardioversia electrica urmeaza unei anticoagulari corecte.',
];
const variant = (i: number) => `${GOOD} ${TAILS[i % TAILS.length]}`;
const WEAKER = 'Anticoagularea se discuta si in fibrilatia atriala, alaturi de alte masuri generale de prevenție.';

/** Fragmente fără legătură cu interogarea: fără ele, IDF-ul pe un corpus de 2-3 fragmente e prea mic ca să treacă pragul. */
const FILLER = Array.from({ length: 14 }, (_, i) => chunk(`f${i}`, 'Diverse.pdf', `Pisica numarul ${i} a sarit gardul si a fugit prin gradina vecinului dupa-amiaza, ${['marti', 'miercuri', 'joi', 'vineri'][i % 4]}.`));

describe('clasare cu întâietatea cărților (scop Rezidențiat)', () => {
  it('scopul general rămâne neschimbat: fără bonus și fără nivel pe materiale', () => {
    const chunks = [...FILLER, chunk('m', 'Note.pdf', variant(1)), chunk('b', KUMAR, variant(2))];
    const plain = rankChunks(QUERY, chunks, NO_EMBEDDING, null, 5, { diversify: false });
    const boosted = rankChunks(QUERY, chunks, NO_EMBEDDING, null, 5, { diversify: false, rezidentiat: true });
    const score = (list: RetrievedChunk[], id: string) => list.find((r) => r.id === id)!.score;
    expect(score(plain, 'm')).toBeCloseTo(score(boosted, 'm'), 10);
    expect(score(boosted, 'b') / score(plain, 'b')).toBeCloseTo(BOOK_SCORE_BONUS, 8);
    expect(plain.find((r) => r.id === 'm')?.tier).toBeUndefined();
    expect(plain.find((r) => r.id === 'b')?.tier).toBe('book');
  });

  it('în Rezidențiat o carte primește bonus moderat și nivelul „book”; materialul primește „bank”', () => {
    const chunks = [...FILLER, chunk('m', 'Note.pdf', variant(1)), chunk('b', KUMAR, variant(5))];
    const ranked = rankChunks(QUERY, chunks, NO_EMBEDDING, null, 5, { diversify: false, rezidentiat: true });
    expect(ranked[0].id).toBe('b');
    expect(ranked[0].tier).toBe('book');
    expect(ranked[1].tier).toBe('bank');
    expect(BOOK_SCORE_BONUS).toBeLessThanOrEqual(1.3);
  });

  it('bonusul nu îneacă un material mult mai relevant', () => {
    const chunks = [...FILLER, chunk('m', 'Note.pdf', variant(1)), chunk('b', KUMAR, 'Chirurgia hernială folosește plase sintetice la reparația defectelor parietale mari.')];
    const ranked = rankChunks(QUERY, chunks, NO_EMBEDDING, null, 5, { diversify: false, rezidentiat: true });
    expect(ranked[0].id).toBe('m');
  });

  it('cota: dacă o carte are fragment relevant, primele locuri sunt din cărți chiar când materialele scorează mai sus', () => {
    const materials = Array.from({ length: 6 }, (_, i) => chunk(`m${i}`, `Note${i}.pdf`, variant(i), { heading: `Capitol ${i}` }));
    const books = [chunk('b1', KUMAR, WEAKER), chunk('b2', BUNDLED_BOOK_NAMES.lawrence, 'Riscul embolic in fibrilatia atriala post-operatorie impune anticoagulare dupa interventia chirurgicala.')];
    const ranked = rankChunks(QUERY, [...FILLER, ...materials, ...books], NO_EMBEDDING, null, 5, { diversify: false, rezidentiat: true });
    expect(ranked.slice(0, 2).map((r) => r.tier)).toEqual(['book', 'book']);
    expect(ranked).toHaveLength(5);
  });

  it('fără fragmente relevante în cărți, cota nu inventează nimic', () => {
    const chunks = [...FILLER, chunk('m1', 'Note.pdf', variant(1)), chunk('b', KUMAR, 'Pisica a sarit gardul in gradina vecinului.')];
    const ranked = rankChunks(QUERY, chunks, NO_EMBEDDING, null, 5, { diversify: false, rezidentiat: true });
    expect(ranked.map((r) => r.id)).toEqual(['m1']);
  });

  it('applyBookQuota: cel mult BOOK_MIN_SLOTS cărți în față, lungimea nu depășește k', () => {
    const mk = (id: string, tier: 'book' | 'bank', score: number) => ({ id, tier, score, text: id, topic: '', source: id, difficulty: 'medium', keywordScore: 0, semanticScore: 0, recencyBoost: 0, weaknessBoost: 0 }) as RetrievedChunk;
    const selected = [mk('m1', 'bank', 9), mk('m2', 'bank', 8), mk('m3', 'bank', 7), mk('m4', 'bank', 6)];
    const books = [mk('b1', 'book', 5), mk('b2', 'book', 4), mk('b3', 'book', 3), mk('b4', 'book', 2)];
    const out = applyBookQuota(selected, [...selected, ...books], 4);
    expect(out).toHaveLength(4);
    expect(out.slice(0, BOOK_MIN_SLOTS).every((r) => r.tier === 'book')).toBe(true);
    expect(out[BOOK_MIN_SLOTS].id).toBe('m1');
  });
});

describe('antete de nivel în context și `tier` în citări', () => {
  const book = { id: 'b', source: KUMAR, sourceId: 'sk', text: 'Fibrilatia atriala se trateaza cu anticoagulare.', page: 75, printedPage: 75, tier: 'book' as const, score: 1 };
  const material = { id: 'm', source: 'Cardio note.pdf', sourceId: 'sm', text: 'Altceva despre ritm cardiac si tratament.', tier: 'bank' as const, score: 0.8 };

  it('antetul spune nivelul: „[CARTE DE BAZĂ · carte p.75]” și „[MATERIAL · nume]”', () => {
    const { context, sources } = buildNumberedContext([book, material], 4000);
    expect(context).toContain('[1] [CARTE DE BAZĂ · Kumar și Clark – Medicină Clinică p.75]');
    expect(context).toContain('[2] [MATERIAL · Cardio note]');
    expect(sources.map((s) => s.tier)).toEqual(['book', 'bank']);
  });

  it('fără nivel (scop general) antetul rămâne cel vechi și sursa nu are `tier`', () => {
    const { context, sources } = buildNumberedContext([{ ...book, tier: undefined }], 4000);
    expect(context).toContain('[1] Kumar și Clark – Medicină Clinică · pag. 75');
    expect(context).not.toContain('CARTE DE BAZĂ');
    expect('tier' in sources[0]).toBe(false);
  });

  it('citarea din UI poartă `tier`', () => {
    const { sources } = buildNumberedContext([book, material], 4000);
    expect(citationFromSource(sources[0]).tier).toBe('book');
    expect(citationFromSource(sources[1]).tier).toBe('bank');
  });

  it('diversifyChunks nu coboară cărțile sub materiale', () => {
    const items = [
      { source: 'K', score: 3, tier: 'book' }, { source: 'K', score: 2.9, tier: 'book' },
      { source: 'A', score: 2.8, tier: 'bank' }, { source: 'B', score: 2.7, tier: 'bank' }, { source: 'C', score: 2.6, tier: 'bank' },
    ];
    const out = diversifyChunks(items, 5);
    expect(out.slice(0, 2).map((x) => x.tier)).toEqual(['book', 'book']);
    expect(out).toHaveLength(5);
  });
});
