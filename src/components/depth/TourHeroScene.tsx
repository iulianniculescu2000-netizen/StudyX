import type { ReactNode } from 'react';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { usePlayback } from '../film/usePlayback';
import { fraction as fr } from '../film/useTimeline';
import { easeOut } from '../whats-new/stage3d';
import { sway } from './useTilt';

const DURATION_MS = 4200;

interface TourHeroSceneProps {
  /** Iconița din centru (a pasului). */
  center: ReactNode;
  /** Iconițele pașilor turului, mici, pe orbită. */
  orbit: ReactNode[];
  /** „orbit” la început (se așază pe orbită), „gather” la final (se adună în centru). */
  kind: 'orbit' | 'gather';
  color: string;
}

/**
 * Scena mică de la începutul și finalul unui tur, generată din iconițele lui: placa pasului pe trei straturi de sticlă,
 * cu pașii pe o orbită în perspectivă. Un singur ceas (`usePlayback`), fără buclă: se oprește pe cadrul final, iar cu
 * mișcare redusă îl arată direct. E decor (inert); titlul și textul pasului spun tot.
 */
export default function TourHeroScene({ center, orbit, kind, color }: TourHeroSceneProps) {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  const clock = usePlayback(!calmMotion, DURATION_MS, undefined, 1000 / 30);
  const t = calmMotion ? DURATION_MS : clock.elapsedMs;
  const drift = sway(t, calmMotion, 0.6);
  const gather = kind === 'gather' ? easeOut(fr(t, 500, 1600)) : 0;
  const spread = kind === 'orbit' ? 0.55 + 0.45 * easeOut(fr(t, 600, 1400)) : 1 - gather;
  const fills = [`color-mix(in srgb, ${color} 14%, ${theme.surface})`, `color-mix(in srgb, ${color} 22%, ${theme.surface})`, theme.surface];

  return (
    <div
      inert
      aria-hidden="true"
      data-testid="tour-hero-scene"
      className="relative mb-4 h-[112px] overflow-hidden rounded-[var(--r-lg)] border"
      style={{
        perspective: 700,
        borderColor: theme.border,
        background: `linear-gradient(160deg, color-mix(in srgb, ${theme.surface} 88%, ${color} 12%), ${theme.surface2})`,
      }}
    >
      <div className="absolute inset-0" style={{ transformStyle: 'preserve-3d', transform: `rotateX(${drift.y}deg) rotateY(${drift.x}deg)` }}>
        <div className="absolute left-1/2 top-1/2" style={{ transformStyle: 'preserve-3d' }}>
          <div
            className="absolute rounded-full"
            style={{
              left: -120, top: -120, width: 240, height: 240, border: `1px solid ${color}42`,
              transform: `rotateX(74deg) rotateZ(${t * 0.012}deg)`, opacity: easeOut(fr(t, 200, 700)) * (1 - gather * 0.6),
            }}
          />
          {[0, 1, 2].map((i) => {
            const k = easeOut(fr(t, i * 160, 800));
            return (
              <div
                key={i}
                className="absolute flex items-center justify-center"
                style={{
                  left: -34, top: -26, width: 68, height: 52, borderRadius: 'var(--r-md)',
                  border: `1px solid ${theme.border}`, background: fills[i], boxShadow: `var(--elev-${i + 1})`, color,
                  transform: `translate3d(${(i - 2) * 8}px, ${(i - 2) * 6}px, ${-180 + k * (180 + (i - 2) * 26)}px)`,
                  opacity: k,
                }}
              >
                {i === 2 && center}
              </div>
            );
          })}
        </div>
        {orbit.map((icon, i) => {
          const a = (i / Math.max(1, orbit.length)) * Math.PI * 2 + t * 0.0004;
          const radius = 120 * spread;
          const z = Math.sin(a) * radius * 0.8;
          const appear = kind === 'orbit' ? easeOut(fr(t, 600 + i * 120, 500)) : 1 - gather;
          return (
            <div
              key={i}
              className="absolute flex h-[26px] w-[26px] items-center justify-center rounded-[var(--r-sm)] border"
              style={{
                left: 'calc(50% - 13px)', top: 'calc(50% - 13px)',
                background: theme.surface, borderColor: theme.border, color, boxShadow: 'var(--elev-1)',
                transform: `translate3d(${Math.cos(a) * radius}px, ${Math.sin(a) * 10 + 4}px, ${z - 30}px) scale(${1 - gather * 0.6})`,
                opacity: appear * (0.45 + 0.55 * (z / Math.max(radius, 1) + 1) / 2),
              }}
            >
              {icon}
            </div>
          );
        })}
      </div>
    </div>
  );
}
