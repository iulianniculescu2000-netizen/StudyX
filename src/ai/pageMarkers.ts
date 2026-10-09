/**
 * Numerele de pagină ale unui PDF, purtate prin textul extras până la chunking, fără a le lăsa în
 * text. Parserul PDF scrie un marcaj invizibil la începutul fiecărei pagini; înainte de indexare
 * marcajele se scot, iar poziția fiecărei pagini se păstrează într-o hartă, cu care chunk-urile
 * primesc `page`/`pageEnd`. Dacă harta lipsește (Electron, DOCX, text lipit), chunk-urile rămân
 * fără pagină — câmpurile sunt opționale peste tot.
 */

/** U+2063 INVISIBLE SEPARATOR: trece de curățarea de text a parserelor (interval U+2000–U+206F) și nu apare în texte reale. */
export const PAGE_MARK = '⁣';

export interface PageStart {
  /** Poziția în textul curat (fără marcaje) la care începe pagina. */
  offset: number;
  page: number;
  /** Numărul tipărit pe pagină (diferă de indexul PDF); opțional. */
  printedPage?: number;
  /** Pagina nu are text util dar are imagini: candidată la OCR (vezi pdfOcr.ts). */
  needsOcr?: boolean;
}

export function pageMarker(page: number, printedPage?: number, needsOcr?: boolean): string {
  return `${PAGE_MARK}p${page}${printedPage ? `|${printedPage}` : ''}${needsOcr ? '~' : ''}${PAGE_MARK}`;
}

export function hasPageMarkers(text: string): boolean {
  return text.includes(PAGE_MARK);
}

/** Scoate marcajele și întoarce textul curat + începutul fiecărei pagini (în ordinea apariției). */
export function extractPageMap(text: string): { text: string; pages: PageStart[] } {
  const pages: PageStart[] = [];
  const re = new RegExp(`${PAGE_MARK}p(\\d{1,5})(?:\\|(\\d{1,5}))?(~)?${PAGE_MARK}`, 'g');
  let out = '';
  let last = 0;
  for (const match of text.matchAll(re)) {
    const index = match.index ?? 0;
    out += text.slice(last, index);
    pages.push({ offset: out.length, page: Number(match[1]), ...(match[2] ? { printedPage: Number(match[2]) } : {}), ...(match[3] ? { needsOcr: true } : {}) });
    last = index + match[0].length;
  }
  out += text.slice(last);
  return { text: out.replace(new RegExp(PAGE_MARK, 'g'), ''), pages };
}

/**
 * Înlocuiește textul paginilor indicate cu text OCR și recalculează pozițiile paginilor.
 * Pagina OCR-izată nu mai e `needsOcr`. Paginile fără rezultat (sau cu rezultat gol) rămân cum erau.
 */
export function applyOcrText(text: string, pages: readonly PageStart[], ocr: ReadonlyMap<number, string>): { text: string; pages: PageStart[] } {
  if (ocr.size === 0 || pages.length === 0) return { text, pages: [...pages] };
  let out = text.slice(0, pages[0].offset);
  const nextPages: PageStart[] = [];
  pages.forEach((start, i) => {
    const end = i + 1 < pages.length ? pages[i + 1].offset : text.length;
    const replacement = ocr.get(start.page)?.trim();
    const body = replacement ? `${replacement}\n` : text.slice(start.offset, end);
    const { needsOcr, ...rest } = start;
    nextPages.push({ ...rest, offset: out.length, ...(needsOcr && !replacement ? { needsOcr } : {}) });
    out += body;
  });
  return { text: out, pages: nextPages };
}

/**
 * Curăță fiecare pagină separat și le lipește curat, refăcând pozițiile paginilor.
 *
 * De ce: textul se curăța o dată cu marcajele în el și încă o dată fără ele. Marcajele despart rândurile libere
 * și spațiile ("…\n" + marcaj + "\n…"), deci a doua curățare le colapsa și textul final nu mai era cel pentru care
 * se făcuse harta: harta paginilor se arunca pentru toată cartea ("Fără pagini"). Cu paginile curățate fiecare și
 * lipite curat, a doua curățare nu mai are ce schimba. `clean` taie capetele (trim) și trebuie să fie idempotentă.
 *
 * Limita dintre două pagini: un singur \n când textul brut avea spațiu sau rând nou acolo; lipire directă când nu avea
 * (cuvântul cu cratimă împărțit între pagini, deja unit de curățarea dinainte: „anato” + „mică” rămâne „anatomică”).
 */
export function restitchPages(
  text: string,
  pages: readonly PageStart[],
  clean: (segment: string) => string,
): { text: string; pages: PageStart[] } {
  if (pages.length === 0) return { text: clean(text), pages: [] };
  let out = '';
  let prevRaw = '';
  const append = (raw: string, segment: string): number => {
    const glue = out && !/\s$/.test(prevRaw) && !/^\s/.test(raw) ? '' : '\n';
    // Cratima de la capăt de pagină, urmată de literă mică, se unește (la fel face și curățarea de text).
    if (out && /-$/.test(out) && /^\p{Ll}/u.test(segment)) {
      out = out.slice(0, -1) + segment;
      prevRaw = raw;
      return out.length - segment.length;
    }
    const startAt = out ? out.length + glue.length : 0;
    out = out ? `${out}${glue}${segment}` : segment;
    prevRaw = raw;
    return startAt;
  };

  if (pages[0].offset > 0) {
    const raw = text.slice(0, pages[0].offset);
    const lead = clean(raw);
    if (lead) append(raw, lead);
  }
  const next: PageStart[] = pages.map((start, i) => {
    const end = i + 1 < pages.length ? pages[i + 1].offset : text.length;
    const raw = text.slice(start.offset, end);
    const segment = clean(raw);
    return { ...start, offset: segment ? append(raw, segment) : out.length };
  });
  return { text: out, pages: next };
}

/** Pagina care conține poziția dată (binar). `undefined` dacă poziția e înaintea primei pagini marcate. */
export function pageAtOffset(pages: readonly PageStart[], offset: number): number | undefined {
  return pageStartAtOffset(pages, offset)?.page;
}

export function pageStartAtOffset(pages: readonly PageStart[], offset: number): PageStart | undefined {
  let lo = 0;
  let hi = pages.length - 1;
  let found: PageStart | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pages[mid].offset <= offset) {
      found = pages[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export interface PageTaggable {
  text: string;
  page?: number;
  pageEnd?: number;
  printedPage?: number;
}

/**
 * Pune `page`/`pageEnd` pe chunk-uri, căutându-le în ordine în textul sursă. Chunk-ul începe cu
 * coada celui dinainte (suprapunere), deci căutarea pornește de la începutul precedentului, nu de
 * la sfârșitul lui. Un chunk negăsit (text normalizat de procesor) moștenește pagina precedentului.
 */
export function assignPagesToChunks<T extends PageTaggable>(sourceText: string, chunks: T[], pages: readonly PageStart[]): T[] {
  if (pages.length === 0 || chunks.length === 0) return chunks;

  let cursor = 0;
  let previousPage: number | undefined;
  return chunks.map((chunk) => {
    const firstLine = chunk.text.split('\n').find((line) => line.trim().length >= 12)?.trim().slice(0, 80)
      ?? chunk.text.trim().slice(0, 80);
    let at = firstLine ? sourceText.indexOf(firstLine, cursor) : -1;
    if (at < 0 && firstLine) at = sourceText.indexOf(firstLine.slice(0, 32), cursor);

    let page: number | undefined;
    let pageEnd: number | undefined;
    let printedPage: number | undefined;
    if (at >= 0) {
      cursor = at;
      const start = pageStartAtOffset(pages, at);
      page = start?.page;
      printedPage = start?.printedPage;
      const end = pageAtOffset(pages, at + chunk.text.length - 1);
      if (end !== undefined && page !== undefined && end > page) pageEnd = end;
    } else {
      page = previousPage;
    }
    if (page === undefined) return chunk;
    previousPage = pageEnd ?? page;
    return { ...chunk, page, ...(pageEnd !== undefined ? { pageEnd } : {}), ...(printedPage !== undefined ? { printedPage } : {}) };
  });
}

// ─── Canal lateral parser → indexare ──────────────────────────────────────────
// `parsePDF` întoarce doar un string (apelanții din pagini nu se schimbă), așa că harta paginilor
// se ține aici, legată de textul curat prin amprentă, și o consumă `addKnowledgeSource`.

const pendingMaps = new Map<string, PageStart[]>();
const MAX_PENDING = 3;

function fingerprint(text: string): string {
  return `${text.length}:${text.slice(0, 120)}:${text.slice(-120)}`;
}

export function rememberPageMap(cleanText: string, pages: PageStart[]): void {
  if (pages.length === 0) return;
  pendingMaps.set(fingerprint(cleanText), pages);
  while (pendingMaps.size > MAX_PENDING) {
    const oldest = pendingMaps.keys().next().value;
    if (oldest === undefined) break;
    pendingMaps.delete(oldest);
  }
}

/** Scoate (o singură dată) harta paginilor pentru acest text, dacă parserul a lăsat una. */
export function takePageMap(cleanText: string): PageStart[] | null {
  const key = fingerprint(cleanText);
  const pages = pendingMaps.get(key) ?? null;
  pendingMaps.delete(key);
  return pages;
}
