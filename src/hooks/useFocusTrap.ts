import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTORS = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function isVisible(el: HTMLElement): boolean {
  if (el.closest('[aria-hidden="true"], [hidden]')) return false;
  // Not `offsetParent`: it is null for position: fixed elements and always null in jsdom.
  if (typeof el.checkVisibility === 'function') return el.checkVisibility();
  const style = getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function visibleFocusables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)).filter(isVisible);
}

/** Capcanele active, în ordinea deschiderii: doar cea de sus tratează Tab/Esc. */
const trapStack: symbol[] = [];

/**
 * Dialog keyboard behaviour: while `active`, focus moves into the container
 * (to the element marked `data-autofocus`, else the first focusable one), Tab /
 * Shift+Tab stay inside it, Esc calls `onEscape`, and focus returns to whatever
 * had it before when the dialog closes.
 *
 * `onEscape` may be an inline function: it is read through a ref, so a new
 * closure on every render does not restart the trap (which would steal focus
 * from the field being typed in).
 *
 * Usage:
 *   const ref = useFocusTrap(isOpen, () => setIsOpen(false));
 *   return <div ref={ref} role="dialog" aria-modal="true">...</div>;
 */
export function useFocusTrap(active: boolean, onEscape?: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const escapeRef = useRef(onEscape);
  useEffect(() => {
    escapeRef.current = onEscape;
  });

  useEffect(() => {
    const container = ref.current;
    if (!active || !container) return undefined;

    const id = Symbol('focus-trap');
    trapStack.push(id);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const preferred = container.querySelector<HTMLElement>('[data-autofocus]');
    (preferred ?? visibleFocusables(container)[0])?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (trapStack[trapStack.length - 1] !== id) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        escapeRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = visibleFocusables(container);
      if (items.length === 0) { event.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const inside = container.contains(document.activeElement);

      if (event.shiftKey) {
        if (document.activeElement === first || !inside) { event.preventDefault(); last.focus(); }
      } else if (document.activeElement === last || !inside) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const at = trapStack.indexOf(id);
      if (at !== -1) trapStack.splice(at, 1);
      previouslyFocused?.focus?.();
    };
  }, [active]);

  return ref;
}
