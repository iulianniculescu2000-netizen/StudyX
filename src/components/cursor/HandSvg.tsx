import type { FC } from 'react';
import type { CursorGesture } from '../../store/cursorStore';

interface CursorSvgProps {
  gesture: CursorGesture;
  accent: string;
  isDark: boolean;
  clicking: boolean;
}

/**
 * Windows-style cursor, but crafted finer, cuter, and smaller (16px),
 * with delicate lines, crisp white fill, and modern elevation.
 */
export const HandSvg: FC<CursorSvgProps> = ({ gesture, accent, isDark, clicking }) => {
  const strokeColor = isDark ? '#090d16' : '#1e293b';
  const fillColor = '#ffffff';

  if (gesture === 'pointer') {
    /* Refined, cute, small Windows Pointer Hand (Hotspot at index tip) */
    return (
      <div
        className="relative select-none pointer-events-none transition-transform duration-75"
        style={{
          width: 17,
          height: 19,
          transform: clicking ? 'scale(0.92) translate(0.5px, 0.5px)' : 'scale(1)',
          transformOrigin: '0 0',
        }}
      >
        <svg
          width="17"
          height="19"
          viewBox="0 0 17 19"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="overflow-visible cursor-hand-shadow-lg"
          style={{ marginLeft: -5, marginTop: -1 }}
        >
          <path
            d="M5.5 1.5 
               C 4.8 1.5, 4.2 2.1, 4.2 2.8 
               L 4.2 8.2 
               C 3.8 8, 3.1 7.8, 2.5 8.2 
               C 1.7 8.7, 1.5 9.7, 2.2 10.7 
               L 4.5 14.5 
               C 5.5 16, 7 17, 9.2 17 
               C 12.2 17, 13.5 14.8, 13.5 11.8 
               L 13.5 8 
               C 13.5 7.3, 12.9 6.8, 12.2 6.8 
               C 11.8 6.8, 11.4 7, 11.1 7.4 
               C 10.8 6.8, 10.2 6.5, 9.6 6.5 
               C 9.2 6.5, 8.8 6.7, 8.5 7.1 
               C 8.3 6.5, 7.7 6.2, 7.1 6.2 
               L 7.1 2.8 
               C 7.1 2.1, 6.5 1.5, 5.5 1.5 Z"
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth="1.15"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* Subtle accent highlight on index finger */}
          <circle cx="5.5" cy="2.5" r="1.2" fill={accent} />
        </svg>
      </div>
    );
  }

  if (gesture === 'text') {
    /* Refined Windows I-Beam (Hotspot centered) */
    return (
      <div
        className="relative select-none pointer-events-none"
        style={{
          width: 11,
          height: 17,
          marginLeft: -5.5,
          marginTop: -8.5,
        }}
      >
        <svg
          width="11"
          height="17"
          viewBox="0 0 11 17"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="cursor-hand-shadow-sm"
        >
          <path
            d="M2.5 1.5 L8.5 1.5 M5.5 1.5 L5.5 15.5 M2.5 15.5 L8.5 15.5"
            stroke={strokeColor}
            strokeWidth="1.3"
            strokeLinecap="round"
          />
          <path
            d="M3 2 L8 2 M5.5 2 L5.5 15 M3 15 L8 15"
            stroke="#ffffff"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  /* Refined, cute, small Windows Pointer Arrow (Hotspot exactly at 0, 0) */
  return (
    <div
      className="relative select-none pointer-events-none transition-transform duration-75"
      style={{
        width: 17,
        height: 19,
        transform: clicking ? 'scale(0.92) translate(0.5px, 0.5px)' : 'scale(1)',
        transformOrigin: '0 0',
      }}
    >
      <svg
        width="17"
        height="19"
        viewBox="0 0 17 19"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="overflow-visible cursor-hand-shadow-lg"
        style={{ marginLeft: -1.5, marginTop: -1.5 }}
      >
        {/* Sleek, scaled-down classic Windows pointer arrow */}
        <path
          d="M1.5 1.5 L1.5 14.5 L5 11.2 L7.8 17.2 L9.8 16.2 L7.1 10.3 L12 10.3 Z"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth="1.15"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Ambient Loading indicator beside arrow */}
        {gesture === 'loading' && (
          <circle
            cx="13.5"
            cy="13.5"
            r="4.5"
            stroke={accent}
            strokeWidth="1.3"
            strokeDasharray="4 3"
            className="animate-spin origin-center"
            style={{ animationDuration: '1.2s' }}
          />
        )}

        {/* Ambient Thinking Sparkle beside arrow */}
        {gesture === 'thinking' && (
          <circle
            cx="13.5"
            cy="13.5"
            r="3.5"
            fill="#ec4899"
            className="animate-pulse"
          />
        )}
      </svg>
    </div>
  );
};
