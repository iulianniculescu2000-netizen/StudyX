import type { Question } from '../../../types';
import { buildFlashcardQuestion } from '../cardBuilders';

const HEADER_FRONT = /^(front|fa[țţt][aă]|intrebare|întrebare|question|term|termen)$/i;
const HEADER_BACK = /^(back|spate|raspuns|răspuns|answer|definition|defini[țţt]ie)$/i;

/**
 * Splits CSV/TSV text into rows of fields. Honours RFC 4180 quoting: a field in
 * double quotes may hold the separator, line breaks and `""` for a literal quote.
 */
function parseRows(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  const endField = () => { row.push(field); field = ''; };
  const endRow = () => {
    endField();
    if (row.some((value) => value.trim())) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field.trim() === '') {
      field = '';
      quoted = true;
    } else if (ch === separator) {
      endField();
    } else if (ch === '\n') {
      endRow();
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  endRow();
  return rows;
}

/** Parses CSV/TSV text (front;back per line, `#` comments ignored) into flashcard questions. */
export function parseCsvFlashcards(text: string): Question[] {
  return parseCsvFlashcardsDetailed(text).questions;
}

/** Same as `parseCsvFlashcards`, but also reports how many non-empty rows could not become a card. */
export function parseCsvFlashcardsDetailed(text: string): { questions: Question[]; skipped: number } {
  const source = text.replace(/^\uFEFF/, '');
  const meaningful = source.split('\n').filter((line) => line.trim() && !line.startsWith('#'));
  if (meaningful.length === 0) {
    throw new Error('Fișierul CSV este gol sau conține doar comentarii.');
  }

  const first = meaningful[0];
  const separator = first.includes('\t') ? '\t' : first.includes(';') ? ';' : ',';
  let rows = parseRows(meaningful.join('\n'), separator);

  // A header row ("Față;Spate", "Front,Back") is not a card.
  const head = rows[0]?.map((value) => value.trim());
  if (head && head.length >= 2 && HEADER_FRONT.test(head[0]) && HEADER_BACK.test(head[1])) rows = rows.slice(1);

  const questions: Question[] = [];
  let skipped = 0;
  for (const parts of rows) {
    if (parts.length < 2) { skipped += 1; continue; }
    const front = parts[0].trim();
    const back = parts.slice(1).join(separator).trim();
    if (!front || !back) { skipped += 1; continue; }
    questions.push(buildFlashcardQuestion(front, back));
  }

  if (questions.length === 0) {
    throw new Error('Nu s-au găsit perechi front/back valide în CSV.');
  }
  return { questions, skipped };
}
