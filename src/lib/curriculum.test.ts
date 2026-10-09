import { describe, expect, it } from 'vitest';
import raw from '../data/organizare/plan.json';
import kumarDeck from '../data/rezidentiat/kumar_flashcards.json';
import {
  BOOK_NAMES,
  bookOfSourceName,
  chapterForLabel,
  chaptersOfBook,
  curriculumChapters,
} from './curriculum';

describe('curriculum', () => {
  it('are 39 de capitole, fiecare cu topicuri, în 3 cărți', () => {
    const chapters = curriculumChapters();
    expect(chapters).toHaveLength(39);
    expect(chapters.every((chapter) => chapter.topicIndexes.length > 0 && chapter.pages > 0)).toBe(true);
    const total = chaptersOfBook('K').length + chaptersOfBook('L').length + chaptersOfBook('S').length;
    expect(total).toBe(39);
    expect(Object.keys(BOOK_NAMES)).toHaveLength(3);
    expect(chapters.reduce((n, c) => n + c.topicIndexes.length, 0)).toBe((raw as { ch: unknown[] }).ch.length);
  });

  it('recunoaște cartea după numele sursei', () => {
    expect(bookOfSourceName('Kumar și Clark.pdf')).toBe('K');
    expect(bookOfSourceName('LAWRENCE 2024')).toBe('L');
    expect(bookOfSourceName('Sinopsis de medicină')).toBe('S');
    expect(bookOfSourceName('Altceva')).toBeNull();
  });

  it('potrivește categoriile flashcardurilor la capitolele din plan', () => {
    expect(chapterForLabel('Diabet zaharat')?.number).toBe(7);
    expect(chapterForLabel('Infecția HIV')?.number).toBe(16);
    expect(chapterForLabel('Boli hepatice')?.number).toBe(14);
    expect(chapterForLabel('Echilibru hidro-electrolitic și acido-bazic')?.number).toBe(2);
    expect(chapterForLabel('Sepsis')?.number).toBe(1);
    expect(chapterForLabel('Cardiologie', 'K')?.number).toBe(11);
    expect(chapterForLabel('')).toBeNull();
  });

  it('fiecare categorie din pachetul Kumar are capitol', () => {
    const categories = new Set((kumarDeck.questions as Array<{ category?: string }>).map((q) => q.category ?? ''));
    for (const category of categories) {
      expect(chapterForLabel(category, 'K'), category).not.toBeNull();
    }
  });
});
