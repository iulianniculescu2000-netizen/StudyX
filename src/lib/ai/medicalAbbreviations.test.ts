import { describe, expect, it } from 'vitest';
import { explainAbbreviations } from './medicalAbbreviations';

describe('explainAbbreviations', () => {
  it('explică AR ca artrită reumatoidă, ca modelul să nu aleagă altă patologie', () => {
    expect(explainAbbreviations('tratamentul AR')).toBe('tratamentul AR (AR = artrita reumatoidă)');
  });

  it('explică fiecare abreviere o singură dată', () => {
    expect(explainAbbreviations('AR și SA, apoi AR')).toBe('AR și SA, apoi AR (AR = artrita reumatoidă; SA = spondilita anchilozantă)');
  });

  it('nu atinge cuvinte care conțin literele sau textul fără abrevieri', () => {
    expect(explainAbbreviations('arterita Takayasu, SARS, MARE')).toBe('arterita Takayasu, SARS, MARE');
    expect(explainAbbreviations('artrita reumatoidă')).toBe('artrita reumatoidă');
  });
});
