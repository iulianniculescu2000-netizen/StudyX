import { useEffect, useRef, useState } from 'react';

/** Seconds allowed per question in timed mode. */
export const TIME_PER_QUESTION = 30;

interface Options {
  examMode: boolean;
  timedMode: boolean;
  /** Total exam minutes (0 = no countdown). */
  examMinutes: number;
  /** Epoch ms when the session started. */
  startedAt: number;
  currentIdx: number;
  revealed: boolean;
  /** Called once when the per-question countdown reaches 0 (timed mode). Always the latest closure. */
  onTimeUp: () => void;
}

/**
 * The three clocks of a play session:
 *  - `timeElapsed`: seconds since start (not counted in exam mode)
 *  - `examSecondsLeft`: whole-simulation countdown derived from the start time, so a backgrounded tab cannot drift
 *  - `questionTimer`: per-question countdown in timed mode, re-armed on every question / un-reveal;
 *    reaching 0 is reported through `onTimeUp` from the tick itself (no state-watching effect)
 */
export function useQuizTimers({ examMode, timedMode, examMinutes, startedAt, currentIdx, revealed, onTimeUp }: Options) {
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [examSecondsLeft, setExamSecondsLeft] = useState(examMinutes * 60);
  const [questionTimer, setQuestionTimer] = useState(TIME_PER_QUESTION);

  useEffect(() => {
    if (examMode) return; // Don't track time in exam mode
    const intervalId = setInterval(() => {
      setTimeElapsed((t) => t + 1);
    }, 1000);
    return () => clearInterval(intervalId);
  }, [examMode]);

  useEffect(() => {
    if (!examMinutes) return;
    const deadline = startedAt + examMinutes * 60_000;
    const tick = () => setExamSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [examMinutes, startedAt]);

  // Re-arm the countdown whenever a new question becomes answerable. Done while rendering (not in an
  // effect) so the stale value from the previous question is never painted.
  const armId = timedMode && !revealed ? currentIdx : null;
  const [lastArmId, setLastArmId] = useState(armId);
  if (armId !== lastArmId) {
    setLastArmId(armId);
    if (armId !== null) setQuestionTimer(TIME_PER_QUESTION);
  }

  const onTimeUpRef = useRef(onTimeUp);
  useEffect(() => {
    onTimeUpRef.current = onTimeUp;
  });

  useEffect(() => {
    if (!timedMode || revealed) return;
    let left = TIME_PER_QUESTION;
    const intervalId = setInterval(() => {
      left = Math.max(0, left - 1);
      setQuestionTimer(left);
      if (left === 0) {
        clearInterval(intervalId);
        onTimeUpRef.current();
      }
    }, 1000);
    return () => clearInterval(intervalId);
  }, [currentIdx, timedMode, revealed]);

  return { timeElapsed, examSecondsLeft, questionTimer };
}
