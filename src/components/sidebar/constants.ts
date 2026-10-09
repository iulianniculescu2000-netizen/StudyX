import type { QuizColor } from '../../types';
import { QUIZ_COLOR_HEX } from '../../theme/colorMaps';

export const FOLDER_COLOR_IDS: QuizColor[] = ['blue', 'purple', 'green', 'orange', 'pink', 'red', 'teal'];
export const FOLDER_COLORS: { id: QuizColor; bg: string }[] = FOLDER_COLOR_IDS.map((id) => ({ id, bg: QUIZ_COLOR_HEX[id] }));

/** Identity hue of each navigation entry (decorative accent, intentionally not theme-driven). */
export const NAV_HUE = {
  dashboard: '#0A84FF',
  quizzes: '#5E5CE6',
  review: '#FF9F0A',
  dailyReview: '#FF375F',
  stats: '#5AC8FA',
  gamification: '#FF9F0A',
  analytics: '#5E5CE6',
  notes: '#30D158',
  vault: '#0A84FF',
  rezidentiat: '#FF453A',
  flashcards: '#5E5CE6',
} as const;
export const FOLDER_EMOJIS = ['\u{1F4C1}', '\u{1F4DA}', '\u{1F9E0}', '\u{1F4A1}', '\u{1F52C}', '\u{1F30D}', '\u{1F4BB}', '\u2764\uFE0F', '\u{1F9B4}', '\u{1F48A}', '\u2695\uFE0F', '\u{1F9EA}', '\u{1F4CB}', '\u{1F3AF}', '\u26A1', '\u{1F3E5}'];
export const QUIZ_DRAG_MIME = 'application/x-studyx-quiz-id';
