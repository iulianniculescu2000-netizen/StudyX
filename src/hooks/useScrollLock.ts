import { useEffect } from 'react';

/**
 * Blochează derularea documentului cât timp un modal e deschis (fundalul nu mai „fuge” sub el).
 * Numărată: două modale care se închid pe rând nu eliberează blocarea prea devreme.
 */
let locks = 0;
let previousOverflow = '';

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return undefined;
    if (locks === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    locks += 1;
    return () => {
      locks = Math.max(0, locks - 1);
      if (locks === 0) document.body.style.overflow = previousOverflow;
    };
  }, [active]);
}
