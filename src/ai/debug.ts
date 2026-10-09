const DEBUG_KEY = 'studyx-ai-debug';

export function isAIDebugEnabled() {
  try {
    return localStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAIDebugEnabled(enabled: boolean) {
  try {
    localStorage.setItem(DEBUG_KEY, enabled ? '1' : '0');
  } catch (err) {
    console.error('[Debug] Failed to set AI debug state:', err);
  }
}

export function logAIDebug(label: string, payload: unknown) {
  if (!isAIDebugEnabled()) return;
  console.log(`[StudyX AI] ${label}`, payload);
}

export function replayPrompt(prompt: string) {
  logAIDebug('replayPrompt', prompt);
  return prompt;
}
