import React from 'react';
import { useTheme } from '../theme/ThemeContext';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';

/**
 * Premium Minimal Background
 * Elimină petele de culoare stridente (mov) pentru un aspect curat, profesional.
 * Folosește doar gradiente subtile și un zgomot de textură fin.
 */
const AnimatedBackground: React.FC = () => {
  const theme = useTheme();
  const { performanceLite, calmMotion } = useAdaptiveMotion();
  const useStaticBackground = calmMotion;
  const showTexture = !performanceLite;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        background: 'transparent',
        overflow: 'hidden',
      }}
    >
      {/* Subtle Grain Texture */}
      {showTexture && (
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />
      )}

      {/* Orbii sunt doar gradiente radiale (fără filter: blur, care costa un strat uriaș rasterizat),
          iar mișcarea e o animație CSS de transform/opacity rulată pe compositor, fără JS pe cadru. */}
      <div
        className={useStaticBackground ? 'animated-background-orb' : 'animated-background-orb animated-background-orb--drift'}
        style={{
          position: 'absolute',
          top: '-15%',
          right: '-10%',
          width: useStaticBackground ? '62vw' : '70vw',
          height: useStaticBackground ? '62vw' : '70vw',
          borderRadius: '50%',
          opacity: useStaticBackground ? 0.08 : undefined,
          background: `radial-gradient(circle closest-side, ${theme.orb1}, transparent)`,
        }}
      />

      <div
        className="animated-background-orb"
        style={{
          opacity: useStaticBackground ? 0.06 : 0.07,
          position: 'absolute',
          bottom: '-15%',
          left: '-10%',
          width: useStaticBackground ? '52vw' : '60vw',
          height: useStaticBackground ? '52vw' : '60vw',
          borderRadius: '50%',
          background: `radial-gradient(circle closest-side, ${theme.orb2}, transparent)`,
        }}
      />
    </div>
  );
};

export default AnimatedBackground;
