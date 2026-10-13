import { useEffect, useRef } from 'react';
import type { Confidence, Question } from '../../../types';
import { useTutorialStore } from '../../../store/tutorialStore';

interface Handlers {
  question: Question | undefined;
  revealed: boolean;
  examMode: boolean;
  currentIdx: number;
  onSelect: (optionId: string) => void;
  onConfirm: () => void;
  onNext: () => void;
  onHint: () => void;
  onConfidence: (level: Confidence) => void;
  onPrevious: () => void;
}

const CONFIDENCE_KEYS: Record<string, Confidence> = { '1': 'blackout', '2': 'guess', '3': 'confident' };
const OPTION_KEYS: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, a: 0, b: 1, c: 2, d: 3, e: 4 };

/**
 * Global quiz shortcuts. The window listener is bound once; the latest handlers/state are read
 * through a ref so re-renders never re-attach it.
 */
export function useQuizKeyboard(handlers: Handlers) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (useTutorialStore.getState().active || (e.target instanceof Element && e.target.closest('[role="dialog"]'))) return;
      // Held keys must not replay selection/confirm/next (a held Enter on the last card finished the quiz twice).
      if (e.repeat) return;
      const s = latest.current;
      const active = document.activeElement;
      // Focused controls keep their native keys, including the help button opening a tour.
      if (active?.closest('input, textarea, select, button, a, [role="button"], [contenteditable="true"], [role="dialog"], [role="alertdialog"]')) return;

      // After reveal (study modes): 1/2/3 rate confidence and advance.
      if (s.revealed && !s.examMode) {
        const level = CONFIDENCE_KEYS[e.key];
        if (level) {
          e.preventDefault();
          s.onConfidence(level);
          return;
        }
      }

      // 1-5 or A-E to select option (rezidențiat questions have five answers)
      const idx = OPTION_KEYS[e.key.toLowerCase()];
      if (idx !== undefined && s.question?.options[idx]) {
        s.onSelect(s.question.options[idx].id);
      }
      // Enter or Space to confirm/next
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!s.revealed) s.onConfirm();
        else s.onNext();
      }
      // ArrowLeft to revisit the previous question
      if (e.key === 'ArrowLeft' && s.currentIdx > 0) {
        e.preventDefault();
        s.onPrevious();
        return;
      }
      if (e.key.toLowerCase() === 'h' && !s.revealed && !s.examMode) {
        s.onHint();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
