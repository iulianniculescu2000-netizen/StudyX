import type { QuizColor } from '../../types';

export type StudioChatSource = {
  id: string;
  name: string;
};

export type StudioChatFolder = {
  id: string;
  name: string;
  emoji: string;
  color: QuizColor;
};

export type ParsedStudioCommand = {
  shouldGenerate: boolean;
  packCount: number | null;
  questionsPerPack: number | null;
  difficulty: 'auto' | 'easy' | 'medium' | 'hard' | null;
  sourceName: string | null;
  folderName: string | null;
};

/** Lower-case, no diacritics, punctuation (including hyphens) turned into single spaces. */
function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((entry) => entry.charAt(0).toUpperCase() + entry.slice(1))
    .join(' ');
}

/** True when `needle` appears in `haystack` as whole words (both already normalized). */
function containsWholePhrase(haystack: string, needle: string) {
  return ` ${haystack} `.includes(` ${needle} `);
}

const stripExtension = (name: string) => name.replace(/\.(pdf|docx|txt|md)$/i, '');

function matchEntityByName<T extends { name: string }>(text: string, items: T[]) {
  const normalizedText = normalize(text);
  let best: T | null = null;
  let bestScore = 0;

  for (const item of items) {
    const candidate = normalize(stripExtension(item.name));
    if (!candidate) continue;

    // Whole words only: a folder called "Test" must not match "testez", nor
    // one called "Grile" match every "…5 grile…" in a request.
    if (containsWholePhrase(normalizedText, candidate)) {
      const score = candidate.length;
      if (score > bestScore) {
        best = item;
        bestScore = score;
      }
    }
  }

  return best;
}

function firstNumber(patterns: RegExp[], text: string) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > 0) return value;
    }
  }
  return null;
}

/** Cuts a captured phrase where the sentence moves on ("Cardio pentru examen" → "Cardio"), and strips quotes. */
function cleanCapturedName(raw: string): string | null {
  const cut = raw
    .split(/[.,;!?\n]|\s+(?:din|pentru|cu|și|si|dificultate|de tip|la|care|unde)(?=\s|$)/i)[0]
    .replace(/[„”“"'«»]/g, '')
    .trim();
  const words = cut.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 6) return null;
  return titleCase(cut);
}

/**
 * Words that ask for generation. "vreau" alone doesn't count ("Vreau să pun o
 * întrebare…" is a question), and neither does a sentence that only mentions a
 * quiz; it needs an imperative or a "vreau" followed by an amount of grile.
 */
function asksForGeneration(normalized: string) {
  if (/\b(genereaza|creeaza|creaza|fa|fa mi|da mi|adauga|pregateste|construieste|produce)\b/.test(normalized)) return true;
  return /\bvreau\b.*\b\d+\s+(?:de\s+)?(?:grile|pachete|seturi|intrebari)\b/.test(normalized);
}

/** Everything after "în folderul" / "pune-le în", up to the end of the sentence — before any name-shortening heuristic. */
function capturedFolderTail(text: string): string | null {
  const match = text.match(/(?<![\p{L}])(?:în|in)\s+folder(?:ul)?\s+(.+)/iu)
    ?? text.match(/(?<![\p{L}])(?:salveaz[ăa]|pune|adaug[ăa]|mut[ăa])(?:[-\s]+le|[-\s]+l)?\s+(?:în|in)\s+(?!folder)(.+)/iu);
  if (!match) return null;
  return match[1].split(/[.,;!?\n]/)[0].replace(/[„”“"'«»]/g, '').trim() || null;
}

export function parseStudioChatCommand(text: string): ParsedStudioCommand {
  const normalized = normalize(text);
  const mentionsQuiz = /\b(grile|grila|pachete|pachet|seturi|batch|quiz)\b/.test(normalized)
    || /\b\d+\s+(?:de\s+)?intrebari\b/.test(normalized);

  const packCount = firstNumber([
    /(\d+)\s+(?:de\s+)?(?:pachete|seturi|batch(?:uri)?)\b/,
  ], normalized);

  let questionsPerPack = firstNumber([
    /\ba cate (\d+)\s+(?:de\s+)?(?:grile|intrebari)\b/,
    /(\d+)\s+(?:de\s+)?(?:grile|intrebari)\s+(?:pe|per)\s+(?:pachet|set|batch)\b/,
    /\b(?:cu|cate)\s+(\d+)\s+(?:de\s+)?(?:grile|intrebari)\b/,
  ], normalized);

  // "Fă-mi 5 grile din X" — no packs mentioned: one set of exactly that many questions.
  let resolvedPackCount = packCount;
  if (questionsPerPack === null && packCount === null) {
    const plain = firstNumber([/\b(\d+)\s+(?:de\s+)?(?:grile|grila|intrebari|intrebare)\b/], normalized);
    if (plain !== null) {
      questionsPerPack = plain;
      resolvedPackCount = 1;
    }
  }

  // Destination: only when the request names one ("în folderul X", "pune-le în X").
  const folderMatch = text.match(/(?<![\p{L}])(?:în|in)\s+folder(?:ul)?\s+(.+)/iu)
    ?? text.match(/(?<![\p{L}])(?:salveaz[ăa]|pune|adaug[ăa]|mut[ăa])(?:[-\s]+le|[-\s]+l)?\s+(?:în|in)\s+(?!folder)(.+)/iu);
  const folderName = folderMatch ? cleanCapturedName(folderMatch[1]) : null;

  const sourceMatch = text.match(/(?<![\p{L}])(?:din|pentru)\s+curs(?:ul)?\s+["“„]?([^"”“.,\n]+)/iu)
    ?? text.match(/(?<![\p{L}])(?:din|pentru)\s+document(?:ul)?\s+["“„]?([^"”“.,\n]+)/iu)
    ?? text.match(/(?<![\p{L}])(?:din|pentru)\s+["“„]([^"”“]+)/iu);
  const sourceName = sourceMatch ? cleanCapturedName(sourceMatch[1]) : null;

  let difficulty: ParsedStudioCommand['difficulty'] = null;
  if (/\b(auto|adaptiv|automat)\b/.test(normalized)) difficulty = 'auto';
  else if (/\b(usor|easy)\b/.test(normalized)) difficulty = 'easy';
  else if (/\b(mediu|medium)\b/.test(normalized)) difficulty = 'medium';
  else if (/\b(dificil|greu|hard)\b/.test(normalized)) difficulty = 'hard';

  return {
    shouldGenerate: mentionsQuiz && asksForGeneration(normalized),
    packCount: resolvedPackCount,
    questionsPerPack,
    difficulty,
    sourceName,
    folderName,
  };
}

/** Words too common in book titles to identify one ("Medicină Clinică", "Chirurgie generală"). */
const GENERIC_TITLE_WORDS = new Set(['medicina', 'clinica', 'generala', 'specialitati', 'chirurgicale', 'chirurgie', 'simple', 'curs', 'document']);

/**
 * Picks the source a request refers to: the full name (extension ignored), then a
 * distinctive word of it ("din Kumar", "din Lawrence"), then the active one.
 * An explicitly named course that matches nothing is *not* silently replaced by
 * the active one — the caller asks instead of generating from the wrong book.
 */
export function resolveStudioSourceFromCommand<T extends StudioChatSource>(
  text: string,
  sources: T[],
  scopedSource?: T | null,
) {
  const directMatch = matchEntityByName(text, sources);
  if (directMatch) return directMatch;

  const normalizedText = normalize(text);
  const scored = sources.map((source) => {
    const words = normalize(stripExtension(source.name)).split(' ').filter((word) => word.length >= 5 && !GENERIC_TITLE_WORDS.has(word));
    const score = words.filter((word) => containsWholePhrase(normalizedText, word)).length;
    return { source, score };
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);
  if (scored.length > 0 && (scored.length === 1 || scored[0].score > scored[1].score)) return scored[0].source;
  if (scored.length > 1) return null; // two sources fit equally well — ask which one

  const named = parseStudioChatCommand(text).sourceName;
  if (named) return null; // an explicit course that isn't in the library

  if (scopedSource && sources.some((source) => source.id === scopedSource.id)) return scopedSource;
  if (sources.length === 1) return sources[0];
  return null;
}

export function resolveStudioFolderFromCommand<T extends StudioChatFolder>(
  text: string,
  folders: T[],
  selectedFolder?: T | null,
) {
  if (/\b(neclasificat|neclasificate|fara folder)\b/i.test(normalize(text))) {
    return { kind: 'uncategorized' as const };
  }

  // A folder is only chosen when the request names one. Matching folder names anywhere in the
  // sentence used to file "fă-mi 5 grile din …" into a folder that happened to be called "Grile",
  // and matching by "contains" sent "Cardiologie clinică" (new) into an existing "Cardiologie".
  const namedFolder = parseStudioChatCommand(text).folderName;
  if (namedFolder) {
    // An existing folder wins even when its name contains "și", "la", "cu"… which the shortening below
    // would cut at ("Boli infecțioase și parazitare" → "Boli Infecțioase", a duplicate folder).
    const tail = normalize(capturedFolderTail(text) ?? '');
    const longestPrefix = tail
      ? folders
        .filter((folder) => {
          const name = normalize(folder.name);
          if (name.length === 0) return false;
          if (tail === name) return true;
          // Only when what follows the name is the rest of the sentence ("... pentru examen"), not more of a longer name ("Cardiologie clinică").
          return tail.startsWith(name + ' ') && /^(?:din|pentru|cu|dificultate|de tip|care|unde)(?: |$)/.test(tail.slice(name.length + 1));
        })
        .sort((a, b) => normalize(b.name).length - normalize(a.name).length)[0]
      : undefined;
    if (longestPrefix) return { kind: 'existing' as const, folder: longestPrefix };

    const wanted = normalize(namedFolder);
    const exact = folders.find((folder) => normalize(folder.name) === wanted);
    if (exact) return { kind: 'existing' as const, folder: exact };
    return { kind: 'create' as const, name: namedFolder };
  }

  if (selectedFolder) {
    return { kind: 'existing' as const, folder: selectedFolder };
  }

  return { kind: 'uncategorized' as const };
}

export function buildStudioCommandHelp(sources: StudioChatSource[], folders: StudioChatFolder[]) {
  const sourceHint = sources.slice(0, 3).map((source) => source.name).join(', ');
  const folderHint = folders.slice(0, 3).map((folder) => folder.name).join(', ');

  return [
    'Poți scrie direct în chat, de exemplu:',
    '1. Fă-mi 12 pachete a câte 20 de grile din cursul Cardiologie în folderul Rezidențiat.',
    '2. Generează 6 seturi a câte 15 întrebări din documentul Fiziologie, dificultate mediu.',
    sourceHint ? `Surse detectate acum: ${sourceHint}.` : 'Nu ai încă documente indexate în Bibliotecă.',
    folderHint ? `Foldere disponibile: ${folderHint}.` : 'Nu ai încă foldere; pot crea unul direct din comandă.',
  ].join('\n');
}
