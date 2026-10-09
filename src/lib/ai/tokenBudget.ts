/**
 * Buget de tokeni pentru chat: estimare, defalcarea unui prompt pe părți și câteva unelte pure
 * care reduc consumul fără să schimbe regulile din prompt (plafon de context, deduplicare de
 * fragmente aproape identice, compactarea răspunsurilor vechi din istoric, cache cu TTL).
 *
 * Funcții pure, fără importuri din aplicație: se testează izolat.
 */

/** Româna cu diacritice se tokenizează mai prost decât engleza: ~3.2 caractere / token. */
export const CHARS_PER_TOKEN = 3.2;

export function estimateTextTokens(text: string): number {
  return text ? Math.ceil(text.length / CHARS_PER_TOKEN) : 0;
}

export interface BudgetMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string }>;
}

function textOf(content: BudgetMessage['content']): string {
  if (typeof content === 'string') return content;
  return content.map((part) => (part.type === 'text' ? part.text ?? '' : '')).join('');
}

export interface PromptBreakdown {
  /** Promptul de sistem fără blocul de context RAG. */
  system: number;
  /** Mesajele anterioare (user + assistant), fără ultimul mesaj. */
  history: number;
  /** Blocul „CONTEXT DIN BIBLIOTECA UTILIZATORULUI" (fragmente RAG numerotate). */
  context: number;
  /** Ultimul mesaj al utilizatorului. */
  user: number;
  total: number;
}

/** Marcajul cu care `composeChatSystemPrompt` deschide blocul RAG (ultimul bloc din prompt). */
export const CONTEXT_MARKER = 'CONTEXT DIN BIBLIOTECA UTILIZATORULUI';

export function describePromptBreakdown(messages: BudgetMessage[]): PromptBreakdown {
  let system = 0;
  let history = 0;
  let context = 0;
  let user = 0;
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf('user');
  messages.forEach((message, index) => {
    const text = textOf(message.content);
    if (message.role === 'system') {
      const at = text.indexOf(CONTEXT_MARKER);
      if (at >= 0) {
        system += estimateTextTokens(text.slice(0, at));
        context += estimateTextTokens(text.slice(at));
      } else {
        system += estimateTextTokens(text);
      }
    } else if (index === lastUserIndex) {
      user += estimateTextTokens(text);
    } else {
      history += estimateTextTokens(text);
    }
  });
  return { system, history, context, user, total: system + history + context + user };
}

/** Dev only: `localStorage['studyx:debug:tokens'] = '1'` pornește logarea defalcării. */
export function logPromptBreakdown(label: string, messages: BudgetMessage[]): void {
  try {
    if (!import.meta.env.DEV) return;
    if (localStorage.getItem('studyx:debug:tokens') !== '1') return;
    console.debug(`[tokens] ${label}`, describePromptBreakdown(messages));
  } catch {
    // fără localStorage / fără import.meta.env: nimic de logat
  }
}

/* ── Deduplicare de fragmente aproape identice ─────────────────────────────────────────────── */

function shingles(text: string): Set<string> {
  const words = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  if (words.length < 3) {
    words.forEach((word) => out.add(word));
    return out;
  }
  for (let i = 0; i + 2 < words.length; i++) out.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  return out;
}

/** Similaritate Jaccard pe grupuri de 3 cuvinte: 1 = text identic, 0 = nimic în comun. */
export function textSimilarity(a: string, b: string): number {
  const sa = shingles(a);
  const sb = shingles(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let shared = 0;
  for (const item of sa) if (sb.has(item)) shared += 1;
  return shared / (sa.size + sb.size - shared);
}

/** Pragul peste care două fragmente sunt tratate ca dublură (păstrează primul, cel mai bine clasat). */
export const NEAR_DUPLICATE_THRESHOLD = 0.8;

export function isNearDuplicate(text: string, others: string[], threshold = NEAR_DUPLICATE_THRESHOLD): boolean {
  return others.some((other) => textSimilarity(text, other) >= threshold);
}

/* ── Istoric ────────────────────────────────────────────────────────────────────────────── */

export interface HistoryLikeTurn { role: 'user' | 'assistant'; content: string }

/**
 * Răspunsurile vechi ale asistentului (mai vechi de ultimele `keepRecent` mesaje) sunt lungi și
 * rar necesare integral: modelul păstrează firul din începutul lor. Se taie la `maxChars`, pe
 * frontieră de paragraf/propoziție. Mesajele utilizatorului nu se ating.
 */
export function compactOldAssistantTurns<T extends HistoryLikeTurn>(history: T[], keepRecent = 4, maxChars = 700): T[] {
  const cutoff = history.length - keepRecent;
  return history.map((turn, index) => {
    if (index >= cutoff || turn.role !== 'assistant' || turn.content.length <= maxChars) return turn;
    const window = turn.content.slice(0, maxChars);
    const paragraph = window.lastIndexOf('\n\n');
    const sentence = Math.max(window.lastIndexOf('. '), window.lastIndexOf('.\n'));
    const cut = paragraph >= maxChars * 0.4 ? paragraph : sentence >= maxChars * 0.4 ? sentence + 1 : maxChars;
    return { ...turn, content: `${window.slice(0, cut).trimEnd()} […]` };
  });
}

/* ── Rute ușoare ───────────────────────────────────────────────────────────────────────── */

/**
 * Pentru sarcini utilitare (rezumat de memorie, extragere de memorie) modelul mare nu aduce nimic.
 * Întoarce modelul mic al aceluiași furnizor, sau null dacă furnizorul nu are unul mai mic cunoscut
 * (Google/Mistral rulează deja pe modelele lor rapide).
 */
export function lightModelFor(provider: string, model: string): string | null {
  if (provider === 'groq' && model === 'openai/gpt-oss-120b') return 'openai/gpt-oss-20b';
  return null;
}

/* ── Cache cu TTL ────────────────────────────────────────────────────────────────────────── */

export function hashText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${text.length}:${(h >>> 0).toString(36)}`;
}

export function createTtlCache<V>(ttlMs = 10 * 60 * 1000, maxEntries = 40, now: () => number = Date.now) {
  const store = new Map<string, { at: number; value: V }>();
  return {
    get(key: string): V | undefined {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (now() - hit.at > ttlMs) {
        store.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key: string, value: V): void {
      if (store.size >= maxEntries) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
      store.set(key, { at: now(), value });
    },
    clear(): void { store.clear(); },
  };
}
