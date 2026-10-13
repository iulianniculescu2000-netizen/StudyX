import { sleepMs } from './retry';

/**
 * Pauza minimă între două cereri către același furnizor. Mistral (planul gratuit) acceptă cel mult o cerere pe secundă:
 * funcțiile care trimit două cereri la rând (agentul „Vezi în carte”, grile + explicații) primeau „Rate limit exceeded” și
 * treceau degeaba pe alt furnizor. Cererile se așază în coadă, fiecare la cel puțin `gap` după cea dinaintea ei.
 */
const MIN_GAP_MS: Record<string, number> = { mistral: 1100 };

const nextFreeAt = new Map<string, number>();

export function providerGapMs(provider: string | undefined): number {
  return provider ? MIN_GAP_MS[provider] ?? 0 : 0;
}

/** Așteaptă până când furnizorul poate primi o cerere nouă (fără pauză pentru cei fără limită de ritm). */
export async function paceProvider(provider: string | undefined, abortSignal?: AbortSignal): Promise<void> {
  const gap = providerGapMs(provider);
  if (!provider || gap === 0) return;
  const now = Date.now();
  const startAt = Math.max(now, nextFreeAt.get(provider) ?? 0);
  nextFreeAt.set(provider, startAt + gap);
  if (startAt > now) await sleepMs(startAt - now, abortSignal);
}

/** Pentru teste: uită cererile anterioare. */
export function resetProviderPacing(): void {
  nextFreeAt.clear();
}
