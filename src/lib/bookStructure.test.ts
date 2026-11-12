import { describe, expect, it } from 'vitest';
import kumarPages from '../data/rezidentiat/library/kumar.pages.json';
import { headingMatchesTopic, isRealHeading, structureBook, structuredChunks } from './bookStructure';

const KUMAR = kumarPages as string[];
const topics = structureBook('K', KUMAR);

describe('baza structurată a cărților', () => {
  it('textul rămâne cel din carte: fiecare bloc apare exact așa în pagina lui', () => {
    for (const topic of topics) {
      for (const section of topic.sections) {
        for (const block of section.blocks) expect(KUMAR[block.page - 1]).toContain(block.text);
      }
    }
  });

  it('subiectul începe la titlul lui din carte, nu la începutul paginii', () => {
    const psa = topics.find((topic) => topic.title.startsWith('Artrita psoriazică'))!;
    expect(psa.anchoredAt).toBe(80);
    expect(psa.sections[0].title).toBe('Artrita psoriazică');
    // finalul subiectului de dinainte (spondilita: prognosticul) rămâne la el, deși e pe aceeași pagină
    const spondyl = topics.find((topic) => topic.title.startsWith('Spondilartritele'))!;
    expect(spondyl.sections.some((section) => section.title === 'Prognosticul')).toBe(true);
    expect(psa.sections.some((section) => section.title === 'Prognosticul')).toBe(false);
  });

  it('secțiunile poartă subiectul numit din carte și subsecțiunea cerută', () => {
    const psa = topics.find((topic) => topic.title.startsWith('Artrita psoriazică'))!;
    const treatment = psa.sections.find((section) => section.title === 'Tratament și prognostic')!;
    expect(treatment).toMatchObject({ parent: 'Artrita psoriazică', intent: 'treatment', page: 80 });
    const reactive = psa.sections.find((section) => section.parent === 'Artrită reactivă' && section.title === 'Etiologie');
    expect(reactive).toBeTruthy();
  });

  it('nimic din carte nu se pierde în afara bibliografiei', () => {
    const chunks = structuredChunks(topics, 'K');
    const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
    const book = words(KUMAR.join(' '));
    const kept = chunks.reduce((sum, chunk) => sum + words(chunk.text.slice(chunk.heading.length)), 0);
    expect(kept / book).toBeGreaterThan(0.9);
  });

  it('fragmentele: titlul „Subiect › Secțiune” în față, pagina exactă, id-uri în ordine', () => {
    const chunks = structuredChunks(topics, 'Kumar.pdf');
    const psa = chunks.find((chunk) => chunk.heading === 'Artrita psoriazică, reactivă și enteropatică › Artrita psoriazică › Tratament și prognostic')!;
    expect(psa.text.startsWith(`${psa.heading}\n\n`)).toBe(true);
    expect(psa).toMatchObject({ page: 80, chapter: 'Reumatologie' });
    expect(chunks.every((chunk, i) => chunk.id === `Kumar.pdf-chunk-${i}`)).toBe(true);
    expect(chunks.every((chunk) => chunk.text.length <= 1500 + chunk.heading.length + 2 || !chunk.text.slice(chunk.heading.length + 2).includes('\n\n'))).toBe(true);
    expect(chunks.some((chunk) => /Lecturi suplimentare/.test(chunk.heading))).toBe(false);
  });

  it('titlurile false de OCR rămân text, nu secțiuni', () => {
    expect(isRealHeading('Tablou clinic')).toBe(true);
    expect(isRealHeading('a')).toBe(false);
    expect(isRealHeading('Plămân ------J')).toBe(false);
    expect(headingMatchesTopic('Guta și hiperuricemia', 'Guta și artropatiile microcristaline')).toBeGreaterThanOrEqual(0.6);
    expect(headingMatchesTopic('Bronșita cronică', 'BPOC (bronșita cronică, emfizemul)')).toBeGreaterThanOrEqual(0.6);
    expect(headingMatchesTopic('Hiponatremia cu euvolemie', 'Hipernatremia')).toBeLessThan(0.6);
  });
});

describe('textul cărții din fragmentul structurat', () => {
  it('extrasul și contextul nu încep cu titlul „Subiect › Secțiune”', async () => {
    const { chunkBodyText } = await import('../ai/contextBuilder');
    const chunk = structuredChunks(topics, 'K').find((item) => item.heading.endsWith('Artrita psoriazică › Tratament și prognostic'))!;
    expect(chunkBodyText(chunk.text, chunk.heading).startsWith('AINS')).toBe(true);
    expect(chunkBodyText('Text obișnuit', 'Alt titlu')).toBe('Text obișnuit');
  });
});
