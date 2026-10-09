/**
 * The flag hides the ambient background orbs while an overlay is open. If it
 * ever failed to clear, the app would look permanently flat after closing the
 * tour — so the cleanup, and the reference counting between two overlays, are
 * worth pinning down.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { useOverlayFlag } from './useOverlayFlag';

function Overlay({ active }: { active: boolean }) {
  useOverlayFlag(active);
  return null;
}

const flag = () => document.documentElement.dataset.overlay;

describe('overlay flag', () => {
  it('is not set when nothing is open', () => {
    render(<Overlay active={false} />);
    expect(flag()).toBeUndefined();
  });

  it('marks the document while an overlay is open and clears it on close', () => {
    const view = render(<Overlay active />);
    expect(flag()).toBe('open');

    view.rerender(<Overlay active={false} />);
    expect(flag()).toBeUndefined();
  });

  it('clears the flag when the overlay unmounts without closing first', () => {
    const view = render(<Overlay active />);
    expect(flag()).toBe('open');

    view.unmount();
    expect(flag()).toBeUndefined();
  });

  it('keeps the flag while a second overlay is still open', () => {
    const tour = render(<Overlay active />);
    const tutorial = render(<Overlay active />);
    expect(flag()).toBe('open');

    // Closing one must not un-hide the orbs under the other.
    tour.unmount();
    expect(flag()).toBe('open');

    tutorial.unmount();
    expect(flag()).toBeUndefined();
  });
});
