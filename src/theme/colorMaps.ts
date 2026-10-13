/**
 * Shared color maps for quiz card colors.
 * Single source of truth used by QuizCard, QuizDetail, and any other
 * component that needs to render per-color styles.
 */

import type { QuizColor } from '../types';

/** The seven folder / pack colours as plain hex, for places that need one solid swatch (sidebar, update modal, folder view). */
export const QUIZ_COLOR_HEX: Record<QuizColor, string> = {
  blue: '#0A84FF',
  purple: '#5E5CE6',
  green: '#30D158',
  orange: '#FF9F0A',
  pink: '#FF375F',
  red: '#FF453A',
  teal: '#5AC8FA',
};

/** Used by QuizCard — card background gradient + border + badge color */
export const CARD_COLOR_MAP: Record<string, {
  from: string;
  to: string;
  border: string;
  badge: string;
}> = {
  blue:   { from: 'rgba(10,132,255,0.13)',  to: 'rgba(94,92,230,0.07)',   border: 'rgba(10,132,255,0.22)',  badge: '#0A84FF' },
  purple: { from: 'rgba(94,92,230,0.13)',   to: 'rgba(175,82,222,0.07)',  border: 'rgba(94,92,230,0.22)',   badge: '#5E5CE6' },
  green:  { from: 'rgba(48,209,88,0.10)',   to: 'rgba(52,199,89,0.05)',   border: 'rgba(48,209,88,0.18)',   badge: '#30D158' },
  orange: { from: 'rgba(255,159,10,0.12)',  to: 'rgba(255,149,0,0.05)',   border: 'rgba(255,159,10,0.18)',  badge: '#FF9F0A' },
  pink:   { from: 'rgba(255,55,95,0.10)',   to: 'rgba(255,45,85,0.05)',   border: 'rgba(255,55,95,0.18)',   badge: '#FF375F' },
  red:    { from: 'rgba(255,69,58,0.12)',   to: 'rgba(255,59,48,0.06)',   border: 'rgba(255,69,58,0.22)',   badge: '#FF453A' },
  teal:   { from: 'rgba(90,200,250,0.12)',  to: 'rgba(50,173,230,0.06)',  border: 'rgba(90,200,250,0.22)',  badge: '#5AC8FA' },
};

/** Used by QuizDetail hero card — full gradient + glow shadow. Both stops keep white text at >= 4.5:1 (themeContrast.test.ts). */
export const HERO_COLOR_MAP: Record<string, {
  gradient: string;
  glow: string;
}> = {
  blue:   { gradient: 'linear-gradient(135deg, #0872DD 0%, #5E5CE6 100%)', glow: 'rgba(10,132,255,0.28)'  },
  purple: { gradient: 'linear-gradient(135deg, #5E5CE6 0%, #A44DD0 100%)', glow: 'rgba(94,92,230,0.28)'   },
  green:  { gradient: 'linear-gradient(135deg, #1E8538 0%, #22853B 100%)', glow: 'rgba(48,209,88,0.28)'   },
  orange: { gradient: 'linear-gradient(135deg, #A56706 0%, #C45200 100%)', glow: 'rgba(255,159,10,0.28)'  },
  pink:   { gradient: 'linear-gradient(135deg, #DB2F51 0%, #E0274A 100%)', glow: 'rgba(255,55,95,0.28)'   },
  red:    { gradient: 'linear-gradient(135deg, #D63930 0%, #DB3229 100%)', glow: 'rgba(255,69,58,0.28)'   },
  teal:   { gradient: 'linear-gradient(135deg, #377B9A 0%, #237CA5 100%)', glow: 'rgba(90,200,250,0.28)'  },
};
