import { describe, expect, it } from 'vitest';
import { curriculumChapters } from '../curriculum';
import {
  CHAPTER_TEXT_LIMIT,
  NOT_INDEXED_NOTE,
  buildChapterContext,
  chapterHeaderLine,
  clipChapterText,
  detectChapterInQuestion,
  pickChapterHeading,
  type ChapterContextDeps,
} from './chapterContext';

const sepsis = curriculumChapters()[0];

function deps(overrides: Partial<ChapterContextDeps> = {}): ChapterContextDeps {
  const chunks = Array.from({ length: 4 }, (_, i) => ({ heading: sepsis.label, text: `Sepsisul fragment ${i}` }));
  return {
    sources: () => [{ id: 'k1', name: 'Kumar și Clark.pdf', indexStatus: 'ready' }],
    chunks: async () => chunks,
    text: async () => 'Sepsisul este disfuncție de organ prin răspuns dereglat la infecție.',
    ...overrides,
  };
}

describe('chapterContext', () => {
  it('găsește headingul capitolului printre headinguri', () => {
    expect(pickChapterHeading(sepsis, ['Introducere', sepsis.label])).toBe(sepsis.label);
    expect(pickChapterHeading(sepsis, ['Introducere', 'Altceva'])).toBeNull();
  });

  it('antetul numește capitolul, cartea și paginile', () => {
    const line = chapterHeaderLine(sepsis);
    expect(line).toContain(sepsis.title);
    expect(line).toContain('Kumar');
    expect(line).toContain(`${sepsis.pages} pagini`);
  });

  it('include textul capitolului când sursa e indexată', async () => {
    const result = await buildChapterContext(sepsis, { topicName: 'Recunoașterea sepsisului' }, deps());
    expect(result.scope).toEqual({ sourceId: 'k1', sourceName: 'Kumar și Clark.pdf', heading: sepsis.label });
    expect(result.context).toContain('disfuncție de organ');
    expect(result.context).not.toContain(NOT_INDEXED_NOTE);
  });

  it('spune explicit când textul nu e indexat și nu inventează', async () => {
    const noSource = await buildChapterContext(sepsis, {}, deps({ sources: () => [] }));
    expect(noSource.scope).toBeNull();
    expect(noSource.context).toContain('nu e indexat');

    const otherBook = await buildChapterContext(sepsis, {}, deps({ sources: () => [{ id: 'l', name: 'Lawrence', indexStatus: 'ready' }] }));
    expect(otherBook.context).toContain(NOT_INDEXED_NOTE);

    const noHeading = await buildChapterContext(sepsis, {}, deps({ chunks: async () => [{ heading: 'Altceva', text: 'x' }] }));
    expect(noHeading.context).toContain(NOT_INDEXED_NOTE);

    const broken = await buildChapterContext(sepsis, {}, deps({ chunks: async () => { throw new Error('idb'); } }));
    expect(broken.scope).toBeNull();
    expect(broken.context).toContain(NOT_INDEXED_NOTE);
  });

  it('limitează textul și păstrează paragrafele relevante pentru topic', () => {
    const paragraphs = Array.from({ length: 60 }, (_, i) => `Paragraf ${i} ${'x'.repeat(300)}`);
    paragraphs[50] = `Vasopresoare noradrenalina ${'y'.repeat(300)}`;
    const clipped = clipChapterText(paragraphs.join('\n\n'), CHAPTER_TEXT_LIMIT, 'noradrenalina');
    expect(clipped.length).toBeLessThanOrEqual(CHAPTER_TEXT_LIMIT);
    expect(clipped).toContain('noradrenalina');
    expect(clipChapterText(paragraphs.join('\n\n')).startsWith('Paragraf 0')).toBe(true);
    expect(clipChapterText('scurt')).toBe('scurt');
  });

  it('recunoaște un capitol numit în întrebare doar cu cuvântul „capitol”', () => {
    expect(detectChapterInQuestion(`Explică-mi capitolul ${sepsis.title}`)?.index).toBe(0);
    expect(detectChapterInQuestion(`Ce știi despre ${sepsis.title}?`)).toBeNull();
    expect(detectChapterInQuestion('Explică-mi capitolul inexistent')).toBeNull();
  });
});
