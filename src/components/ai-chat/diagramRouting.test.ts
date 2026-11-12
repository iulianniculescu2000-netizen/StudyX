import { describe, expect, it } from 'vitest';
import { renderDiagramBlock, roundedPath, spreadLabels } from './diagram';

const LOOP = `# Durere toracică
! Durere toracică | sub 20 min
~ ECG în 10 min
? Supradenivelare ST?
  da> + Reperfuzie urgentă
    = Internare
  nu> ~ Troponină seriată
    ? Troponină pozitivă?
      da> + Tratament NSTEMI
        = Internare
      nu> . Reevaluare clinică
        @ECG în 10 min`;

const edgePaths = (svg: string) =>
  [...svg.matchAll(/<path class="sx-edge"([^>]*)>/g)].map((m) => ({ attrs: m[1], d: /\sd="([^"]+)"/.exec(m[1])![1] }));

describe('rutarea muchiilor în jurul nodurilor', () => {
  const svg = renderDiagramBlock(LOOP, 'schema')!;
  const paths = edgePaths(svg);

  it('muchia care sare peste straturi ocolește nodurile printr-o rută cu colțuri rotunjite', () => {
    expect(paths.some((p) => p.d.includes(' Q '))).toBe(true);
  });

  it('săgeata de întoarcere e punctată și nu mai are pathLength (altfel liniuțele se strică)', () => {
    const dashed = paths.filter((p) => p.attrs.includes('data-dashed="1"'));
    expect(dashed.length).toBeGreaterThan(0);
    for (const p of dashed) expect(p.attrs).not.toContain('pathLength');
  });

  it('muchiile obișnuite păstrează pathLength pentru animația de desenare', () => {
    const solid = paths.filter((p) => !p.attrs.includes('data-dashed'));
    expect(solid.length).toBeGreaterThan(0);
    for (const p of solid) expect(p.attrs).toContain('pathLength="1"');
  });

  it('pânza se lărgește ca ruta din margine să nu fie tăiată', () => {
    const viewBox = /viewBox="0 0 (\d+) (\d+)"/.exec(svg)!;
    const xs = paths.flatMap((p) => [...p.d.matchAll(/-?\d+(?:\.\d+)?/g)].filter((_, i) => i % 2 === 0).map((m) => Number(m[0])));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Number(viewBox[1])).toBeGreaterThan(Math.max(...xs) - 1);
  });
});

describe('roundedPath', () => {
  it('rotunjește colțurile și ignoră punctele repetate sau coliniare', () => {
    const d = roundedPath([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 20 },
      { x: 0, y: 40 },
      { x: 40, y: 40 },
    ]);
    expect(d.match(/ Q /g)).toHaveLength(1);
    expect(d.startsWith('M 0 0')).toBe(true);
    expect(d.endsWith('L 40 40')).toBe(true);
  });
});

describe('spreadLabels', () => {
  it('mută mai departe pe curbă o etichetă care se suprapune cu alta', () => {
    const at = (t: number) => ({ x: 100, y: 100 + t * 100 });
    const labels = [
      { x: 100, y: 110, w: 60, t: 0.1 as number | null, at },
      { x: 104, y: 112, w: 60, t: 0.12 as number | null, at },
    ];
    spreadLabels(labels);
    expect(Math.abs(labels[0].y - labels[1].y)).toBeGreaterThanOrEqual(20);
  });

  it('nu atinge etichetele fixe (rute) și pe cele deja separate', () => {
    const at = () => ({ x: 0, y: 0 });
    const fixed = { x: 10, y: 10, w: 40, t: null as number | null, at };
    const far = { x: 300, y: 10, w: 40, t: 0.3 as number | null, at };
    spreadLabels([far, fixed]);
    expect(fixed).toMatchObject({ x: 10, y: 10, t: null });
    expect(far.t).toBe(0.3);
  });
});

const LOOP_LR = `flowchart LR
A[Triaj] --> B[ECG]
B --> C[Troponină]
C --> D[Decizie terapeutică]
D --> E[Internare]
B --> E
A --> D`;

describe('rutarea pe scheme orizontale (LR)', () => {
  const svg = renderDiagramBlock(LOOP_LR)!;
  const d = edgePaths(svg).map((p) => p.d);
  const dims = /viewBox="0 0 (\d+) (\d+)"/.exec(svg)!;

  it('muchiile care ar trece prin noduri sunt redesenate ortogonal', () => {
    expect(d.some((x) => x.includes(' Q '))).toBe(true);
  });

  it('nicio coordonată nu iese din pânză', () => {
    const nums = d.flatMap((x) => [...x.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0])));
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(0);
    expect(Number(dims[2])).toBeGreaterThan(0);
  });
});

describe('titlul schemei', () => {
  const pos = (s: string) => {
    const t = /<text class="sx-title" x="([\d.]+)"[^>]*text-anchor="middle"/.exec(s)!;
    return { x: Number(t[1]), w: Number(/viewBox="0 0 (\d+)/.exec(s)![1]) };
  };
  it('e centrat pe pânză, și când pânza e lărgită de rute', () => {
    for (const src of [LOOP, '# Titlu\n! A\n~ B']) {
      const { x, w } = pos(renderDiagramBlock(src, 'schema')!);
      expect(Math.abs(x - w / 2)).toBeLessThan(0.6);
    }
  });
});

describe('legenda marcajelor', () => {
  const legend = (s: string) => /<g class="sx-legend"[^>]*>(.*?)<\/g>/.exec(s)?.[1] ?? null;
  it('apare cu cel puțin două tipuri colorate, doar cu cele prezente, aria-hidden', () => {
    const svg = renderDiagramBlock(LOOP, 'schema')!;
    expect(svg).toContain('<g class="sx-legend" aria-hidden="true">');
    const l = legend(svg)!;
    expect(l).toContain('Urgență');
    expect(l).toContain('Tratament');
    expect(l).toContain('Investigație');
    expect(renderDiagramBlock('# T\n! A\n+ B', 'schema')).not.toContain('Investigație</text>');
  });
  it('lipsește când schema are un singur tip', () => {
    expect(renderDiagramBlock('# T\n! A\n! B', 'schema')).not.toContain('sx-legend');
  });
  it('nu depinde de CSS extern și încape în pânză', () => {
    const svg = renderDiagramBlock(LOOP, 'schema')!;
    expect(legend(svg)).not.toContain('class=');
    const w = Number(/viewBox="0 0 (\d+)/.exec(svg)![1]);
    const xs = [...legend(svg)!.matchAll(/<(?:rect|text) x="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(w);
  });
});
