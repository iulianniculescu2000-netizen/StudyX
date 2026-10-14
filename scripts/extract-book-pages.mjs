// Extrage textul cărților incluse în aplicație, pagină cu pagină, din exact PDF-urile livrate în build/books
// (aceleași fișiere și aceeași numerotare ca planul din Organizare, vezi src/lib/bookPages.ts › BOOK_FILES).
// Rulare: node scripts/extract-book-pages.mjs [K|L|S] [primaPagină ultimaPagină]  (fără argumente: toate cărțile)
//   Opțional: STUDYX_PAGES_OUT=<folder> scrie JSON-urile acolo, nu în src/data/rezidentiat/library.
// Ieșire: <folder>/<carte>.pages.json = ["text pagina 1", "text pagina 2", ...]
//
// Cum se ordonează textul (v2): pdf.js dă fragmente cu coordonate. Pe fiecare pagină se caută „culoarul” dintre
// coloane (un spațiu vertical aproape gol, nu mijlocul foii: marginile paginilor nu sunt simetrice). Fragmentele care
// trec peste culoar (titluri, tabele pe lățime întreagă) taie pagina în benzi; în fiecare bandă cu două coloane se
// citește stânga, apoi dreapta. Benzile care arată a tabel (rânduri cu celule separate de goluri mari) se citesc pe rânduri.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pdfjs = await import(pathToFileURL(path.join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);

const BOOKS = {
  K: { out: 'kumar', file: 'Carti/Kumar/Kumar 10th ed RO - doar capitolele rezi (391 p).pdf' },
  L: { out: 'lawrence', file: 'Carti/Lawrence/Lawrence RO - capitole rezi (345 p).pdf' },
  S: { out: 'sinopsis', file: 'Carti/Sinopsis/Sinopsis RO - tematica (118 p).pdf' },
};

const percentile = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

/** Fragmentele unei pagini, cu geometrie; cele rotite (filigran) se ignoră. */
export function toBoxes(items) {
  const out = [];
  for (const it of items) {
    if (!('str' in it) || !it.str) continue;
    const [a, b, , d, e, f] = it.transform;
    if (it.str.trim() && Math.abs(b) > 0.2 * Math.abs(a || 1)) continue;
    out.push({ s: it.str, x0: e, x1: e + it.width, y: f, h: Math.abs(d) || 8, blank: !it.str.trim() });
  }
  return out;
}

/**
 * Casetele de reclamă „Important! Platforma MG Rezidențiat – Grile Rezi…” sunt lipite peste pagină (uneori peste textul
 * cărții, cu rânduri suprapuse). Se recunosc după fragmentele care sunt bucăți din textul fix al reclamei; se scoate tot
 * ce se află în dreptunghiul lor.
 */
const plain = (t) => t.toLowerCase().replace(/[ăâ]/g, 'a').replace(/î/g, 'i').replace(/[șş]/g, 's').replace(/[țţ]/g, 't').replace(/[^a-z0-9]+/g, ' ').trim();
const AD_TEXT = plain(`Important! Platforma MG Rezidențiat – Grile Rezi oferă grile conforme cu bibliografia oficială a Ministerului Sănătății,
  bazate pe examenele din anii anteriori. Simulările sunt concepute să reproducă fidel formatul real al examenului de admitere în
  rezidențiat, oferind o evaluare corectă și relevantă a nivelului de pregătire. Este instrumentul ideal pentru antrenament eficient,
  în condiții cât mai apropiate de cele din ziua concursului. Platforma online rezidentiat.com oferă resurse suplimentare online:
  întrebări de tipul celor de la examenul de admitere în rezidențiat, slide-uri Power Point + audio, flash-card-uri, video cu operații
  etc. Accesul se face urmând pașii de pe coperta a 2-a a cărții. PLATFORMA REZIDENTIAT.COM MGRezidentiat.ro
  Platforma online rezidentiat.com oferă resurse suplimentare online: întrebări de evaluare de tipul celor de la admitere în
  rezidențiat, slide-uri Power Point + audio, flash-card-uri, video cu operații etc.`);
export function removeAds(boxes) {
  const seeds = boxes.filter((b) => {
    if (b.blank) return false;
    const t = plain(b.s);
    if (/^mg rezidentiat\s*grile rezi$/.test(t) || /^grile rezi$/.test(t)) return false; // subsolul paginii, nu caseta
    return t.length >= 14 ? AD_TEXT.includes(t) : /^(important|mgrezidentiat ro|platforma rezidentiat com)$/.test(t);
  });
  if (seeds.length < 3) return boxes;
  const x0 = Math.min(...seeds.map((b) => b.x0)) - 1;
  const x1 = Math.max(...seeds.map((b) => b.x1)) + 1;
  const y0 = Math.min(...seeds.map((b) => b.y)) - 3;
  const y1 = Math.max(...seeds.map((b) => b.y + b.h)) + 1;
  return boxes.filter((b) => !(((b.x0 + b.x1) / 2 >= x0 && (b.x0 + b.x1) / 2 <= x1 && b.y >= y0 && b.y <= y1)));
}

/** Culoarul dintre coloane: [g0, g1] sau null dacă pagina are o singură coloană. */
export function findGutter(text, extent = text, tolFrac = 0.08) {
  if (text.length < 10) return null;
  const cl = percentile(extent.map((b) => b.x0), 0.02);
  const cr = percentile(extent.map((b) => b.x1), 0.98);
  const cw = cr - cl;
  if (cw < 200) return null;
  const STEP = 0.5;
  const nb = Math.ceil(cw / STEP) + 1;
  const cover = new Array(nb).fill(0);
  for (const b of text) {
    const i0 = Math.max(0, Math.floor((b.x0 - cl) / STEP));
    const i1 = Math.min(nb - 1, Math.ceil((b.x1 - cl) / STEP));
    for (let i = i0; i <= i1; i += 1) cover[i] += 1;
  }
  const tol = Math.max(1, Math.floor(text.length * tolFrac));
  const lo = Math.floor(0.2 * nb);
  const hi = Math.floor(0.85 * nb);
  let best = null;
  let i = lo;
  while (i <= hi) {
    if (cover[i] <= tol) {
      let j = i;
      while (j + 1 <= hi && cover[j + 1] <= tol) j += 1;
      const width = (j - i) * STEP;
      const mid = (i + j) / 2 / nb;
      const score = width - Math.abs(mid - 0.5) * 10;
      if (width >= 6 && (!best || score > best.score)) best = { g0: cl + i * STEP, g1: cl + j * STEP, score, cl, cr };
      i = j + 1;
    } else i += 1;
  }
  if (!best) return null;
  const gm = (best.g0 + best.g1) / 2;
  const nl = text.filter((b) => (b.x0 + b.x1) / 2 < gm).length;
  const nr = text.length - nl;
  if (nl < text.length * 0.15 || nr < text.length * 0.15) return null;
  return best;
}

/**
 * Culoarul după începuturile liniilor late: două grupuri clare de linii care încep în același loc (marginea stângă a
 * fiecărei coloane), chiar dacă tabele sau legende pe lățime întreagă trec peste culoar.
 */
export function findGutterByStarts(wide, extent) {
  if (wide.length < 10) return null;
  const cl = percentile(extent.map((b) => b.x0), 0.05);
  const cr = percentile(extent.map((b) => b.x1), 0.95);
  const cw = cr - cl;
  if (cw < 200) return null;
  const bins = new Map();
  for (const b of wide) { const k = Math.round(b.x0 / 3); bins.set(k, (bins.get(k) ?? 0) + 1); }
  const peaks = [...bins.entries()].map(([k, n]) => ({ x: k * 3, n: n + (bins.get(k - 1) ?? 0) + (bins.get(k + 1) ?? 0) })).sort((a, b) => b.n - a.n);
  const first = peaks[0];
  if (!first || first.n < 4) return null;
  const second = peaks.find((q) => Math.abs(q.x - first.x) >= 0.3 * cw && q.n >= 3);
  if (!second) return null;
  const [left, right] = first.x < second.x ? [first, second] : [second, first];
  const leftEdges = wide.filter((b) => Math.abs(b.x0 - left.x) <= 4).map((b) => b.x1);
  const g0 = percentile(leftEdges, 0.9) + 1;
  const g1 = right.x - 2;
  if (g1 - g0 < 4 || g0 < left.x + 0.25 * cw) return null;
  return { g0, g1, score: 0, cl, cr };
}

/** Rânduri dintr-un set de fragmente (tolerant la indici/exponenți mai mici). Întoarce {t, x0, x1}. */
function buildRows(boxes) {
  const rows = [];
  const sorted = [...boxes].sort((a, b) => b.y - a.y);
  for (const bx of sorted) {
    const small = bx.h < 0.8 * Math.max(...sorted.slice(0, 40).map((q) => q.h));
    const tolY = small ? 4 : 2.5;
    let row = rows.find((r) => Math.abs(r.y - bx.y) <= tolY);
    if (!row) { row = { y: bx.y, parts: [] }; rows.push(row); }
    row.parts.push(bx);
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    r.parts.sort((a, b) => a.x0 - b.x0);
    let line = '';
    let end = null;
    let maxGap = 0;
    let prevReal = null;
    for (const p of r.parts) {
      if (end !== null && p.x0 - end > 1.5 && !line.endsWith(' ') && !p.s.startsWith(' ')) line += ' ';
      line += p.s;
      end = Math.max(end ?? -1e9, p.x1);
      if (!p.blank) {
        if (prevReal !== null) maxGap = Math.max(maxGap, p.x0 - prevReal);
        prevReal = Math.max(prevReal ?? -1e9, p.x1);
      }
    }
    const real = r.parts.filter((p) => !p.blank);
    return {
      t: line.replace(/\s+/g, ' ').trim(),
      x0: Math.min(...real.map((p) => p.x0)), x1: Math.max(...real.map((p) => p.x1)), y: r.y, maxGap,
      full: false,
    };
  }).filter((r) => r.t && Number.isFinite(r.x0));
}

/** O bandă arată a tabel dacă multe rânduri au goluri mari între celule. */
function looksLikeTable(rows) {
  if (rows.length < 3) return false;
  return rows.filter((r) => r.maxGap > 14).length >= Math.max(2, rows.length * 0.3);
}

/** Culoarul unei mulțimi de fragmente (căutat întâi pe liniile late: tabelele, etichetele și titlurile scurte nu-l acoperă). */
export function detectGutter(text) {
  const longText = text.filter((b) => b.x1 - b.x0 >= 60);
  const wide = text.filter((b) => b.x1 - b.x0 >= 150);
  return (wide.length >= 12 ? findGutter(wide, text, 0.12) ?? findGutterByStarts(wide, text) : null)
    ?? (longText.length >= 8 ? findGutter(longText) : null) ?? findGutter(text);
}

/** Rânduri simple, fără coloane (pagină cu o coloană sau zonă de tabel/figură). */
function plainLines(boxes) {
  const out = buildRows(boxes);
  const ref = percentile(out.map((r) => r.x1), 0.8);
  for (const r of out) { r.full = r.x1 >= ref - 6; r.gap = Math.max(0, ref - r.x1); }
  return out;
}

/**
 * Pagini fără culoar pe toată înălțimea (un tabel sau o figură pe lățime întreagă taie coloanele): zonele de text pe
 * coloane de deasupra/dedesubt își găsesc culoarul separat. Întoarce [{y0, y1, gut}] de sus în jos.
 */
function columnRegions(text) {
  const wide = text.filter((b) => b.x1 - b.x0 >= 150).sort((a, b) => b.y - a.y);
  const runs = [];
  for (const b of wide) {
    const last = runs.at(-1);
    if (last && last.y1 - b.y <= 40) { last.items.push(b); last.y1 = b.y; } else runs.push({ y0: b.y, y1: b.y, items: [b] });
  }
  const regions = [];
  for (const r of runs) {
    if (r.items.length < 8) continue;
    const top = r.y0 + 14;
    const bottom = r.y1 - 4;
    const inside = text.filter((b) => b.y <= top && b.y >= bottom);
    const gut = findGutter(r.items, inside, 0.12) ?? findGutterByStarts(r.items, inside);
    if (gut) regions.push({ y0: top, y1: bottom, gut });
  }
  return regions;
}

/**
 * Rândurile unei pagini în ordinea de citire, fiecare cu `full` (rândul ajunge la marginea dreaptă a coloanei lui =
 * paragraful continuă pe rândul următor).
 */
export function pageLines(items) {
  const boxes = removeAds(toBoxes(items));
  const text = boxes.filter((b) => !b.blank);
  const gut = detectGutter(text);
  if (gut) return columnLines(boxes, gut);
  const regions = columnRegions(text);
  if (!regions.length) return plainLines(boxes);
  const out = [];
  let above = boxes;
  for (const reg of regions) {
    const inRegion = above.filter((b) => b.y <= reg.y0 && b.y >= reg.y1);
    const higher = above.filter((b) => b.y > reg.y0);
    out.push(...plainLines(higher), ...columnLines(inRegion, reg.gut));
    above = above.filter((b) => b.y < reg.y1);
  }
  out.push(...plainLines(above));
  return out;
}

/** Citește boxele cu un culoar dat: benzi pe lățime întreagă, coloane stânga apoi dreapta, tabele pe rânduri. */
function columnLines(boxes, gut) {
  const text = boxes.filter((b) => !b.blank);
  const out = [];
  const gm = (gut.g0 + gut.g1) / 2;
  const side = (b) => {
    if (b.blank) return 'B';
    if (b.x0 < gut.g0 - 2 && b.x1 > gut.g1 + 2) return 'S';
    return (b.x0 + b.x1) / 2 < gm ? 'L' : 'R';
  };
  // Rândurile pe lățime întreagă (S) taie pagina în benzi.
  const spanY = [];
  for (const b of text) if (side(b) === 'S' && !spanY.some((y) => Math.abs(y - b.y) <= 2.5)) spanY.push(b.y);
  spanY.sort((a, b) => b - a);
  const segOf = (b) => {
    if (spanY.some((y) => Math.abs(y - b.y) <= 2.5)) return { span: spanY.findIndex((y) => Math.abs(y - b.y) <= 2.5) };
    return { seg: spanY.filter((y) => y > b.y).length };
  };
  const segs = Array.from({ length: spanY.length + 1 }, () => ({ L: [], R: [] }));
  const spans = spanY.map(() => []);
  for (const b of boxes) {
    const k = segOf(b);
    if (k.span !== undefined) { spans[k.span].push(b); continue; }
    const sd = side(b);
    if (sd === 'B') (((b.x0 + b.x1) / 2) < gm ? segs[k.seg].L : segs[k.seg].R).push(b);
    else if (sd === 'S') (segs[k.seg].L).push(b);
    else segs[k.seg][sd].push(b);
  }
  const colW = Math.min(gut.g0 - gut.cl, gut.cr - gut.g1);
  // În fiecare bandă: grupuri de coloane (stânga apoi dreapta) și, între ele, tabele pe lățime întreagă (citite pe rânduri).
  const groups = [];
  const pushGroup = (g) => {
    const last = groups.at(-1);
    if (g.table || !last || last.table || last.span !== undefined) groups.push(g);
    else last.boxes.push(...g.boxes);
  };
  for (let k = 0; k < segs.length; k += 1) {
    for (const g of readBand([...segs[k].L, ...segs[k].R], gm, colW)) pushGroup({ ...g, seg: k });
    if (k < spans.length) groups.push({ span: k, boxes: spans[k], table: false });
  }
  const colRows = groups.map((g) => {
    if (g.span !== undefined) return null;
    if (g.table) return { all: buildRows(g.boxes) };
    const l = buildRows(g.boxes.filter((b) => (b.x0 + b.x1) / 2 < gm));
    const r = buildRows(g.boxes.filter((b) => (b.x0 + b.x1) / 2 >= gm));
    for (const x of [...l, ...r]) if (x.maxGap > 14) x.table = true;
    return { l, r };
  });
  const refL = percentile(colRows.filter((c) => c?.l).flatMap((c) => c.l.filter((x) => !x.table).map((x) => x.x1)), 0.8);
  const refR = percentile(colRows.filter((c) => c?.r).flatMap((c) => c.r.filter((x) => !x.table).map((x) => x.x1)), 0.8);
  groups.forEach((g, k) => {
    if (g.span !== undefined) { out.push(...buildRows(g.boxes)); return; }
    const c = colRows[k];
    if (c.all) { for (const x of c.all) x.table = true; out.push(...c.all); return; }
    for (const x of c.l) { x.full = x.x1 >= refL - 6; x.gap = Math.max(0, refL - x.x1); }
    for (const x of c.r) { x.full = x.x1 >= refR - 6; x.gap = Math.max(0, refR - x.x1); }
    out.push(...c.l, ...c.r);
  });
  return out;
}

/**
 * Împarte o bandă în grupuri de coloane și tabele pe lățime întreagă. Un rând e „scurt” dacă niciuna dintre părțile lui
 * (stânga, dreapta) nu e o linie de text continuă cât o coloană; 3+ rânduri scurte consecutive, cu celule și în stânga,
 * și în dreapta, sunt un tabel. Altfel (text pe coloane, chiar cu un tabel într-o singură coloană) se citește pe coloane.
 */
function readBand(boxes, gm, colW) {
  if (!boxes.length) return [];
  const sorted = [...boxes].sort((a, b) => b.y - a.y);
  const rows = [];
  for (const b of sorted) {
    const tol = b.h < 7 ? 4 : 2.5;
    let r = rows.find((q) => Math.abs(q.y - b.y) <= tol);
    if (!r) { r = { y: b.y, items: [] }; rows.push(r); }
    r.items.push(b);
  }
  rows.sort((a, b) => b.y - a.y);
  for (const r of rows) {
    const real = r.items.filter((b) => !b.blank);
    const side = (b) => ((b.x0 + b.x1) / 2 < gm ? 'L' : 'R');
    r.hasL = real.some((b) => side(b) === 'L');
    r.hasR = real.some((b) => side(b) === 'R');
    r.long = false;
    for (const sd of ['L', 'R']) {
      const it = real.filter((b) => side(b) === sd).sort((a, b) => a.x0 - b.x0);
      let s = null;
      let e = null;
      for (const b of it) {
        if (s === null) { s = b.x0; e = b.x1; } else if (b.x0 - e > 9) { if (e - s >= 0.8 * colW) r.long = true; s = b.x0; e = b.x1; } else e = Math.max(e, b.x1);
      }
      if (s !== null && e - s >= 0.8 * colW) r.long = true;
    }
  }
  const out = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].long) { out.push({ table: false, boxes: rows[i].items }); i += 1; continue; }
    let j = i;
    while (j < rows.length && !rows[j].long) j += 1;
    const run = rows.slice(i, j);
    const both = run.filter((r) => r.hasL && r.hasR).length;
    const isTable = run.length >= 3 && both >= 2 && both >= run.length * 0.3;
    out.push({ table: isTable, boxes: run.flatMap((r) => r.items) });
    i = j;
  }
  return out;
}

const SEDILLA = { 'ş': 'ș', 'ţ': 'ț', 'Ş': 'Ș', 'Ţ': 'Ț' };
const fixDiacritics = (t) => t.replace(/[şţŞŢ]/g, (c) => SEDILLA[c]);
const LETTERS = 'a-zA-ZăâîșțĂÂÎȘȚéèüöáó';
const WORD_RE = new RegExp(`[${LETTERS}]+`, 'g');
/** Rânduri care nu sunt din textul cărții: watermark-ul scanării și antetul/subsolul cu număr de pagină. */
const NOISE = [/MG Rezidentiat/i, /Grile Rezi\s*$/i];
// Antet de pagină: „Tulburările concentrației potasiului 189” sau „190 Echilibrul…” (titlu cu majusculă + număr de pagină).
const RUNNING_HEAD = new RegExp(String.raw`^(?:\d{2,4}\s+[A-ZĂÂÎȘȚ][${LETTERS}].{2,70}|[A-ZĂÂÎȘȚ][${LETTERS}]+\s.{1,70}[${LETTERS}]\s+\d{2,4})$`);
/** Antetul literat al Sinopsisului („200 e S I N O P S I S D E M E D I C I N Ă”), uneori lipit de un rând din pagină. */
const SINOPSIS_HEAD = /(?:\b\d{2,3}\s+)?(?:e\s+)?S\s+I\s+N\s+O\s+P\s+S\s+I\s+S(?:\s+D\s+E)?(?:\s+M\s+E\s+D\s+I\s+C\s+I\s+N\s+Ă)?/;
/** Pictograma din fața unei casete („li Cadranul 18.31”, „M Cadranul 18.30”) iese ca 1–2 litere rătăcite. */
const BOX_ICON = /^(?:[A-Za-z]{1,2})\s+(?=(?:Cadranul|Tabelul|Figura|Caseta)\s+\d)/;

/** Frecvența cuvintelor din toată cartea: decide dacă două bucăți de la capăt de rând sunt un singur cuvânt. */
export function vocabulary(pages) {
  const freq = new Map();
  const bump = (w) => freq.set(w, (freq.get(w) ?? 0) + 1);
  for (const page of pages) {
    for (const l of page) {
      const t = fixDiacritics(l.t).toLowerCase();
      for (const w of t.match(WORD_RE) ?? []) bump(w);
      // Compușii cu cratimă din interiorul rândului („anti-inflamator”): cheia are cratimă, nu se confundă cu un cuvânt.
      for (const w of t.match(new RegExp(`[${LETTERS}]+-[${LETTERS}]+`, 'g')) ?? []) bump(w);
    }
  }
  return freq;
}

/** Decide dacă două bucăți de la capăt/început de rând sunt un singur cuvânt rupt; întoarce forma lipită sau null. */
function gluePieces(para, line, freq, prevFull) {
  const prevWord = (para.match(new RegExp(`([${LETTERS}]+)$`)) ?? [])[1];
  const nextWord = (line.match(new RegExp(`^([${LETTERS}]+)`)) ?? [])[1];
  if (!prevWord || !nextWord || !/^[a-zăâîșț]/.test(nextWord)) return null;
  const lp = prevWord.toLowerCase();
  const ln = nextWord.toLowerCase();
  // Lipit doar dacă forma întreagă apare în carte și măcar o bucată e mai rară ca ea („acțiu”+„nea”), nu „în”+„orice”.
  const whole = freq.get(lp + ln) ?? 0;
  const fp = freq.get(lp) ?? 0;
  const fn = freq.get(ln) ?? 0;
  if (whole > 0 && Math.min(fp, fn) <= whole * 3 && !(GLUE_BLOCK.has(lp) && fn > whole)) return true;
  // Rând plin care se termină într-o bucată necunoscută, urmat de una necunoscută („reajus”+„tarea”): lipit
  // doar când forma lipită nu apare nicăieri și NICIUNA dintre bucăți nu e un cuvânt atestat (cel mult o apariție).
  return Boolean(prevFull && whole === 0 && fp <= 1 && fn <= 1 && lp.length >= 3 && ln.length >= 3);
}

/** Cum se lipește un rând de paragraful de până acum: cu spațiu, lipit (cuvânt rupt) sau cu cratima de la capăt de rând rezolvată. */
function joinLines(para, line, freq, prevFull) {
  // Cratima de la capăt de rând e citită uneori ca „•” sau „·” (OCR): se tratează la fel.
  const hy = para.match(new RegExp(`([${LETTERS}]+)([-•·●])$`));
  const nextWord = (line.match(new RegExp(`^([${LETTERS}]+)`)) ?? [])[1];
  if (hy && nextWord && /^[a-zăâîșț]/.test(nextWord)) {
    const head = hy[1].toLowerCase();
    const tail = nextWord.toLowerCase();
    const keep = hy[2] === '-' ? line : `\u0000-${line}`;
    // Compus atestat în carte („anti-inflamator”): cratima rămâne. Cuvânt întreg atestat: cratima dispare. Altfel: nu se ghicește, cratima rămâne.
    if ((freq.get(`${head}-${tail}`) ?? 0) > 0) return keep;
    if ((freq.get(head + tail) ?? 0) > 0) return `\u0000${line}`;
    return keep;
  }
  return gluePieces(para, line, freq, prevFull) ? line : ` ${line}`;
}

/** Cuvintele care chiar se termină la capăt de rând (nu sunt rupte): nu se lipesc de rândul următor. */
const GLUE_BLOCK = new Set(['în', 'de', 'la', 'cu', 'pe', 'și', 'sau', 'din', 'pentru', 'al', 'ale', 'ai', 'un', 'o', 'a', 'că', 'ca', 'se', 'nu', 'mai']);

/**
 * Rândurile unei pagini → text organizat: paragrafe refăcute, cuvinte despărțite lipite la loc, titluri cu „## ”,
 * liste cu „- ”, fără watermark și antet. Rândurile scurte (celule de tabel, „Cadranul”) rămân pe rândul lor.
 */
export function organize(rawLines, freq) {
  const lines = rawLines.map((l) => ({ ...l, t: fixDiacritics(l.t).replace(SINOPSIS_HEAD, ' ').replace(BOX_ICON, '').replace(/\s+/g, ' ').trim() })).filter((l) => l.t && !/^M E D I C I N Ă$/.test(l.t))
    .filter((l) => !NOISE.some((re) => re.test(l.t)) && !(RUNNING_HEAD.test(l.t) && Number((l.t.match(/\d+/g) ?? ['0']).at(-1)) >= 20 && !/[.;:,]$/.test(l.t)));
  const blocks = [];
  let para = '';
  const flush = () => { if (para) blocks.push(para); para = ''; };
  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i].t;
    const next = lines[i + 1]?.t ?? '';
    if (/^[•●▪■◦·]\s*/.test(line)) { flush(); line = `- ${line.replace(/^[•●▪■◦·]\s*/, '')}`; }
    // Variante de grilă („A. Pertussis”): elemente de listă, nu titluri.
    if (/^[A-E][.)]\s/.test(line)) { flush(); blocks.push(`- ${line}`); continue; }
    if (!para) {
      const heading = line.length <= 60 && !/[.,;:!?)\-–]$/.test(line) && /^[A-ZĂÂÎȘȚ]/.test(line) && !line.startsWith('- ')
        && (next === '' || /^[A-ZĂÂÎȘȚ•]/.test(next)) && line.split(' ').length <= 9 && !lines[i].full && !lines[i].table
        && !/\s(în|de|și|a|la|cu|pe|din|pentru|al|ale|ai|o|un|sau|că|care|mai|este|sunt)$/i.test(line);
      if (heading && !/^(Cadranul|Tabelul|Fig)/.test(line)) { blocks.push(`## ${line}`); continue; }
      para = line;
    } else {
      const j = joinLines(para, line, freq, lines[i - 1]?.full);
      para = j.startsWith('\u0000') ? para.slice(0, -1) + j.slice(1) : para + j;
    }
    // Rândul nu ajunge la marginea coloanei sau se încheie cu punct urmat de o propoziție nouă: paragraful se termină aici.
    // Excepție: rând doar puțin mai scurt decât coloana (text neregulat în dreapta, casetă îngustă) sau cu un cuvânt rupt, fără
    // semn de punctuație, urmat de literă mică: e același paragraf („glucocor”+„ticoizilor”). Elementele scurte de listă rămân separate.
    const lastWord = (line.match(new RegExp(`([${LETTERS}]+)$`)) ?? [])[1] ?? '';
    const brokenWord = /[a-zăâîșț]$/.test(line) && (freq.get(lastWord.toLowerCase()) ?? 0) <= 2 && gluePieces(line, next, freq, true);
    const hyphenEnd = new RegExp(`[${LETTERS}][-•·●]$`).test(line) && /^[a-zăâîșț]/.test(next);
    const cont = hyphenEnd || brokenWord
      || (!lines[i].table && !lines[i + 1]?.table && !/[.!?:;]$/.test(line) && /^[a-zăâîșț]/.test(next) && (lines[i].gap ?? 999) <= 40);
    if (cont) continue;
    if (!lines[i].full || lines[i].table || (/[.!?:]$/.test(line) && /^[A-ZĂÂÎȘȚ•\-]/.test(next))) flush();
  }
  flush();
  return mendSplitWords(blocks.join('\n\n'), freq);
}

/**
 * Cuvinte rupte în mijlocul rândului de stratul de text al scanării („pacie ntii”): lipite doar dacă fiecare bucată apare
 * o singură dată în toată cartea (adică numai aici) și forma lipită apare de cel puțin două ori în carte.
 */
function mendSplitWords(block, freq) {
  return block.replace(new RegExp(`(?<![${LETTERS}-])([A-ZĂÂÎȘȚa-zăâîșț][a-zăâîșț]+)[ \n]{1,2}([a-zăâîșț]{2,})(?![${LETTERS}-])`, 'g'), (m, x, y) => {
    const lx = x.toLowerCase();
    const whole = freq.get(lx + y) ?? 0;
    return whole >= 2 && (freq.get(lx) ?? 0) <= 1 && (freq.get(y) ?? 0) <= 1 ? x + y : m;
  });
}

/** Rândurile fiecărei pagini dintr-un PDF oarecare (folosit și pentru a compara cu PDF-urile din folderul proprietarului). */
export async function extractFile(file, from, to) {
  const data = new Uint8Array(fs.readFileSync(file));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  const last = Math.min(to ?? doc.numPages, doc.numPages);
  const pages = [];
  for (let n = from ?? 1; n <= last; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    pages.push(pageLines(content.items));
    page.cleanup();
  }
  return { pages, numPages: doc.numPages };
}

const extract = (code, from, to) => extractFile(path.join(root, 'build/books', BOOKS[code].file), from, to);

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) await main();

async function main() {
  const [code, a, b] = process.argv.slice(2);
  if (code && a) {
    const { pages: all } = await extract(code);
    const freq = vocabulary(all);
    for (let n = Number(a); n <= Number(b ?? a); n += 1) console.log(`===== pagina ${n} =====\n${organize(all[n - 1], freq)}\n`);
  } else {
    const outDir = process.env.STUDYX_PAGES_OUT ? path.resolve(process.env.STUDYX_PAGES_OUT) : path.join(root, 'src/data/rezidentiat/library');
    fs.mkdirSync(outDir, { recursive: true });
    for (const c of code ? [code] : Object.keys(BOOKS)) {
      const { pages: raw, numPages } = await extract(c);
      const freq = vocabulary(raw);
      const pages = raw.map((page) => organize(page, freq));
      const out = path.join(outDir, `${BOOKS[c].out}.pages.json`);
      fs.writeFileSync(out, JSON.stringify(pages));
      console.log(`${c}: ${numPages} pagini -> ${out} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
    }
  }
}
