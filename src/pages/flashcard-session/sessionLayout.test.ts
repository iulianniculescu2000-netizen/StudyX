import { describe, expect, it } from 'vitest';
import { getAnswerTone, getQuestionTone, shuffleArr } from './sessionUtils';
import { computeSessionLayout } from './sessionLayout';
import type { CardItem } from './sessionTypes';

const card = (text: string, imageUrl?: string): CardItem => ({
  quiz: { id: 'q' } as never,
  question: { id: 'x', text, imageUrl, options: [{ id: 'a', text: 'Răspuns', isCorrect: true }] } as never,
});

const base = {
  flipped: false, aiExplanation: null, calmMotion: false, isDue: false, density: 'comfortable',
  crampedHeight: false, shortHeight: false, narrow: false, mobile: false, tablet: false,
  viewport: { width: 1440, height: 900 }, uiScale: 1,
};

describe('sessionUtils', () => {
  it('shuffleArr păstrează elementele și nu modifică originalul', () => {
    const source = [1, 2, 3, 4, 5];
    const out = shuffleArr(source);
    expect(source).toEqual([1, 2, 3, 4, 5]);
    expect([...out].sort()).toEqual(source);
  });

  it('textul se micșorează odată cu lungimea', () => {
    expect(getAnswerTone('a', false)).toContain('text-2xl');
    expect(getAnswerTone('a'.repeat(300), false)).toContain('text-base');
    expect(getQuestionTone('a', false, false)).toContain('text-3xl');
    expect(getQuestionTone('a'.repeat(300), false, true)).toContain('text-base');
  });
});

describe('computeSessionLayout', () => {
  it('card fără imagine, față: lățime 4xl, fără media', () => {
    const layout = computeSessionLayout({ ...base, current: card('Întrebare') });
    expect(layout.cardWidthClass).toBe('max-w-4xl');
    expect(layout.hasMedia).toBe(false);
    expect(layout.correctAnswers).toHaveLength(1);
    expect(layout.centerBackContent).toBe(true);
  });

  it('cu imagine și text scurt, imaginea domină fața', () => {
    const layout = computeSessionLayout({ ...base, current: card('Ce vezi?', 'x.png') });
    expect(layout.imageDominantFront).toBe(true);
    expect(layout.cardWidthClass).toBe('max-w-5xl');
  });

  it('pe mobil cardul ocupă toată lățimea, iar dock-ul are o coloană', () => {
    const layout = computeSessionLayout({ ...base, mobile: true, current: card('Q') });
    expect(layout.cardWidthClass).toBe('max-w-full');
    expect(layout.dockGridClass).toBe('grid-cols-1');
  });

  it('cardul întors folosește eticheta Evaluează cardul', () => {
    expect(computeSessionLayout({ ...base, flipped: true, current: card('Q') }).dockLabel).toBe('Evaluează cardul');
  });
});
