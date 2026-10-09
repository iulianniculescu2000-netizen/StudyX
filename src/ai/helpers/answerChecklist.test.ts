import { describe, expect, it } from 'vitest';
import { buildFixInstruction, checkAnswer, extractCitations, languageBalance, looksTruncated } from './answerChecklist';
import { estimateTextTokens } from './shared';

const GOOD =
  'Stenoza mitrală are ca **semn-cheie** sufluul diastolic în focarul mitral, cu pocnet de deschidere [1]. ' +
  '➔ Cauza cea mai frecventă este reumatismul articular acut. ➔ Ecografia confirmă diagnosticul și gradul stenozei [2].';

const codes = (text: string, sources = 3, extra = {}) => checkAnswer(text, { sourceCount: sources, ...extra }).issues.map((i) => i.code);

describe('checkAnswer', () => {
  it('un răspuns curat nu are probleme', () => {
    const r = checkAnswer(GOOD, { sourceCount: 3 });
    expect(r.issues).toEqual([]);
    expect(r.needsRegeneration).toBe(false);
    expect(r.fixInstruction).toBe('');
  });

  it('repară sedila automat și nu cere regenerare', () => {
    const r = checkAnswer('Fibrilaţia atrială şi tromboza: anticoagulare pentru prevenţia AVC-ului, în funcție de scor.', { sourceCount: 0 });
    expect(r.issues.map((i) => i.code)).toContain('sedilla');
    expect(r.autoFixed).toContain('Fibrilația atrială și');
    expect(r.autoFixed).not.toMatch(/[şţ]/);
    expect(r.needsRegeneration).toBe(false);
  });

  it('detectează răspuns în engleză', () => {
    const en =
      'Atrial fibrillation is the most common sustained arrhythmia and it is associated with the risk of stroke. ' +
      'The treatment of this condition is based on rate control and anticoagulation for the patients with a high score.';
    const r = checkAnswer(en, { sourceCount: 0 });
    expect(r.issues.map((i) => i.code)).toContain('not-romanian');
    expect(r.needsRegeneration).toBe(true);
    expect(r.fixInstruction).toMatch(/română/);
  });

  it('nu confundă româna cu termeni englezi sau latini', () => {
    const ro =
      'Pacientul cu sepsis necesită **antibioterapie** în prima oră, conform „golden hour”, plus resuscitare volemică, ' +
      'iar monitorizarea lactatului ghidează conduita; nu se așteaptă rezultatul hemoculturii pentru a începe tratamentul.';
    expect(codes(ro, 0)).not.toContain('not-romanian');
  });

  it('textul scurt în altă limbă nu declanșează testul de limbă', () => {
    expect(languageBalance('The patient is stable.')).toBeNull();
  });

  it('citări: inexistente față de numărul de surse', () => {
    const r = checkAnswer('Conform criteriilor Duke [4] endocardita infecțioasă se confirmă [1][2].', { sourceCount: 2 });
    const issue = r.issues.find((i) => i.code === 'citation-invalid');
    expect(issue?.detail).toContain('[4]');
    expect(issue?.detail).not.toContain('[1]');
    expect(r.needsRegeneration).toBe(true);
  });

  it('citări fără nicio sursă', () => {
    const r = checkAnswer('Criteriile Duke se aplică [1].', { sourceCount: 0 });
    expect(r.issues.map((i) => i.code)).toContain('citation-without-sources');
    expect(r.fixInstruction).toMatch(/citările/);
  });

  it('citări grupate și intervale', () => {
    expect(extractCitations('vezi [1, 3] și [2-4] și [7]')).toEqual([1, 3, 2, 3, 4, 7]);
    expect(codes('Vezi [1-3].', 3)).not.toContain('citation-invalid');
    expect(codes('Vezi [1-5].', 3)).toContain('citation-invalid');
  });

  it('paranteze pătrate din cod sau fără număr nu sunt citări', () => {
    expect(extractCitations('```js\nconst a = [1];\n``` și [text]'.replace(/```[\s\S]*?```/g, ''))).toEqual([]);
    expect(codes('Vezi `x[9]` în exemplu și lista [A, B].', 2)).not.toContain('citation-invalid');
  });

  it('listă prea lungă', () => {
    const list = Array.from({ length: 15 }, (_, i) => `➔ element ${i + 1}`).join('\n');
    expect(codes(`Cauze:\n${list}`, 0)).toContain('list-too-long');
    expect(codes(`Cauze:\n${list}`, 0, { maxListItems: 20 })).not.toContain('list-too-long');
  });

  it('ASCII art', () => {
    const art = 'Fluxul:\n┌────────┐\n│ Atriu  │\n└────────┘\n   ↓';
    expect(codes(art, 0)).toContain('ascii-art');
    expect(codes('A --> B\nB --> C\nC --> D', 0)).toContain('ascii-art');
    expect(codes('Un singur rând cu o săgeată --> nu e schemă.', 0)).not.toContain('ascii-art');
  });

  it('mermaid nu e ASCII art', () => {
    expect(codes('Schemă:\n```mermaid\nflowchart TD\nA --> B\nB --> C\n```\nAtât.', 0)).not.toContain('ascii-art');
  });

  it('doze fără sursă sunt marcate, cele cu avertisment/citare nu', () => {
    const bad = checkAnswer('Se administrează 300 mg aspirină și 5000 UI heparină iv.', { sourceCount: 0 });
    const issue = bad.issues.find((i) => i.code === 'dose-unsourced');
    expect(issue?.detail).toMatch(/300 mg/);
    expect(issue?.detail).toMatch(/5000 UI/);
    expect(bad.needsRegeneration).toBe(false);
    expect(codes('Doza de încărcare este 300 mg [1].', 2)).not.toContain('dose-unsourced');
    expect(codes('Se dă 300 mg, dar doza exactă o verifici în ghidul actual.', 0)).not.toContain('dose-unsourced');
    expect(codes('Doza este 0,5 mg/kg/zi.', 0)).toContain('dose-unsourced');
  });

  it('valori fără unități de doză nu declanșează', () => {
    expect(codes('Pacientul are 65 de ani și TA 140/90.', 0)).not.toContain('dose-unsourced');
  });

  it('text tăiat', () => {
    const cut = `${'Stenoza aortică severă se manifestă prin angină, sincopă și dispnee de efort, iar '.repeat(3)}tratamentul definitiv este chirurgic sau transcate`;
    expect(codes(cut, 0)).toContain('truncated');
    expect(codes(GOOD, 3)).not.toContain('truncated');
  });

  it('propoziții repetate', () => {
    const rep = 'Hipertensiunea arterială crește riscul cardiovascular major. Hipertensiunea arterială crește riscul cardiovascular major. Hipertensiunea arterială crește riscul cardiovascular major.';
    const r = checkAnswer(rep, { sourceCount: 0 });
    expect(r.issues.map((i) => i.code)).toContain('repetition');
    expect(r.needsRegeneration).toBe(true);
  });

  it('răspuns prea lung și răspuns gol', () => {
    expect(codes('Cuvânt diferit. '.repeat(500) + 'x'.repeat(100), 0, { maxChars: 2000 })).toContain('too-long');
    const empty = checkAnswer('  ', { sourceCount: 0 });
    expect(empty.needsRegeneration).toBe(true);
    expect(empty.issues[0].code).toBe('empty');
  });

  it('expectRomanian=false dezactivează testul de limbă', () => {
    const en =
      'The patient is a 60 year old man with chest pain and the ECG shows ST elevation, so the treatment is primary PCI with the antiplatelet therapy.';
    expect(codes(en, 0, { expectRomanian: false })).not.toContain('not-romanian');
  });
});

describe('buildFixInstruction', () => {
  it('rămâne scurtă (≤ 60 tokeni) chiar cu toate problemele grave', () => {
    const text = buildFixInstruction([
      { code: 'not-romanian', severity: 'error', detail: '' },
      { code: 'citation-invalid', severity: 'error', detail: '' },
      { code: 'repetition', severity: 'error', detail: '' },
    ]);
    expect(estimateTextTokens(text)).toBeLessThanOrEqual(60);
    expect(text).toMatch(/română/);
  });
});

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
