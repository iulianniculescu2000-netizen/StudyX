import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ProgressRing from './ProgressRing';
import { ThemeProvider } from '../../theme/ThemeContext';

const ring = (props: Parameters<typeof ProgressRing>[0]) => render(<ThemeProvider><ProgressRing {...props} /></ThemeProvider>).container.querySelector('svg')!;

describe('ProgressRing', () => {
  it('clamps and never writes NaN', () => {
    for (const value of [Number.NaN, -20, 0, 50, 140, Infinity]) {
      expect(ring({ value }).outerHTML).not.toMatch(/NaN|Infinity/);
    }
    expect(ring({ value: Number.NaN }).getAttribute('aria-label')).toBe('0%');
    expect(ring({ value: 140 }).getAttribute('aria-label')).toBe('100%');
  });
  it('survives a stroke wider than the ring', () => {
    expect(ring({ value: 40, size: 10, stroke: 30 }).outerHTML).not.toMatch(/NaN|r="-/);
  });
  it('keeps a custom spoken label', () => {
    expect(ring({ value: 40, label: 'Nivel 3, 40% până la nivelul următor' }).getAttribute('aria-label')).toMatch(/^Nivel 3/);
  });
});
