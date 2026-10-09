import { useUIStore } from '../store/uiStore';
import type { ErrorEntry } from './errorNotebook';

export type ErrorAiAction = 'explain' | 'similar';

/** Deschide asistentul cu o cerere despre o greșeală: explicație sau grile similare. */
export function askAiAboutError(entry: ErrorEntry, action: ErrorAiAction): void {
  const correct = entry.question.options.filter((option) => option.isCorrect).map((option) => option.text).join('; ');
  const prompt = action === 'explain'
    ? `Explică-mi, pentru rezidențiat, de ce răspunsul corect este „${correct}” la întrebarea: ${entry.question.text}`
    : `Fă-mi 3 grile noi, similare ca idee cu aceasta, ca să exersez: ${entry.question.text} (răspuns corect: ${correct})`;
  window.dispatchEvent(new CustomEvent('studyx:ai-prompt', { detail: { open: true, prompt } }));
  useUIStore.getState().setChatOpen(true);
}
