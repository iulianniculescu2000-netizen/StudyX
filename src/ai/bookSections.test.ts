/**
 * Găsirea pasajului corect în cărțile de bază (probleme văzute live pe 19 oct 2026): titlul secțiunii din plan, subsecțiunea
 * cerută („## Tratament”) și fragmentul care continuă subsecțiunea începută în fragmentul anterior.
 */
import { describe, expect, it } from 'vitest';
import { embedTextLocal } from './embeddings';
import { bookSectionTitle, rankChunks, type RankableChunk } from './retriever';
import { headingIntentsInOrder, nextChunkId, previousChunkId, queryIntents } from './sectionIntent';
import { topicTitlesForPages } from '../lib/curriculum';
import { BUNDLED_BOOK_NAMES } from '../lib/bundledBookNames';

const KUMAR = BUNDLED_BOOK_NAMES.kumar;
let n = 0;
function kumar(text: string, page: number, { id, ...extra }: Partial<Omit<RankableChunk, 'id'>> & { id?: number } = {}): RankableChunk {
  n += 1;
  return { id: `${KUMAR}-chunk-${id ?? n}`, text, topic: 'Kumar', source: KUMAR, difficulty: 'medium', embedding: embedTextLocal(text), page, ...extra };
}

describe('titlul secțiunii din plan', () => {
  it('pagina unei cărți de bază primește subiectul din plan; paginile din afara PDF-ului și materialele nu', () => {
    expect(topicTitlesForPages('K', 56)).toContain('Anemia microcitară (deficit de fier)');
    expect(topicTitlesForPages('K', 296)).toContain('Acalazia');
    expect(bookSectionTitle({ source: KUMAR, page: 56 })).toContain('Anemia microcitară');
    expect(bookSectionTitle({ source: BUNDLED_BOOK_NAMES.lawrence, page: 360, printedPage: 150 })).toBe('');
    expect(bookSectionTitle({ source: 'Curs anemie.pdf', page: 56 })).toBe('');
  });
});

describe('subsecțiunea cerută', () => {
  it('recunoaște întrebarea și titlurile din carte', () => {
    expect(queryIntents('Care este tratamentul acalaziei?')).toEqual(['treatment']);
    expect(queryIntents('Cum se confirmă eradicarea H. pylori?')).toEqual(['diagnosis']);
    expect(queryIntents('Care sunt cauzele pancreatitei acute?')).toEqual(['etiology']);
    expect(queryIntents('Ce este semnul Auspitz?')).toEqual([]);
    expect(headingIntentsInOrder('## Tablou clinic\ntext\n## Tratament\ntext')).toEqual([['clinical'], ['treatment']]);
    expect(previousChunkId(`${KUMAR}-chunk-12`)).toBe(`${KUMAR}-chunk-11`);
    expect(nextChunkId(`${KUMAR}-chunk-12`)).toBe(`${KUMAR}-chunk-13`);
  });

  it('fragmentul care continuă `## Tratament` (fără numele bolii) intră imediat după fragmentul în care începe secțiunea', () => {
    const chunks = [
      kumar('## Investigații\nFeritina serică scăzută confirmă deficitul de fier. Anemia microcitară hipocromă are VEM scăzut.\n## Tratament\nGestionarea corectă a deficitului de fier constă în tratarea cauzei.', 56, { id: 100 }),
      kumar('Fierul oral este suficient în majoritatea cazurilor. Cel mai eficient preparat este sulfatul feros, 200 mg.', 57, { id: 101 }),
      kumar('## Tablou clinic\nAnemia feriprivă de lungă durată produce koilonichie și glosită. Anemia se manifestă prin paloare.', 52, { id: 102 }),
      kumar('Talasemia produce anemie microcitară cu fier seric normal; electroforeza hemoglobinei confirmă.', 57, { id: 103 }),
    ];
    const query = 'Care e managementul anemiei feriprive?';
    const ids = rankChunks(query, chunks, embedTextLocal(query), null, 3, { rezidentiat: true }).map((chunk) => chunk.id);
    const start = ids.indexOf(`${KUMAR}-chunk-100`);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(ids[start + 1]).toBe(`${KUMAR}-chunk-101`);
  });

  it('fragmentul din subsecțiunea cerută urcă peste cel care doar numește boala', () => {
    const chunks = [
      kumar('## Diagnostic diferențial\nAcalazia se deosebește de carcinom. Acalazia are aspect de cioc de pasăre; acalazia apare la orice vârstă.', 296, { id: 200 }),
      kumar('## Tratament\nÎn acalazie, dilatarea endoscopică a SEI are succes în 80% din cazuri; miotomia Heller este tratamentul chirurgical de elecție.', 296, { id: 300 }),
    ];
    const query = 'Care este tratamentul acalaziei?';
    const ids = rankChunks(query, chunks, embedTextLocal(query), null, 2, { rezidentiat: true, diversify: false }).map((chunk) => chunk.id);
    expect(ids[0]).toBe(`${KUMAR}-chunk-300`);
  });

  it('eticheta citării folosește subiectul din plan, nu titlul greșit detectat la indexare', () => {
    const chunk = kumar('Gestionarea corectă a deficitului de fier.', 56, { id: 400, heading: 'TERAPIE INTENSIVĂ' });
    const [result] = rankChunks('deficit de fier', [chunk], embedTextLocal('deficit de fier'), null, 1, { rezidentiat: true });
    expect(result.heading).toBe('Anemia microcitară (deficit de fier)');
  });
});
