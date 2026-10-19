/**
 * Calitatea retrieval-ului pe un corpus mic, sintetic, medical (RO). Fără rețea, fără IndexedDB:
 * `rankChunks` e pur, iar vectorii sunt cei locali (hash) — exact ce primește un utilizator fără cheie Google.
 * „Înainte" = vechea cale `searchVault` (cosinus pur); „după" = calea hibridă din retriever.
 */
import { describe, expect, it } from 'vitest';
import { cosineSimilarity, embedTextLocal } from './embeddings';
import { rankChunks, type RankableChunk } from './retriever';
import { expandMedicalQuery, normalizeSearchText } from './medicalSynonyms';
import { stemRo, tokenizeForSearch } from './searchText';
import { buildNumberedContext, parseInlineCitations, truncateAtBoundary } from './contextBuilder';
import { assignPagesToChunks, extractPageMap, pageMarker } from './pageMarkers';

function chunk(id: string, text: string, extra: Partial<RankableChunk> = {}): RankableChunk {
  return { id, text, topic: extra.topic ?? id, source: 'Kumar.pdf', difficulty: 'medium', embedding: embedTextLocal(text), ...extra };
}

const CORPUS: RankableChunk[] = [
  chunk('ic-trat', 'Tratamentul insuficienței cardiace cronice cu fracție de ejecție redusă include IECA, beta-blocante, antagoniști ai receptorilor de mineralocorticoizi și inhibitori SGLT2. Diureticele ameliorează simptomele congestive.', { heading: 'Insuficiența cardiacă', page: 151 }),
  chunk('ic-diag', 'Diagnosticul IC se pune pe dispnee, edeme și ortopnee, confirmate prin ecocardiografie și NT-proBNP crescut. Fracția de ejecție a ventriculului stâng clasifică forma de boală.', { heading: 'Insuficiența cardiacă', page: 149 }),
  chunk('hta-def', 'HTA se definește prin valori ale tensiunii arteriale peste 140/90 mmHg la cabinet, confirmate la măsurători repetate. Hipertensiunea arterială esențială reprezintă majoritatea cazurilor.', { heading: 'Hipertensiunea arterială', page: 201 }),
  chunk('hta-trat', 'Tratamentul hipertensiunii arteriale începe cu modificarea stilului de viață, apoi IECA sau blocante ale canalelor de calciu, diuretice tiazidice. Ținta tensională este sub 130/80 la diabetici.', { heading: 'Hipertensiunea arterială', page: 205 }),
  chunk('ima', 'Infarctul miocardic acut cu supradenivelare de ST impune reperfuzie în primele 120 de minute: angioplastie primară sau tromboliză. Troponina crește, durerea toracică depășește 20 de minute.', { heading: 'Sindroame coronariene acute', page: 120 }),
  chunk('dz', 'Diabetul zaharat de tip 2 se caracterizează prin insulinorezistență. Diagnosticul: glicemie à jeun peste 126 mg/dl sau HbA1c peste 6,5%. Metforminul este tratamentul de primă linie.', { heading: 'Diabetul zaharat', page: 310 }),
  chunk('bpoc', 'BPOC se diagnostichează prin spirometrie: raport VEMS/CVF sub 0,70 postbronhodilatator. Tratamentul include bronhodilatatoare cu durată lungă de acțiune și renunțarea la fumat.', { heading: 'Bronhopneumopatia obstructivă cronică', page: 260 }),
  chunk('avc', 'Accidentul vascular cerebral ischemic se tratează prin tromboliză intravenoasă în fereastra de 4,5 ore de la debut. Examenul CT exclude hemoragia intracerebrală.', { heading: 'Boli cerebrovasculare', page: 410 }),
  chunk('fa', 'Fibrilatia atriala impune anticoagulare orală pe baza scorului CHA2DS2-VASc, pentru reducerea riscului embolic. Controlul frecvenței folosește beta-blocante sau verapamil.', { heading: 'Aritmii', page: 98 }),
  chunk('pisica', 'Pisica a sărit gardul și a fugit prin grădina vecinului în după-amiaza aceea, fără să se uite înapoi.', { heading: 'Fragment literar' }),
  chunk('anat', 'Ficatul are opt segmente funcționale Couinaud; vascularizația este dublă, prin artera hepatică și vena portă.', { heading: 'Anatomie', page: 33 }),
  // Aproape-dubluri ale tratamentului IC (altă ediție / pagină repetată)
  chunk('ic-trat-dup1', 'Tratamentul insuficienței cardiace cronice cu fracție de ejecție redusă include IECA, beta-blocante, antagoniști ai receptorilor de mineralocorticoizi și inhibitori SGLT2. Diureticele ameliorează simptomele.', { heading: 'Insuficiența cardiacă', page: 152 }),
  chunk('ic-trat-dup2', 'Tratamentul insuficienței cardiace cronice cu fracție de ejecție redusă include IECA, beta-blocante, antagoniști de mineralocorticoizi și inhibitori SGLT2; diureticele ameliorează simptomele congestive.', { heading: 'Insuficiența cardiacă', page: 153 }),
];

function rank(query: string, k: number, diversify = true) {
  return rankChunks(query, CORPUS, embedTextLocal(query), null, k, { diversify }).map((r) => r.id);
}

/** Vechea cale: cosinus pur pe vectorii locali. */
function cosineOnly(query: string, k: number) {
  const q = embedTextLocal(query);
  return CORPUS.map((c) => ({ id: c.id, score: cosineSimilarity(q, c.embedding) }))
    .sort((a, b) => b.score - a.score).slice(0, k).map((e) => e.id);
}

function precisionAtK(returned: string[], relevant: Set<string>, k: number) {
  const top = returned.slice(0, k);
  return top.filter((id) => relevant.has(id)).length / k;
}

const QUERIES: Array<{ q: string; relevant: string[] }> = [
  { q: 'tratament IC', relevant: ['ic-trat', 'ic-trat-dup1', 'ic-trat-dup2'] },
  { q: 'HTA tratament', relevant: ['hta-trat', 'hta-def'] },
  { q: 'diagnostic DZ tip 2', relevant: ['dz'] },
  { q: 'BPOC spirometrie', relevant: ['bpoc'] },
  { q: 'AVC tromboliza', relevant: ['avc'] },
  { q: 'fibrilație atrială anticoagulare', relevant: ['fa'] },
  { q: 'IMA reperfuzie', relevant: ['ima'] },
];

describe('precizie top-k: cosinus pur (înainte) vs. hibrid (după)', () => {
  it('hibridul nu e mai slab și e clar mai bun la interogări cu abrevieri', () => {
    let before = 0;
    let after = 0;
    const rows: string[] = [];
    for (const { q, relevant } of QUERIES) {
      const set = new Set(relevant);
      const k = Math.min(3, relevant.length) || 1;
      const b = precisionAtK(cosineOnly(q, k), set, k);
      const a = precisionAtK(rank(q, k, false), set, k);
      before += b;
      after += a;
      rows.push(`${q.padEnd(34)} before=${b.toFixed(2)} after=${a.toFixed(2)}`);
    }
    const n = QUERIES.length;
    console.info(`[rag] precision@k mediu: înainte=${(before / n).toFixed(3)} după=${(after / n).toFixed(3)}\n${rows.join('\n')}`);
    expect(after).toBeGreaterThanOrEqual(before);
    expect(after / n).toBeGreaterThanOrEqual(0.85);
  });

  it('găsește fragmentul corect fără diacritice și cu abreviere în interogare', () => {
    expect(rank('fibrilatie atriala anticoagulare', 1)[0]).toBe('fa');
    expect(rank('fibrilație atrială anticoagulare', 1)[0]).toBe('fa');
    expect(rank('IC', 3)).toEqual(expect.arrayContaining(['ic-diag']));
  });

  it('un termen din altă lume nu aduce nimic (prag), iar întrebarea nu e salvată de abreviere', () => {
    expect(rank('quasar neutrinic galactic', 5)).toEqual([]);
  });
});

describe('diversitate (MMR)', () => {
  it('nu întoarce trei chunk-uri aproape identice când există alt aspect al aceluiași subiect', () => {
    const plain = rank('insuficiență cardiacă', 3, false);
    const diverse = rank('insuficiență cardiacă', 3, true);
    const dupIds = new Set(['ic-trat', 'ic-trat-dup1', 'ic-trat-dup2']);
    expect(plain.filter((id) => dupIds.has(id)).length).toBeGreaterThanOrEqual(2);
    // Primele două locuri: un fragment de tratament + celălalt aspect (diagnosticul), nu două dubluri.
    expect(diverse.slice(0, 2).filter((id) => dupIds.has(id)).length).toBe(1);
    expect(plain.filter((id) => dupIds.has(id)).length).toBe(3);
    expect(diverse).toContain('ic-diag');
  });
});

describe('expandarea abrevierilor și normalizarea', () => {
  it('abreviere → formă completă și invers; 2 litere doar cu majuscule', () => {
    expect(expandMedicalQuery('tratament HTA').phrases).toContain('hipertensiune arteriala');
    expect(expandMedicalQuery('IC acut').phrases).toContain('insuficienta cardiaca');
    expect(expandMedicalQuery('ic acut').phrases).toEqual([]);
    expect(expandMedicalQuery('insuficiență cardiacă cronică').phrases).toContain('ic');
    expect(expandMedicalQuery('Insuficienta cardiaca congestiva').phrases).toContain('icc');
    expect(expandMedicalQuery('fibrilație atrială').phrases).toContain('fibrilatie auriculara');
    expect(expandMedicalQuery('tema de mâine').phrases).toEqual([]);
  });

  it('sinonimele se potrivesc și pe forme flexionate („anemiei feriprive” → „deficit de fier”)', () => {
    expect(expandMedicalQuery('Care e managementul anemiei feriprive?').phrases).toContain('deficit de fier');
    expect(expandMedicalQuery('anemia sideropenică').phrases).toContain('anemie feripriva');
    expect(expandMedicalQuery('fibrilației atriale').phrases).toContain('fibrilatie auriculara');
    expect(expandMedicalQuery('tratamentul chirurgical al acalaziei').phrases).toContain('achalazie');
    expect(expandMedicalQuery('managementul anemiei').phrases).toContain('tratament');
    // Kumar tratează tema sub „deficit de fier”: pagina de tratament trebuie să vină înaintea unei mențiuni în treacăt.
    const corpus = [
      chunk('fier-trat', 'Gestionarea corectă a deficitului de fier constă în tratarea cauzei și administrarea preparatelor de fier oral.', { page: 57 }),
      chunk('koilon', 'Semnele specifice includ koilonichia, care apare în anemia feriprivă de lungă durată, și icterul din anemia hemolitică.', { page: 52 }),
      chunk('ic', CORPUS[0].text, { page: 151 }),
    ];
    const query = 'Care e managementul anemiei feriprive?';
    const ids = rankChunks(query, corpus, embedTextLocal(query), null, 3, { diversify: false }).map((r) => r.id);
    expect(ids).toContain('fier-trat');
  });

  it('ICC nu e confundat cu IC la forma completă', () => {
    const phrases = expandMedicalQuery('insuficiență cardiacă congestivă').phrases;
    expect(phrases).toContain('icc');
  });

  it('normalizează diacriticele (ș/ț cu virgulă și cu sedilă)', () => {
    expect(normalizeSearchText('Ștefan Țepeș')).toBe('stefan tepes');
    expect(normalizeSearchText('ştefan ţepes')).toBe('stefan tepes');
  });

  it('tokenizarea stemează terminațiile și păstrează abrevierile scurte', () => {
    expect(stemRo('fibrilatia')).toBe(stemRo('fibrilatie'));
    expect(stemRo('atriala')).toBe(stemRo('atriale'));
    expect(tokenizeForSearch('IC și DZ în HTA')).toEqual(['ic', 'dz', 'hta']);
    expect(tokenizeForSearch('ic')).toEqual([]);
    // Cererea despre sursă nu e subiect: „după Kumar, dă-mi și pagina” nu trebuie să dilueze potrivirea.
    expect(tokenizeForSearch('anemia feriprivă după Kumar, dă-mi și pagina din carte')).toEqual(tokenizeForSearch('anemia feriprivă'));
  });
});

describe('tăiere pe propoziție și context numerotat', () => {
  const text = 'Prima propoziție despre tratament este completă. A doua propoziție continuă cu detalii importante despre doze. A treia nu mai încape deloc în buget.';

  it('taie la capăt de propoziție, nu în mijlocul cuvântului', () => {
    const cut = truncateAtBoundary(text, 100);
    expect(cut.endsWith('.')).toBe(true);
    expect(text.startsWith(cut)).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(100);
  });

  it('nu consideră „Fig." sfârșit de propoziție', () => {
    const t = 'Mecanismul este ilustrat în Fig. 3 din capitolul anterior și detaliat mai jos pentru cititor atent.';
    const cut = truncateAtBoundary(t, 40);
    expect(cut.endsWith('Fig.')).toBe(false);
  });

  it('preferă paragraful când există', () => {
    const t = `${'a'.repeat(60)}.\n\nAl doilea paragraf care este mult mai lung decât bugetul rămas pentru tăiere.`;
    expect(truncateAtBoundary(t, 90)).toBe(`${'a'.repeat(60)}.`);
  });

  it('alege chunk-uri întregi pe buget, numerotate, cu pagină', () => {
    const picked = rankChunks('tratament IC', CORPUS, embedTextLocal('tratament IC'), null, 4);
    const { context, sources } = buildNumberedContext(picked, 900);
    expect(context.length).toBeLessThanOrEqual(900);
    expect(sources.length).toBeGreaterThan(0);
    expect(context).toContain('[1] Kumar · pag. ');
    expect(sources[0].label).toMatch(/^Kumar, p\. 15\d( \(.+\))?$/);
    // Fiecare corp inclus este întreg (nu tăiat) când încape.
    for (const source of sources) {
      const original = CORPUS.find((c) => c.id === source.id)!;
      expect(context).toContain(original.text);
    }
  });

  it('sare peste un chunk prea lung și ia unul mai scurt, în loc să taie brut', () => {
    const long = { id: 'long', text: 'Un fragment foarte lung. '.repeat(100), source: 'Carte.pdf' };
    const short = { id: 'short', text: 'Fragment scurt și complet.', source: 'Carte.pdf' };
    const { context, sources } = buildNumberedContext([long, short], 500);
    expect(sources.map((s) => s.id)).toEqual(['short']);
    expect(context).toContain('Fragment scurt și complet.');
  });

  it('taie pe propoziție doar când nici primul chunk nu încape', () => {
    const long = { id: 'long', text: 'Prima propoziție completă și clară. A doua propoziție, de asemenea completă. '.repeat(30), source: 'Carte.pdf' };
    const { context } = buildNumberedContext([long], 500);
    expect(context.length).toBeLessThanOrEqual(500);
    expect(context.trimEnd().endsWith('.')).toBe(true);
  });

  it('bibliotecă goală / fără rezultate → context gol', () => {
    expect(buildNumberedContext([], 1000)).toEqual({ context: '', sources: [] });
    expect(rankChunks('orice', [], embedTextLocal('orice'), null, 5)).toEqual([]);
    expect(rankChunks('', CORPUS, [], null, 5)).toEqual([]);
  });
});

describe('citări inline', () => {
  const { sources } = buildNumberedContext(
    [
      { id: 'a', text: 'Alfa.', source: 'Kumar.pdf', page: 151 },
      { id: 'b', text: 'Beta.', source: 'Harrison.pdf', page: 12, pageEnd: 13 },
      { id: 'c', text: 'Gama.', source: 'Note.docx' },
    ],
    2000,
  );

  it('desparte textul în segmente fără a pierde nimic', () => {
    const input = 'IC se tratează cu IECA [1], iar HTA la fel [2, 3]. Vezi x[7] și [1][2].';
    const segments = parseInlineCitations(input, sources);
    const rebuilt = segments.map((s) => (s.type === 'text' ? s.text : s.raw)).join('');
    expect(rebuilt).toBe(input);
    const cites = segments.filter((s) => s.type === 'cite');
    expect(cites.map((c) => (c.type === 'cite' ? c.numbers : []))).toEqual([[1], [2, 3], [1], [2]]);
    expect(cites[0].type === 'cite' && cites[0].sources[0].label).toBe('Kumar, p. 151');
    expect(sources[1].label).toBe('Harrison, p. 12–13');
    expect(sources[2].label).toBe('Note');
  });

  it('lasă ca text citările către surse inexistente', () => {
    const segments = parseInlineCitations('Vezi [9] și v[0].', sources);
    expect(segments).toEqual([{ type: 'text', text: 'Vezi [9] și v[0].' }]);
  });

  it('acceptă intervale', () => {
    const segments = parseInlineCitations('Conform [1-3].', sources);
    expect(segments[1]).toMatchObject({ type: 'cite', numbers: [1, 2, 3] });
  });
});

describe('pagini din marcaje PDF', () => {
  it('scoate marcajele și atribuie pagina chunk-urilor, tolerant când nu găsește', () => {
    const raw = `${pageMarker(1)}Capitolul unu începe aici cu prima propoziție lungă.\n${pageMarker(2)}Pagina a doua conține fragmentul despre fibrilație atrială și anticoagulare.\n${pageMarker(3)}Pagina trei vorbește despre hipertensiune arterială esențială.`;
    const { text, pages } = extractPageMap(raw);
    expect(text).not.toContain('⁣');
    expect(pages.map((p) => p.page)).toEqual([1, 2, 3]);
    const tagged = assignPagesToChunks<{ text: string; page?: number }>(text, [
      { text: 'Capitolul unu începe aici cu prima propoziție lungă.' },
      { text: 'Pagina a doua conține fragmentul despre fibrilație atrială și anticoagulare.' },
      { text: 'text normalizat de procesor care nu există în sursă' },
      { text: 'Pagina trei vorbește despre hipertensiune arterială esențială.' },
    ], pages);
    expect(tagged.map((c) => c.page)).toEqual([1, 2, 2, 3]);
  });

  it('fără hartă de pagini chunk-urile rămân neschimbate (biblioteci vechi)', () => {
    const chunks = [{ text: 'Ceva text suficient de lung.' }];
    expect(assignPagesToChunks('Ceva text suficient de lung.', chunks, [])).toBe(chunks);
  });
});
