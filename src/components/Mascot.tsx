import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Body colour; the darker shades are derived from it, so the mascot follows the app accent. */
  accent: string;
  /** True while the assistant is working: three dots bob above the head and the antenna blinks faster. */
  thinking?: boolean;
  /** Calm motion (reduced motion / lite): no floating, no cursor tracking, no waving. */
  calm?: boolean;
  size?: number;
}

const SLEEP_AFTER_MS = 120_000;
const GREETED_KEY = 'studyx-mascot-greeted';
const LOOK_RANGE = 2.6;

/**
 * Pip, the assistant's mascot: a small round robot that blinks, floats, follows the cursor with its eyes,
 * waves on hover (and once when the app opens), looks busy while the assistant works and dozes off when
 * left alone. The loops live in index.css (.pip-*) so the reduced-motion block can switch them off.
 */
export default function Mascot({ accent, thinking = false, calm = false, size = 64 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gazeRef = useRef<SVGGElement>(null);
  const [asleep, setAsleep] = useState(false);
  const [greeting, setGreeting] = useState(false);

  useEffect(() => {
    let frame = 0;
    let sleepTimer = 0;
    const armSleep = () => {
      window.clearTimeout(sleepTimer);
      sleepTimer = window.setTimeout(() => setAsleep(true), SLEEP_AFTER_MS);
    };
    const onMove = (event: PointerEvent) => {
      setAsleep(false);
      armSleep();
      if (calm || frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const svg = svgRef.current;
        const gaze = gazeRef.current;
        if (!svg || !gaze) return;
        const rect = svg.getBoundingClientRect();
        const dx = (event.clientX - (rect.left + rect.width / 2)) / 260;
        const dy = (event.clientY - (rect.top + rect.height / 2)) / 260;
        const x = Math.max(-1, Math.min(1, dx)) * LOOK_RANGE;
        const y = Math.max(-1, Math.min(1, dy)) * (LOOK_RANGE * 0.7);
        gaze.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
      });
    };
    const onKey = () => { setAsleep(false); armSleep(); };
    armSleep();
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(sleepTimer);
      window.cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('keydown', onKey);
    };
  }, [calm]);

  // One hello per session, a moment after the app settles; never when motion is reduced.
  useEffect(() => {
    if (calm) return undefined;
    let greeted = false;
    try { greeted = sessionStorage.getItem(GREETED_KEY) === '1'; } catch { /* storage unavailable */ }
    if (greeted) return undefined;
    const start = window.setTimeout(() => {
      try { sessionStorage.setItem(GREETED_KEY, '1'); } catch { /* storage unavailable */ }
      setGreeting(true);
    }, 1800);
    const stop = window.setTimeout(() => setGreeting(false), 1800 + 2000);
    return () => { window.clearTimeout(start); window.clearTimeout(stop); };
  }, [calm]);

  const dark = `color-mix(in srgb, ${accent} 72%, #000)`;
  const state = thinking ? 'thinking' : asleep ? 'asleep' : 'idle';

  return (
    <svg
      ref={svgRef}
      viewBox="8 -4 104 108"
      width={size}
      height={Math.round(size * (108 / 104))}
      aria-hidden="true"
      focusable="false"
      className={`pip ${calm ? '' : 'pip-motion'}`}
      data-state={state}
      style={{ overflow: 'visible', filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.28))' }}
    >
      <g className="pip-float">
        <line x1="60" y1="22" x2="60" y2="11" stroke={dark} strokeWidth="3" strokeLinecap="round" />
        <circle className="pip-ant" cx="60" cy="9" r="5" fill="#FFD60A" />
        <rect x="22" y="22" width="76" height="66" rx="30" fill={accent} />
        <rect x="30" y="32" width="60" height="44" rx="22" fill="#F2F7FF" />
        <g ref={gazeRef} className="pip-gaze">
          <g className="pip-eyes">
            <ellipse cx="48" cy="54" rx="6" ry="8" fill="#14233A" />
            <ellipse cx="72" cy="54" rx="6" ry="8" fill="#14233A" />
          </g>
          <circle className="pip-shine" cx="50" cy="51" r="2" fill="#fff" />
          <circle className="pip-shine" cx="74" cy="51" r="2" fill="#fff" />
        </g>
        <ellipse cx="40" cy="66" rx="5" ry="3" fill="#FF8FA3" opacity="0.7" />
        <ellipse cx="80" cy="66" rx="5" ry="3" fill="#FF8FA3" opacity="0.7" />
        <path className="pip-mouth" d="M54 66 Q60 72 66 66" fill="none" stroke="#14233A" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="20" cy="56" r="6" fill={dark} />
        <g className="pip-hand" data-wave={greeting ? 'true' : undefined}>
          <circle cx="100" cy="56" r="6" fill={dark} />
        </g>
        <rect x="44" y="86" width="32" height="14" rx="7" fill={dark} />
      </g>
      <g className="pip-dots" fill={accent}>
        <circle cx="46" cy="-2" r="3" />
        <circle cx="60" cy="-6" r="3" />
        <circle cx="74" cy="-2" r="3" />
      </g>
    </svg>
  );
}
