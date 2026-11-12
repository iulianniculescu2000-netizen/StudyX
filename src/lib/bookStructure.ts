/**
 * Baza de date a cărților incluse: fiecare carte împărțită în capitol → subiect → secțiuni, cu textul cărții NESCHIMBAT.
 *
 * Capitolele și subiectele vin din planul din Organizare (555 de subiecte cu paginile lor), dar granița unui subiect nu
 * e o pagină întreagă: se caută titlul subiectului în textul paginii („## Artrita psoriazică” la mijlocul paginii 80), iar
 * subiectul începe exact acolo. Înăuntrul lui, titlurile cărții („## Tablou clinic”, „## Tratament”, „## Febuxostat”)
 * despart secțiunile. Fiecare bloc își păstrează pagina, deci o citare duce la pagina exactă.
 *
 * Nimic nu se rescrie, nu se rezumă și nu se generează: cuvintele sunt cele din `*.pages.json` (extrase din PDF-urile din
 * aplicație). Doar titlurile false (gunoi de OCR marcat ca titlu, „## a”, „## Plămân ------J”) rămân text obișnuit.
 */
import { basePlan, curriculumChapters, type BookCode } from './curriculum';
import { parsePageRange } from './bookPages';
import { withoutNumber } from './organizare/format';
import { queryIntents, type SectionIntent } from '../ai/sectionIntent';
import { normalizeSearchText } from '../ai/medicalSynonyms';

export type BookBlockKind = 'p' | 'li' | 'caption';

export interface BookBlock {
  kind: BookBlockKind;
  /** Textul exact din carte. */
  text: string;
  /** Pagina din PDF-ul inclus (de la 1). */
  page: number;
}

export interface BookSection {
  /** Titlul din carte („Tablou clinic”); gol pentru textul de la începutul subiectului, înainte de primul titlu. */
  title: string;
  /** Subiectul numit din carte în care se află secțiunea („Artrita psoriazică” pentru „Tratament și prognostic”). */
  parent?: string;
  intent?: SectionIntent;
  page: number;
  pageEnd: number;
  blocks: BookBlock[];
}

export interface BookTopic {
  book: BookCode;
  chapterNumber: number;
  chapter: string;
  title: string;
  /** Paginile din plan (pot începe sau se pot termini la mijlocul paginii). */
  first: number;
  last: number;
  /** Pagina la care s-a găsit titlul subiectului în text, sau null când subiectul începe la pagina din plan. */
  anchoredAt: number | null;
  sections: BookSection[];
}

/** Titlurile de secțiune care se repetă în fiecare subiect (subsecțiuni, nu subiecte noi). */
const SECTION_TITLE = /^(tablou clinic|talou clinic|manifestari|simptome|semne|examen (fizic|clinic)|investigat|diagnostic|tratament|terapi|management|conduita|prognostic|complicat|etiologi|patogen|fiziopatolog|morfopatolog|patologi|epidemiolog|incident|prevalent|introducere|definit|clasificare|factori de risc|prevenire|profilaxi|mecanism de actiune|utilizare clinica|efecte adverse|contraindicat|interactiuni|de retinut|de rejinut|de re inut|oe retinut|lecturi suplimentare|bibliografie|evaluare|anatomie|fiziologie|masuri generale|dieta|sfaturi)/;
/** Secțiuni care nu conțin materie (trimiteri bibliografice). */
const REFERENCE_TITLE = /^(lecturi suplimentare|bibliografie)/;
const CAPTION = /^(fig\.?|figura|cadranul|tabelul|caseta)\s*\d/i;
const LETTER = /\p{L}/gu;

function fold(text: string): string {
  return normalizeSearchText(text).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Un rând marcat „## ” e titlu adevărat, nu gunoi de OCR: are cuvinte, nu doar simboluri, litere izolate sau cifre. */
export function isRealHeading(text: string): boolean {
  const t = text.trim();
  if (t.length < 3 || t.length > 90) return false;
  const letters = t.match(LETTER)?.length ?? 0;
  if (letters < 3 || letters / t.length < 0.7) return false;
  if (/-{2,}|[|=_{}<>@#$%^*~]/.test(t)) return false;
  // Titlu cu majuscule rupt de OCR în bucăți („SPON Dl LARTR ITA”): o bucată de 1–2 litere care nu e un cuvânt mic.
  const upper = t.match(/\p{Lu}/gu)?.length ?? 0;
  if (upper / letters >= 0.7 && t.split(/\s+/).some((word) => /^\p{L}{1,2}$/u.test(word) && !CAPS_SHORT_WORDS.has(word))) return false;
  return /\p{L}{3,}/u.test(t);
}

/** Trimitere la o figură sau un cadran în mijlocul unui bloc: blocul e (și) legendă. */
const FIGURE_REF = /\b(Fig\.?|Figura|Cadranul|Tabelul)\s*\d+[.-]\d+/;
const CAPS_SHORT_WORDS = new Set(['ȘI', 'SI', 'DE', 'LA', 'ÎN', 'IN', 'CU', 'PE', 'A', 'O', 'AL', 'ÎI', 'UN']);
/** Câte caractere de text trebuie să aibă sub el un titlu ca să devină părintele secțiunilor următoare. */
const PARENT_MIN_TEXT = 120;

const STOP = new Set(['si', 'de', 'la', 'cu', 'in', 'a', 'al', 'ale', 'din', 'pe', 'sau', 'ca', 'boala', 'bolile', 'alte', 'tipuri']);
// Parantezele rămân: „BPOC (bronșita cronică, emfizemul)” trebuie să recunoască titlul „Bronșita cronică”.
const stems = (text: string) => fold(withoutNumber(text)).split(' ')
  .filter((word) => word.length >= 3 && !STOP.has(word)).map((word) => word.slice(0, 6));

/**
 * Cât de bine numește un titlu din carte subiectul din plan: partea din cuvintele titlului care apar în numele subiectului.
 * Același prim cuvânt („Guta și hiperuricemia” ~ „Guta și artropatiile microcristaline”) e o potrivire bună chiar dacă restul diferă.
 */
export function headingMatchesTopic(heading: string, topicTitle: string): number {
  const own = stems(heading);
  if (own.length === 0) return 0;
  const topic = stems(topicTitle);
  const wanted = new Set(topic);
  const hits = own.filter((stem) => wanted.has(stem)).length;
  const sameStart = own[0] === topic[0] && own[0].length >= 4 ? 0.8 : 0;
  return Math.max(hits / own.length, sameStart);
}

interface Position { page: number; offset: number }

interface RawBlock { text: string; page: number; offset: number }

function pageBlocks(pages: readonly string[]): RawBlock[] {
  const out: RawBlock[] = [];
  pages.forEach((text, index) => {
    let offset = 0;
    for (const part of text.split(/\n{2,}/)) {
      const at = text.indexOf(part, offset);
      offset = at + part.length;
      if (part.trim()) out.push({ text: part.trim(), page: index + 1, offset: at });
    }
  });
  return out;
}

const before = (a: Position, b: Position) => a.page < b.page || (a.page === b.page && a.offset < b.offset);

/** Unde începe fiecare subiect în text: titlul lui pe pagina de start din plan sau pe una vecină, altfel începutul paginii din plan. */
function topicStarts(blocks: readonly RawBlock[], topics: ReadonlyArray<{ title: string; first: number }>): Array<{ at: Position; anchored: boolean }> {
  const starts: Array<{ at: Position; anchored: boolean }> = [];
  let floor: Position = { page: 0, offset: -1 };
  for (const topic of topics) {
    let found: RawBlock | null = null;
    let best = 0;
    for (const block of blocks) {
      if (block.page < topic.first - 1 || block.page > topic.first + 1) continue;
      if (!block.text.startsWith('## ')) continue;
      const position = { page: block.page, offset: block.offset };
      if (!before(floor, position)) continue;
      const score = headingMatchesTopic(block.text.slice(3), topic.title);
      // Prima potrivire bună câștigă; una mai bună pe aceeași fereastră o înlocuiește.
      if (score >= 0.6 && score > best) {
        found = block;
        best = score;
      }
    }
    const at = found ? { page: found.page, offset: found.offset } : { page: topic.first, offset: 0 };
    const safe = before(floor, at) ? at : { ...floor, offset: floor.offset + 1 };
    starts.push({ at: safe, anchored: Boolean(found) && safe === at });
    floor = safe;
  }
  return starts;
}

function blockKind(text: string): BookBlockKind {
  if (text.startsWith('- ')) return 'li';
  if (CAPTION.test(text)) return 'caption';
  return 'p';
}

/** Secțiunile unui subiect, din blocurile lui, în ordinea din carte. */
function sectionsOf(blocks: readonly RawBlock[], topicTitle: string): BookSection[] {
  const sections: BookSection[] = [];
  let parent: string | undefined;
  let current: BookSection | null = null;
  const open = (title: string, page: number, withParent: boolean) => {
    const intent = title ? queryIntents(title)[0] : undefined;
    current = { title, ...(withParent && parent && parent !== title ? { parent } : {}), ...(intent ? { intent } : {}), page, pageEnd: page, blocks: [] };
    sections.push(current);
  };
  // Un titlu care nu e o subsecțiune obișnuită poate numi o boală/un medicament („Artrita psoriazică”, „Febuxostat”) și devine
  // părintele subsecțiunilor de după el („Tablou clinic”, „Tratament”); titlurile de același fel sunt frați, nu copii. Dar și
  // etichetele din scheme („Consideră externare”) arată ca titluri: devine părinte doar când are sub el un paragraf propriu
  // (nu doar o legendă sau o listă) sau e urmat direct de o subsecțiune.
  let pending: BookSection | null = null;
  // Un părinte adevărat numește ceva din subiect („Artrita psoriazică” în „Artrita psoriazică, reactivă și enteropatică”);
  // „Splina, ganglionii limfatici” sau „Chirurgie” din mijlocul unui subiect nu sunt părinții secțiunii „Tratament” de după ele.
  const promote = () => {
    if (pending && headingMatchesTopic(pending.title, topicTitle) > 0) parent = pending.title;
    pending = null;
  };
  for (const block of blocks) {
    if (block.text.startsWith('## ')) {
      const title = block.text.slice(3).trim();
      if (isRealHeading(title)) {
        const isSubsection = SECTION_TITLE.test(fold(title));
        if (isSubsection && pending && (pending as BookSection).blocks.length === 0) promote();
        pending = null;
        if (!isSubsection) parent = undefined;
        open(title, block.page, isSubsection);
        if (!isSubsection) pending = current;
        continue;
      }
    }
    if (!current) open('', block.page, false);
    const section = current as unknown as BookSection;
    // Titlul fals rămâne text, cu cuvintele lui, fără marcajul „## ”.
    const text = block.text.startsWith('## ') ? block.text.slice(3).trim() : block.text;
    for (const line of text.startsWith('- ') ? text.split(/\n(?=- )/) : [text]) {
      section.blocks.push({ kind: blockKind(line), text: line, page: block.page });
    }
    section.pageEnd = Math.max(section.pageEnd, block.page);
    // Doar paragrafe adevărate: încep cu majusculă (nu continuă o listă) și nu sunt legenda unei figuri („… Fig. 32.16 Ghidul…”).
    const own = section.blocks.reduce((sum, item) => sum + (item.kind === 'p' && /^\p{Lu}/u.test(item.text) && !FIGURE_REF.test(item.text) ? item.text.length : 0), 0);
    if ((pending as BookSection | null) === section && own >= PARENT_MIN_TEXT) promote();
  }
  return sections.filter((section) => section.blocks.length > 0 || section.title);
}

/** Toată cartea, structurată. Paginile dinaintea primului subiect din plan (copertă, cuprins) formează „Pagini introductive”. */
export function structureBook(book: BookCode, pages: readonly string[]): BookTopic[] {
  const chapters = curriculumChapters();
  const planned = basePlan().topics
    .filter((topic) => topic.book === book)
    .map((topic) => ({ topic, range: parsePageRange(topic.pdf) }))
    .filter((entry): entry is { topic: typeof entry.topic; range: NonNullable<typeof entry.range> } => !!entry.range && entry.range.first <= pages.length)
    .sort((a, b) => a.range.first - b.range.first || a.topic.index - b.topic.index)
    .map(({ topic, range }) => ({
      // Titlurile din plan au uneori ş/ţ cu sedilă („Guşa”); în aplicație se scriu cu virgulă, ca textul cărților.
      title: withoutNumber(topic.name).replace(/ş/g, 'ș').replace(/ţ/g, 'ț').replace(/Ş/g, 'Ș').replace(/Ţ/g, 'Ț'),
      first: range.first,
      last: Math.min(range.last, pages.length),
      chapterNumber: chapters[topic.group]?.number ?? topic.group + 1,
      chapter: chapters[topic.group]?.title ?? topic.chapter,
    }));

  const blocks = pageBlocks(pages);
  const starts = topicStarts(blocks, planned);
  const result: BookTopic[] = [];

  const intro = blocks.filter((block) => planned.length === 0 || before({ page: block.page, offset: block.offset }, starts[0].at));
  if (intro.length) {
    result.push({ book, chapterNumber: 0, chapter: 'Pagini introductive', title: 'Pagini introductive', first: 1, last: intro.at(-1)!.page, anchoredAt: null, sections: sectionsOf(intro, '') });
  }
  planned.forEach((topic, index) => {
    const from = starts[index].at;
    const to = starts[index + 1]?.at;
    const own = blocks.filter((block) => {
      const position = { page: block.page, offset: block.offset };
      return !before(position, from) && (!to || before(position, to));
    });
    result.push({
      book, chapterNumber: topic.chapterNumber, chapter: topic.chapter, title: topic.title, first: topic.first, last: topic.last,
      anchoredAt: starts[index].anchored ? from.page : null, sections: sectionsOf(own, topic.title),
    });
  });
  return result;
}

export interface StructuredChunk {
  id: string;
  text: string;
  heading: string;
  chapter: string;
  page: number;
  pageEnd?: number;
  printedPage?: number;
}

/** Cât text intră într-un fragment de căutare (cât un fragment obișnuit, ~1500 de caractere). */
const CHUNK_CHARS = 1500;

export function isReferenceSection(section: BookSection): boolean {
  return REFERENCE_TITLE.test(fold(section.title));
}

/**
 * Fragmentele de căutare ale unei cărți: unul sau mai multe pe secțiune, tăiate doar între blocuri. Fiecare începe cu
 * „Subiect › Secțiune” (titlurile din carte), deci căutarea și citarea știu exact unde sunt; textul de după e cel din carte.
 */
export function structuredChunks(topics: readonly BookTopic[], sourceName: string): StructuredChunk[] {
  const chunks: StructuredChunk[] = [];
  for (const topic of topics) {
    for (const section of topic.sections) {
      if (isReferenceSection(section) || section.blocks.length === 0) continue;
      const trail = [topic.title, section.parent, section.title].filter((part, i, all) => part && all.indexOf(part) === i);
      const heading = trail.join(' › ');
      let piece: BookBlock[] = [];
      const flush = () => {
        if (!piece.length) return;
        const first = piece[0].page;
        const last = piece.at(-1)!.page;
        chunks.push({
          id: `${sourceName}-chunk-${chunks.length}`,
          text: `${heading}\n\n${piece.map((block) => block.text).join('\n\n')}`,
          heading,
          chapter: topic.chapter,
          page: first,
          ...(last !== first ? { pageEnd: last } : {}),
        });
        piece = [];
      };
      let size = 0;
      for (const block of section.blocks) {
        if (size > 0 && size + block.text.length > CHUNK_CHARS) {
          flush();
          size = 0;
        }
        piece.push(block);
        size += block.text.length + 2;
      }
      flush();
    }
  }
  return chunks;
}

/**
 * Paginile din afara PDF-ului inclus (Lawrence: 69 de pagini din folderul proprietarului) nu au loc în plan: fiecare devine
 * fragmente proprii, numerotate după ultima pagină a PDF-ului, cu pagina tipărită, ca înainte.
 */
export function extraPageChunks(
  extra: ReadonlyArray<{ printed: number; text: string }>,
  pdfPages: number,
  sourceName: string,
  firstIndex: number,
): StructuredChunk[] {
  const chunks: StructuredChunk[] = [];
  extra.forEach(({ printed, text }, index) => {
    const heading = `Pagina tipărită ${printed} (nu e în PDF-ul din aplicație)`;
    let piece: string[] = [];
    let size = 0;
    const flush = () => {
      if (!piece.length) return;
      chunks.push({
        id: `${sourceName}-chunk-${firstIndex + chunks.length}`,
        text: `${heading}\n\n${piece.join('\n\n')}`,
        heading,
        chapter: '',
        page: pdfPages + index + 1,
        printedPage: printed,
      });
      piece = [];
      size = 0;
    };
    for (const part of text.trim().split(/\n{2,}/)) {
      if (size > 0 && size + part.length > CHUNK_CHARS) flush();
      piece.push(part);
      size += part.length + 2;
    }
    flush();
  });
  return chunks;
}
