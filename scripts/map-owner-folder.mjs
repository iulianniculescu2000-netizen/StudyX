// Mapează paginile PDF-urilor „capitole întregi” din folderul proprietarului (numele fișierelor au paginile TIPĂRITE) pe
// numerotarea PDF-ului din aplicație (build/books, aceeași ca index+1 în *.pages.json). Potrivire după conținutul paginii.
// Doar citește (folderul proprietarului nu se modifică). Nu schimbă nimic în aplicație.
// Rulare: node scripts/map-owner-folder.mjs lawrence|sinopsis [folderCarti] [fișierJsonIeșire]
//   folderCarti implicit: %USERPROFILE%\Desktop\Carti   (conține „Lawrence - capitole” și „Sinopsis - capitole”)
// Ieșire: intervale „tipărit → pagina din aplicație”, paginile din folder care lipsesc din PDF-ul aplicației și (opțional)
// un JSON cu câte o intrare pe pagină {chap, printed, app, score}.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFile, organize, vocabulary } from './extract-book-pages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [which, folderArg, outArg] = process.argv.slice(2);
const SETUP = {
  lawrence: { app: 'build/books/Carti/Lawrence/Lawrence RO - capitole rezi (345 p).pdf', dir: 'Lawrence - capitole' },
  sinopsis: { app: 'build/books/Carti/Sinopsis/Sinopsis RO - tematica (118 p).pdf', dir: 'Sinopsis - capitole' },
};
const cfg = SETUP[which];
if (!cfg) { console.error('Folosire: node scripts/map-owner-folder.mjs lawrence|sinopsis [folderCarti] [ieșire.json]'); process.exit(1); }
const base = folderArg ?? path.join(os.homedir(), 'Desktop', 'Carti');
const dir = path.join(base, cfg.dir, 'Capitole Intregi');

const plain = (t) => t.toLowerCase().replace(/[ăâ]/g, 'a').replace(/î/g, 'i').replace(/[șş]/g, 's').replace(/[țţ]/g, 't').replace(/[^a-z0-9]+/g, ' ').trim();
const bag = (t) => new Set(plain(t).split(' ').filter((w) => w.length >= 5));
const sim = (a, b) => {
  if (!a.size || !b.size) return 0;
  let i = 0;
  for (const x of a) if (b.has(x)) i += 1;
  return (i / Math.min(a.size, b.size)) * 0.5 + (i / (a.size + b.size - i)) * 0.5;
};

const app = await extractFile(path.join(root, cfg.app));
const appFreq = vocabulary(app.pages);
const appBags = app.pages.map((p) => bag(organize(p, appFreq)));

const rows = [];
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.pdf')).sort()) {
  const m = /^(\d+)\. (.*) - pagina (.*)\.pdf$/.exec(file);
  if (!m) continue;
  const first = Number(/^(\d+)/.exec(m[3])[1]);
  const own = await extractFile(path.join(dir, file));
  const freq = vocabulary(own.pages);
  own.pages.forEach((pg, i) => {
    const b = bag(organize(pg, freq));
    let best = 0;
    let bestScore = 0;
    appBags.forEach((ab, j) => { const s = sim(b, ab); if (s > bestScore) { bestScore = s; best = j + 1; } });
    // Caz cunoscut Lawrence cap. 26: pagina tipărită 546 lipsește din sursă (după 545 urmează 547).
    const printed = first + i + (which === 'lawrence' && Number(m[1]) === 26 && first + i >= 546 ? 1 : 0);
    rows.push({ chap: Number(m[1]), printed, app: bestScore >= 0.5 ? best : null, score: Number(bestScore.toFixed(3)) });
  });
}

const ranges = [];
const missing = [];
for (const r of rows) {
  if (r.app === null) { missing.push(r); continue; }
  const last = ranges.at(-1);
  if (last && last.chap === r.chap && r.app === last.app1 + 1 && r.printed === last.p1 + 1) { last.app1 = r.app; last.p1 = r.printed; } else ranges.push({ chap: r.chap, p0: r.printed, p1: r.printed, app0: r.app, app1: r.app });
}
console.log('MAPARE (pagina tipărită -> pagina din PDF-ul aplicației)');
for (const c of ranges) console.log(`cap ${c.chap}: tipărit ${c.p0}-${c.p1} -> aplicație ${c.app0}-${c.app1} (diferență ${c.p0 - c.app0})`);
const groups = [];
for (const r of missing) {
  const last = groups.at(-1);
  if (last && last.chap === r.chap && last.p1 + 1 === r.printed) last.p1 = r.printed; else groups.push({ chap: r.chap, p0: r.printed, p1: r.printed });
}
console.log(`\nPAGINI DIN FOLDER CARE NU EXISTĂ ÎN PDF-UL APLICAȚIEI: ${missing.length}`);
console.log(groups.map((g) => `cap ${g.chap}: ${g.p0 === g.p1 ? g.p0 : `${g.p0}-${g.p1}`}`).join('; ') || '(niciuna)');
const covered = new Set(rows.filter((r) => r.app !== null).map((r) => r.app));
const uncovered = [];
for (let p = 1; p <= app.numPages; p += 1) if (!covered.has(p)) uncovered.push(p);
console.log(`\nPAGINI DIN PDF-UL APLICAȚIEI CARE NU APAR ÎN FOLDER: ${uncovered.length}${uncovered.length ? ` (${uncovered.join(', ')})` : ''}`);
if (outArg) fs.writeFileSync(path.resolve(outArg), JSON.stringify(rows, null, 1));
