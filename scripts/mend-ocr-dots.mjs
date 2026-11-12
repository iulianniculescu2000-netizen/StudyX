// Repară cuvintele în care stratul OCR al scanării a pus „·”/„•” în locul literelor „tr”/„r” („penh·u” → „pentru”,
// „h·atament” → „tratament”, „concenti·ația” → „concentrația”). Regula e aceeași ca la extragere: un cuvânt se
// înlocuiește doar cu o formă care apare deja, scrisă corect, în cărți (de cel puțin MIN_SEEN ori). Altfel rămâne neatins.
//
// Uz: node scripts/mend-ocr-dots.mjs            → raport (nu scrie nimic)
//     node scripts/mend-ocr-dots.mjs --write    → rescrie *.pages.json și *.extra.json din src/data/rezidentiat/library
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LETTERS = 'A-Za-zĂÂÎȘȚăâîșțŞşŢţÁÉÍÓÚáéíóúÀÈÌÒÙàèìòùÄËÏÖÜäëïöü';
const DOT = '[·•]';
/** Cuvânt care conține un punct OCR între litere (bucăți de 1–3 caractere înainte de punct pot fi tot gunoi: „tJ·”, „tt·”). */
const DOTTED = new RegExp(`[${LETTERS}0-9]*${DOT}[${LETTERS}]+`, 'gu');
/** Ce poate sta în locul grupului „<gunoi>·”: literele lipsă cele mai dese în text românesc. */
const FILLS = ['tr', 'r', 't', 'ti', 'f', 'fi', 'ri', 'u', 'ur', ''];
const MIN_SEEN = 3;

export function vocabularyOf(texts) {
  const freq = new Map();
  const word = new RegExp(`[${LETTERS}]+`, 'gu');
  for (const text of texts) {
    for (const w of text.toLowerCase().match(word) ?? []) freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return freq;
}

/** Forma corectă a unui cuvânt cu punct OCR, sau null când nicio formă atestată nu se potrivește. */
export function mendDottedWord(token, freq) {
  const at = token.search(new RegExp(DOT, 'u'));
  if (at <= 0 || at === token.length - 1) return null;
  const head = token.slice(0, at);
  const tail = token.slice(at + 1);
  if (!new RegExp(`^[${LETTERS}]+$`, 'u').test(tail)) return null;
  // Coada de o literă („penh·u”, „dinn·e”) se repară doar când rămâne un început real de cuvânt de cel puțin 2 litere.
  const minKeep = tail.length < 2 ? 2 : 0;
  let best = null;
  // Gunoiul dinaintea punctului are 0–2 caractere („h·”, „tJ·”, „tt·”, „ti·”); restul capului e începutul real al cuvântului.
  // Grupul „<gunoi>·” ține locul a tot atâtea litere cât are (minus cel mult una): „h·” → „tr”, „ti·” → „tr”, „i·” → „r”.
  // Fără gunoi, punctul e doar în plus („hep·atice” → „hepatice”). Așa nu se pierd litere („cm·e” nu devine „ce”).
  for (let drop = 0; drop <= Math.min(2, head.length); drop += 1) {
    const keep = head.slice(0, head.length - drop);
    for (const fill of FILLS) {
      const fits = drop === 0 ? fill === '' : fill.length === drop || fill.length === drop + 1;
      if (!fits) continue;
      const candidate = `${keep}${fill}${tail}`;
      if (candidate.length < 4 || keep.length < minKeep) continue;
      // Tot capul e gunoi și nu e literă mică („1·ică”, „J·ic”): e o bucată de cuvânt rupt, nu se ghicește decât un cuvânt lung.
      if (!keep && !/^[a-zăâîșț]+$/u.test(head) && candidate.length < 6) continue;
      const seen = freq.get(candidate.toLowerCase()) ?? 0;
      // „h·” e aproape mereu „tr” („h·ata” = „trata”, nu „rata”): forma cu „tr” câștigă când e atestată.
      const rank = seen * (fill === 'tr' ? 10 : 1);
      if (seen >= MIN_SEEN && (!best || rank > best.rank)) best = { candidate, rank };
    }
  }
  if (!best) return null;
  // Majuscula inițială se păstrează („Penh·u” → „Pentru”).
  const first = token[0];
  const fixed = best.candidate;
  return first === first.toUpperCase() && first !== first.toLowerCase() ? fixed[0].toUpperCase() + fixed.slice(1) : fixed;
}

export function mendText(text, freq, log) {
  return text.replace(DOTTED, (token) => {
    const fixed = mendDottedWord(token, freq);
    if (fixed && log) log.push([token, fixed]);
    return fixed ?? token;
  });
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/data/rezidentiat/library');
  const files = fs.readdirSync(dir).filter((f) => /\.(pages|extra)\.json$/.test(f));
  const raw = Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));
  const data = Object.fromEntries(files.map((f) => [f, JSON.parse(raw[f])]));
  const textsOf = (value) => (Array.isArray(value) ? value : Object.values(value));
  // Vocabularul vine din toate cărțile: „tratament” scris corect în Kumar confirmă „h·atament” din Lawrence.
  const freq = vocabularyOf(Object.values(data).flatMap(textsOf));
  const write = process.argv.includes('--write');
  for (const f of files) {
    const log = [];
    const value = data[f];
    const mended = Array.isArray(value)
      ? value.map((page) => mendText(page, freq, log))
      : Object.fromEntries(Object.entries(value).map(([k, page]) => [k, mendText(page, freq, log)]));
    const left = textsOf(mended).join('\n').match(DOTTED) ?? [];
    const counts = new Map();
    for (const [a, b] of log) counts.set(`${a} → ${b}`, (counts.get(`${a} → ${b}`) ?? 0) + 1);
    console.log(`${f}: ${log.length} reparate, ${left.length} rămase neatinse`);
    console.log('  ' + [...counts].sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} (${n})`).join('; '));
    if (left.length) console.log('  neatinse: ' + [...new Set(left)].slice(0, 40).join(' '));
    // Formatul fișierului rămâne cel de până acum (paginile pe un rând, `extra` cu câte o pagină pe rând), ca diff-ul să arate doar cuvintele.
    if (write && log.length) fs.writeFileSync(path.join(dir, f), JSON.stringify(mended, null, /^\{\s*\n/.test(raw[f]) ? 1 : undefined));
  }
}
