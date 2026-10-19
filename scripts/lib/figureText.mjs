/**
 * Curățarea conservatoare a etichetelor de figură din textul OCR al paginilor Lawrence care lipsesc din PDF-ul aplicației
 * (`lawrence.extra.json`, scris de scripts/map-owner-folder.mjs). Scanarea citește desenele ca linii de săgeți și puncte
 * („...--..+---------”), caractere stricate (U+FFFD) și etichete rupte, câte un cuvânt pe paragraf.
 *
 * Ce face: scoate U+FFFD, scoate săgețile/punctele și resturile fără litere din rândurile de figură, scoate rândurile rămase
 * fără conținut și lipește o etichetă ruptă doar când e evident („Ganglionii” + „subcarinali”). Nu ghicește litere sau cuvinte:
 * o literă pierdută rămâne pierdută. Proza (rândurile lungi, fără săgeți) nu se atinge, în afară de U+FFFD.
 *
 * Funcții pure (fără fs), idempotente, testate în src/test/figureText.test.ts.
 * Aplicare pe JSON-ul existent: node scripts/lib/figureText.mjs src/data/rezidentiat/library/lawrence.extra.json
 */

// Semnele din care OCR-ul face săgețile și liniile de indicație ale figurilor.
const JUNK = String.raw`\-–—_=+~:.•·,;'"„”»«\\|!/{}()<>^*`;
const JUNK_RUN = new RegExp(`[${JUNK}]{3,}`, 'g');
// Săgeată sau linie de indicație: liniuțe/egaluri/plusuri, sau cel puțin patru puncte. Nu „).” sau „...” din proză.
const isArrowRun = (run) => run.length >= 4 || (run.match(/[-–—_=+~]/g) ?? []).length >= 2;
const hasArrow = (line) => (line.match(/[-–—_=+~.:•·,]{3,}/g) ?? []).some(isArrowRun);
const EDGE = new RegExp(`^[${JUNK}]+|[${JUNK}]+$`, 'g');
// Un cuvânt sau un număr curat după scoaterea punctuației de la margini: „Ganglionii”, „59-69”, „2,8”, „g/dL”.
const WORDISH = /^[\p{L}\p{N}]+(?:(?:[-/][\p{L}\p{N}]+)|(?:(?<=\d),\d+))*$/u;
// Cuvintele românești de două litere au vocală („de”, „și”, „în”); „lt”, „tt”, „ft” sunt resturi de desen.
const VOWEL = /[aeiouăâîAEIOUĂÂÎ]/;
// Cuvânt cu litere normale: tot mic, tot majuscule sau cu inițială mare. „lHt”, „atN”, „IUi” sunt resturi de desen.
const NORMAL_CASE = /^(?:\p{Ll}+|\p{Lu}+|\p{Lu}\p{Ll}+)$/u;
const KEEP_SHORT = new Set(['ph', 'ml', 'dl', 'meq', 'mmhg', 'kda', 'cm', 'mm', 'kg', 'g', 'mg']);
const WORD = /[\p{L}]+/gu;

/** Frecvența cuvintelor (litere mici) din textele cărții: decide ce e cuvânt real și ce e rest de desen. */
export function wordFrequency(texts) {
  const freq = new Map();
  for (const text of texts) for (const w of text.toLowerCase().match(WORD) ?? []) freq.set(w, (freq.get(w) ?? 0) + 1);
  return freq;
}

const STRAY = /^[{}[\]|\\"'„”»«•·_^*~□]+$/;
const ALNUM = /[\p{L}\p{N}]/u;

/** U+FFFD: între două litere mici e o literă pierdută (se scoate, fără să fie ghicită); altfel desparte, ca un spațiu. */
export function dropReplacementChars(text) {
  return text
    .replace(/(?<=\p{Ll})\uFFFD+(?=\p{Ll})/gu, '')
    .replace(/\uFFFD+/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .split('\n').map((line) => line.trim()).join('\n');
}

const wordCount = (line) => line.split(/\s+/).filter(Boolean).length;

/** Rând de figură: are o săgeată/linie de puncte sau e o etichetă scurtă (cel mult 4 cuvinte), nu titlu și nu variantă de grilă. */
function isFigureLine(line) {
  if (line.startsWith('## ') || /^- [A-E][.)]\s/.test(line) || /^\d+\.\s/.test(line)) return false;
  return hasArrow(line) || wordCount(line) <= 4;
}

const known = (freq, w) => (freq.get(w.toLowerCase()) ?? 0) >= 2;

/** Un token dintr-un rând de figură, curățat; șir gol dacă e doar zgomot de desen. */
function cleanToken(token, freq) {
  // Numerotarea etichetelor („1) Mucoasă”) și parantezele („(T2)”) rămân.
  if (/^\d+\)$/.test(token)) return token;
  const core = token.replace(EDGE, '');
  if (!core || !ALNUM.test(core) || !WORDISH.test(core)) return '';
  // Rândul are săgeți: o literă sau o cifră izolată e capătul unei săgeți („sondă ----L--!”).
  if (core.length === 1) return '';
  if (/^\p{L}+$/u.test(core) && core.length <= 4 && !KEEP_SHORT.has(core.toLowerCase())) {
    if (!NORMAL_CASE.test(core) || !known(freq, core) || (core.length === 2 && !VOWEL.test(core))) return '';
  }
  // Punctuația obișnuită a propoziției rămâne („substanțială.”, „(T2)”, „„nod”); restul marginii e rest de desen.
  const at = token.indexOf(core);
  const ok = /^[(„"]?$/.test(token.slice(0, at)) && /^[.,;:!?)”"]{0,2}$/.test(token.slice(at + core.length));
  return ok ? token : core;
}

/**
 * Cuvânt rupt de scanare în rândul de figură („Mucoasă su perficială”): lipit doar dacă bucățile sunt rare în carte și forma
 * lipită apare de cel puțin două ori (aceeași regulă ca `mendSplitWords` din extract-book-pages.mjs).
 */
function mendSplit(tokens, freq) {
  const out = [];
  for (const t of tokens) {
    const prev = out.at(-1);
    if (prev && /^\p{L}+$/u.test(prev) && /^\p{Ll}+$/u.test(t) && known(freq, prev + t) && !known(freq, prev) && !known(freq, t)) {
      out[out.length - 1] = prev + t;
    } else out.push(t);
  }
  return out;
}

/** Rândul de figură fără săgeți, puncte și resturi de desen. Un rând fără săgeți și fără U+FFFD rămâne cum e. */
function cleanFigureLine(line, noisy, freq) {
  // Fără săgeți și fără U+FFFD: se scot doar semnele izolate de desen („celiac {”).
  if (!noisy && !hasArrow(line)) return line.split(' ').filter((t) => !STRAY.test(t)).join(' ');
  if (wordCount(line) > 4) return cleanProseWithArrow(line, freq);
  const tokens = mendSplit(line.replace(JUNK_RUN, ' ').split(/\s+/).filter(Boolean), freq);
  return tokens.map((t) => cleanToken(t, freq)).filter(Boolean).join(' ');
}

/**
 * Proză în care a intrat o săgeată sau o axă de grafic („autoexpansiune a 100.......------r--, 90”): se scot doar săgețile și
 * resturile sigure de desen („IUi”, „lt”), nu și cuvintele scurte ale propoziției („a”, „o”, „ș:”).
 */
function cleanProseWithArrow(line, freq) {
  const junk = (t) => {
    const core = t.replace(EDGE, '');
    if (!ALNUM.test(t) || STRAY.test(t)) return true;
    if (!/^\p{L}+$/u.test(core) || core.length > 4 || KEEP_SHORT.has(core.toLowerCase())) return false;
    return !NORMAL_CASE.test(core) || (core.length === 2 && !VOWEL.test(core));
  };
  const arrows = line.replace(/[-–—_=+~.:•·,]{3,}/g, (run) => (isArrowRun(run) ? ' ' : run));
  const tokens = arrows.split(/\s+/).filter((t) => t && !junk(t));
  // Axa unui grafic citită ca text („ltol te„ monitorizarepH”): sub o treime de cuvinte reale, rândul nu e proză.
  const real = tokens.filter((t) => { const core = t.replace(EDGE, ''); return core.length >= 3 && known(freq, core); }).length;
  return real * 3 >= tokens.length ? tokens.join(' ') : '';
}

/**
 * Rămășiță fără sens a unui rând de figură: niciun cuvânt de cel puțin două litere și niciun număr („o”, „.Q”, „""O”, „□”).
 * Numerele rămân („80”, „>9”): pot fi celule de tabel.
 */
const isLeftover = (line) => !line.split(/\s+/).some((t) => {
  const core = t.replace(EDGE, '');
  return WORDISH.test(core) && (core.length >= 2 || /\d/.test(core));
});
const PANELS = /^## (?:[A-E] )*[A-E]$/;

const LOWER_LABEL = /^\p{Ll}[\p{L}-]*(?: \p{Ll}[\p{L}-]*)?$/u;
const UPPER_LABEL = /^\p{Lu}[\p{L}-]*(?: [\p{L}-]+){0,2}$/u;

/**
 * Lipește o etichetă ruptă doar când e evident: un rând care începe cu majusculă (cel mult 3 cuvinte, fără punctuație) urmat de
 * EXACT un rând scurt cu literă mică („Ganglionii” + „subcarinali”). Când urmează două sau mai multe, gruparea e ambiguă
 * (etichete din coloane diferite): rândurile rămân separate.
 */
function joinBrokenLabels(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const next = lines[i + 1];
    const after = lines[i + 2];
    if (UPPER_LABEL.test(line) && next !== undefined && LOWER_LABEL.test(next) && !(after !== undefined && LOWER_LABEL.test(after))) {
      out.push(`${line} ${next}`);
      i += 1;
      continue;
    }
    out.push(line);
  }
  return out;
}

/**
 * Textul unei pagini cu etichetele de figură curățate. Paragrafele sunt separate prin rând gol, ca în `organize`.
 * `freq`: frecvența cuvintelor din carte (`wordFrequency`); fără ea, toate cuvintele scurte din rândurile cu săgeți se scot.
 */
export function cleanFigureText(text, freq = new Map()) {
  const lines = text.split('\n').filter((line) => line.trim());
  const figure = [];
  for (const raw of lines) {
    const noisy = raw.includes('\uFFFD');
    const line = noisy ? dropReplacementChars(raw) : raw;
    // Titlu fals din litere rătăcite („## I”); literele panourilor („## A B”) rămân.
    if (line.startsWith('## ') && !PANELS.test(line) && isLeftover(line.slice(3))) continue;
    if (!isFigureLine(line)) { figure.push({ line, label: false }); continue; }
    const cleaned = cleanFigureLine(line, noisy, freq);
    if (cleaned && !isLeftover(cleaned)) figure.push({ line: cleaned, label: true });
  }
  // Lipirea se face doar între rânduri de figură consecutive; proza nu participă.
  const result = [];
  let run = [];
  const flush = () => { result.push(...joinBrokenLabels(run)); run = []; };
  for (const entry of figure) {
    if (entry.label) run.push(entry.line);
    else { flush(); result.push(entry.line); }
  }
  flush();
  return result.join('\n\n');
}

/** Toate paginile din `{ "<pagina tipărită>": "text" }`, cu aceleași chei, în aceeași ordine. */
export function cleanExtraPages(extra, freq) {
  return Object.fromEntries(Object.entries(extra).map(([printed, text]) => [printed, cleanFigureText(text, freq)]));
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/').replace(/^\//, '')}`) {
  const fs = await import('node:fs');
  const file = process.argv[2];
  if (!file) { console.error('Folosire: node scripts/lib/figureText.mjs <fișier.extra.json>'); process.exit(1); }
  const extra = JSON.parse(fs.readFileSync(file, 'utf8'));
  // Vocabularul: paginile PDF-ului din aplicație (alături de fișierul extra) plus paginile extra.
  const pagesFile = file.replace(/\.extra\.json$/, '.pages.json');
  const pages = fs.existsSync(pagesFile) ? JSON.parse(fs.readFileSync(pagesFile, 'utf8')) : [];
  fs.writeFileSync(file, JSON.stringify(cleanExtraPages(extra, wordFrequency([...pages, ...Object.values(extra)])), null, 1));
  console.log(`Curățat: ${Object.keys(extra).length} pagini în ${file}`);
}
