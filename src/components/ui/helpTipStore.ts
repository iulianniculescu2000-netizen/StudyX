import { useSyncExternalStore } from 'react';

/** Un singur HelpTip deschis la un moment dat: cheia instanței deschise sau null. */
let openKey: string | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export function openHelpTip(key: string) { if (openKey !== key) { openKey = key; emit(); } }
export function closeHelpTip(key?: string) { if (openKey !== null && (key === undefined || openKey === key)) { openKey = null; emit(); } }
export function useOpenHelpTipKey(): string | null { return useSyncExternalStore(subscribe, () => openKey, () => null); }
