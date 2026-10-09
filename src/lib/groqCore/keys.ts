export function sanitizeKey(key: string): string {
  // eslint-disable-next-line no-control-regex
  return key.replace(/[^\x00-\x7F]/g, '').trim();
}

/** Există cel puțin o cheie cloud (cea activă sau una salvată pentru alt furnizor). Local nu intră aici. */
export function hasAnyCloudKey(state: { apiKey?: string; providerKeys?: Partial<Record<string, string>> }): boolean {
  if (sanitizeKey(state.apiKey ?? '')) return true;
  return Object.entries(state.providerKeys ?? {}).some(([id, key]) => id !== 'local' && !!sanitizeKey(key ?? ''));
}
