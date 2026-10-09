import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnswerResult } from '../helpers';

type FeedbackAnim = 'correct' | 'partial' | 'wrong' | null;

/**
 * Transient reveal feedback: the card animation, the option to shake, and the in-session
 * "answered correctly in a row" count (mobile-only pill; deliberately local, never persisted).
 * Animation timers are tracked so unmounting mid-animation cannot leave one firing.
 */
export function useAnswerFeedback() {
  const [shakeId, setShakeId] = useState<string | null>(null);
  const [feedbackAnim, setFeedbackAnim] = useState<FeedbackAnim>(null);
  const [answerStreak, setAnswerStreak] = useState(0);
  const timersRef = useRef<number[]>([]);

  useEffect(() => () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  const clearFeedback = useCallback(() => {
    setShakeId(null);
    setFeedbackAnim(null);
  }, []);

  /** Plays the feedback for a freshly revealed answer. `wrongPick` is the option to shake (wrong results only). */
  const playFeedback = useCallback((result: AnswerResult, wrongPick: string | null) => {
    if (result === 'correct') {
      setFeedbackAnim('correct');
      setAnswerStreak((n) => n + 1);
      timersRef.current.push(window.setTimeout(() => setFeedbackAnim(null), 420));
    } else if (result === 'partial') {
      setFeedbackAnim('partial');
      setAnswerStreak(0);
      timersRef.current.push(window.setTimeout(() => setFeedbackAnim(null), 600));
    } else {
      setFeedbackAnim('wrong');
      setAnswerStreak(0);
      setShakeId(wrongPick);
      timersRef.current.push(window.setTimeout(() => {
        setFeedbackAnim(null);
        setShakeId(null);
      }, 520));
    }
  }, []);

  return { shakeId, feedbackAnim, answerStreak, clearFeedback, playFeedback };
}
