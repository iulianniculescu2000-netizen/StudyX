import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { localDateStr } from '../lib/studyPlan';
import type { RateWindow } from '../lib/ai/rateHeaders';

export type UsageProvider = 'groq' | 'google' | 'mistral';

export interface DayUsage {
  tokens: number;
  requests: number;
  /** True once any part of the day's count is an estimate (streamed replies carry no token count). */
  estimated: boolean;
}

const KEEP_DAYS = 14;

interface AIUsageState {
  /** date (YYYY-MM-DD) → provider → usage. Counted on this device only. */
  days: Record<string, Partial<Record<UsageProvider, DayUsage>>>;
  /** Latest rate-limit numbers a provider reported, when it reports any. */
  windows: Partial<Record<UsageProvider, RateWindow>>;
  record: (provider: UsageProvider, tokens: number, options?: { estimated?: boolean; window?: RateWindow | null }) => void;
  /** Keep the latest limit numbers without counting a request (used when a call fails). */
  noteWindow: (provider: UsageProvider, window: RateWindow) => void;
  reset: () => void;
}

export const useAIUsageStore = create<AIUsageState>()(
  persist(
    (set) => ({
      days: {},
      windows: {},
      record: (provider, tokens, options = {}) => set((state) => {
        const today = localDateStr();
        const previous = state.days[today]?.[provider] ?? { tokens: 0, requests: 0, estimated: false };
        const days = {
          ...state.days,
          [today]: {
            ...state.days[today],
            [provider]: {
              tokens: previous.tokens + Math.max(0, Math.round(tokens)),
              requests: previous.requests + 1,
              estimated: previous.estimated || Boolean(options.estimated),
            },
          },
        };
        const kept = Object.keys(days).sort().slice(-KEEP_DAYS);
        const pruned = Object.fromEntries(kept.map((day) => [day, days[day]]));
        return {
          days: pruned,
          windows: options.window ? { ...state.windows, [provider]: options.window } : state.windows,
        };
      }),
      noteWindow: (provider, window) => set((state) => ({ windows: { ...state.windows, [provider]: window } })),
      reset: () => set({ days: {}, windows: {} }),
    }),
    { name: 'studyx-ai-usage' },
  ),
);

/** ~4 characters per token: close enough to label a streamed reply "≈". */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
