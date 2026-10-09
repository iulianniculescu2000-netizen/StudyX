/**
 * Lightweight, instant intent router for the AI chat.
 *
 * Picks the best chat mode (explain / summarize / diagram / test / mnemonic /
 * grounded) directly from the user's message, so the user no longer has to set
 * the mode manually from the dropdown. Pure heuristics — zero network cost,
 * runs synchronously on every keystroke-free send. Agent commands ("fă-mi 50
 * de grile…") are filtered upstream in AIChatDrawer before this runs, so we only
 * classify conversational intent here.
 */
import type { ChatMode } from '../../components/ai-chat/shared';

export interface IntentResult {
  mode: ChatMode;
  /** 0–1 — how strongly the text matched the winning mode over the runner-up. */
  confidence: number;
  /** The concrete keywords that triggered the decision (for UI tooltips). */
  signals: string[];
}

interface ModeRule {
  mode: Exclude<ChatMode, 'grounded'>;
  /** Each pattern that hits adds `weight` to the mode's score. */
  patterns: RegExp[];
  weight: number;
}

// Romanian + a few latin/eng variants. Diacritics are stripped before matching,
// so patterns are written without diacritics.
const MODE_RULES: ModeRule[] = [
  {
    mode: 'explain',
    weight: 1,
    patterns: [
      /\bexplica(-?mi|ti)?\b/,
      /\bde ce\b/,
      /\bcum (functioneaza|apare|se produce|merge)\b/,
      /\bce inseamna\b/,
      /\bmecanism(ul|e)?\b/,
      /\bpas cu pas\b/,
      /\blamure(ste|sc)\b/,
      /\bnu (inteleg|pricep)\b/,
      /\bdetaliaz/,
    ],
  },
  {
    mode: 'summarize',
    weight: 1,
    patterns: [
      /\brezum(a|at|eaza|e)\b/,
      /\bsinteza\b/,
      /\bpe scurt\b/,
      /\bidei(le)? (principale|cheie)\b/,
      /\bcomprima\b/,
      /\bfisa (de )?(studiu|recapitulare)\b/,
      /\brecapitul/,
      /\bce trebuie (sa )?(stiu|retin|memorez) (pentru|la) examen\b/,
      /\bin (cateva|3|5|cinci|trei) (idei|puncte|randuri)\b/,
    ],
  },
  {
    mode: 'diagram',
    weight: 1,
    patterns: [
      /\bschema\b/,
      /\bdiagram/,
      /\btabel\b/,
      /\balgoritm\b/,
      /\bflux(ul)?\b/,
      /\barbore (de )?decizie\b/,
      /\bharta (mintala|conceptuala)\b/,
      /\bcomparatie (intre|tabelara)\b/,
      /\bdiferential (intre|tabelar)\b/,
    ],
  },
  {
    mode: 'test',
    weight: 1,
    patterns: [
      /\btesteaza(-?ma)?\b/,
      /\bintreaba(-?ma)?\b/,
      /\bexamineaza(-?ma)?\b/,
      /\bquiz\b/,
      /\bverifica daca (stiu|cunosc)\b/,
      /\bintrebari de verificare\b/,
      /\bpune(-?mi)? (cateva |niste )?intrebari\b/,
      /\bda(-?mi)? (cateva |niste )?intrebari\b/,
    ],
  },
  {
    mode: 'mnemonic',
    weight: 1,
    patterns: [
      /\bmnemonic/,
      /\bcum (retin|memorez|tin minte)\b/,
      /\btruc (de )?memor/,
      /\basociere (vizuala|mentala)\b/,
      /\bacronim\b/,
      /\bsa (nu )?uit\b/,
    ],
  },
];

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Classify the conversational intent of a chat message.
 * Returns `grounded` (the safe default) when nothing matches strongly.
 */
export function detectChatIntent(text: string): IntentResult {
  const normalized = normalize(text);
  if (normalized.length < 3) {
    return { mode: 'grounded', confidence: 0, signals: [] };
  }

  const scores = new Map<ChatMode, { score: number; signals: string[] }>();

  for (const rule of MODE_RULES) {
    let score = 0;
    const signals: string[] = [];
    for (const pattern of rule.patterns) {
      const match = normalized.match(pattern);
      if (match) {
        score += rule.weight;
        signals.push(match[0]);
      }
    }
    if (score > 0) scores.set(rule.mode, { score, signals });
  }

  if (scores.size === 0) {
    return { mode: 'grounded', confidence: 0, signals: [] };
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score);
  const [topMode, top] = ranked[0];
  const runnerUpScore = ranked[1]?.[1].score ?? 0;

  // An exact tie means two modes matched equally strongly — genuinely ambiguous, not a
  // confident pick. Without this, ties used to land at confidence 0.5 (right at the
  // auto-switch threshold) and silently resolve to whichever mode happened to be declared
  // first in MODE_RULES, instead of admitting "I don't know" and staying grounded.
  if (runnerUpScore === top.score) {
    return { mode: 'grounded', confidence: 0, signals: [] };
  }

  // Confidence = dominance of winner over runner-up, capped at 1.
  const confidence = Math.min(1, (top.score - runnerUpScore + 1) / (top.score + 1));

  return { mode: topMode, confidence, signals: top.signals };
}

/** Whether the detected intent is strong enough to auto-switch the chat mode. */
export function shouldApplyIntent(result: IntentResult): boolean {
  return result.mode !== 'grounded' && result.confidence >= 0.5;
}
