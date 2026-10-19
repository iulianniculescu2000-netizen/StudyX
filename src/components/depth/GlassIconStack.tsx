import type { ReactNode } from 'react';
import { useTheme } from '../../theme/ThemeContext';

interface GlassIconStackProps {
  icon: ReactNode;
  /** Culoarea pasului sau a secțiunii. */
  color: string;
  /** Latura plăcii din față, în pixeli. */
  size?: number;
}

/**
 * O iconiță pe trei plăci de sticlă în adâncime, aceeași peste tururi, indicii „?” și ghiduri.
 * Plăcile din spate sunt decor (aria-hidden); iconița e și ea decorativă, textul de lângă o numește.
 */
export default function GlassIconStack({ icon, color, size = 40 }: GlassIconStackProps) {
  const theme = useTheme();
  const radius = size >= 36 ? 'var(--r-md)' : 'var(--r-sm)';
  const step = Math.round(size / 8);
  return (
    <span
      aria-hidden="true"
      className="relative inline-block flex-shrink-0"
      style={{ width: size, height: size, transformStyle: 'preserve-3d' }}
    >
      <span className="absolute inset-0" style={{ borderRadius: radius, background: `${color}24`, transform: `translate3d(${step * 2}px, ${-step * 2}px, -18px)` }} />
      <span className="absolute inset-0" style={{ borderRadius: radius, background: `${color}38`, transform: `translate3d(${step}px, ${-step}px, -9px)` }} />
      <span
        className="absolute inset-0 flex items-center justify-center"
        style={{
          borderRadius: radius,
          background: `color-mix(in srgb, ${color} 16%, ${theme.surface})`,
          border: `1px solid ${color}4d`,
          color,
          boxShadow: 'var(--elev-1)',
        }}
      >
        {icon}
      </span>
    </span>
  );
}
