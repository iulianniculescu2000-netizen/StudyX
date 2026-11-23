import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import './Mascot.css';

interface Props {
  /** Body colour; the darker shades are derived from it, so the mascot follows the app accent. */
  accent: string;
  /** True while the assistant is working: three dots bob above the head and the antenna blinks faster. */
  thinking?: boolean;
  /** Calm motion (reduced motion / lite): no floating, no cursor tracking, no waving. */
  calm?: boolean;
  size?: number;
  /** Conversation state. Controlled mascots animate once when the state changes. */
  expression?: 'idle' | 'waiting' | 'streaming' | 'success' | 'error' | 'stopped' | 'unconfigured';
  /** Message avatars keep their expression without motion or global event listeners. */
  static?: boolean;
}

const SLEEP_AFTER_MS = 120_000;
/** viewBox-ul mascotei: x 8…112, y -4…104 (104 × 108 unități). */
const VIEW_W = 104;
const VIEW_H = 108;
const GREETED_KEY = 'studyx-mascot-greeted';
const LOOK_RANGE = 2.6;

/**
 * Pip, the assistant's mascot: a small round robot that blinks, floats, follows the cursor with its eyes,
 * waves on hover (and once when the app opens), looks busy while the assistant works and dozes off when
 * left alone. The loops live in index.css (.pip-*) so the reduced-motion block can switch them off.
 */
export default function Mascot({ accent, thinking = false, calm = false, size = 64, expression, static: isStatic = false }: Props) {
  const svgRef = useRef<SVGSVGElement | HTMLDivElement>(null);
  const gazeRef = useRef<SVGGElement | HTMLDivElement>(null);
  const [asleep, setAsleep] = useState(false);
  const [greeting, setGreeting] = useState(false);
  const autonomous = expression === undefined && !isStatic && !calm;
  const height = Math.round(size * (VIEW_H / VIEW_W));
  // Scara exactă a viewBox-ului în cutia SVG-ului (preserveAspectRatio implicit: „meet”, centrat).
  const unit = Math.min(size / VIEW_W, height / VIEW_H);

  useEffect(() => {
    if (!autonomous) return;
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
        // Mascota autonomă e desenată în straturi HTML (vezi mai jos): privirea se mută în px, nu în unități viewBox.
        const x = Math.max(-1, Math.min(1, dx)) * LOOK_RANGE * unit;
        const y = Math.max(-1, Math.min(1, dy)) * (LOOK_RANGE * 0.7) * unit;
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
  }, [calm, autonomous, unit]);

  // One hello per session, a moment after the app settles; never when motion is reduced.
  useEffect(() => {
    if (!autonomous) return undefined;
    let greeted = false;
    try { greeted = sessionStorage.getItem(GREETED_KEY) === '1'; } catch { /* storage unavailable */ }
    if (greeted) return undefined;
    const start = window.setTimeout(() => {
      try { sessionStorage.setItem(GREETED_KEY, '1'); } catch { /* storage unavailable */ }
      setGreeting(true);
    }, 1800);
    const stop = window.setTimeout(() => setGreeting(false), 1800 + 2000);
    return () => { window.clearTimeout(start); window.clearTimeout(stop); };
  }, [autonomous]);

  const dark = `color-mix(in srgb, ${accent} 72%, #000)`;
  const state = expression ?? (thinking ? 'thinking' : autonomous && asleep ? 'asleep' : 'idle');
  const mouth = expression === 'error' ? 'M54 69 Q60 65 66 69'
    : expression === 'stopped' || expression === 'unconfigured' ? 'M55 68 L65 68'
    : expression === 'waiting' ? 'M56 68 Q60 70 64 68'
    : expression === 'streaming' || expression === 'success' ? 'M52 65 Q60 76 68 65'
    : 'M54 66 Q60 72 66 66';

  if (autonomous) {
    return <LayeredPip rootRef={svgRef as RefObject<HTMLDivElement | null>} gazeRef={gazeRef as RefObject<HTMLDivElement | null>}
      accent={accent} dark={dark} size={size} height={height} unit={unit} state={state} mouth={mouth} wave={greeting} />;
  }

  return (
    <svg
      ref={svgRef as RefObject<SVGSVGElement | null>}
      viewBox="8 -4 104 108"
      width={size}
      height={height}
      aria-hidden="true"
      focusable="false"
      className={`pip ${expression !== undefined ? 'pip-controlled' : ''} ${!calm && !isStatic ? expression !== undefined ? 'pip-expressive' : 'pip-motion' : ''}`}
      data-state={state}
      data-static={isStatic || calm ? 'true' : undefined}
      style={{ overflow: 'visible', filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.28))' }}
    >
      <g className="pip-float">
        <line x1="60" y1="22" x2="60" y2="11" stroke={dark} strokeWidth="3" strokeLinecap="round" />
        <circle className="pip-ant" cx="60" cy="9" r="5" fill="#FFD60A" />
        <rect x="22" y="22" width="76" height="66" rx="30" fill={accent} />
        <rect x="30" y="32" width="60" height="44" rx="22" fill="#F2F7FF" />
        <g ref={gazeRef as RefObject<SVGGElement | null>} className="pip-gaze">
          {expression !== undefined && <g className="pip-brows" fill="none" stroke="#14233A" strokeWidth="2.5" strokeLinecap="round">
            <path d={expression === 'error' ? 'M43 43 L52 40' : expression === 'waiting' ? 'M43 40 L52 42' : 'M43 41 Q48 38 53 41'} />
            <path d={expression === 'error' ? 'M68 40 L77 43' : expression === 'waiting' ? 'M67 42 L76 39' : 'M67 41 Q72 38 77 41'} />
          </g>}
          <g className="pip-eyes">
            <ellipse cx="48" cy="54" rx="6" ry="8" fill="#14233A" />
            <ellipse cx="72" cy="54" rx="6" ry="8" fill="#14233A" />
          </g>
          <circle className="pip-shine" cx="50" cy="51" r="2" fill="#fff" />
          <circle className="pip-shine" cx="74" cy="51" r="2" fill="#fff" />
        </g>
        <ellipse cx="40" cy="66" rx="5" ry="3" fill="#FF8FA3" opacity="0.7" />
        <ellipse cx="80" cy="66" rx="5" ry="3" fill="#FF8FA3" opacity="0.7" />
        <path className="pip-mouth" d={mouth} fill="none" stroke="#14233A" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="20" cy="56" r="6" fill={dark} />
        <g className="pip-hand" data-wave={autonomous && greeting ? 'true' : undefined}>
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

const SHADOW = 'drop-shadow(0 3px 5px rgba(0,0,0,0.28))';

/**
 * Pip-ul autonom (butonul chatului): același desen, aceeași ordine a straturilor și aceleași bucle ca varianta
 * dintr-un singur SVG, dar fiecare parte care se mișcă (plutirea, clipitul, antena, mâna, punctele, privirea) e un
 * strat HTML propriu. Buclele (.pip-layered în index.css) animă doar transform/opacitate pe aceste straturi, deci
 * rulează pe compozitor și nu mai redesenează SVG-ul pe firul principal la fiecare cadru. Umbra e aceeași
 * `drop-shadow`, pusă pe rădăcină, deci cade sub întregul desen, ca înainte.
 */
function LayeredPip({ rootRef, gazeRef, accent, dark, size, height, unit, state, mouth, wave }: {
  rootRef: RefObject<HTMLDivElement | null>;
  gazeRef: RefObject<HTMLDivElement | null>;
  accent: string; dark: string; size: number; height: number; unit: number; state: string; mouth: string; wave: boolean;
}) {
  // Straturile acoperă exact zona viewBox-ului (fără marginea de centrare), ca procentele din CSS să fie unități exacte.
  const box: CSSProperties = { left: (size - VIEW_W * unit) / 2, top: (height - VIEW_H * unit) / 2, width: VIEW_W * unit, height: VIEW_H * unit };
  const layer = (children: ReactNode) => (
    <svg viewBox={`8 -4 ${VIEW_W} ${VIEW_H}`} width="100%" height="100%" aria-hidden="true" focusable="false" className="pip-layer" style={{ overflow: 'visible' }}>{children}</svg>
  );
  return (
    <div ref={rootRef} aria-hidden="true" className="pip pip-layered" data-state={state}
      style={{ position: 'relative', flex: 'none', width: size, height, filter: SHADOW }}>
      <div className="pip-layer" style={box}>
        <div className="pip-float pip-layer">
          {layer(<>
            <line x1="60" y1="22" x2="60" y2="11" stroke={dark} strokeWidth="3" strokeLinecap="round" />
            <rect x="22" y="22" width="76" height="66" rx="30" fill={accent} />
            <rect x="30" y="32" width="60" height="44" rx="22" fill="#F2F7FF" />
          </>)}
          <div className="pip-ant pip-layer">{layer(<circle cx="60" cy="9" r="5" fill="#FFD60A" />)}</div>
          <div ref={gazeRef} className="pip-gaze pip-layer">
            <div className="pip-eyes pip-layer">{layer(<>
              <ellipse cx="48" cy="54" rx="6" ry="8" fill="#14233A" />
              <ellipse cx="72" cy="54" rx="6" ry="8" fill="#14233A" />
            </>)}</div>
            {layer(<>
              <circle className="pip-shine" cx="50" cy="51" r="2" fill="#fff" />
              <circle className="pip-shine" cx="74" cy="51" r="2" fill="#fff" />
            </>)}
          </div>
          {layer(<>
            <ellipse cx="40" cy="66" rx="5" ry="3" fill="#FF8FA3" opacity="0.7" />
            <ellipse cx="80" cy="66" rx="5" ry="3" fill="#FF8FA3" opacity="0.7" />
            <path className="pip-mouth" d={mouth} fill="none" stroke="#14233A" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="20" cy="56" r="6" fill={dark} />
          </>)}
          <div className="pip-hand pip-layer" data-wave={wave ? 'true' : undefined}>{layer(<circle cx="100" cy="56" r="6" fill={dark} />)}</div>
          {layer(<rect x="44" y="86" width="32" height="14" rx="7" fill={dark} />)}
        </div>
        <div className="pip-dots pip-layer">
          {[46, 60, 74].map((cx, index) => (
            <div key={cx} className="pip-dot pip-layer">{layer(<circle cx={cx} cy={index === 1 ? -6 : -2} r="3" fill={accent} />)}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
