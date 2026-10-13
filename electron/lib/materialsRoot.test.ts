import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { findMaterialsRoot, safeExpected } = require('./materialsRoot.cjs');

const EXPECTED = [
  'Carti/Kumar/Kumar compilat.pdf',
  'Carti/Lawrence/Lawrence compilat.pdf',
  'Carti/Sinopsis/Sinopsis compilat.pdf',
];

describe('findMaterialsRoot', () => {
  let base = '';
  let tmp = '';
  const file = (...parts: string[]) => {
    const full = path.join(tmp, ...parts);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, 'x');
  };
  const dir = (...parts: string[]) => fs.mkdirSync(path.join(tmp, ...parts), { recursive: true });
  const at = (...parts: string[]) => path.join(tmp, ...parts);

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'studyx-root-'));
    // The resolver intentionally visits three ancestors. Keep them inside this
    // fixture so another test's materials under the shared temp root cannot win.
    tmp = path.join(base, 'scope', 'case', 'root');
    fs.mkdirSync(tmp, { recursive: true });
    // Folderul corect: cele trei cărți + Capitole.
    for (const rel of EXPECTED) file('Desktop', 'Rezidentiat', ...rel.split('/'));
    dir('Desktop', 'Rezidentiat', 'Capitole');
    // Un folder vecin cu aceeași structură, dar cu alte cărți (ca „Licenta”).
    file('Desktop', 'Licenta', 'Carti', 'altceva.pdf');
    dir('Desktop', 'Licenta', 'Capitole');
  });
  afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

  it('alegerea corectă rămâne neschimbată', () => {
    const res = findMaterialsRoot(at('Desktop', 'Rezidentiat'), EXPECTED);
    expect(res).toMatchObject({ ok: true, root: at('Desktop', 'Rezidentiat'), via: 'same', books: 3, hasCapitole: true });
  });

  it('un subfolder ales din greșeală (Carti) duce la folderul-părinte', () => {
    const res = findMaterialsRoot(at('Desktop', 'Rezidentiat', 'Carti'), EXPECTED);
    expect(res).toMatchObject({ ok: true, root: at('Desktop', 'Rezidentiat'), books: 3 });
    expect(res.via).toBe('parent');
  });

  it('Desktop (părintele ambelor) alege folderul cu cărțile, nu pe cel vecin', () => {
    const res = findMaterialsRoot(at('Desktop'), EXPECTED);
    expect(res).toMatchObject({ ok: true, root: at('Desktop', 'Rezidentiat'), books: 3 });
    expect(res.via).toBe('child');
  });

  it('un folder vecin (Licenta) duce la cel corect, fiindcă are mai multe cărți așteptate', () => {
    const res = findMaterialsRoot(at('Desktop', 'Licenta'), EXPECTED);
    expect(res).toMatchObject({ ok: true, root: at('Desktop', 'Rezidentiat'), books: 3 });
  });

  it('o carte lipsă nu strică: contează câte sunt', () => {
    fs.rmSync(at('Desktop', 'Rezidentiat', 'Carti', 'Sinopsis', 'Sinopsis compilat.pdf'));
    expect(findMaterialsRoot(at('Desktop', 'Rezidentiat'), EXPECTED)).toMatchObject({ ok: true, books: 2 });
  });

  it('fără nicio carte, dar cu Carti și Capitole, tot e acceptat (pentru sincronizarea Capitolelor)', () => {
    const res = findMaterialsRoot(at('Desktop', 'Licenta'), ['Carti/inexistent.pdf']);
    expect(res).toMatchObject({ ok: true, root: at('Desktop', 'Licenta'), books: 0, hasCapitole: true });
  });

  it('nimic de găsit: not-found; folder inexistent: missing; cale relativă: invalid', () => {
    dir('Gol', 'Altceva');
    expect(findMaterialsRoot(at('Gol'), EXPECTED)).toEqual({ ok: false, code: 'not-found' });
    expect(findMaterialsRoot(at('nu-exista'), EXPECTED)).toEqual({ ok: false, code: 'missing' });
    expect(findMaterialsRoot('relativ/cale', EXPECTED)).toEqual({ ok: false, code: 'invalid' });
    expect(findMaterialsRoot(42 as unknown as string, EXPECTED)).toEqual({ ok: false, code: 'invalid' });
  });

  it('un fișier în loc de folder: invalid', () => {
    file('doar-fisier.txt');
    expect(findMaterialsRoot(at('doar-fisier.txt'), EXPECTED)).toEqual({ ok: false, code: 'invalid' });
  });

  it('ignoră căile așteptate nesigure (.., absolute)', () => {
    const bs = String.fromCharCode(92);
    expect(safeExpected(['Carti/a.pdf', '../x.pdf', `C:${bs}Windows${bs}x.pdf`, '/etc/passwd', '', 5, `Carti${bs}b.pdf`])).toEqual(['Carti/a.pdf', 'Carti/b.pdf']);
    expect(safeExpected('nu e listă')).toEqual([]);
  });
});

describe('detectMaterialsRoot / commonBases', () => {
  const { detectMaterialsRoot, commonBases } = require('./materialsRoot.cjs');
  let tmp = '';
  const make = (...parts: string[]) => fs.mkdirSync(path.join(tmp, ...parts), { recursive: true });
  const put = (...parts: string[]) => { make(...parts.slice(0, -1)); fs.writeFileSync(path.join(tmp, ...parts), 'x'); };

  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studyx-detect-')); });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('găsește folderul în copiii unui loc obișnuit', () => {
    for (const rel of EXPECTED) put('Desktop', 'Rezidentiat', ...rel.split('/'));
    make('Desktop', 'Rezidentiat', 'Capitole');
    make('Documents', 'Altceva');
    const res = detectMaterialsRoot([path.join(tmp, 'Desktop'), path.join(tmp, 'Documents')], EXPECTED);
    expect(res).toMatchObject({ ok: true, root: path.join(tmp, 'Desktop', 'Rezidentiat'), books: 3, hasCapitole: true });
  });

  it('între două foldere asemănătoare îl alege pe cel cu mai multe cărți', () => {
    put('Desktop', 'Vechi', 'Carti', 'Kumar', 'Kumar compilat.pdf');
    make('Desktop', 'Vechi', 'Capitole');
    for (const rel of EXPECTED) put('Documents', 'Nou', ...rel.split('/'));
    const res = detectMaterialsRoot([path.join(tmp, 'Desktop'), path.join(tmp, 'Documents')], EXPECTED);
    expect(res.root).toBe(path.join(tmp, 'Documents', 'Nou'));
  });

  it('nu coboară în AppData și întoarce not-found când nu e nimic', () => {
    for (const rel of EXPECTED) put('AppData', 'Local', ...rel.split('/'));
    make('Documents', 'Altceva');
    expect(detectMaterialsRoot([tmp], EXPECTED)).toEqual({ ok: false, code: 'not-found' });
  });

  it('commonBases păstrează doar locurile care există', () => {
    make('Desktop');
    make('OneDrive', 'Documents');
    const bases = commonBases(tmp) as string[];
    expect(bases).toContain(tmp);
    expect(bases).toContain(path.join(tmp, 'Desktop'));
    expect(bases).toContain(path.join(tmp, 'OneDrive', 'Documents'));
    expect(bases).not.toContain(path.join(tmp, 'Downloads'));
  });
});
