import { describe, expect, it } from 'vitest';
import { parseGrile } from './grileParser';
import { toQuizImportData } from './grileImport';

const lines = (text: string) => text.split('\n').map((t) => ({ text: t, page: 1 }));

const SAMPLE = `Hematologie – set de antrenament (Kumar cap. 16)
123 grile · CS = complement simplu (1 corect), CM = complement multiplu (2–4 corecte)
1. (CM)
Referitor la modificările volumului plasmatic, sunt adevărate:
A. o reducere a volumului plasmatic duce la o hemoglobină fals crescută
B. volumul plasmatic crescut din sarcină produce o anemie falsă
C. deshidratarea produce o anemie falsă
D. policitemia aparentă se asociază cu volum plasmatic crescut
E. în sarcină volumul de eritrocite scade
Răspuns corect: A, B
Explicație
A – adevărat. «O reducere a volumului plasmatic va duce la o hemoglobină fals crescută»
B – adevărat. «Un volum plasmatic crescut produce o anemie falsă»
C – fals. în deshidratare volumul plasmatic scade
D – fals. în policitemia aparentă volumul plasmatic este redus
E – fals. în sarcină volumul de eritrocite crește puțin
Sursa: Kumar, p. 350
Hematologie – set de antrenament (Kumar cap. 16) · pagina 2
2. (CS)
O creștere a 2,3-BPG determină:
A. deplasarea curbei de disociere a oxigenului spre dreapta
B. o anemie falsă
C. o hemoglobină fals crescută
D. eliberarea mai dificilă a oxigenului în țesuturi
E. precipitarea claudicației intermitente
Răspuns corect: A
Explicație
A – adevărat. «O creștere a 2,3-BPG determină o deplasare spre dreapta»
B – fals. anemia falsă apare când volumul plasmatic crește
Sursa: Kumar, p. 350`;

describe('șablonul „set de antrenament” (Răspuns corect → Explicație → Sursa)', () => {
  const { questions } = parseGrile(lines(SAMPLE));

  it('citește fiecare grilă cu exact 5 variante și răspunsul din cheie', () => {
    expect(questions).toHaveLength(2);
    expect(questions.map((q) => q.options.length)).toEqual([5, 5]);
    expect(questions[0].options.map((o) => o.isCorrect)).toEqual([true, true, false, false, false]);
    expect(questions[0].multipleCorrect).toBe(true);
    expect(questions[1].options.map((o) => o.isCorrect)).toEqual([true, false, false, false, false]);
    expect(questions[1].multipleCorrect).toBe(false);
  });

  it('nu lipește „Explicație”/„Sursa” de variante și nu citește antetul de pagină', () => {
    const all = questions.flatMap((q) => q.options.map((o) => o.text)).join(' | ');
    expect(all).not.toMatch(/Explica[țt]ie|Sursa|pagina|adev[ăa]rat\./i);
  });

  it('păstrează explicația și sursa și le duce în grila importată', () => {
    expect(questions[0].explanation).toContain('A – adevărat.');
    expect(questions[0].explanation).toMatch(/Sursa: Kumar, p\. 350$/);
    const data = toQuizImportData('Hematologie', questions);
    expect(data.questions[0].explanation).toBe(questions[0].explanation);
  });
});
