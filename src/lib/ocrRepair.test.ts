import { describe, expect, it } from 'vitest';
import corrections from '../data/ocrCorrections.json';
import { OCR_CORRECTION_COUNT, repairOcr } from './ocrRepair';

describe('repairOcr', () => {
  it('repară greșeli sistematice de OCR, cuvânt întreg', () => {
    expect(repairOcr('Evaluați funeție renală pentru nivelui')).toContain('funcție');
    expect(repairOcr('obstrueție și afeețiuni')).toBe('obstrucție și afecțiuni');
  });

  it('păstrează majusculele', () => {
    expect(repairOcr('Funeția este scăzută')).toBe('Funcția este scăzută');
    expect(repairOcr('FUNEȚIE')).toBe('FUNCȚIE');
  });

  it('repară cifrele puse în loc de litere doar între litere mici', () => {
    expect(repairOcr('a1ticulară și rap01t')).toBe('articulară și raport');
    expect(repairOcr('vitamina B12, H1N1, 10 mg')).toBe('vitamina B12, H1N1, 10 mg');
  });

  it('repară „vitamina 8 12” în „vitamina B 12”, dar nu alte cifre', () => {
    expect(repairOcr('vitamina 8 12 intramuscular')).toBe('vitamina B 12 intramuscular');
    expect(repairOcr('vitamina 8 mg zilnic')).toBe('vitamina 8 mg zilnic');
  });

  it('nu atinge cuvinte valide și e idempotent', () => {
    const valid = 'istorie arteriole marca anemic cancerul infecția';
    expect(repairOcr(valid)).toBe(valid);
    const once = repairOcr('pentrn funeție lmediat');
    expect(repairOcr(once)).toBe(once);
  });

  it('dicționarul nu are corecturi circulare sau goale', () => {
    const entries = Object.entries(corrections as Record<string, string>);
    expect(entries.length).toBe(OCR_CORRECTION_COUNT);
    for (const [wrong, right] of entries) {
      expect(right.length).toBeGreaterThanOrEqual(5);
      expect(wrong).not.toBe(right);
      expect(Object.hasOwn(corrections, right)).toBe(false);
    }
  });
});
