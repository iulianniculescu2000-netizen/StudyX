import type { ComponentType, CSSProperties } from 'react';
import type { useTheme } from '../../theme/ThemeContext';

type Theme = ReturnType<typeof useTheme>;

/** O scenă 3D din „Ce e nou”: se desenează din ceasul filmului (`useSceneTime`), fără cronometre proprii. */
export interface WhatsNewScene {
  /** Numele scenei, pentru cititoarele de ecran. */
  label: string;
  /** Tot ce se vede, spus în cuvinte: scena în sine e inertă. */
  transcript: string;
  durationMs: number;
  /** Momentele (ms) la care începe fiecare etapă; `captions[i]` se arată de la `marks[i]`. */
  marks: readonly number[];
  captions: readonly string[];
  Scene: ComponentType;
}

/** Ieșire lină (cubică): pornește repede, se așază încet. */
export function easeOut(k: number): number {
  return 1 - (1 - k) ** 3;
}

/** Intrare și ieșire line (cubică), pentru mișcări între două poziții. */
export function easeInOut(k: number): number {
  return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
}

/** Un card în scenă: aceeași suprafață, margine, rază și umbră ca restul aplicației. */
export function sceneCard(theme: Theme, elevation: 1 | 2 | 3 = 2): CSSProperties {
  return {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 'var(--r-md)',
    boxShadow: `var(--elev-${elevation})`,
  };
}

/** O pastilă (etichetă rotunjită) așezată pe o suprafață din scenă. */
export function sceneChip(theme: Theme): CSSProperties {
  return {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    color: theme.accentText,
    boxShadow: 'var(--elev-1)',
  };
}
