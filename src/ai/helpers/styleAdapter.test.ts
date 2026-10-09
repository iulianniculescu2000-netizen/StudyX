import { describe, expect, it } from 'vitest';
import { PROMPT_CHAT_MODES, chatModeModule } from '../promptKit';
import { detectStyleMode, levelFromAccuracy, styleFragment, type StyleMode } from './styleAdapter';
import { estimateTextTokens } from './shared';

describe('styleFragment', () => {
  const modes: StyleMode[] = ['explain', 'simple', 'summarize', 'review', 'test', 'mnemonic', 'diagram', 'exam'];

  it('fiecare fragment (cu nivel) are sub 65 de tokeni', () => {
    for (const mode of modes) {
      for (const level of ['beginner', 'intermediate', 'advanced'] as const) {
        expect(estimateTextTokens(styleFragment({ mode, level }))).toBeLessThanOrEqual(65);
      }
    }
  });

  it('economie măsurată față de modulele existente din promptKit', () => {
    const pairs: [StyleMode, (typeof PROMPT_CHAT_MODES)[number]][] = [
      ['explain', 'explain'],
      ['summarize', 'summarize'],
      ['test', 'test'],
      ['diagram', 'diagram'],
      ['mnemonic', 'mnemonic'],
      ['exam', 'grounded'],
    ];
    let before = 0;
    let after = 0;
    for (const [mode, chatMode] of pairs) {
      const old = estimateTextTokens(chatModeModule(chatMode));
      const next = estimateTextTokens(styleFragment({ mode, level: 'intermediate' }));
      expect(next).toBeLessThan(old);
      before += old;
      after += next;
    }
    // Economie totală de cel puțin 55% pe cele 6 moduri (măsurat: ~58%).
    expect(after).toBeLessThan(before * 0.45);
  });

  it('nivelul adaugă o propoziție, fără nivel nu', () => {
    expect(styleFragment({ mode: 'explain' })).not.toMatch(/Nivel/);
    expect(styleFragment({ mode: 'explain', level: 'beginner' })).toMatch(/începător/);
  });

  it('nu pierde cerința de format a modului mnemonic și diagramă', () => {
    expect(styleFragment({ mode: 'mnemonic' })).toMatch(/Se desface/);
    expect(styleFragment({ mode: 'diagram' })).toMatch(/mermaid/);
  });
});

describe('detectStyleMode', () => {
  it.each([
    ['Explică-mi simplu cum funcționează rinichiul', 'simple'],
    ['fă-mi un rezumat la capitolul 3', 'summarize'],
    ['recapitulare rapidă la aritmii', 'review'],
    ['dă-mi un mnemonic pentru nervii cranieni', 'mnemonic'],
    ['fă-mi o schemă cu fluxul diagnostic', 'diagram'],
    ['pune-mi grile despre tiroidă', 'test'],
    ['explică mecanismul de acțiune al IECA', 'explain'],
    ['salut', null],
  ])('„%s” → %s', (msg, expected) => {
    expect(detectStyleMode(msg)).toBe(expected);
  });
});

describe('levelFromAccuracy', () => {
  it('mapează acuratețea pe niveluri', () => {
    expect(levelFromAccuracy(30)).toBe('beginner');
    expect(levelFromAccuracy(65)).toBe('intermediate');
    expect(levelFromAccuracy(90)).toBe('advanced');
    expect(levelFromAccuracy(null)).toBe('intermediate');
    expect(levelFromAccuracy(NaN)).toBe('intermediate');
  });
});
