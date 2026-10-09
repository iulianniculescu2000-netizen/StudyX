import { describe, expect, it } from 'vitest';
import { TIP_ATTR, claimTooltipText, estimateTooltipBox, placeTooltip } from './titleTooltip';

const VIEW = { width: 1200, height: 800 };

describe('placeTooltip', () => {
  it('stă sub element când încape, centrat', () => {
    const p = placeTooltip({ top: 100, left: 500, width: 40, height: 20 }, { width: 120, height: 30 }, VIEW);
    expect(p.side).toBe('below');
    expect(p.top).toBe(128);
    expect(p.centerX).toBe(520);
  });
  it('trece deasupra lângă marginea de jos', () => {
    const p = placeTooltip({ top: 780, left: 500, width: 40, height: 20 }, { width: 120, height: 30 }, VIEW);
    expect(p.side).toBe('above');
    expect(p.top).toBe(742);
  });
  it('rămâne în ecran lângă marginile laterale', () => {
    expect(placeTooltip({ top: 100, left: 0, width: 10, height: 10 }, { width: 200, height: 30 }, VIEW).centerX).toBe(108);
    expect(placeTooltip({ top: 100, left: 1195, width: 10, height: 10 }, { width: 200, height: 30 }, VIEW).centerX).toBe(1092);
  });
});

describe('estimateTooltipBox', () => {
  it('crește cu textul, plafonat, cu mai multe rânduri la text lung', () => {
    const short = estimateTooltipBox('Închide');
    const long = estimateTooltipBox('Trimite întrebarea, răspunsul și sursele la alt furnizor AI (consumă din cota lui gratuită)');
    expect(short.width).toBeLessThan(long.width);
    expect(long.width).toBe(280);
    expect(long.height).toBeGreaterThan(short.height);
  });
});

describe('claimTooltipText', () => {
  it('mută title în data-tip (fără tooltip nativ) și dă nume accesibil butoanelor fără text', () => {
    document.body.innerHTML = '<button id="b" title="Închide (Esc)"><svg id="i"></svg></button>';
    const claim = claimTooltipText(document.getElementById('i'));
    const button = document.getElementById('b')!;
    expect(claim?.text).toBe('Închide (Esc)');
    expect(button.hasAttribute('title')).toBe(false);
    expect(button.getAttribute(TIP_ATTR)).toBe('Închide (Esc)');
    expect(button.getAttribute('aria-label')).toBe('Închide (Esc)');
  });
  it('nu strică un aria-label existent și nu pune nume pe butoane cu text', () => {
    document.body.innerHTML = '<button id="a" aria-label="Ajutor" title="Detalii"></button><button id="t" title="Mai mult">Salvează</button>';
    claimTooltipText(document.getElementById('a'));
    claimTooltipText(document.getElementById('t'));
    expect(document.getElementById('a')!.getAttribute('aria-label')).toBe('Ajutor');
    expect(document.getElementById('t')!.hasAttribute('aria-label')).toBe(false);
  });
  it('la o a doua trecere folosește data-tip păstrat', () => {
    document.body.innerHTML = '<span id="s" title="Text"></span>';
    const span = document.getElementById('s');
    claimTooltipText(span);
    expect(claimTooltipText(span)?.text).toBe('Text');
  });
  it('ignoră title gol și elementele fără tooltip', () => {
    document.body.innerHTML = '<div id="d" title="  "><span id="c"></span></div>';
    expect(claimTooltipText(document.getElementById('c'))).toBeNull();
    expect(claimTooltipText(document.body)).toBeNull();
  });
});
