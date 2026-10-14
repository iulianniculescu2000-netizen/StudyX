
/** Romanian inflection: everything here may be followed by a normal word ending. */
export const ENDING = '[a-zăâîșț]*';

/**
 * Stems that mark a message as an instruction rather than a question.
 *
 * These used to sit inside `\b(...)\b`, and that closing boundary demanded the
 * stem be the ENTIRE word — which Romanian almost never obliges. "șterg"
 * matched but "șterge" did not, "folder" matched but "folderul" did not, so
 * "șterge folderul Cardiologie" was answered as chit-chat.
 *
 * Short or ambiguous stems stay anchored on purpose: a loose "fa" would swallow
 * "familie" and "facultate", and "card" would swallow "cardiologie".
 */
export const COMMAND_PATTERNS = [
  // Actions
  `cre[ea]z${ENDING}`, `creaz${ENDING}`, `adaug${ENDING}`, `gener(?:ea[zț]|e[aă]z[aă]|a[tț]i|a)(?![a-zăâîșț])`,
  `[sș]terg${ENDING}`, `mut[aă]${ENDING}`, `redenum${ENDING}`, `organiz${ENDING}`,
  `import(?:[aă]|e[aă]z[aă]|a[tț]i)(?![a-zăâîșț])`, `pune${ENDING}`, `bag[aă]\\b`,
  // Imperative "fă" / "fă-mi", kept tight so ordinary "fa..." words don't match.
  'f[aă]\\s*-?\\s*mi\\b', 'f[aă]\\b', 'face\\b',
  // Things the actions operate on
  `fol?der${ENDING}`, `subfolder${ENDING}`, `gril[aăe]${ENDING}`,
  'set(ul|uri|urile)?\\b', `pachet${ENDING}`, `atlas${ENDING}`, `bibliotec${ENDING}`,
  `gre[șs]el${ENDING}`, 'gre[șs]esc', `recapitul${ENDING}`,
  // Flashcards, including the "flascard" typo users type constantly. "card" on
  // its own stays out — it would swallow "cardiologie".
  `flash\\s?card${ENDING}`, `flascard${ENDING}`, `deck${ENDING}`, 'fi[sș]e\\b',
];

export const COMMAND_HINTS = new RegExp(`\\b(?:${COMMAND_PATTERNS.join('|')})`, 'i');

const foldText = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Mesajul vorbește despre ceva ce există deja pe ecran („explică această grilă”, „debrief al sesiunii”), nu cere să se creeze ceva.
 * Cuvântul „grilă” sau „fă-mi o schemă” dintr-un astfel de mesaj nu e comandă: mesajul merge în chat, cu contextul grilei.
 */
export function refersToCurrentStudyItem(text: string): boolean {
  const norm = foldText(text);
  if (/\b(?:aceasta|asta|actuala|curenta|aceea|acea)\s+(?:grila|intrebare)\b/.test(norm)) return true;
  if (/\bgrila\s+(?:asta|aceasta|curenta|de mai sus|rezolvata|de pe ecran)\b/.test(norm)) return true;
  if (/\b(?:debrief|sesiunii|sesiunea mea)\b/.test(norm)) return true;
  // „explică-mi grila” fără număr: se explică una existentă. „explică-mi și fă-mi 10 grile” are număr și rămâne comandă.
  return /\bexplic\w*/.test(norm) && /\bgril\w*/.test(norm) && !/\d/.test(norm);
}

/** Cheap pre-filter so normal chat questions never pay for a planning round-trip. */
export function looksLikeAgentCommand(text: string): boolean {
  const value = text.trim();
  if (value.length < 4) return false;
  if (refersToCurrentStudyItem(value)) return false;
  if (value.endsWith('?') && !COMMAND_HINTS.test(value)) return false;
  // „Ce face metformina?”, „Cum se pune diagnosticul de lupus?”: cuvinte-comandă într-o întrebare, nu o comandă.
  if (QUESTION_START.test(value) && !EXPLICIT_COMMAND.test(value)) return false;
  return COMMAND_HINTS.test(value);
}

const QUESTION_START = /^\s*(?:cum|ce|care|c[aă]t[ei]?|c[aâ]nd|unde|cine|de ce|la ce|pentru ce)\b/i;
/** Formele care sunt o comandă chiar dacă mesajul începe cu un cuvânt de întrebare („ce grile mi-ai putea face?”). */
const EXPLICIT_COMMAND = /(?:^|[^a-zăâîșț])(?:f[aă]\s*-?\s*mi|cre(?:e[aă]|[aă])z[aă]|genere[aă]z[aă]|adaug[aă]|[sș]terge|redenume[sș]te|import[aă])(?![a-zăâîșț])/i;

/**
 * Short "do it again" follow-ups ("mai încearcă", "încă o dată", "reia").
 * These carry no course/count of their own, so when the previous command failed
 * the caller must RE-RUN the last real command instead of planning from these
 * words — otherwise the model invents a brand-new (wrong) request.
 */
export function isRetryPhrase(text: string): boolean {
  const norm = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/, '');
  if (!norm || norm.length > 48) return false;
  const RETRY_PATTERNS = [
    /\bmai incearca\b/, /\bincearca din nou\b/, /\bincearca iar\b/, /\breincearca\b/,
    /\binca o data\b/, /\binca odata\b/, /\bmai fa o data\b/, /\bfa din nou\b/,
    /\bmai fa\b/, /\breia\b/, /\brepeta\b/, /\bmai incearca o data\b/,
    // Only the bare phrase: "Iar dacă pacientul are diabet?" is a new question, not a retry.
    /^din nou$/, /^iar(asi)?$/, /\btry again\b/, /\bretry\b/,
  ];
  return RETRY_PATTERNS.some((pattern) => pattern.test(norm));
}

// ── In-quiz answer disputes ────────────────────────────────────────────────
// "Cred că e corect și varianta C" — the student disagrees with the marked
// answer while looking at a question (QuizPlay → useQuizChatContextStore).
// This is deliberately SEPARATE from the folder/generation planner above: it
// needs the EXACT quiz/question identity from app state, not something an LLM
// should infer from chat text, and it must never silently guess — general
// medical knowledge is only used when the student explicitly allows it.

export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Does this message read as "I think the marked answer is wrong / X is also correct"? */
export function looksLikeAnswerDispute(text: string): boolean {
  const norm = normalizeForMatch(text);
  const DISPUTE_PATTERNS = [
    /\bcred c[ăa]\b[\s\S]{0,40}\b(corect|gre[șs]it|varianta|r[ăa]spuns)/,
    /\bnu (e|este|cred c[ăa] e|cred c[ăa] este) corect/,
    /\br[ăa]spuns(ul)? (e|este) gre[șs]it/,
    /\bde fapt (e|este|ar trebui|cred)/,
    /\b(si|și) varianta [a-e]\b/,
    /\bmai e[i]? corect[ăa]?\b/,
  ];
  return DISPUTE_PATTERNS.some((p) => p.test(norm));
}

/** Explicit permission to use general knowledge when no course backs the claim. */
export function grantsGeneralKnowledgePermission(text: string): boolean {
  const norm = normalizeForMatch(text);
  return /\bghice[șs]te\b|\bintuie[șs]te\b|din cuno[șs]tin[țt]ele tale|cunostinte generale|f[ăa]r[ăa] curs|chiar dac[ăa] nu (ai|g[ăa]se[șs]ti)/.test(norm);
}

// ── "Pune-le într-un folder" fără țintă ─────────────────────────────────────
// „ok, bagă-le în folder” după o generare: planificatorul nu vede mesajele agentului, deci nu poate lega „le” de
// setul abia creat și întoarce „nu e comandă”. Fără asta mesajul cade pe chatul simplu, care răspunde „le-am salvat”
// fără să fi făcut nimic. Aici îl prindem deterministic și cerem folderul.

const PLACE_THEM_RE = /\b(?:baga|bagal|pune|du|muta|trimite|tine|salveaza|adauga|stocheaza)\s*-?\s*(?:le|l|o)\b/;

/** „Bagă-le în folder”, „pune-le acolo”, „mută-le”: cere mutarea a ceva deja creat, fără să numească setul. */
export function looksLikePlaceThemRequest(text: string): boolean {
  const norm = normalizeForMatch(text).replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (norm.length > 80) return false;
  return PLACE_THEM_RE.test(norm);
}

export const PLACE_THEM_QUESTION = 'În ce folder vrei să le pun? Spune-mi numele folderului (îl creez dacă nu există).';
