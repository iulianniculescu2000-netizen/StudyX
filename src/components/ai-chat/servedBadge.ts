/**
 * Insigna de sub un răspuns: cine l-a scris („Groq · gpt-oss-120b”). Pur.
 */
export interface ServedInfo {
  provider: string;
  model: string;
  /** Păstrat doar pentru mesajele salvate cu modelul local (eliminat); ignorat la afișare. */
  local?: boolean;
}

const PROVIDER_LABELS: Record<string, string> = {
  groq: 'Groq',
  google: 'Gemini',
  mistral: 'Mistral',
};

/** „openai/gpt-oss-120b” → „gpt-oss-120b”; „mistral-small-latest” → „mistral-small”. */
export function shortModelName(model: string): string {
  const base = model.includes('/') ? model.slice(model.lastIndexOf('/') + 1) : model;
  return base.replace(/-latest$/, '');
}

export function servedBadgeText(info: ServedInfo, completedWithCloud = false): string {
  const parts = [PROVIDER_LABELS[info.provider] ?? info.provider, shortModelName(info.model)].filter(Boolean);
  const text = parts.join(' · ');
  return completedWithCloud ? `${text} → completat cu cloud` : text;
}
