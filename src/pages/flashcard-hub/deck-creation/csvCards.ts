import type { Question } from '../../../types';
import { buildFlashcardQuestion } from '../cardBuilders';

/** Parses CSV/TSV text (front;back per line, `#` comments ignored) into flashcard questions. */
export function parseCsvFlashcards(text: string): Question[] {
  const lines = text.split('\n').filter((line) => line.trim() && !line.startsWith('#'));
  if (lines.length === 0) {
    throw new Error('Fișierul CSV este gol sau conține doar comentarii.');
  }

  const separator = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const questions: Question[] = [];

  for (const line of lines) {
    const parts = line.split(separator);
    if (parts.length < 2) continue;

    const clean = (value: string) => value.trim().replace(/^"(.*)"$/, '$1').replace(/""/g, '"');
    const front = clean(parts[0]);
    const back = clean(parts.slice(1).join(separator));
    if (!front || !back) continue;

    questions.push(buildFlashcardQuestion(front, back));
  }

  if (questions.length === 0) {
    throw new Error('Nu s-au găsit perechi front/back valide în CSV.');
  }
  return questions;
}
