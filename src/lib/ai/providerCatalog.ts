import type { AIProvider } from '../../store/aiStore';

/** The providers a user can bring a free key for, with where to get it. Limits are left to the provider's own page: they change. */
export const PROVIDER_CATALOG: { id: AIProvider; name: string; keyHint: string; docs: string }[] = [
  { id: 'groq', name: 'Groq', keyHint: 'gsk_...', docs: 'https://console.groq.com/keys' },
  { id: 'google', name: 'Google Gemini', keyHint: 'AIza...', docs: 'https://aistudio.google.com/apikey' },
  { id: 'mistral', name: 'Mistral AI', keyHint: 'cheie opacă, fără prefix fix', docs: 'https://admin.mistral.ai/organization/api-keys' },
];

export const providerName = (id: string) => PROVIDER_CATALOG.find((entry) => entry.id === id)?.name ?? id;
