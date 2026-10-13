import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { THEMES } from '../../../theme/themes';
import { getQuizPlayLayout } from '../layout';
import OptionList from './OptionList';

const layout = getQuizPlayLayout({ density: 'normal', shortHeight: false, crampedHeight: false, mobile: false, narrow: false, tablet: false, uiScale: 1 });
const props = {
  options: [{ id: 'a', text: 'Alpha', isCorrect: true }, { id: 'b', text: 'Beta', isCorrect: true }, { id: 'c', text: 'Gamma', isCorrect: false }],
  correctIds: ['a', 'b'], selectedNow: [], revealed: false, isMultiple: true,
  wasPartial: false, shakeId: null, theme: THEMES.light, layout, focusMode: false, calmMotion: false, onSelect: vi.fn(),
};

describe('stable answer feedback', () => {
  it.each(['light', 'dark'] as const)('keeps dense small-screen feedback operable in %s', (theme) => {
    const dense = getQuizPlayLayout({ density: 'dense', shortHeight: true, crampedHeight: true, mobile: true, narrow: true, tablet: false, uiScale: 0.82 });
    const onSelect = vi.fn();
    render(<OptionList {...props} theme={THEMES[theme]} layout={dense} focusMode calmMotion revealed wasPartial selectedNow={['a']} onSelect={onSelect} />);
    const missed = screen.getByRole('button', { name: /Beta.*corect omis/ });
    expect(missed.classList.contains('p-3')).toBe(true);
    expect(missed.style.borderStyle).toBe('dashed');
    expect(missed.style.transitionDuration).toBe('0s');
    fireEvent.click(missed);
    expect(onSelect).toHaveBeenCalledWith('b');
    expect(screen.getByRole('button', { name: /Alpha/ }).getAttribute('aria-pressed')).toBe('true');
  });
  it('preserves selection callbacks and border width through selection and reveal', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<OptionList {...props} onSelect={onSelect} />);
    const option = screen.getByRole('button', { name: /Alpha/ });
    fireEvent.click(option);
    expect(onSelect).toHaveBeenCalledWith('a');
    expect(option.style.borderWidth).toBe('2px');
    rerender(<OptionList {...props} selectedNow={['a']} />);
    expect(option.getAttribute('aria-pressed')).toBe('true');
    expect(option.style.borderWidth).toBe('2px');
    rerender(<OptionList {...props} selectedNow={['a']} revealed wasPartial />);
    expect(option.style.borderWidth).toBe('2px');
    expect(screen.getByRole('button', { name: /Beta.*corect omis/ }).style.borderStyle).toBe('dashed');
    expect(option.querySelector('svg.lucide-check')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Beta/ }).querySelector('svg.lucide-minus')).toBeTruthy();
  });

  it('keeps revealed single choices disabled and multiple choices interactive', () => {
    const { rerender } = render(<OptionList {...props} revealed isMultiple={false} selectedNow={['c']} />);
    expect(screen.getByRole('button', { name: /Gamma.*incorect/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /Gamma/ }).querySelector('svg.lucide-x')).toBeTruthy();
    rerender(<OptionList {...props} revealed />);
    expect(screen.getByRole('button', { name: /Alpha/ }).hasAttribute('disabled')).toBe(false);
  });

  it('renders calm feedback without transforms, transitions or escaped glyphs', () => {
    const { container } = render(<OptionList {...props} calmMotion revealed selectedNow={['c']} />);
    for (const button of screen.getAllByRole('button')) {
      expect(button.style.transform).toBe('');
      expect(button.style.transitionDuration).toBe('0s');
    }
    expect(container.textContent).not.toContain('\\u');
  });
});
