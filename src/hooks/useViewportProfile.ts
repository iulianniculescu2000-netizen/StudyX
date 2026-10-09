import { useEffect, useMemo, useState } from 'react';

function readViewport() {
  if (typeof window === 'undefined') {
    return { width: 1440, height: 900 };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

export function useViewportProfile() {
  const [viewport, setViewport] = useState(readViewport);

  useEffect(() => {
    let frame = 0;

    const updateViewport = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setViewport(readViewport());
      });
    };

    window.addEventListener('resize', updateViewport, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  return useMemo(() => {
    const compact = viewport.height < 860 || viewport.width < 1280;
    const crampedHeight = viewport.height < 760;
    const shortHeight = viewport.height < 700;
    const ultraShortHeight = viewport.height < 620;
    const narrow = viewport.width < 1040;
    const mobile = viewport.width < 640;
    const tablet = viewport.width >= 640 && viewport.width < 1024;
    const uiScale = Math.max(0.82, Math.min(1.04, Math.min(viewport.width / 1440, viewport.height / 920)));
    const density = ultraShortHeight || viewport.width < 720
      ? 'dense'
      : compact || narrow
        ? 'balanced'
        : 'airy';

    return {
      viewport,
      compact,
      crampedHeight,
      shortHeight,
      ultraShortHeight,
      narrow,
      mobile,
      tablet,
      uiScale,
      density,
    };
  }, [viewport]);
}
