/** Paleta scenei: filmul are mereu fundal închis, indiferent de tema aplicației. */
import type { CSSProperties } from 'react';

export const STAGE = {
  bg: '#080f1b',
  panel: 'rgba(20,36,58,0.88)',
  panelStrong: 'rgba(29,52,82,0.92)',
  line: 'rgba(126,180,240,0.22)',
  text: '#ffffff',
  text2: '#b1c4de',
  text3: '#8ba4c4',
  blue: '#65b7ff',
  green: '#78dfb4',
  red: '#FF453A',
  amber: '#FF9F0A',
  violet: '#BF6FFF',
} as const;

export const FILM_CARD: CSSProperties = {
  background: 'linear-gradient(145deg, #1b314c, #0e1c30)', border: `1px solid ${STAGE.line}`,
  boxShadow: 'var(--elev-3)', color: STAGE.text,
};
