import { describe, expect, it } from 'vitest';
import type { RetrievedChunk } from '../../ai/types';
import { bodyLength, pickRelevantDoc } from './relevantDocPick';
import { tidyBookText } from './relevantDocFormatting';

const chunk = (id: string, text: string, score = 0.8): RetrievedChunk => ({
  id, text, topic: 't', source: 'Lawrence.pdf', difficulty: 'medium', score,
  keywordScore: 0, semanticScore: 0, recencyBoost: 0, weaknessBoost: 0,
});

const BODY = 'Artrita reumatoidă este o boală inflamatorie cronică, simetrică, care afectează articulațiile mici. '
  + 'Tratamentul de fond începe precoce cu metotrexat, la care se adaugă la nevoie terapii biologice anti-TNF.';

describe('pickRelevantDoc', () => {
  const question = 'Care este tratamentul de fond al artritei reumatoide?';

  it('nu oferă un fragment care e doar un titlu, deși se potrivește perfect pe cuvinte', () => {
    const titleOnly = chunk('t', 'SPONDILITĂ ANCHILOZANTĂ / SA');
    expect(bodyLength(titleOnly.text)).toBe(0);
    expect(pickRelevantDoc('Criteriul de diagnostic al spondilitei anchilozante', [titleOnly])).toBeNull();
  });

  it('sare peste titlu și ia primul fragment cu text de citit', () => {
    const picked = pickRelevantDoc(question, [chunk('t', 'ARTRITA REUMATOIDĂ'), chunk('b', `ARTRITA REUMATOIDĂ\n\n${BODY}`)]);
    expect(picked?.id).toBe('b');
  });

  it('cere cuvinte-cheie comune, nu doar scor semantic', () => {
    const offTopic = chunk('x', 'Insuficiența renală cronică apare după leziuni glomerulare repetate, cu scăderea ratei de filtrare. '.repeat(3));
    expect(pickRelevantDoc(question, [offTopic])).toBeNull();
  });

  it('respectă pragul de scor', () => {
    expect(pickRelevantDoc(question, [chunk('b', BODY, 0.2)])).toBeNull();
  });
});

describe('pickRelevantDoc: legătura cu răspunsul corect', () => {
  const question = 'Un pacient cu anemie feriprivă are Hb = 7,5 g/dL. Care este intervenția corectă?';
  const answer = 'Transfuzii de hematii urgent, apoi tratament oral cu fier';
  const ALERTA = 'Toți pacienții cu semne și simptome de alarmă necesită evaluare endoscopică: anemie feriprivă, pierdere involuntară din greutate, anorexie, hemateméză sau melenă, vărsături persistente. Pacienții cu ulcer gastric trebuie biopsiați pentru a exclude un proces malign și reevaluați endoscopic pentru a verifica vindecarea completă.';
  const TRATAMENT = 'Tratamentul anemiei feriprive: fier oral, iar transfuziile de hematii sunt rezervate pacienților cu instabilitate hemodinamică sau anemie severă simptomatică. Pacienții cu anemie feriprivă primesc fier intravenos când nu tolerează tratamentul oral.';

  it('respinge fragmentul care vorbește despre același subiect, dar nu susține răspunsul (lista de alarmă pentru endoscopie)', () => {
    expect(pickRelevantDoc(question, [chunk('alarma', ALERTA)], answer)).toBeNull();
  });

  it('acceptă fragmentul care vorbește despre tratament și transfuzii', () => {
    expect(pickRelevantDoc(question, [chunk('alarma', ALERTA), chunk('tratament', TRATAMENT)], answer)?.id).toBe('tratament');
  });

  it('fără text de răspuns, rămâne regula veche (doar întrebarea)', () => {
    expect(pickRelevantDoc(question, [chunk('alarma', ALERTA)])?.id).toBe('alarma');
  });
});

describe('tidyBookText', () => {
  it('repară cifrele puse de OCR în locul literelor, doar în mijlocul cuvintelor', () => {
    expect(tidyBookText('distrucție a1ticulară, hipe1trofia, rap01t de 3:1, titrul 1idicat'))
      .toBe('distrucție articulară, hipertrofia, raport de 3:1, titrul 1idicat');
  });

  it('nu atinge cifrele reale', () => {
    const real = 'vitamina B12, H1N1, 10 mg, CD4, IL-1β, pH 7, HbA1c';
    expect(tidyBookText(real)).toBe(real);
  });

  it('trece diacriticele cu sedilă la virgulă și lipește cratimele de capăt de rând', () => {
    expect(tidyBookText('Deşi prezenţa şi tra-\ntamentul')).toBe('Deși prezența și tratamentul');
  });
});
