import { describe, expect, it } from 'vitest';
import { looksTruncated } from './answerChecklist';

describe('looksTruncated', () => {
  const long = 'Hipertensiunea arterială se definește prin valori crescute persistent ale presiunii în artere, '.repeat(4);
  it('prinde un răspuns oprit la mijloc de propoziție', () => {
    expect(looksTruncated(`${long}iar tratamentul include modificări ale stilului de via`)).toBe(true);
  });
  it('lasă în pace răspunsurile terminate, listele și textele scurte', () => {
    expect(looksTruncated(`${long}iar tratamentul include modificări ale stilului de viață.`)).toBe(false);
    expect(looksTruncated(`${long}\n- diuretice tiazidice`)).toBe(false);
    expect(looksTruncated('Text scurt fără punct')).toBe(false);
  });
});
