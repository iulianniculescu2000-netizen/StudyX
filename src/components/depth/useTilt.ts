import type { PointerEvent } from 'react';
import { useMotionValue, useSpring, useTransform, type SpringOptions } from 'framer-motion';
import { spring } from '../../theme/motion';

const TILT_SPRING = spring.panel as SpringOptions;

/** Înclinarea țintă (grade) după poziția indicatorului într-o suprafață, limitată ca să rămână discretă. */
export function pointerTilt(px: number, py: number, maxX = 6, maxY = 4.5): { x: number; y: number } {
  const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));
  return { x: clamp((px - 0.5) * maxX * 2, maxX), y: clamp(-(py - 0.5) * maxY * 2, maxY) };
}

/** Legănarea lentă a unei scene, derivată din ceasul filmului (grade); zero cu mișcare redusă. */
export function sway(elapsedMs: number, calm: boolean, amount = 1): { x: number; y: number } {
  if (calm) return { x: 0, y: 0 };
  return { x: Math.sin(elapsedMs / 2600) * 2.2 * amount, y: Math.cos(elapsedMs / 3400) * 1.2 * amount };
}

/** Culoarea luminii care alunecă pe sticlă: discretă în tema închisă. */
export function sheenColor(isDark: boolean): string {
  return isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.55)';
}

interface TiltOptions {
  /** Cu mișcare redusă suprafața stă dreaptă și lumina nu se mișcă. */
  calm: boolean;
  isDark: boolean;
  /** Unghiurile maxime (grade): scenele mari se înclină mai mult, cardurile cu text mai puțin. */
  maxX?: number;
  maxY?: number;
}

/**
 * Înclinare discretă după mouse, cu resortul `spring.panel`, și o pată de lumină care urmează înclinarea.
 * Fără cronometre: valorile se mișcă doar când se mișcă indicatorul. Nu se înclină cât se scrie într-un câmp din suprafață.
 */
export function useTilt({ calm, isDark, maxX = 6, maxY = 4.5 }: TiltOptions) {
  const targetX = useMotionValue(0);
  const targetY = useMotionValue(0);
  const rotateY = useSpring(targetX, TILT_SPRING);
  const rotateX = useSpring(targetY, TILT_SPRING);
  const sheen = sheenColor(isDark);
  const light = useTransform([rotateY, rotateX], ([x, y]: number[]) =>
    `radial-gradient(70% 60% at ${50 + x * 8}% ${22 - y * 8}%, ${sheen}, transparent 70%)`);

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (calm) return;
    const typing = event.currentTarget.contains(document.activeElement)
      && !!document.activeElement?.closest('input, textarea, select, [contenteditable="true"]');
    if (typing) { targetX.set(0); targetY.set(0); return; }
    const box = event.currentTarget.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const tilt = pointerTilt((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height, maxX, maxY);
    targetX.set(tilt.x);
    targetY.set(tilt.y);
  };
  const onPointerLeave = () => { targetX.set(0); targetY.set(0); };

  return { rotateX, rotateY, light, onPointerMove, onPointerLeave };
}
