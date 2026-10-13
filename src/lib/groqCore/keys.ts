export function sanitizeKey(key: string): string {
  // eslint-disable-next-line no-control-regex
  return key.replace(/[^\x00-\x7F]/g, '').trim();
}
