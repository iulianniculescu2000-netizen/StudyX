export type RelevantDocBlock =
  | { kind: 'heading' | 'paragraph'; text: string }
  | { kind: 'list'; items: string[] };

const CEDILLA: Record<string, string> = { 'ş': 'ș', 'Ş': 'Ș', 'ţ': 'ț', 'Ţ': 'Ț' };
const OCR_DIGITS: Record<string, string> = { '0': 'o', '1': 'r' };

/**
 * Curățenie tipografică pentru textul extras din PDF, fără să schimbe sensul: diacritice cu sedilă → virgulă, cratime
 * de capăt de rând lipite, și cifrele care în OCR țin loc de litere în mijlocul cuvintelor („a1ticulară” → „articulară”,
 * „rap01t” → „raport”). Cifrele se corectează doar când au litere mici de ambele părți, ca „B12”, „H1N1” sau „10 mg” să rămână.
 * Greșelile de OCR de alt fel („pentrn”) nu se ating: nu se ghicesc cuvinte medicale.
 */
export function tidyBookText(text: string): string {
  return text
    .replace(/­/g, '')
    .replace(/[şŞţŢ]/g, (char) => CEDILLA[char])
    .replace(/(\p{Ll})-\n[ \t]*(\p{Ll})/gu, '$1$2')
    .replace(/(?<=\p{Ll})[01]+(?=\p{Ll})/gu, (digits) => Array.from(digits, (digit) => OCR_DIGITS[digit]).join(''));
}

/** Present extracted PDF text. Only visual line wraps become spaces; see `tidyBookText` for the typographic cleanup. */
export function formatRelevantDoc(text: string): RelevantDocBlock[] {
  const lines = tidyBookText(text.replace(/\r\n?/g, '\n')).split('\n');
  const blocks: RelevantDocBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      const text = paragraph.join(' ');
      let start = 0;
      for (const match of text.matchAll(/[.!?](?=\s+[\p{Lu}„"'])/gu)) {
        const end = (match.index ?? 0) + 1;
        if (end - start < 220) continue;
        const lastWord = text.slice(Math.max(start, end - 12), end).match(/([\p{L}]+)[.!?]$/u)?.[1];
        if (lastWord && /^(?:dr|prof|fig|nr|pag|etc|ex|art)$/i.test(lastWord)) continue;
        blocks.push({ kind: 'paragraph', text: text.slice(start, end).trim() });
        start = end;
      }
      if (text.slice(start).trim()) blocks.push({ kind: 'paragraph', text: text.slice(start).trim() });
    }
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ kind: 'list', items: list });
    list = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    // A short standalone uppercase line or a label ending in ':' is a reliable
    // source heading. Keep its original spelling and punctuation.
    const letters = line.match(/\p{L}/gu)?.join('') ?? '';
    const heading = line.length <= 80 && line.split(/\s+/).length <= 10 && (
      (letters.length >= 4 && letters === letters.toLocaleUpperCase('ro-RO') && !/[.!?]$/.test(line)) ||
      (/^[\p{Lu}][^.!?]{2,60}:$/u.test(line))
    );
    const listItem = /^(?:[•●▪*-]|\d+[.)])\s+/.test(line);

    if (listItem) {
      flushParagraph();
      list.push(line);
    } else if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'heading', text: line });
    } else if (list.length) {
      // Wrapped lines in a list item belong to the preceding item.
      list[list.length - 1] += ` ${line}`;
    } else {
      paragraph.push(line);
    }
  }

  flushParagraph();
  flushList();
  return blocks;
}
