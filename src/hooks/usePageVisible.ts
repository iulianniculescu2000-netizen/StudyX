import { useSyncExternalStore } from 'react';

/**
 * Este fereastra vizibilă? Fals doar când e ascunsă de-a binelea (minimizată, alt tab, ecran blocat),
 * nu când e doar fără focus: o fereastră vizibilă, dar în spatele alteia, trebuie să arate la fel ca înainte.
 * O singură abonare la `visibilitychange`, comună tuturor componentelor (useSyncExternalStore).
 */
function subscribe(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

export function isPageVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

export function usePageVisible(): boolean {
  return useSyncExternalStore(subscribe, isPageVisible, () => true);
}
