import type { Difficulty, Question, QuizColor } from '../../types';
import { resizeImageDataUrl } from '../../lib/imageProcessing';

export const EMOJIS = ['📚', '🧠', '💡', '🔬', '🌍', '💻', '🔢', '🎯', '⚡', '🏆', '🎓', '🌱', '🧪', '🗺️', '📖', '🏛️', '🩺', '💊', '❤️', '🦠', '🔭', '🧬'];

export const COLORS: { id: QuizColor; bg: string; label: string }[] = [
  { id: 'blue', bg: 'linear-gradient(135deg, #0A84FF, #5E5CE6)', label: 'Culoare albastră' },
  { id: 'purple', bg: 'linear-gradient(135deg, #5E5CE6, #AF52DE)', label: 'Culoare violet' },
  { id: 'green', bg: 'linear-gradient(135deg, #30D158, #34C759)', label: 'Culoare verde' },
  { id: 'orange', bg: 'linear-gradient(135deg, #FF9F0A, #FF6B00)', label: 'Culoare portocalie' },
  { id: 'pink', bg: 'linear-gradient(135deg, #FF375F, #FF2D55)', label: 'Culoare roz' },
  { id: 'red', bg: 'linear-gradient(135deg, #FF453A, #FF3B30)', label: 'Culoare roșie' },
  { id: 'teal', bg: 'linear-gradient(135deg, #5AC8FA, #32ADE6)', label: 'Culoare turcoaz' },
];

export const CATEGORIES = ['Dermatologie', 'Anatomie', 'Fiziologie', 'Biochimie', 'Farmacologie', 'Patologie', 'Chirurgie', 'Medicină internă', 'Neurologie', 'Microbiologie', 'Histologie', 'Altele'];

export const DIFFICULTIES: { id: Difficulty; label: string; color: string }[] = [
  { id: 'easy', label: 'Ușor', color: '#30D158' },
  { id: 'medium', label: 'Mediu', color: '#FF9F0A' },
  { id: 'hard', label: 'Dificil', color: '#FF453A' },
];

export const OPTION_IDS = ['a', 'b', 'c', 'd', 'e', 'f'];

export function compressImage(dataUrl: string, maxPx = 1680, quality = 0.88): Promise<string> {
  return resizeImageDataUrl(dataUrl, {
    maxLongEdge: maxPx,
    quality,
    mimeType: 'image/jpeg',
  }).catch(() => dataUrl);
}

export function generateId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

export function newQuestion(): Question {
  return {
    id: generateId(),
    text: '',
    multipleCorrect: false,
    difficulty: 'easy',
    options: [
      { id: 'a', text: '', isCorrect: false },
      { id: 'b', text: '', isCorrect: false },
      { id: 'c', text: '', isCorrect: false },
      { id: 'd', text: '', isCorrect: false },
    ],
    explanation: '',
  };
}

/** Why "Salvează" is inert, in words (null when saving is possible). */
export function getSaveBlockedReason(hasTitle: boolean, questionsValid: boolean): string | null {
  if (!hasTitle) return 'Completează titlul grilei (pasul anterior).';
  if (!questionsValid) return 'Fiecare întrebare are nevoie de text, de toate variantele completate și de cel puțin un răspuns corect.';
  return null;
}
