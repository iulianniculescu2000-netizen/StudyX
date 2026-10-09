/**
 * Citări din cărți: construire, parsare, etichete (pagină tipărită → pagină PDF → titlu) și
 * retrieval pe corpus suprapus (PDF „Capitole întregi” + PDF pe secțiuni), cu scope de capitol.
 */
import { describe, expect, it } from 'vitest';
import { embedTextLocal } from './embeddings';
import { rankChunks, type RankableChunk } from './retriever';
import { buildNumberedContext, formatCitationLabel, parseInlineCitations } from './contextBuilder';

describe('formatCitationLabel', () => {
  it('preferă pagina tipărită și adaugă titlul', () => {
    expect(formatCitationLabel('Kumar.pdf', 1180, 1181, 1136, 'Hipertensiunea arterială')).toBe('Kumar, p. 1136 (Hipertensiunea arterială)');
  });
  it('cade pe pagina PDF, apoi pe interval, apoi doar pe titlu, apoi doar nume', () => {
    expect(formatCitationLabel('Kumar.pdf', 151)).toBe('Kumar, p. 151');
    expect(formatCitationLabel('Kumar.pdf', 151, 153)).toBe('Kumar, p. 151–153');
    expect(formatCitationLabel('Lawrence.pdf', undefined, undefined, undefined, 'Hernii')).toBe('Lawrence (Hernii)');
    expect(formatCitationLabel('Sinopsis.pdf')).toBe('Sinopsis');
  });
  it('scurtează titlurile lungi', () => {
    expect(formatCitationLabel('Kumar', 1, undefined, undefined, 'A'.repeat(120)).length).toBeLessThan(70);
  });
});

describe('buildNumberedContext cu metadate de pagină', () => {
  it('preia pagini plate și din metadata; ignoră valori invalide', () => {
    const { sources, context } = buildNumberedContext(
      [
        { id: 'a', text: 'Alfa despre HTA.', source: 'Kumar.pdf', sourceId: 's1', page: 1180, printedPage: 1136, heading: 'HTA' },
        { id: 'b', text: 'Beta despre FA.', source: 'Kumar.pdf', metadata: { page: 99, pageEnd: 100, printedPage: 55 }, heading: 'FA' },
        { id: 'c', text: 'Gama fără pagini.', source: 'Note.docx', page: -3 },
      ],
      3000,
    );
    expect(sources[0]).toMatchObject({ n: 1, sourceId: 's1', page: 1180, printedPage: 1136, label: 'Kumar, p. 1136 (HTA)' });
    expect(sources[1]).toMatchObject({ page: 99, pageEnd: 100, printedPage: 55 });
    expect(sources[2].page).toBeUndefined();
    expect(sources[2].label).toBe('Note');
    expect(context).toContain('[1] Kumar · pag. 1136 — HTA');
  });
  it('păstrează bugetul de caractere', () => {
    const big = 'Propoziție medicală lungă. '.repeat(100);
    const { context } = buildNumberedContext([1, 2, 3].map((i) => ({ id: `c${i}`, text: `${big}${i}`, source: 'Kumar.pdf', page: i })), 3500);
    expect(context.length).toBeLessThanOrEqual(3500);
  });
});

describe('parseInlineCitations', () => {
  const sources = [{ n: 1 }, { n: 2 }, { n: 3 }];
  it('acceptă liste și intervale, lasă text n inexistent', () => {
    const segs = parseInlineCitations('A [1], B [2, 3], C [1-2], D [7], cod x[1](y)', sources);
    const cites = segs.filter((s) => s.type === 'cite').map((s) => (s.type === 'cite' ? s.numbers : []));
    expect(cites).toEqual([[1], [2, 3], [1, 2], [1]]);
    expect(segs.map((s) => (s.type === 'text' ? s.text : s.raw)).join('')).toBe('A [1], B [2, 3], C [1-2], D [7], cod x[1](y)');
  });
});

function chunk(id: string, text: string, extra: Partial<RankableChunk> = {}): RankableChunk {
  return { id, text, topic: id, source: 'Kumar.pdf', difficulty: 'medium', embedding: embedTextLocal(text), ...extra };
}
const HTA = 'Hipertensiunea arterială se tratează cu IECA sau blocante ale canalelor de calciu, ținta fiind TA sub 130/80 mmHg la pacientul diabetic. Modificarea stilului de viață rămâne prima măsură.';
const HTA_COPY = 'Hipertensiunea arterială se tratează cu IECA sau blocante ale canalelor de calciu, ținta fiind TA sub 130/80 mmHg la pacientul diabetic. Modificarea stilului de viață rămâne prima măsură';
const FA = 'Fibrilația atrială (FA) impune anticoagulare orală după scorul CHA2DS2-VASc, plus controlul frecvenței cu beta-blocante.';
const IC = 'Insuficiența cardiacă (IC) cu fracție de ejecție redusă se tratează cu IECA, beta-blocante și antagoniști ai aldosteronului.';

describe('retrieval pe surse suprapuse', () => {
  const corpus: RankableChunk[] = [
    chunk('cap-hta', HTA, { sourceId: 'cap', source: 'Kumar Capitole Intregi.pdf', heading: 'Hipertensiunea arterială', page: 12 }),
    chunk('sec-hta', HTA_COPY, { sourceId: 'sec', source: 'Kumar Hipertensiune.pdf', heading: 'Hipertensiunea arterială', page: 3, printedPage: 1136 }),
    chunk('fa', FA, { sourceId: 'cap', heading: 'Aritmii', page: 40 }),
    chunk('ic', IC, { sourceId: 'cap', heading: 'Insuficiența cardiacă', page: 70 }),
  ];
  const run = (query: string, filters = {}) => rankChunks(query, corpus, embedTextLocal(query), null, 4, filters);

  it('dedupe: același text din două PDF-uri apare o singură dată', () => {
    const ids = run('tratamentul hipertensiunii arteriale IECA').map((r) => r.id);
    expect(ids.filter((id) => id === 'cap-hta' || id === 'sec-hta')).toHaveLength(1);
  });

  it('dedupe și fără MMR; preferă exemplarul cu pagină tipărită la scor egal', () => {
    const ids = run('tratamentul hipertensiunii arteriale IECA', { diversify: false }).map((r) => r.id);
    expect(ids.filter((id) => id.endsWith('-hta'))).toHaveLength(1);
    const kept = run('tratamentul hipertensiunii arteriale IECA', { diversify: false }).find((r) => r.id.endsWith('-hta'));
    expect(kept).toBeDefined();
    expect(kept?.page).toBeDefined();
  });

  it('abrevieri: FA și IC regăsesc textul cu forma completă', () => {
    expect(run('anticoagulare în FA')[0].id).toBe('fa');
    expect(run('tratament IC')[0].id).toBe('ic');
    expect(run('ținta TA la diabetic')[0].id.endsWith('-hta')).toBe(true);
  });

  it('scope de capitol/pagini urcă chunk-ul din zona activă fără a exclude restul', () => {
    const query = 'tratament IECA beta-blocante';
    const mk = (id: string, heading: string, page: number, text: string) => chunk(id, text, { sourceId: 'a', heading, page });
    const near = [
      mk('y1', 'Aritmii', 10, 'IECA și beta-blocante în tratamentul cardiac: indicații generale pentru pacienții cronici cu risc.'),
      mk('y2', 'Insuficiența cardiacă', 70, 'IECA și beta-blocante în tratamentul cardiac: indicații pentru insuficiență, cu titrare lentă a dozei.'),
    ];
    const byHeading = rankChunks(query, near, embedTextLocal(query), null, 2, { diversify: false, activeScope: { headings: ['Insuficiența cardiacă'] } });
    expect(byHeading[0].id).toBe('y2');
    const byPages = rankChunks(query, near, embedTextLocal(query), null, 2, { diversify: false, activeScope: { pageStart: 68, pageEnd: 75, sourceId: 'a' } });
    expect(byPages[0].id).toBe('y2');
    const other = rankChunks(query, near, embedTextLocal(query), null, 2, { diversify: false, activeScope: { headings: ['Aritmii'] } });
    expect(other[0].id).toBe('y1');
  });
});
