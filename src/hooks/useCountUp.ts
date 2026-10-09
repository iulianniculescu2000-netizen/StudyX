import { useEffect, useRef, useState } from 'react';
import { useAdaptiveMotion } from './useAdaptiveMotion';

export function useCountUp(target: number, duration = 600) {
  const [value, setValue] = useState(target);
  const previousTargetRef = useRef(target);
  const { calmMotion } = useAdaptiveMotion();

  useEffect(() => {
    const startValue = previousTargetRef.current;
    previousTargetRef.current = target;

    if (calmMotion) return;
    if (startValue === target) return;

    const startTime = Date.now();
    // Only the FIRST frame's id used to be captured, while `tick` kept
    // scheduling further frames from inside itself — none of which could be
    // cancelled. Leaving the page mid-animation kept calling setValue on an
    // unmounted hook, and a target that changed within the animation window
    // left two chains running against the same state, so the number jittered
    // and could settle on the old value.
    let frame = 0;

    const tick = () => {
      const elapsed = Date.now() - startTime;
      // A zero duration would make this 0/0 = NaN, and the NaN went straight
      // into setValue and onto the screen as the stat's number.
      const progress = duration <= 0 ? 1 : Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(startValue + eased * (target - startValue)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [calmMotion, duration, target]);

  return calmMotion ? target : value;
}
