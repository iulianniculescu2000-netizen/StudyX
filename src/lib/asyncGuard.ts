export function createLatestOnlyRunner() {
  let token = 0;

  return async function runLatest<T>(factory: () => Promise<T>): Promise<T | undefined> {
    token += 1;
    const currentToken = token;
    const result = await factory();
    if (currentToken !== token) return undefined;
    return result;
  };
}

export function isDocumentHidden() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}
