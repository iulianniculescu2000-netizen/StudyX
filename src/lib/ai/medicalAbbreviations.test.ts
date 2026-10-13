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

  it('nu contrazice utilizatorul care a explicat deja abrevierea sau vorbește despre aortă', () => {
    expect(explainAbbreviations('SA (stenoză aortică) și tratamentul ei')).toBe('SA (stenoză aortică) și tratamentul ei');
    expect(explainAbbreviations('stenoza aortică (SA), indicații chirurgicale')).toBe('stenoza aortică (SA), indicații chirurgicale');
    expect(explainAbbreviations('AR aortică: criterii de severitate')).toBe('AR aortică: criterii de severitate');
    expect(explainAbbreviations('artrita reumatoidă (AR)')).toBe('artrita reumatoidă (AR)');
  });

  it('folosește grafia corectă a tromboembolismului', () => {
    expect(explainAbbreviations('profilaxia TEP')).toContain('tromboembolismul pulmonar');
  });
});
