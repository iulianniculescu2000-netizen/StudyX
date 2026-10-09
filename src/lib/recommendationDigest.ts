export interface DigestItem {
  /** Leading emoji of the section, or a neutral bullet when the model gave none. */
  icon: string;
  title: string;
  /** One short line: the first sentence/bullet of the section, markdown stripped. */
  line: string;
}

const MAX_ITEMS = 3;
const MAX_LINE_CHARS = 120;

const EMOJI_LEAD = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*/u;

function stripMarkdown(value: string): string {
  return value
    .replace(/[*_`~]+/g, '')
    .replace(/^\s*(?:[-•▪◦]|\d+[.)])\s+/, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstSentence(value: string): string {
  const text = stripMarkdown(value);
  const cut = text.search(/[.!?](\s|$)/);
  const sentence = cut > 12 ? text.slice(0, cut + 1) : text;
  return sentence.length > MAX_LINE_CHARS ? `${sentence.slice(0, MAX_LINE_CHARS - 1).trimEnd()}…` : sentence;
}

/** A heading is a markdown heading, a line that is only bold text, or a short emoji-led label with no full stop. */
function headingText(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('|')) return null;

  const markdownHeading = trimmed.match(/^#{1,6}\s+(.+)$/);
  if (markdownHeading) return markdownHeading[1];

  const boldOnly = trimmed.match(/^\*\*([^*]{2,60})\*\*:?$/);
  if (boldOnly) return boldOnly[1];

  if (EMOJI_LEAD.test(trimmed) && trimmed.length <= 48 && !/[.!?]$/.test(trimmed) && !trimmed.includes(':')) return trimmed;
  return null;
}

/**
 * Boils a (possibly long, multi-section, table-carrying) AI recommendation down to
 * at most three "icon · title · one line" items, so the dashboard can show the gist
 * and keep the full text one click away. Tables and the rest of each section are
 * dropped; a recommendation with no sections becomes a single item.
 */
export function digestRecommendation(markdown: string): DigestItem[] {
  const items: DigestItem[] = [];
  let current: { icon: string; title: string; body: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const line = firstSentence(current.body.join(' '));
    if (line) items.push({ icon: current.icon, title: current.title, line });
    current = null;
  };

  const preface: string[] = [];
  for (const raw of markdown.split('\n')) {
    // "🎯 Focus: text" on one line — the compact format the recommendation prompt asks for.
    const inline = raw.trim().match(/^(\p{Extended_Pictographic}(?:️)?)\s*\*{0,2}([^:*]{2,24}?)\*{0,2}:\s*\*{0,2}(.+)$/u);
    if (inline) {
      flush();
      const line = firstSentence(inline[3]);
      if (line) items.push({ icon: inline[1], title: inline[2].trim(), line });
      continue;
    }
    const heading = headingText(raw);
    if (heading) {
      flush();
      const plain = stripMarkdown(heading);
      const emoji = plain.match(EMOJI_LEAD);
      current = { icon: emoji ? emoji[1] : '•', title: plain.replace(EMOJI_LEAD, '').replace(/:$/, '').trim(), body: [] };
      continue;
    }
    const line = raw.trim();
    if (!line || line.startsWith('|') || /^[-|:\s]+$/.test(line)) continue;
    if (current) current.body.push(line);
    else preface.push(line);
  }
  flush();

  if (items.length === 0) {
    const line = firstSentence(preface.join(' '));
    return line ? [{ icon: '🎯', title: 'Recomandare', line }] : [];
  }
  return items.slice(0, MAX_ITEMS);
}
