/**
 * Reconstructor pur (fără dependențe) de ordine de citire pentru UNA pagină PDF, pe itemi pdf.js
 * ({ str, transform:[.,.,.,.,x,y], width, height, hasEOL }). ESM simplu: îl importă și workerul
 * Electron (CommonJS, prin `import()` dinamic) și renderer-ul (Vite/TS, tipuri în .d.mts).
 *
 * Pași: itemi -> linii (grupare pe y) -> detecție gutieră (histogramă x) -> rânduri pe toată
 * lățimea (titluri) vs. coloane -> ordine: coloana stângă, apoi dreapta, între titlurile full-width
 * -> curățare (antet curent, număr tipărit, watermark, diacritice, cuvinte despărțite).
 *
 * Euristic (de validat pe PDF real): pragurile de gutieră, spațierea, paragrafele, antetul.
 */

const median = (arr) => {
  if (arr.length === 0) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  return s[s.length >> 1];
};
const num = (v) => (Number.isFinite(v) ? v : 0);

function normItems(items) {
  const out = [];
  for (const it of items || []) {
    if (!it || typeof it.str !== 'string' || !it.str.trim()) continue;
    const t = it.transform || [];
    const x = num(t[4]);
    const y = num(t[5]);
    const h = Math.abs(num(it.height)) || Math.abs(num(t[3])) || 10;
    let w = num(it.width);
    if (w <= 0) w = it.str.length * h * 0.5;
    out.push({ s: it.str, x0: x, x1: x + w, y, h });
  }
  return out;
}

function joinItems(items, h) {
  let out = '';
  let prev = null;
  for (const it of items) {
    if (prev) {
      const hasWs = /\s$/.test(out) || /^\s/.test(it.s);
      if (!hasWs && it.x0 - prev.x1 > 0.15 * h) out += ' ';
    }
    out += it.s;
    prev = it;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Grupează itemii în linii (y descrescător = de sus în jos), itemi sortați pe x. */
function clusterLines(its) {
  const sorted = its.slice().sort((a, b) => b.y - a.y || a.x0 - b.x0);
  const groups = [];
  let cur = null;
  for (const it of sorted) {
    if (cur && Math.abs(cur.sumY / cur.items.length - it.y) <= 0.5 * Math.max(cur.h, it.h)) {
      cur.items.push(it);
      cur.sumY += it.y;
      cur.h = Math.max(cur.h, it.h);
    } else {
      cur = { items: [it], sumY: it.y, h: it.h };
      groups.push(cur);
    }
  }
  return groups.map((g) => {
    g.items.sort((a, b) => a.x0 - b.x0);
    return {
      text: joinItems(g.items, g.h),
      y: g.sumY / g.items.length,
      h: g.h,
      x0: g.items[0].x0,
      x1: Math.max(...g.items.map((i) => i.x1)),
      items: g.items,
    };
  });
}

/** Gutiera = cel mai lat gol vertical (aproape neacoperit de itemi) în zona centrală. */
function findGutter(its, minX, maxX) {
  const span = maxX - minX;
  if (span < 100 || its.length < 8) return null;
  const nb = 200;
  const bw = span / nb;
  const cover = new Int32Array(nb);
  for (const it of its) {
    const a = Math.max(0, Math.floor((it.x0 - minX) / bw));
    const b = Math.min(nb - 1, Math.floor((it.x1 - minX) / bw));
    for (let i = a; i <= b; i += 1) cover[i] += 1;
  }
  const thr = Math.max(1, Math.floor(0.06 * its.length));
  const minRun = Math.max(3, Math.ceil(0.025 * nb));
  let best = null;
  let i = Math.floor(nb * 0.3);
  const end = Math.ceil(nb * 0.7);
  while (i < end) {
    if (cover[i] <= thr) {
      let j = i;
      while (j + 1 < nb && cover[j + 1] <= thr) j += 1;
      if (j - i + 1 >= minRun) {
        const centre = (i + j) / 2;
        const dist = Math.abs(centre - nb / 2);
        if (!best || dist < best.dist) best = { a: i, b: j, dist };
      }
      i = j + 1;
    } else i += 1;
  }
  if (!best) return null;
  const left = minX + best.a * bw;
  const right = minX + (best.b + 1) * bw;
  return { left, right, centre: (left + right) / 2 };
}

function isFullRow(row, g) {
  const gw = g.right - g.left;
  let l = 0;
  let r = 0;
  for (const it of row.items) {
    if (it.x0 < g.left && it.x1 > g.right) return true;
    if ((it.x0 + it.x1) / 2 < g.centre) l += 1;
    else r += 1;
  }
  if (!l || !r) return false;
  for (let k = 0; k + 1 < row.items.length; k += 1) {
    const a = row.items[k];
    const b = row.items[k + 1];
    if (a.x1 <= g.right && b.x0 >= g.left && b.x0 - a.x1 >= 0.6 * gw) return false;
  }
  return true;
}

/**
 * Întoarce liniile în ordine de citire: { text, y, h, kind: 'full'|'left'|'right'|'single', blankBefore }
 * și numărul de coloane detectat.
 */
export function orderLines(items) {
  const its = normItems(items);
  if (its.length === 0) return { lines: [], columns: 1, yTop: 0, yBottom: 0 };
  const yTop = Math.max(...its.map((i) => i.y));
  const yBottom = Math.min(...its.map((i) => i.y));
  const minX = Math.min(...its.map((i) => i.x0));
  const maxX = Math.max(...its.map((i) => i.x1));

  let ordered = null;
  let columns = 1;
  const g = findGutter(its, minX, maxX);
  if (g) {
    const rows = clusterLines(its);
    const fullLines = [];
    const colItems = { left: [], right: [] };
    for (const row of rows) {
      if (isFullRow(row, g)) fullLines.push({ ...row, kind: 'full' });
      else {
        for (const it of row.items) colItems[(it.x0 + it.x1) / 2 < g.centre ? 'left' : 'right'].push(it);
      }
    }
    const left = clusterLines(colItems.left).map((l) => ({ ...l, kind: 'left' }));
    const right = clusterLines(colItems.right).map((l) => ({ ...l, kind: 'right' }));
    if (left.length >= 3 && right.length >= 3) {
      columns = 2;
      fullLines.sort((a, b) => b.y - a.y);
      const bandOf = (l) => fullLines.filter((f) => f.y > l.y).length;
      ordered = [];
      for (let b = 0; b <= fullLines.length; b += 1) {
        for (const l of left) if (bandOf(l) === b) ordered.push(l);
        for (const l of right) if (bandOf(l) === b) ordered.push(l);
        if (b < fullLines.length) ordered.push(fullLines[b]);
      }
    }
  }
  if (!ordered) ordered = clusterLines(its).map((l) => ({ ...l, kind: 'single' }));

  // Paragrafe: salt vertical > 1.65 x pasul median al liniilor; titlurile full-width sunt izolate.
  const pitches = [];
  for (let i = 1; i < ordered.length; i += 1) {
    const d = ordered[i - 1].y - ordered[i].y;
    if (d > 0 && d < 4 * Math.max(ordered[i].h, 1)) pitches.push(d);
  }
  const pitch = median(pitches) || Math.max(...ordered.map((l) => l.h)) * 1.2;
  ordered.forEach((l, i) => {
    const prev = ordered[i - 1];
    l.blankBefore = false;
    if (!prev) return;
    if (columns === 2 && (l.kind === 'full' || prev.kind === 'full')) l.blankBefore = true;
    else if (prev.kind === l.kind && prev.y - l.y > 1.65 * pitch) l.blankBefore = true;
  });
  return { lines: ordered, columns, yTop, yBottom };
}

// ─── Curățare ─────────────────────────────────────────────────────────────────

const CEDILLA = { ţ: 'ț', ş: 'ș', Ţ: 'Ț', Ş: 'Ș' };
export function normalizeDiacritics(s) {
  return s.replace(/[ţşŢŞ]/g, (c) => CEDILLA[c]);
}

const WATERMARK = /(?:\bMG\s+)?Rezid[eE]n[tț]iat\s*[-–—]\s*Grile(?:\s+Rezi\w*)?/gi;
/** Prefixe care nu sunt cuvinte de sine stătătoare: "hiper tensiune" -> "hipertensiune". */
const SPLIT_PREFIX = /\b(hiper|hipo|tahi|bradi|oligo|normo|poli)\s+(?=\p{Ll}{4,})/giu;

/**
 * Sufixe care NU sunt cuvinte de sine stătătoare în română: dacă apar singure după un fragment
 * minuscul, e un cuvânt rupt de OCR ("domi nantă" -> "dominantă"). Intenționat scurtă și fără
 * sufixe ambigue ("ție", "tă", "re", "ment" pot fi cuvinte sau terminații obișnuite după cuvinte întregi).
 */
const SPLIT_SUFFIXES = ['nantă', 'nanta', 'nanți', 'nante', 'țiune', 'țiunea', 'țiunii', 'țiuni', 'tiune', 'tiunea', 'bilitate', 'bilității', 'mentul', 'mentului'];
const SPLIT_SUFFIX = new RegExp(`(?<![\\p{L}])(\\p{Ll}{3,8}) (${SPLIT_SUFFIXES.join('|')})(?![\\p{L}])`, 'gu');

export function cleanLineText(raw) {
  let s = normalizeDiacritics(raw);
  s = s.replace(WATERMARK, ' ');
  s = s.replace(SPLIT_PREFIX, '$1');
  s = s.replace(SPLIT_SUFFIX, '$1$2');
  return s.replace(/\s+/g, ' ').trim();
}

const FIG_CAPTION = /^Fig\.\s*\d+\.\d+/;
const TITLE = "\\p{Lu}[\\p{L}\\s,.'’()–-]{2,80}?";
const HEADER_A = new RegExp(`^(\\d{3,4})\\s+(${TITLE})$`, 'u');
const HEADER_B = new RegExp(`^(${TITLE})\\s+(\\d{3,4})$`, 'u');

/** Antet curent: "1136 Titlu" sau "Titlu 1137". Întoarce { printedPage, title } sau null. */
export function matchRunningHeader(text) {
  let m = HEADER_A.exec(text);
  if (m) return { printedPage: Number(m[1]), title: m[2].trim() };
  m = HEADER_B.exec(text);
  if (m) return { printedPage: Number(m[2]), title: m[1].trim() };
  return null;
}

/**
 * Procesează o pagină: ordine de citire + curățare.
 * @returns {{ text: string, printedPage?: number, runningTitle?: string, columns: 1|2 }}
 */
export function processPage(items) {
  const { lines, columns, yTop, yBottom } = orderLines(items);
  const cleaned = [];
  for (const l of lines) {
    const text = cleanLineText(l.text);
    if (text) cleaned.push({ ...l, text });
  }

  // Legendă de figură duplicată (OCR / text suprapus): "Fig. 31.4 ..." identică de două ori pe pagină -> o dată.
  // Doar potriviri exacte; orice altă "curățare" de zgomot din figuri ar cere imaginile, deci se omite.
  const seenCaptions = new Set();
  for (let i = cleaned.length - 1; i >= 0; i -= 1) {
    if (!FIG_CAPTION.test(cleaned[i].text)) continue;
    if (seenCaptions.has(cleaned[i].text)) cleaned.splice(i, 1);
    else seenCaptions.add(cleaned[i].text);
  }

  // Antetul/numărul paginii: doar printre cele mai de sus / de jos 2 linii (după y), în marginile paginii.
  let printedPage;
  let runningTitle;
  const byY = cleaned.slice().sort((a, b) => b.y - a.y);
  const H = yTop - yBottom;
  const margin = Math.max(H * 0.12, 1);
  const candidates = new Set([...byY.slice(0, 2), ...byY.slice(-2)].filter((l) => l.y >= yTop - margin || l.y <= yBottom + margin));
  const drop = new Set();
  for (const l of candidates) {
    const hdr = matchRunningHeader(l.text);
    if (hdr && printedPage === undefined) {
      printedPage = hdr.printedPage;
      runningTitle = hdr.title;
      drop.add(l);
    } else if (/^\d{1,4}$/.test(l.text)) {
      if (printedPage === undefined) printedPage = Number(l.text);
      drop.add(l);
    }
  }

  let out = '';
  let first = true;
  for (const l of cleaned) {
    if (drop.has(l)) continue;
    if (first) out = l.text;
    else if (/\p{L}-$/u.test(out) && !l.blankBefore && /^\p{Ll}/u.test(l.text)) out = out.slice(0, -1) + l.text;
    else if (/­$/.test(out) && !l.blankBefore) out = out.slice(0, -1) + l.text;
    else out += (l.blankBefore ? '\n\n' : '\n') + l.text;
    first = false;
  }
  const res = { text: out.replace(/­/g, ''), columns };
  if (printedPage !== undefined) res.printedPage = printedPage;
  if (runningTitle) res.runningTitle = runningTitle;
  return res;
}

// ─── OCR: pagini fără text util ───────────────────────────────────────────────
/** Sub atâtea litere (după curățare) o pagină cu imagini nu are text util. */
export const OCR_MAX_LETTERS = 25;

/**
 * Pagina are nevoie de OCR dacă textul reconstruit e gol sau foarte scurt ȘI pagina conține imagini
 * (scanare / figură întreagă). O pagină fără imagini și fără text e doar goală (separator): nu se OCR-izează.
 */
export function pageNeedsOcr({ text, imageCount = 0 }) {
  const letters = (String(text || '').match(/\p{L}/gu) || []).length;
  return letters < OCR_MAX_LETTERS && imageCount > 0;
}

/** Numără operatorii de imagine dintr-o listă de operatori pdf.js ({ fnArray }) folosind constantele `OPS` ale bibliotecii. */
export function countImageOps(operatorList, OPS) {
  const image = new Set([OPS?.paintImageXObject, OPS?.paintInlineImageXObject, OPS?.paintImageMaskXObject, OPS?.paintJpegXObject].filter((v) => v !== undefined));
  let n = 0;
  for (const fn of operatorList?.fnArray || []) if (image.has(fn)) n += 1;
  return n;
}

// ─── Marcaje de pagină (același format ca src/ai/pageMarkers.ts) ──────────────
const PAGE_MARK = '⁣';
/** `needsOcr` adaugă sufixul "~": pagina nu are text util și are imagini. */
export function formatPageMarker(page, printedPage, needsOcr) {
  return `${PAGE_MARK}p${page}${printedPage ? `|${printedPage}` : ''}${needsOcr ? '~' : ''}${PAGE_MARK}`;
}
