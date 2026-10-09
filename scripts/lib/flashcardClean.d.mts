export interface ParsedCard {
  chapter: string;
  number: number;
  question: string;
  answer: string;
  statement: boolean;
}

export interface DeckQuestion {
  id: string;
  text: string;
  options: { id: string; text: string; isCorrect: boolean }[];
  multipleCorrect: boolean;
  explanation: string;
  category: string;
  sourceBook: string;
}

export interface Deck {
  id: string;
  title: string;
  description: string;
  emoji: string;
  category: string;
  kind: 'flashcard';
  questions: DeckQuestion[];
  createdAt: number;
  color: string;
}

export const SHORT_QUESTION_CHARS: number;
export const GENERIC_STATEMENT_STEM: string;
export function headingKey(line: string): string;
export function isHeadingLine(line: string): boolean;
export function headingDisplayName(line: string): string;
export function cleanText(value: string): string;
export function stableId(seed: string): string;
export function cardFingerprint(question: string, answer: string): string;
export function splitQuestionAnswer(content: string): { question: string; answer: string; statement: boolean };
export function repairSplitWords(text: string, frequency: (word: string) => number): { text: string; joins: string[] };
export function parseKumarText(rawText: string, options?: { repairText?: (text: string) => string }): ParsedCard[];
export function buildFlashcardDeck(
  parsedCards: ParsedCard[],
  previous?: Partial<Deck> & { questions?: { id: string; text: string; options?: { text: string }[] }[] },
): { deck: Deck; stats: { total: number; reused: number; created: number } };
