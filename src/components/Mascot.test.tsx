import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Mascot from './Mascot';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.removeItem('studyx-mascot-greeted');
});

describe('Pip conversation lifecycle', () => {
  it.each([
    { static: true },
    { expression: 'waiting' as const },
    { calm: true },
  ])('does not schedule autonomy for %o', (props) => {
    const listen = vi.spyOn(window, 'addEventListener');
    const timeout = vi.spyOn(window, 'setTimeout');
    const frame = vi.spyOn(window, 'requestAnimationFrame');
    const { container } = render(<Mascot accent="#2384ff" {...props} />);
    expect(listen.mock.calls.filter(([type]) => type === 'pointermove' || type === 'keydown')).toHaveLength(0);
    expect(timeout).not.toHaveBeenCalled();
    expect(frame).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(130_000); });
    expect(container.querySelector('svg')).not.toHaveAttribute('data-state', 'asleep');
  });

  it('keeps the same gesture nodes while a streaming response rerenders', () => {
    const { container, rerender } = render(<Mascot accent="#2384ff" expression="streaming" />);
    const svg = container.querySelector('svg');
    const hand = container.querySelector('.pip-hand');
    const body = container.querySelector('.pip-float');
    rerender(<Mascot accent="#2384ff" expression="streaming" />);
    expect(container.querySelector('svg')).toBe(svg);
    expect(container.querySelector('.pip-hand')).toBe(hand);
    expect(container.querySelector('.pip-float')).toBe(body);
    expect(svg).toHaveAttribute('data-state', 'streaming');
    expect(svg).toHaveClass('pip-expressive');
    expect(svg).not.toHaveClass('pip-motion');
  });

  it('preserves launcher autonomy and cleans it up on unmount', () => {
    const listen = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { container, unmount } = render(<Mascot accent="#2384ff" />);
    const pointer = listen.mock.calls.find(([type]) => type === 'pointermove');
    const keyboard = listen.mock.calls.find(([type]) => type === 'keydown');
    expect(pointer).toBeDefined();
    expect(keyboard).toBeDefined();
    expect(container.querySelector('svg')).toHaveClass('pip-motion');
    act(() => { vi.advanceTimersByTime(120_000); });
    expect(container.querySelector('svg')).toHaveAttribute('data-state', 'asleep');
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })); });
    expect(container.querySelector('svg')).toHaveAttribute('data-state', 'idle');
    unmount();
    expect(remove).toHaveBeenCalledWith('pointermove', pointer![1]);
    expect(remove).toHaveBeenCalledWith('keydown', keyboard![1]);
  });

  it.each([
    { expression: 'error' as const, mouthD: 'M54 69 Q60 65 66 69' },
    { expression: 'stopped' as const, mouthD: 'M55 68 L65 68' },
    { expression: 'unconfigured' as const, mouthD: 'M55 68 L65 68' },
    { expression: 'success' as const, mouthD: 'M52 65 Q60 76 68 65' },
    { expression: 'waiting' as const, mouthD: 'M56 68 Q60 70 64 68' },
    { expression: 'idle' as const, mouthD: 'M54 66 Q60 72 66 66' },
  ])('renders appropriate visual state and facial features for $expression', ({ expression, mouthD }) => {
    const { container } = render(<Mascot accent="#2384ff" expression={expression} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('data-state', expression);
    expect(svg).toHaveClass('pip-controlled');
    expect(container.querySelector('.pip-brows')).not.toBeNull();
    expect(container.querySelector('.pip-mouth')).toHaveAttribute('d', mouthD);
  });

  it('marks static or calm mascots with data-static and prevents motion classes', () => {
    const { container: staticContainer } = render(<Mascot accent="#2384ff" expression="success" static />);
    expect(staticContainer.querySelector('svg')).toHaveAttribute('data-static', 'true');
    expect(staticContainer.querySelector('svg')).not.toHaveClass('pip-expressive');
    expect(staticContainer.querySelector('svg')).not.toHaveClass('pip-motion');

    const { container: calmContainer } = render(<Mascot accent="#2384ff" expression="success" calm />);
    expect(calmContainer.querySelector('svg')).toHaveAttribute('data-static', 'true');
    expect(calmContainer.querySelector('svg')).not.toHaveClass('pip-expressive');
    expect(calmContainer.querySelector('svg')).not.toHaveClass('pip-motion');
  });
});
