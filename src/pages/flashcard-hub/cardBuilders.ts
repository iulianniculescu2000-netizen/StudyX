import { flashcardImageRef } from '../../lib/flashcardImageStore';
import type { Difficulty, Question } from '../../types';
import type { CaptionedPdfImage, PdfFlashcardPageSnapshot } from '../../lib/imageProcessing';

export function generateId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

export const OPTION_IDS = ['a', 'b', 'c', 'd', 'e', 'f'];
export const FLASHCARD_ANSWER_SOFT_LIMIT = 210;
export const VISUAL_FLASHCARD_IMAGE_MAX_EDGE = 1680;
export const PHOTO_CARD_PROMPT = 'Privește imaginea și descrie aspectul clinic.';
export const LAST_FOLDER_LS_KEY = 'studyx-flashcard-last-folder';

/**
 * Builds one flashcard per course photo: the image on the front, the verbatim
 * caption on the back. Nothing is rewritten — the AI only decided these were
 * captioned photos worth turning into cards. Images are stored in IndexedDB and
 * referenced by tag so the quiz snapshot stays small.
 */
export function buildPhotoCardQuestion(entry: CaptionedPdfImage, quizId: string): Question {
  return {
    id: generateId(),
    text: PHOTO_CARD_PROMPT,
    imageUrl: flashcardImageRef(quizId, entry.tag),
    multipleCorrect: false,
    difficulty: 'medium' as Difficulty,
    explanation: `${entry.section} · imaginea ${entry.tag}`,
    options: [{
      id: OPTION_IDS[0] ?? generateId(),
      text: normalizeFlashcardCopy(entry.caption),
      isCorrect: true,
    }],
    tags: ['foto', entry.tag],
  };
}

export function normalizeFlashcardCopy(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function splitFlashcardAnswer(rawBack: string) {
  const cleaned = normalizeFlashcardCopy(rawBack);
  if (!cleaned) {
    return {
      answer: 'Răspuns indisponibil.',
      explanation: '',
    };
  }

  if (cleaned.length <= FLASHCARD_ANSWER_SOFT_LIMIT) {
    return { answer: cleaned, explanation: '' };
  }

  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  let answer = '';
  let explanation = '';

  if (sentences.length > 1) {
    // Track where the answer ends inside `cleaned`, so the explanation starts exactly after it
    // even when sentences were separated by newlines (which the split above consumed).
    let end = 0;
    for (const sentence of sentences) {
      const sentenceEnd = cleaned.indexOf(sentence, end) + sentence.length;
      const candidate = cleaned.slice(0, sentenceEnd).trim();
      if (candidate.length > FLASHCARD_ANSWER_SOFT_LIMIT) break;
      answer = candidate;
      end = sentenceEnd;
      if (answer.length >= 120) break;
    }

    if (!answer) {
      // The first sentence alone is longer than the limit: keep it whole.
      answer = sentences[0];
      end = cleaned.indexOf(sentences[0]) + sentences[0].length;
    }
    explanation = cleaned.slice(end).trim().replace(/^[,;:\-\s]+/, '');
  }

  // One long sentence (or nothing to split on): show it whole instead of cutting it mid-sentence with "...".
  if (!answer) return { answer: cleaned, explanation: '' };

  return { answer, explanation };
}

export function buildFlashcardQuestion(front: string, back: string): Question {
  const normalizedFront = normalizeFlashcardCopy(front);
  const { answer, explanation } = splitFlashcardAnswer(back);

  return {
    id: generateId(),
    text: normalizedFront,
    multipleCorrect: false,
    difficulty: 'medium' as Difficulty,
    explanation,
    options: [{ id: OPTION_IDS[0] ?? generateId(), text: answer, isCorrect: true }],
  };
}

export function normalizeMatchText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function pickKeywords(value: string) {
  const stopWords = new Set([
    'care', 'este', 'sunt', 'prin', 'pentru', 'dintre', 'acest', 'aceasta', 'intr', 'intre',
    'what', 'when', 'with', 'from', 'that', 'this', 'the', 'and',
  ]);

  return normalizeMatchText(value)
    .split(' ')
    .filter((word) => word.length >= 5 && !stopWords.has(word))
    .slice(0, 12);
}

/**
 * Images travel inside the deck as data URLs, i.e. inside the profile's localStorage entry (a few MB in
 * all). A handful of modest images is worth it; dozens of full pages would crowd out the user's data.
 */
export const MAX_DECK_IMAGES = 10;
export const MAX_IMAGE_DATA_URL_CHARS = 260_000;

export function attachRelevantPdfImages(questions: Question[], pages: PdfFlashcardPageSnapshot[]) {
  if (pages.length === 0 || questions.length === 0) return questions;

  const visualCandidates = pages
    .flatMap((page) => page.visuals.map((visual) => ({ page, visual })))
    .filter(({ visual }) => visual.dataUrl.length <= MAX_IMAGE_DATA_URL_CHARS)
    .slice(0, 40);
  if (visualCandidates.length === 0) return questions;

  const usedPages = new Set<number>();

  return questions.map((question) => {
    if (usedPages.size >= MAX_DECK_IMAGES) return question;
    const keywords = pickKeywords(`${question.text} ${question.options[0]?.text ?? ''}`);
    let bestCandidate: typeof visualCandidates[number] | null = null;
    let bestScore = 0;

    for (const candidate of visualCandidates) {
      if (usedPages.has(candidate.visual.pageNumber)) continue;
      const pageText = normalizeMatchText(candidate.page.text);
      const score = keywords.reduce((sum, keyword) => sum + (pageText.includes(keyword) ? 1 : 0), 0);
      const visualBoost = candidate.page.wordCount < 120 && score > 0 ? 1 : 0;
      const totalScore = score + visualBoost;
      if (totalScore > bestScore) {
        bestCandidate = candidate;
        bestScore = totalScore;
      }
    }

    if (!bestCandidate || bestScore < 2) return question;
    usedPages.add(bestCandidate.visual.pageNumber);

    return {
      ...question,
      imageUrl: bestCandidate.visual.dataUrl,
      explanation: [
        question.explanation,
        `Imagine relevantă din ${bestCandidate.visual.sourceName}, pagina ${bestCandidate.visual.pageNumber}.`,
      ].filter(Boolean).join('\n\n'),
    };
  });
}
