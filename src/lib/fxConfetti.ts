import confetti from 'canvas-confetti';

/** Confetti is a treat, not a requirement: none in low-power mode or when the system asks for less motion. */
function allowed(): boolean {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  if (root.getAttribute('data-performance') === 'lite' || root.getAttribute('data-power-save') === 'true') return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const COLORS = ['#0A84FF', '#30D158', '#FFD60A', '#FF453A', '#BF5AF2', '#64D2FF'];

/** A small burst from the spot that was tapped (screen pixels). */
export function burstAt(x: number, y: number): void {
  if (!allowed()) return;
  void confetti({
    particleCount: 18,
    spread: 70,
    startVelocity: 22,
    gravity: 1.1,
    ticks: 90,
    scalar: 0.8,
    origin: { x: x / window.innerWidth, y: y / window.innerHeight },
    colors: COLORS,
    disableForReducedMotion: true,
  });
}

/** A bigger celebration for finishing a whole group of topics. */
export function celebrate(): void {
  if (!allowed()) return;
  const fire = (angle: number, x: number) => confetti({
    particleCount: 60,
    spread: 80,
    angle,
    startVelocity: 45,
    origin: { x, y: 0.7 },
    colors: COLORS,
    disableForReducedMotion: true,
  });
  void fire(60, 0.1);
  window.setTimeout(() => void fire(120, 0.9), 180);
}
