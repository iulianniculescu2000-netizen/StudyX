import { describe, expect, it } from 'vitest';
import { cleanText } from './pdfParser';

describe('cleanText păstrează simbolurile medicale', () => {
  it('păstrează litere grecești, săgeți și operatori matematici', () => {
    const t = 'β-lactamine, α-blocante, μg, TA ≥140 mmHg, FEVS ≤40%, ↑ TA, ↓ FC, K → Na, ± 5 °C, 2 × 3 ÷ 4, ∆ ST, µL';
    expect(cleanText(t)).toBe(t);
  });
  it('tot elimină caractere de control și gunoi', () => {
    expect(cleanText('a\u0000b\u0007c � d')).toBe('a b c d');
  });
});
