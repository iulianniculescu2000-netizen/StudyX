/**
 * Insigna de sub un răspuns: cine l-a scris („Groq · gpt-oss-120b”) și, pentru modelul local, cât de repede a mers. Pur.
 */
export interface ServedInfo {
  provider: string;
  model: string;
  local: boolean;
  /** Doar pentru răspunsurile locale: tokeni/secundă după primul text (null dacă răspunsul a fost prea scurt ca să se măsoare). */
  tokensPerSec?: number | null;
  /** Doar pentru răspunsurile locale: secunde până la primul text. */
  ttftSeconds?: number;
}

const PROVIDER_LABELS: Record<string, string> = {
  groq: 'Groq',
  google: 'Gemini',
  mistral: 'Mistral',
  local: 'Local',
};

/** „openai/gpt-oss-120b” → „gpt-oss-120b”; „mistral-small-latest” → „mistral-small”. */
export function shortModelName(model: string): string {
  const base = model.includes('/') ? model.slice(model.lastIndexOf('/') + 1) : model;
  return base.replace(/-latest$/, '');
}

const secondsText = (value: number) => value.toFixed(1).replace('.', ',');

export function servedBadgeText(info: ServedInfo, completedWithCloud = false): string {
  const provider = info.local ? PROVIDER_LABELS.local : (PROVIDER_LABELS[info.provider] ?? info.provider);
  const parts = [provider, shortModelName(info.model)].filter(Boolean);
  if (info.local) {
    if (typeof info.tokensPerSec === 'number' && info.tokensPerSec > 0) parts.push(`${secondsText(info.tokensPerSec)} tok/s`);
    else if (typeof info.ttftSeconds === 'number') parts.push(`${secondsText(info.ttftSeconds)} s până la primul cuvânt`);
  }
  const text = parts.join(' · ');
  return completedWithCloud ? `${text} → completat cu cloud` : text;
}
