/**
 * Model answers sometimes arrive as one dense paragraph with the structure
 * inlined, or with markdown the model escaped itself ("\* Probabilitate").
 * These are the two shapes users actually reported seeing in the app.
 */
import { describe, expect, it } from 'vitest';
import { spaceProse, structureRawText } from './structure';
import { formatMessage } from './shared';

describe('structureRawText', () => {
  it('breaks an inlined enumeration into separate lines', () => {
    const raw =
      '1. Transfuziile de trombocite sunt indicate sub 100 000/µL în prezența unei coagulopatii, fiindcă trombocitele susțin hemostaza primară. ' +
      '2. Alegerea plasmei se bazează pe INR crescut, dar deficitul de trombocite este factorul limitant al hemostazei în acest caz. ' +
      '3. Heparina ar agrava sângerarea, iar vitamina K nu are efect rapid în coagulopatia de consum acută. ' +
      '4. Regula de reținut este că transfuzia de trombocite precede plasma sub pragul de siguranță.';
    const lines = structureRawText(raw).split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[1].startsWith('2.')).toBe(true);
    expect(lines[3].startsWith('4.')).toBe(true);
  });

  it('splits inline bold section labels onto their own blocks', () => {
    const raw =
      '**Mecanism:** hipoxia alveolară produce vasoconstricție pulmonară și crește postsarcina ventriculului drept în timp. ' +
      '**Capcană:** confuzia frecventă este cu embolia pulmonară acută, care are un debut brusc și context diferit total.';
    const out = structureRawText(raw);
    expect(out).toContain('\n\n**Capcană:**');
  });

  it('removes markdown the model escaped by mistake', () => {
    expect(structureRawText('\\* Probabilitate: mare')).toBe('* Probabilitate: mare');
    expect(structureRawText('\\*\\*Mecanism\\*\\*')).toBe('**Mecanism**');
    expect(formatMessage('\\*\\*Mecanism\\*\\*')).toContain('<strong>Mecanism</strong>');
  });

  it('leaves short lines and already-structured text alone', () => {
    const structured = '## Titlu\n\n- unu\n- doi\n\n1. pas\n2. pas';
    expect(structureRawText(structured)).toBe(structured);
    expect(structureRawText('Scurt și clar. 2. nu e o enumerare reală.')).toBe('Scurt și clar. 2. nu e o enumerare reală.');
  });

  it('never reflows code fences', () => {
    const code = '```mermaid\ngraph TD\n  A[Unu cu un text destul de lung ca sa treaca pragul de o suta patruzeci de caractere] --> B[Doi]\n```';
    expect(structureRawText(code)).toBe(code);
  });

  it('keeps table rows on one line but still unescapes them', () => {
    const table = '| \\*Probabilitate\\* | Nota foarte lunga ca sa depaseasca pragul de o suta patruzeci de caractere impus in normalizator |\n| --- | --- |';
    const out = structureRawText(table).split('\n');
    expect(out).toHaveLength(2);
    expect(out[0]).toContain('*Probabilitate*');
  });

  it('breaks a run of per-option verdicts into a sub-list', () => {
    const raw = '3. C. Heparina subcutană ar agrava sângerarea; D. Vitamina K orală nu are efect rapid; B. Plasma proaspătă ar corecta INR, dar nu este prioritară.';
    expect(structureRawText(raw).split('\n')).toEqual([
      '3. Variante:',
      '  - **C.** Heparina subcutană ar agrava sângerarea',
      '  - **D.** Vitamina K orală nu are efect rapid',
      '  - **B.** Plasma proaspătă ar corecta INR, dar nu este prioritară.',
    ]);
  });

  it('keeps a real lead sentence above the option sub-list', () => {
    const raw = 'Celelalte variante cad din motive diferite: A. Ampicilina nu acoperă germenii de spital; D. Vancomicina vizează doar Gram-pozitivii.';
    const lines = structureRawText(raw).split('\n');
    expect(lines[0]).toBe('Celelalte variante cad din motive diferite:');
    expect(lines[1]).toBe('- **A.** Ampicilina nu acoperă germenii de spital');
    expect(lines[2]).toBe('- **D.** Vancomicina vizează doar Gram-pozitivii.');
  });

  it('splits option verdicts nested inside a long inline enumeration', () => {
    const raw =
      '1. Mecanismul corect este scăderea trombocitelor sub pragul de siguranță hemostatică, cu risc de sângerare activă la pacientul septic. ' +
      '2. Varianta aleasă cade fiindcă plasma corectează factorii, nu numărul de trombocite, iar deficitul dominant aici este trombocitar. ' +
      '3. C. Heparina ar agrava sângerarea; D. Vitamina K nu are efect rapid; B. Plasma nu este prioritară.';
    const lines = structureRawText(raw).split('\n');
    expect(lines).toHaveLength(6);
    expect(lines[2]).toBe('3. Variante:');
    expect(lines[3]).toBe('  - **C.** Heparina ar agrava sângerarea');
  });

  it('does not mistake a single lettered reference for a list', () => {
    const raw = 'Varianta B. Plasma proaspătă congelată rămâne indicată doar când INR-ul este crescut și pacientul sângerează activ din cauza deficitului de factori.';
    expect(structureRawText(raw)).toBe(raw);
  });

  it('turns mid-sentence bullet glyphs into list items', () => {
    const raw =
      'Criteriile majore de diagnostic pe care trebuie sa le retii pentru examenul de rezidentiat sunt urmatoarele: • febra persistenta • hemoculturi pozitive • vegetatii ecografice';
    expect(structureRawText(raw)).toContain('\n- febra persistenta');
  });
});

describe('formatMessage with unstructured input', () => {
  it('renders an inlined enumeration as a real list', () => {
    const raw =
      '1. Prima idee explicata suficient de detaliat ca sa treaca pragul minim de lungime impus in normalizatorul nostru. ' +
      '2. A doua idee, la fel de detaliata, ca sa avem doua elemente distincte in lista finala. ' +
      '3. A treia idee care incheie enumerarea.';
    const html = formatMessage(raw);
    expect((html.match(/<li/g) ?? []).length).toBe(3);
  });
});

describe('spaceProse', () => {
  it('desparte rândurile de proză lipite cu un singur \n', () => {
    expect(spaceProse('Selectează „Adaugă cărți”.\nCapcană de examen: nu confunda opțiunile.')).toBe(
      'Selectează „Adaugă cărți”.\n\nCapcană de examen: nu confunda opțiunile.',
    );
  });

  it('rupe un perete de text la sfârșit de propoziție', () => {
    const wall = Array.from({ length: 6 }, (_, i) => `Propoziția numărul ${i + 1} descrie un mecanism patologic important în detaliu.`).join(' ');
    const out = spaceProse(wall);
    expect(out.split('\n\n').length).toBeGreaterThanOrEqual(2);
    expect(out.replace(/\n\n/g, ' ')).toBe(wall);
  });

  it('nu atinge liste, tabele, cod, titluri și formule', () => {
    const text = '- unu\n- doi\ncontinuare\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```\ncod linie 1\ncod linie 2\n```\n\n## Titlu\nText sub titlu\n\n$$\nx = 1\ny = 2\n$$';
    expect(spaceProse(text)).toBe(text.replace('## Titlu\nText sub titlu', '## Titlu\nText sub titlu'));
  });

  it('nu rupe la abrevieri sau zecimale', () => {
    const text = 'Dr. Popescu recomandă 2.5 mg zilnic conform ghidului ESC 2023, vezi pag. 151 pentru detalii despre tratament și monitorizare în practica clinică curentă, deoarece doza se ajustează în funcție de funcția renală, de vârstă și de bolile asociate, iar controlul periodic al tensiunii arteriale și al glicemiei rămâne obligatoriu pe toată durata terapiei, fără întreruperi nejustificate de către pacient.';
    expect(spaceProse(text)).toBe(text);
  });

  it('e idempotent', () => {
    const once = spaceProse('Prima linie.\nA doua linie.');
    expect(spaceProse(once)).toBe(once);
  });
});

describe('listă numerotată cu etichetă îngroșată', () => {
  it('„1. **Etichetă:** text lung” rămâne un singur element de listă (nu „1.” singur pe rând)', () => {
    const line = '1. **Definiție și mecanism:** Șocul septic este o formă de șoc distributiv caracterizată prin vasodilatație periferică severă și hipotensiune refractară la resuscitarea volemică, iar noradrenalina acționează pe receptorii alfa-1.';
    expect(structureRawText(line)).toBe(line);
    expect(structureRawText(`- ${line.slice(3)}`)).toBe(`- ${line.slice(3)}`);
  });
  it('eticheta din mijlocul unui rând lung tot se desparte', () => {
    const line = 'Noradrenalina este vasopresorul de primă linie în ghidurile internaționale pentru șocul septic și are efect alfa-1 puternic asupra tonusului vascular. **Capcana:** adrenalina e linia a doua.';
    expect(structureRawText(line)).toContain('\n\n**Capcana:**');
  });
});
