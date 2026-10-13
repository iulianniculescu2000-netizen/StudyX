import { describe, expect, it } from 'vitest';
import { normalizeLooseSchema } from './schemaLoose';
import { parseSchema } from './schemaDsl';

/** Schemele reale din istoricul chatului Rezidențiat (13 oct 2026), așa cum le-a scris modelul. */
const TREE = `1️⃣ Insuficiență cardiacă stângă?
   ├─► Da → 2️⃣
   └─► Nu → 3️⃣

2️⃣ Semn clinic caracteristic?
   ├─► **Dispnee de efort** → Răspuns corect
   └─► Alte manifestări (ortopnee, crepitante, tuse) → Susțin, dar nu exclusive

3️⃣ Semne insuficiență cardiacă dreaptă?
   ├─► Edeme periferice, hepatomegalie, ascită → Capcană: nu sunt caracteristice stânga
   └─► Dacă apar → Excludere pentru răspuns stânga`;

const CHAIN = `1️⃣ Simetrie + durată >6 săpt? → Da → 2️⃣
2️⃣ RF și/sau anti‑CCP pozitive? → Da → 3️⃣
3️⃣ Radiografie: erosii marginale? → Da → AR diagnosticată
   └─ Dacă nu → reevaluează alte artrite`;

describe('normalizeLooseSchema', () => {
  it('lasă neschimbat formatul compact al aplicației', () => {
    const compact = '# Durere toracică\n? Supradenivelare ST?\n  da> + Reperfuzie urgentă\n  nu> ~ Troponină seriată';
    expect(normalizeLooseSchema(compact)).toBe(compact);
  });

  it('transformă arborele cu ├─► în ramuri, cu pașii trimiși așezați sub ramura lor', () => {
    expect(normalizeLooseSchema(TREE)).toBe([
      '? Insuficiență cardiacă stângă?',
      '  da> ? Semn clinic caracteristic?',
      '    [Dispnee de efort]> . Răspuns corect',
      '    . Alte manifestări (ortopnee, crepitante, tuse) -> Susțin, dar nu exclusive',
      '  nu> ? Semne insuficiență cardiacă dreaptă?',
      '    . Edeme periferice, hepatomegalie, ascită -> Capcană: nu sunt caracteristice stânga',
      '    [Dacă apar]> . Excludere pentru răspuns stânga',
    ].join('\n'));
  });

  it('desenează arborele: fără emoji, fără glyphuri, cu decizii și ramuri', () => {
    const diagram = parseSchema(normalizeLooseSchema(TREE))!;
    const labels = diagram.nodes.map((node) => node.label).join(' | ');
    expect(labels).not.toMatch(/[├└─►]|⃣/);
    expect(diagram.nodes.filter((node) => node.shape === 'decision')).toHaveLength(3);
    expect(diagram.edges.map((edge) => edge.label)).toEqual(expect.arrayContaining(['Da', 'Nu', 'Dispnee de efort']));
  });

  it('transformă un algoritm în lanț „Da → pasul următor” într-un arbore, fără noduri „Da” sau „2️⃣”', () => {
    const normalized = normalizeLooseSchema(CHAIN);
    expect(normalized.split('\n')[0]).toBe('? Simetrie + durată >6 săpt?');
    expect(normalized).toContain('    da> ? Radiografie: erosii marginale?');
    expect(normalized).toContain('[Dacă nu]> . reevaluează alte artrite');
    const diagram = parseSchema(normalized)!;
    expect(diagram.nodes.map((node) => node.label)).not.toContain('Da');
    expect(diagram.nodes.some((node) => /⃣/.test(node.label))).toBe(false);
  });

  it('parseSchema desenează direct textul brut al modelului, fără pași de tip „1️⃣” sau „Da”', () => {
    for (const raw of [TREE, CHAIN]) {
      const diagram = parseSchema(raw)!;
      expect(diagram).toBeTruthy();
      expect(diagram.nodes.some((node) => /⃣|[├└─►]/.test(node.label))).toBe(false);
      expect(diagram.nodes.map((node) => node.label)).not.toContain('Da');
      expect(diagram.edges.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('nu strică un text care are doar un emoji-cifră izolat', () => {
    expect(normalizeLooseSchema('. Pas simplu 1️⃣')).toBe('. Pas simplu 1️⃣');
  });
});
