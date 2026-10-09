'use strict';
/**
 * Găsește folderul-rădăcină al materialelor de studiu (cel care conține `Carti` și `Capitole`), pornind de la ce a ales
 * utilizatorul. Alegerea poate fi greșită în moduri obișnuite: un subfolder (`Rezidentiat\Carti`), părintele (`Desktop`),
 * un folder vecin. Se caută în rădăcină, în strămoși și în copiii lor; câștigă folderul cu cele mai multe cărți așteptate.
 * Citește doar NUME de foldere și verifică existența a câtorva fișiere; nu deschide nimic.
 */
const fs = require('fs');
const path = require('path');

const MAX_DIRS = 400;
const SKIP = /^(\.|node_modules$|\$recycle\.bin$|system volume information$|appdata$)/i;

const fold = (text) => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function listDirs(dir, fsLike) {
  try {
    return fsLike.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !SKIP.test(entry.name))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** Căi relative sigure (fără „..”, fără rădăcini absolute), ca lista cerută de pagină să nu poată ieși din folder. */
function safeExpected(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((rel) => typeof rel === 'string' && rel.length > 0 && rel.length < 300)
    .map((rel) => rel.replace(/\\/g, '/'))
    .filter((rel) => !path.isAbsolute(rel) && !rel.split('/').includes('..'));
}

function score(dir, expected, fsLike) {
  const names = listDirs(dir, fsLike).map(fold);
  const hasCarti = names.includes('carti');
  const hasCapitole = names.includes('capitole');
  const books = expected.filter((rel) => {
    try {
      return fsLike.existsSync(path.join(dir, ...rel.split('/')));
    } catch {
      return false;
    }
  }).length;
  return { hasCarti, hasCapitole, books, value: books * 10 + (hasCarti ? 2 : 0) + (hasCapitole ? 1 : 0) };
}

function candidatesFor(root, fsLike) {
  const seen = new Set();
  const out = [];
  const add = (dir, via) => {
    const key = path.resolve(dir).toLowerCase();
    if (seen.has(key) || out.length >= MAX_DIRS) return;
    seen.add(key);
    out.push({ dir: path.resolve(dir), via });
  };
  add(root, 'same');
  // Copiii rădăcinii, până la două niveluri.
  for (const child of listDirs(root, fsLike)) {
    add(path.join(root, child), 'child');
    for (const grand of listDirs(path.join(root, child), fsLike)) add(path.join(root, child, grand), 'child');
  }
  // Strămoșii (până la 3 niveluri) și copiii lor: un folder vecin sau părintele.
  let up = root;
  for (let i = 0; i < 3; i += 1) {
    const parent = path.dirname(up);
    if (parent === up) break;
    up = parent;
    add(up, 'parent');
    for (const child of listDirs(up, fsLike)) add(path.join(up, child), 'other');
  }
  return out;
}

/**
 * @param {string} root        folderul ales de utilizator
 * @param {string[]} expected  căi relative ale cărților așteptate (ex. `Carti/Kumar/….pdf`)
 * @returns {{ok:true, root:string, via:string, books:number, hasCapitole:boolean} | {ok:false, code:string}}
 */
function findMaterialsRoot(root, expected, fsLike = fs) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) return { ok: false, code: 'invalid' };
  let stat;
  try {
    stat = fsLike.statSync(root);
  } catch {
    return { ok: false, code: 'missing' };
  }
  if (!stat.isDirectory()) return { ok: false, code: 'invalid' };

  const want = safeExpected(expected);
  let best = null;
  for (const candidate of candidatesFor(root, fsLike)) {
    const s = score(candidate.dir, want, fsLike);
    // Minim ca să conteze: măcar o carte așteptată, sau amândouă folderele `Carti` și `Capitole`.
    if (!(s.books > 0 || (s.hasCarti && s.hasCapitole))) continue;
    if (!best || s.value > best.value) best = { ...s, ...candidate };
  }
  if (!best) return { ok: false, code: 'not-found' };
  return { ok: true, root: best.dir, via: best.via, books: best.books, hasCapitole: best.hasCapitole };
}

/** Locurile unde studenții își țin de obicei materialele (Windows): Desktop, Documente, Descărcări, OneDrive, Google Drive. */
function commonBases(home, fsLike = fs) {
  const names = [
    'Desktop', 'Documents', 'Downloads', 'OneDrive', 'Google Drive', 'My Drive',
    path.join('OneDrive', 'Desktop'), path.join('OneDrive', 'Documents'), path.join('Google Drive', 'My Drive'),
  ];
  const bases = [home, ...names.map((name) => path.join(home, name))];
  for (const drive of ['D:', 'E:', 'G:']) bases.push(`${drive}\\`, path.join(`${drive}\\`, 'My Drive'));
  const seen = new Set();
  return bases.filter((dir) => {
    const key = path.resolve(dir).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    try {
      return fsLike.statSync(dir).isDirectory();
    } catch {
      return false;
    }
  });
}

/**
 * Caută de la zero folderul-rădăcină: în fiecare loc obișnuit și în copiii lui (până la două niveluri). Câștigă folderul cu
 * cele mai multe cărți așteptate; fără cărți, doar un folder cu amândouă `Carti` și `Capitole` (și mai puțin sigur).
 * @returns {{ok:true, root:string, books:number, hasCapitole:boolean} | {ok:false, code:'not-found'}}
 */
function detectMaterialsRoot(bases, expected, fsLike = fs) {
  const want = safeExpected(expected);
  const seen = new Set();
  let best = null;
  let visited = 0;
  const consider = (dir) => {
    const key = path.resolve(dir).toLowerCase();
    if (seen.has(key) || visited >= 1500) return;
    seen.add(key);
    visited += 1;
    const s = score(dir, want, fsLike);
    if (!(s.books > 0 || (s.hasCarti && s.hasCapitole))) return;
    if (!best || s.value > best.value) best = { ...s, dir: path.resolve(dir) };
  };
  for (const base of bases) {
    consider(base);
    for (const child of listDirs(base, fsLike)) {
      consider(path.join(base, child));
      for (const grand of listDirs(path.join(base, child), fsLike)) consider(path.join(base, child, grand));
    }
  }
  return best ? { ok: true, root: best.dir, books: best.books, hasCapitole: best.hasCapitole } : { ok: false, code: 'not-found' };
}

module.exports = { findMaterialsRoot, detectMaterialsRoot, commonBases, safeExpected };
