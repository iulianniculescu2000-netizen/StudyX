import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFxSpotlight } from './useFxSpotlight';

function Page() {
  useFxSpotlight();
  return <div className="fx-lift" data-testid="card"><span data-testid="inside">text</span></div>;
}

const move = (target: Element, x: number, y: number) => {
  const event = new MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: y });
  target.dispatchEvent(event);
};

describe('înclinarea cardurilor (useFxSpotlight)', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('hover: hover'), media: query, addEventListener() {}, removeEventListener() {} }));
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 16));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
    document.documentElement.removeAttribute('data-performance');
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.documentElement.removeAttribute('data-performance'); });

  const mount = () => {
    const view = render(<Page />);
    const card = view.getByTestId('card');
    card.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    return { card, inside: view.getByTestId('inside') };
  };

  it('înclină cardul spre mouse, cel mult câteva grade, o dată pe cadru', () => {
    const { card, inside } = mount();
    move(inside, 200, 0);
    move(inside, 200, 0);
    expect(card.style.getPropertyValue('--tilt-x')).toBe('');
    act(() => { vi.advanceTimersByTime(20); });
    expect(card.style.getPropertyValue('--tilt-x')).toBe('3.00deg');
    expect(card.style.getPropertyValue('--tilt-y')).toBe('2.40deg');
  });

  it('nu înclină în modul economic', () => {
    document.documentElement.setAttribute('data-performance', 'lite');
    const { card, inside } = mount();
    move(inside, 200, 0);
    act(() => { vi.advanceTimersByTime(20); });
    expect(card.style.getPropertyValue('--tilt-x')).toBe('');
  });

  it('readuce cardul drept când mouse-ul pleacă de pe el', () => {
    const { card, inside } = mount();
    move(inside, 0, 100);
    act(() => { vi.advanceTimersByTime(20); });
    expect(card.style.getPropertyValue('--tilt-x')).toBe('-3.00deg');
    move(document.body, 0, 0);
    act(() => { vi.advanceTimersByTime(20); });
    expect(card.style.getPropertyValue('--tilt-x')).toBe('');
  });
});
