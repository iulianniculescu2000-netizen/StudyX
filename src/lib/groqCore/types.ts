export type GroqMessagePart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } };

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | GroqMessagePart[];
}

/** Groq Llama 4 Scout — vision-capable, fast, cost-efficient. */
export const GROQ_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

/** Returns true if the given provider supports multimodal (image) requests. */
export function supportsVision(provider: string): boolean {
  // Vision uses Groq's Llama 4 Scout model specifically, so it's Groq-only.
  return provider === 'groq';
}

/** Cloud providers. */
export type ProviderId = 'groq' | 'google' | 'mistral';

/** Providers with an API key and a fixed endpoint. */
export type CloudProviderId = ProviderId;

/** Options shared by groqRequest / groqChat / groqStream / requestStructured. */
export interface LocalCallOptions {
  /** Called once with the provider/model that actually answered, when the answer starts. */
  onServed?: (info: { provider: ProviderId; model: string }) => void;
  /** Called when a streamed answer ends, with the provider's `finish_reason` ("length" = cut off by the token limit), or null if it sent none. */
  onFinish?: (reason: string | null) => void;
}
