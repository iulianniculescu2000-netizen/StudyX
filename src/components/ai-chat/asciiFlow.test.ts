import { describe, expect, it } from 'vitest';
import { asciiFlowToMermaid, isPlainFenceLang } from './asciiFlow';

const SAMPLE = [
  'Diagnosticul confirmat → evaluare activitate (DAS28)',
  '        │',
  '        ▼',
  '1️⃣  Terapie de bază (DMARD sintetic)',
  '    – Metotrexat (MTX) 7-25 mg/ săptămână',
  '    – Leflunomidă 10-20 mg/zi',
  '        │',
  '        ▼',
  '2️⃣  Dacă răspuns insuficient',
  '    – **Combo** MTX + sulfasalazină',
  '        │',
  '        ▼',
  '3️⃣  Terapie biologică',
].join('\n');

describe('asciiFlowToMermaid', () => {
  it('turns an ASCII flow into a flowchart', () => {
    const result = asciiFlowToMermaid(SAMPLE)!;
    expect(result.startsWith('flowchart TD')).toBe(true);
    expect(result).toContain('N0 --> N1');
    expect(result).toContain('N2 --> N3');
    expect(result).toContain('Terapie de bază');
    expect(result).toContain('<br/>Metotrexat');
    expect(result).not.toContain('**');
    expect(result).not.toContain('1️⃣');
  });

  it('ignores ordinary code and short blocks', () => {
    expect(asciiFlowToMermaid('const a = 1;\nconsole.log(a);')).toBeNull();
    expect(asciiFlowToMermaid('A\n │\n ▼\nB')).toBeNull();
  });

  it('recognises plain fence languages', () => {
    expect(isPlainFenceLang('')).toBe(true);
    expect(isPlainFenceLang('text')).toBe(true);
    expect(isPlainFenceLang('ts')).toBe(false);
  });
});
