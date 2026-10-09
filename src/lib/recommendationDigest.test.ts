import { describe, expect, it } from 'vitest';
import { digestRecommendation } from './recommendationDigest';

const LONG = `## 🎯 Obiectivul zilei
Recapitulează cele **6 întrebări** programate, concentrându-te pe subiectele **test** și **rezi**. Apoi continuă cu grilele noi.

## 📚 Subiecte de recapitulare
- Test: patologie hepatică, markerii tumorali.
- Rezi: indicații pentru rezecție colecistică.

## 🗓️ Plan de studiu (90 min)

| Interval | Activitate | Scop |
|---|---|---|
| 0-20 min | Citește rapid notițele | Identifică gap-urile |

## 💡 Sfaturi practice
Folosește **flashcard-uri** pentru markerii tumorali.

## 🚀 Provocare
După studiu, scrie un rezumat de 2-3 fraze.`;

describe('digestRecommendation', () => {
  it('keeps at most three sections, each as icon + title + one plain line', () => {
    const digest = digestRecommendation(LONG);
    expect(digest).toHaveLength(3);
    expect(digest[0]).toEqual({
      icon: '🎯',
      title: 'Obiectivul zilei',
      line: 'Recapitulează cele 6 întrebări programate, concentrându-te pe subiectele test și rezi.',
    });
    expect(digest[1].line).toBe('Test: patologie hepatică, markerii tumorali.');
  });

  it('never lets a table row leak into a line', () => {
    const digest = digestRecommendation(LONG);
    expect(digest.some((item) => item.line.includes('|') || item.line.includes('Interval'))).toBe(false);
    const plan = digestRecommendation('## 🗓️ Plan\n| a | b |\n|---|---|\n| 1 | 2 |');
    expect(plan).toEqual([]);
  });

  it('understands bold-only and emoji-only labels, not just # headings', () => {
    const digest = digestRecommendation('**Focus azi**\nRecapitulează cardiologia.\n\n💡 Sfat\nFă pauze scurte.');
    expect(digest.map((item) => item.title)).toEqual(['Focus azi', 'Sfat']);
    expect(digest[1].icon).toBe('💡');
  });

  it('reads the compact one-line-per-item format', () => {
    const digest = digestRecommendation('🎯 Focus: Recapitulează nefrologia și cardiologia.\n⏱ Plan: 45 de minute, în două sesiuni.\n💡 Sfat: Explică cu voce tare.');
    expect(digest).toEqual([
      { icon: '🎯', title: 'Focus', line: 'Recapitulează nefrologia și cardiologia.' },
      { icon: '⏱', title: 'Plan', line: '45 de minute, în două sesiuni.' },
      { icon: '💡', title: 'Sfat', line: 'Explică cu voce tare.' },
    ]);
  });

  it('turns a plain paragraph into a single item and truncates long lines', () => {
    const one = digestRecommendation('Ai 6 întrebări de recapitulat azi. Menține ritmul activ.');
    expect(one).toEqual([{ icon: '🎯', title: 'Recomandare', line: 'Ai 6 întrebări de recapitulat azi.' }]);
    const long = digestRecommendation(`## Titlu\n${'cuvânt '.repeat(60)}`);
    expect(long[0].line.length).toBeLessThanOrEqual(120);
    expect(long[0].line.endsWith('…')).toBe(true);
  });

  it('returns nothing for empty input', () => {
    expect(digestRecommendation('')).toEqual([]);
    expect(digestRecommendation('   \n\n')).toEqual([]);
  });
});
