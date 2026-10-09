import { describe, expect, it } from 'vitest';
import { cleanLineText, matchRunningHeader, orderLines, processPage, type PdfTextItem } from './readingOrder';
import { assignPagesToChunks, extractPageMap, pageMarker } from '../../ai/pageMarkers';
import { formatPageMarker } from './readingOrder';

const item = (str: string, x: number, y: number, width = str.length * 5, height = 10): PdfTextItem => ({
  str,
  transform: [10, 0, 0, 10, x, y],
  width,
  height,
  hasEOL: true,
});

/** Coloană de linii (x0 fix, lățime variabilă, ca textul real). */
const column = (lines: string[], x: number, yStart: number, pitch = 14) =>
  lines.map((t, i) => item(t, x, yStart - i * pitch, 200 - (i % 3) * 7));

// Items intenționat amestecate (ordinea din PDF intercalează coloanele, ca în OCR-ul real).
const shuffle = <T,>(arr: T[]): T[] => arr.map((v, i) => [v, (i * 7919) % 97] as const).sort((a, b) => a[1] - b[1]).map(([v]) => v);

function twoColumnPage(): PdfTextItem[] {
  const left = column(['Stanga unu', 'Stanga doi', 'Stanga trei', 'Stanga patru'], 50, 700);
  const right = column(['Dreapta unu', 'Dreapta doi', 'Dreapta trei', 'Dreapta patru'], 320, 700);
  return [
    item('1136 Hipertensiunea arterială', 50, 800),
    item('Tipurile de hipertensiune arterială', 120, 760, 360, 14),
    ...left,
    ...right,
    item('Fig. 31.4 Schema TA = DC x FC/VB', 320, 600, 200),
    item('1136', 300, 30, 20),
  ];
}

describe('orderLines / processPage', () => {
  it('2 coloane: stânga apoi dreapta, titlu full-width înaintea lor, antet scos', () => {
    const res = processPage(shuffle(twoColumnPage()));
    expect(res.columns).toBe(2);
    expect(res.printedPage).toBe(1136);
    expect(res.runningTitle).toBe('Hipertensiunea arterială');
    expect(res.text).toBe(
      [
        'Tipurile de hipertensiune arterială',
        '',
        'Stanga unu',
        'Stanga doi',
        'Stanga trei',
        'Stanga patru',
        'Dreapta unu',
        'Dreapta doi',
        'Dreapta trei',
        'Dreapta patru',
        '',
        'Fig. 31.4 Schema TA = DC x FC/VB',
      ].join('\n'),
    );
  });

  it('titlu full-width la mijloc separă benzile: stânga+dreapta sus, titlu, stânga+dreapta jos', () => {
    const items = [
      ...column(['A1', 'A2', 'A3'], 50, 700),
      ...column(['B1', 'B2', 'B3'], 320, 700),
      item('TITLU LARG', 150, 640, 300, 14),
      ...column(['C1', 'C2', 'C3'], 50, 600),
      ...column(['D1', 'D2', 'D3'], 320, 600),
    ];
    const res = processPage(shuffle(items));
    expect(res.text.split('\n').filter(Boolean)).toEqual(['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'TITLU LARG', 'C1', 'C2', 'C3', 'D1', 'D2', 'D3']);
  });

  it('titlu full-width format din cuvinte separate peste gutieră rămâne full-width', () => {
    const items = [
      ...column(['A1', 'A2', 'A3'], 50, 700),
      ...column(['B1', 'B2', 'B3'], 320, 700),
      item('Capitolul', 240, 640, 55, 14),
      item('trei', 300, 640, 25, 14),
      ...column(['C1', 'C2', 'C3'], 50, 600),
      ...column(['D1', 'D2', 'D3'], 320, 600),
    ];
    const lines = orderLines(items).lines.map((l) => l.text);
    expect(lines).toEqual(['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'Capitolul trei', 'C1', 'C2', 'C3', 'D1', 'D2', 'D3']);
  });

  it('o singură coloană: de sus în jos, cuvintele pe aceeași linie unite pe x, paragrafe păstrate', () => {
    const items = [
      item('Primul', 50, 700, 40),
      item('paragraf', 95, 700, 45),
      item('continuare', 50, 686, 60),
      item('Al doilea paragraf', 50, 640, 100),
    ];
    const res = processPage(shuffle(items));
    expect(res.columns).toBe(1);
    expect(res.text).toBe('Primul paragraf\ncontinuare\n\nAl doilea paragraf');
  });

  it('watermark scos (și inline), diacritice cu sedilă -> virgulă, prefix hiper despărțit', () => {
    expect(cleanLineText('MG Rezidentiat - Grile Rezi')).toBe('');
    expect(cleanLineText('boala Rezidentiat - Grile continuă')).toBe('boala continuă');
    expect(cleanLineText('inervaţie şi Ţară')).toBe('inervație și Țară');
    expect(cleanLineText('hiper tensiune și hipo tensiune')).toBe('hipertensiune și hipotensiune');
    expect(cleanLineText('un hiper pe masă')).toBe('un hiper pe masă'); // „pe" prea scurt: nu se unește
    const res = processPage([
      item('MG Rezidentiat - Grile Rezi', 50, 780, 150),
      item('Text normal cu ţesut', 50, 700, 100),
      item('si continuare', 50, 686, 80),
    ]);
    expect(res.text).toBe('Text normal cu țesut\nsi continuare');
  });

  it('cuvânt cu cratimă la capăt de linie se unește; antet "Titlu 1137" și număr singur', () => {
    const res = processPage([
      item('Hipertensiunea arterială 1137', 300, 800, 200),
      item('pacienții cu hiper-', 50, 700, 100),
      item('tensiune severă', 50, 686, 80),
      item('1137', 50, 20, 20),
    ]);
    expect(res.printedPage).toBe(1137);
    expect(res.text).toBe('pacienții cu hipertensiune severă');
  });

  it('matchRunningHeader nu prinde linii de corp', () => {
    expect(matchRunningHeader('1136 Hipertensiunea arterială')).toEqual({ printedPage: 1136, title: 'Hipertensiunea arterială' });
    expect(matchRunningHeader('Hipertensiunea arterială 1137')?.printedPage).toBe(1137);
    expect(matchRunningHeader('Doza este 20 mg zilnic')).toBeNull();
    expect(matchRunningHeader('5 mg zilnic')).toBeNull();
  });

  it('pagină goală / itemi fără str nu aruncă', () => {
    expect(processPage([]).text).toBe('');
    expect(processPage([{ transform: [1, 0, 0, 1, 0, 0] }, item('  ', 1, 1)]).text).toBe('');
  });
});

describe('marcaje de pagină cu printedPage', () => {
  it('formatul din worker == cel din pageMarkers și round-trip', () => {
    expect(formatPageMarker(281, 1136)).toBe(pageMarker(281, 1136));
    expect(formatPageMarker(5)).toBe(pageMarker(5));
    const raw = pageMarker(281, 1136) + 'alfa\n' + pageMarker(282) + 'beta\n' + pageMarker(283, 1138) + 'gama';
    const { text, pages } = extractPageMap(raw);
    expect(text).toBe('alfa\nbeta\ngama');
    expect(pages).toEqual([
      { offset: 0, page: 281, printedPage: 1136 },
      { offset: 5, page: 282 },
      { offset: 10, page: 283, printedPage: 1138 },
    ]);
  });

  it('assignPagesToChunks propagă printedPage', () => {
    const raw = pageMarker(281, 1136) + 'Primul fragment lung de text aici\n' + pageMarker(282, 1137) + 'Al doilea fragment lung de text aici';
    const { text, pages } = extractPageMap(raw);
    const out = assignPagesToChunks(text, [{ text: 'Primul fragment lung de text aici' }, { text: 'Al doilea fragment lung de text aici' }], pages);
    expect(out[0]).toMatchObject({ page: 281, printedPage: 1136 });
    expect(out[1]).toMatchObject({ page: 282, printedPage: 1137 });
  });
});

describe('performanță', () => {
  it('carte sintetică de 400 de pagini < 2s', () => {
    const items = twoColumnPage();
    for (let i = 0; i < 30; i += 1) items.push(...column([`l${i}`], 50, 500 - i * 0.1));
    const t0 = performance.now();
    for (let p = 0; p < 400; p += 1) processPage(items);
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});

describe('cleanLineText: sufixe rupte de OCR (doar cazuri sigure)', () => {
  it('rejoins a lowercase fragment + a suffix that is never a standalone word', () => {
    expect(cleanLineText('componenta domi nantă a tensiunii')).toBe('componenta dominantă a tensiunii');
    expect(cleanLineText('inser țiune')).toBe('inserțiune');
    expect(cleanLineText('stabi litate')).toBe('stabi litate'); // "litate" nu e în listă: nu ghicim
    expect(cleanLineText('insta bilitate')).toBe('instabilitate');
  });
  it('leaves ambiguous cases alone', () => {
    expect(cleanLineText('Domi nantă')).toBe('Domi nantă'); // fragment cu majusculă
    expect(cleanLineText('o nantă')).toBe('o nantă'); // fragment prea scurt
    expect(cleanLineText('îți spun ție ceva')).toBe('îți spun ție ceva');
    expect(cleanLineText('tratamentul este eficient')).toBe('tratamentul este eficient');
  });
});

describe('processPage: legendă de figură duplicată', () => {
  it('keeps one copy of an identical "Fig. N.N" caption, leaves everything else', () => {
    const items = [
      item('Text introductiv despre figură', 50, 700, 250),
      item('Fig. 31.4 Schema TA = DC x FC/VB', 50, 650, 200),
      item('Fig. 31.4 Schema TA = DC x FC/VB', 50, 600, 200),
      item('Fig. 31.5 Altă schemă', 50, 550, 200),
    ];
    const res = processPage(items);
    expect(res.text.match(/Fig\. 31\.4/g)).toHaveLength(1);
    expect(res.text).toContain('Fig. 31.5 Altă schemă');
  });
  it('does not touch repeated non-caption lines', () => {
    const res = processPage([item('Doza zilnică', 50, 700), item('Doza zilnică', 50, 650)]);
    expect(res.text.match(/Doza zilnică/g)).toHaveLength(2);
  });
});
