export type RelevantDocBlock =
  | { kind: 'heading' | 'paragraph'; text: string }
  | { kind: 'list'; items: string[] };

/** Present extracted PDF text without rewriting it. Only visual line wraps become spaces. */
export function formatRelevantDoc(text: string): RelevantDocBlock[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
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
