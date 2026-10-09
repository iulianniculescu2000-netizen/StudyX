import type { QuizColor } from '../types';

export interface FolderAppearance {
  emoji: string;
  color: QuizColor;
}

/**
 * Maps a folder name to a fitting icon + color. Used so folders created by the
 * AI/agent (and as the smart default in the manual picker) look intentional —
 * "Cardiologie" → ❤️ red, "Dermatologie" → 🩹 pink — instead of a generic 📚.
 * Order matters: more specific rules first.
 */
const RULES: Array<{ test: RegExp; emoji: string; color: QuizColor }> = [
  { test: /cardio|inim|cord|vascular|hipertens|coronar/i, emoji: '❤️', color: 'red' },
  { test: /derma|piele|tegument|cutanat|dermato/i, emoji: '🩹', color: 'pink' },
  { test: /neuro|creier|nerv|psihiatr|psiholog/i, emoji: '🧠', color: 'purple' },
  { test: /pneumo|respir|pl[aă]m[aâ]ni|pulmon|bronh/i, emoji: '🫁', color: 'teal' },
  { test: /gastro|digestiv|hepat|ficat|intestin|stomac/i, emoji: '🍽️', color: 'orange' },
  { test: /nefro|renal|rinichi|urolog|urinar/i, emoji: '🫘', color: 'blue' },
  { test: /endocrin|diabet|tiroid|hormon/i, emoji: '🧬', color: 'green' },
  { test: /hemato|s[aâ]nge|anemi|leucemi|mielom|limfom|coagul|trombo/i, emoji: '🩸', color: 'red' },
  { test: /infect|microbio|bacterio|virus|viral|parazi/i, emoji: '🦠', color: 'green' },
  { test: /imuno|alergi/i, emoji: '🛡️', color: 'teal' },
  { test: /oncolog|cancer|tumor|neoplazi|malign/i, emoji: '🎗️', color: 'pink' },
  { test: /pediatr|copil|neonat/i, emoji: '🧸', color: 'orange' },
  { test: /gineco|obstetr|sarcin|na[sș]tere|matern/i, emoji: '🤰', color: 'pink' },
  { test: /ortoped|os(?:os|teo)|fractur|articula|reumat/i, emoji: '🦴', color: 'blue' },
  { test: /oftalmo|ochi|vedere|vizual|retin/i, emoji: '👁️', color: 'blue' },
  { test: /\borl\b|urech|laringe|otorino|faring/i, emoji: '👂', color: 'teal' },
  { test: /stomato|dentar|din[tț]i|oral/i, emoji: '🦷', color: 'blue' },
  { test: /anatom/i, emoji: '🩻', color: 'purple' },
  { test: /fiziolog/i, emoji: '⚙️', color: 'blue' },
  { test: /biochim|molecul|metabol/i, emoji: '🧪', color: 'orange' },
  { test: /farmacolog|medicament|terapeut/i, emoji: '💊', color: 'teal' },
  { test: /chirurg|operat|interven/i, emoji: '🔪', color: 'red' },
  { test: /radiolog|imagistic|rmn|\bct\b|ecograf|rezonan/i, emoji: '🩻', color: 'purple' },
  { test: /patolog|histolog|citolog/i, emoji: '🔬', color: 'purple' },
  { test: /urgent|emergen|\bati\b|terapie intensiv|resuscit/i, emoji: '🚑', color: 'red' },
  { test: /genetic|\badn\b|cromozom/i, emoji: '🧬', color: 'green' },
  { test: /nutri[tț]|diet|aliment/i, emoji: '🥗', color: 'green' },
  { test: /lege|drept|juridic|etic/i, emoji: '⚖️', color: 'blue' },
  { test: /exam|rezident|licen[tț][aă]|admitere/i, emoji: '🎯', color: 'red' },
  { test: /recapitul|revizu|repet/i, emoji: '🔁', color: 'orange' },
  { test: /gre[sș]el|mistake|slab/i, emoji: '🧯', color: 'red' },
  { test: /important|priorit/i, emoji: '⭐', color: 'orange' },
  { test: /matemat|algebr|calcul/i, emoji: '📐', color: 'blue' },
  { test: /chimie/i, emoji: '⚗️', color: 'orange' },
  { test: /fizic[aă]\b/i, emoji: '🔭', color: 'purple' },
  { test: /biolog/i, emoji: '🌿', color: 'green' },
  { test: /istori/i, emoji: '🏛️', color: 'orange' },
  { test: /limb|englez|francez|german|spaniol/i, emoji: '🗣️', color: 'teal' },
];

const COLOR_CYCLE: QuizColor[] = ['blue', 'purple', 'teal', 'green', 'pink', 'orange', 'red'];

/**
 * Suggests an emoji + color for a folder name. Falls back to a name-hashed color
 * (so folders aren't all blue) with a neutral folder icon.
 */
export function suggestFolderAppearance(name: string): FolderAppearance {
  const value = (name ?? '').trim();
  for (const rule of RULES) {
    if (rule.test.test(value)) return { emoji: rule.emoji, color: rule.color };
  }
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return { emoji: '📁', color: COLOR_CYCLE[value ? hash % COLOR_CYCLE.length : 0] };
}
