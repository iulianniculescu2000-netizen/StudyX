import { describe, expect, it } from 'vitest';
import { THEMES } from './themes';
import { contrastRatio, onFillText } from './contrastText';
import { HERO_COLOR_MAP, QUIZ_COLOR_HEX } from './colorMaps';

export const contrast = contrastRatio;

describe('contrast WCAG AA al tokenilor de temă', () => {
  it.each(Object.values(THEMES))('$id: text alb pe umplerea accent și pe umplerea verde >= 4.5', (theme) => {
    expect(contrast('#FFFFFF', theme.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#FFFFFF', theme.accent2)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#FFFFFF', theme.successFill)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.values(THEMES))('$id: accentul ca text mic pe suprafață și fundal >= 4.5', (theme) => {
    expect(contrast(theme.accentText, theme.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.accentText, theme.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.values(THEMES))('$id: textul principal și secundar >= 4.5 pe suprafață', (theme) => {
    expect(contrast(theme.text, theme.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.text2, theme.surface)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('onFillText pentru umpleri colorate', () => {
  it.each(Object.entries(QUIZ_COLOR_HEX))('culoarea de dosar %s are text lizibil >= 4.5', (_name, hex) => {
    expect(contrastRatio(onFillText(hex), hex)).toBeGreaterThanOrEqual(4.5);
  });

  it('alege alb pe fundal închis și negru pe fundal deschis', () => {
    expect(onFillText('#0062CC')).toBe('#FFFFFF');
    expect(onFillText('#BF6FFF')).not.toBe('#FFFFFF');
  });

  it.each(Object.entries(HERO_COLOR_MAP))('hero %s: text alb pe ambele capete ale gradientului >= 4.5', (_name, { gradient }) => {
    const stops = gradient.match(/#[0-9A-Fa-f]{6}/g) ?? [];
    expect(stops.length).toBe(2);
    for (const stop of stops) expect(contrastRatio('#FFFFFF', stop)).toBeGreaterThanOrEqual(4.5);
  });
});
