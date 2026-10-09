/**
 * Parsing + cleanup for the "Kumar - complement simplu" flashcard PDF.
 *
 * The PDF is a list of numbered one-liners ("12.  Întrebare: răspuns.") grouped
 * under all-caps chapter headings on their own line, with numbering restarting
 * at 1 in every chapter. The old regex parser split the whole text on "N." and
 * looked for an all-caps run at the END of a block, which mislabelled ~150 cards
 * (a heading swallowed by the previous card, capital words inside sentences read
 * as chapters). This parser works line by line and uses the numbering itself as
 * the source of truth.
 *
 * Pure functions only — no fs, no pdfjs — so it is unit-tested.
 */

/** Known chapter headings as they come out of the PDF (spacing quirks included) → display name. */
const HEADING_NAMES = {
  SEPSIS: 'Sepsis',
  EHEDAB: 'Echilibru hidro-electrolitic și acido-bazic',
  TERAPIEINTENSIVA: 'Terapie intensivă',
  HEMATOLOGIE: 'Hematologie',
  REUMATOLOGIE: 'Reumatologie',
  ENDOCRINOLOGIE: 'Endocrinologie',
  DIABETZAHARAT: 'Diabet zaharat',
  NEUROLOGIE: 'Neurologie',
  PNEUMOLOGIE: 'Pneumologie',
  BOALAVENOASATROMBOEMBOLICA: 'Boala venoasă tromboembolică',
  CARDIOLOGIE: 'Cardiologie',
  GASTROENTEROLOGIE: 'Gastroenterologie',
  BOLILEHEPATICE: 'Boli hepatice',
  TULBURARIRENALESIALETRACTULUIURINAR: 'Tulburări renale și ale tractului urinar',
};

/**
 * A numbering restart with no heading line of its own (the PDF drops it) is
 * labelled from what precedes it. Keyed by the previous chapter's display name.
 */
const HEADLESS_AFTER = {
  'Tulburări renale și ale tractului urinar': 'Infecția HIV',
};

/** Minimum question length before a card is considered to carry enough context on its own. */
export const SHORT_QUESTION_CHARS = 30;
export const GENERIC_STATEMENT_STEM = 'Afirmație adevărată';

function stripDiacritics(value) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** "NEUROLOGI E" / "DIABET   ZAHARAT" / "Boala venoasă…" → "NEUROLOGIE" / "DIABETZAHARAT" / … */
export function headingKey(line) {
  return stripDiacritics(line).toUpperCase().replace(/[^A-Z]/g, '');
}

function titleCase(line) {
  const lower = line.trim().toLowerCase().replace(/\s+/g, ' ');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Is this line a chapter heading? All caps, letters/spaces/hyphens only, not a fragment ending in "." */
export function isHeadingLine(line) {
  const text = line.trim();
  if (text.length < 5) return false;
  if (!/^[A-ZĂÂÎȘȚŞŢ][A-ZĂÂÎȘȚŞŢ\s\-/]+$/.test(text)) return false;
  if (HEADING_NAMES[headingKey(text)] !== undefined) return true;
  // Unknown all-caps line: only a heading when it is long and multi-word, so a shouted word
  // wrapped onto its own line ("IREMEDIABILE") never becomes a chapter.
  return text.split(/\s+/).length >= 2 && headingKey(text).length >= 12;
}

export function headingDisplayName(line) {
  return HEADING_NAMES[headingKey(line)] ?? titleCase(line);
}

/** Collapses PDF spacing artefacts without touching the wording. */
export function cleanText(value) {
  return value
    .replace(/\s+/g, ' ')
    // "hemato - oncologici", "3 - 5 ani", "CD4 - 8" → tight hyphen; a lone " - " next to punctuation is left alone.
    .replace(/(\p{L}|\d) - (\p{L}|\d)/gu, '$1-$2')
    // the PDF renders → as "- >"
    .replace(/(^|\s)-\s?>\s?/g, '$1→ ')
    .replace(/\s+([.,;:?!)])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+$/g, '')
    .trim();
}

/** Deterministic id (FNV-1a) so regenerating the deck never re-rolls ids and orphans study progress. */
export function stableId(seed) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(7, '0');
}

/** Fingerprint used to recognise the same card across regenerations (ignores case, spacing, diacritics, hyphen spacing). */
export function cardFingerprint(question, answer) {
  const norm = (s) => stripDiacritics(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
  return `${norm(question)}|${norm(answer)}`;
}

/** Index of the ':' / '=' / '?' that separates question from answer — skipping the ':' inside a ratio like "3:1" or "3 : 1". */
function findDelimiter(content, delimiter) {
  let from = 0;
  for (;;) {
    const index = content.indexOf(delimiter, from);
    if (index <= 0) return -1;
    const before = content.slice(0, index).trimEnd().slice(-1);
    const after = content.slice(index + 1).trimStart().slice(0, 1);
    const insideRatio = delimiter === ':' && /\d/.test(before) && /\d/.test(after);
    if (!insideRatio) return index;
    from = index + 1;
  }
}

/**
 * The PDF's text layer cuts words at random ("chimioterap ie", "Age ntul",
 * "frecve nta"). Rejoins two neighbouring tokens when their concatenation is a
 * word the reference corpus knows well while at least one half is not a word on
 * its own. `frequency(word)` returns how often a diacritic-free, lower-case word
 * occurs in the corpus. Returns the repaired text and the joins made (for review).
 */
export function repairSplitWords(text, frequency) {
  const tokens = text.split(' ');
  const out = [];
  const joins = [];
  const core = (token) => stripDiacritics(token).toLowerCase();
  for (let i = 0; i < tokens.length; i++) {
    const left = tokens[i];
    const right = tokens[i + 1];
    if (right !== undefined && /^\p{L}+$/u.test(left)) {
      const match = right.match(/^(\p{L}+)([^\p{L}]*)$/u);
      if (match) {
        const [, rightWord, trailing] = match;
        const a = core(left);
        const b = core(rightWord);
        // "a" and "o" are real Romanian words ("manifestare a bolii", "o data"), and two capitalised
        // tokens are abbreviations ("IM A", "LE S"): never glue those, even when the result is a word.
        if (a === 'a' || a === 'o' || b === 'a' || b === 'o') {
          out.push(left);
          continue;
        }
        if (/^\p{Lu}+$/u.test(left) && /^\p{Lu}+$/u.test(rightWord)) {
          out.push(left);
          continue;
        }
        // A result of 3 letters or fewer is only trusted when the left piece is a lone stray letter
        // ("d e" → "de"); "de l" → "del" would fuse two real words.
        if (a.length + b.length <= 3 && a.length > 1) {
          out.push(left);
          continue;
        }
        const joined = frequency(a + b);
        if (joined >= 5 && (frequency(a) * 3 < joined || frequency(b) * 3 < joined)) {
          const merged = left + rightWord + trailing;
          out.push(merged);
          joins.push(`${left} ${rightWord}${trailing} → ${merged}`);
          i++;
          continue;
        }
      }
    }
    out.push(left);
  }
  return { text: out.join(' '), joins };
}

/** Splits "question: answer" on the first ':' (else '=' , else '?'); no delimiter → a statement card. */
export function splitQuestionAnswer(content) {
  const candidates = [':', '=', '?'];
  for (const delimiter of candidates) {
    const index = findDelimiter(content, delimiter);
    if (index > 0) {
      const keepMark = delimiter === '?';
      const question = content.slice(0, index + (keepMark ? 1 : 0)).trim();
      const answer = content.slice(index + 1).trim();
      if (question && answer) return { question, answer, statement: false };
    }
  }
  return { question: '', answer: content.trim(), statement: true };
}

/**
 * Turns the PDF text (one physical line per line, pages marked "<<PAGE n>>") into
 * cards. Item numbers must run 1,2,3… inside a chapter; a "1." after a higher
 * number starts a new chapter, so a wrapped line that happens to begin with
 * "5. " can never split a card.
 */
export function parseKumarText(rawText, options = {}) {
  const repairText = options.repairText ?? ((text) => text);
  const cards = [];
  let chapter = 'General';
  let sawHeadingSinceRestart = true;
  let expected = 1;
  let current = null;

  const commit = () => {
    if (!current) return;
    const { number, parts, chapterAtStart } = current;
    current = null;
    const content = repairText(cleanText(parts.join(' ')));
    if (!content) return;
    const { question, answer, statement } = splitQuestionAnswer(content);
    if (!answer) return;
    cards.push({ chapter: chapterAtStart, number, question, answer, statement });
  };

  for (const rawLine of rawText.split('\n')) {
    const line = rawLine.trim();
    if (!line || /^<<PAGE \d+>>$/.test(line) || /^@\S+$/.test(line) || /^\d{1,3}$/.test(line)) continue;

    const item = line.match(/^(\d+)\.\s+(.*)$/);
    if (item) {
      const number = Number(item[1]);
      const startsNewChapter = number === 1 && expected > 1;
      const isNext = number === expected || (number === 1 && expected === 1);
      if (startsNewChapter || isNext) {
        commit();
        if (number === 1) {
          // Numbering restarted with no heading line in between → the PDF dropped the title.
          if (startsNewChapter && !sawHeadingSinceRestart) chapter = HEADLESS_AFTER[chapter] ?? `${chapter} (continuare)`;
          sawHeadingSinceRestart = false;
        }
        current = { number, parts: [item[2]], chapterAtStart: chapter };
        expected = number + 1;
        continue;
      }
    }

    if (isHeadingLine(line)) {
      commit();
      chapter = headingDisplayName(line);
      sawHeadingSinceRestart = true;
      expected = 1;
      continue;
    }

    if (current) current.parts.push(line);
  }
  commit();
  return cards;
}

const GENERIC_STEM = /^(Completează informația [/] )?Afirmație adevărată/i;

/**
 * Builds the quiz JSON. `previous` (the JSON currently in the repo) lets a card
 * keep the id it already had — everything the student studied is keyed by that
 * id — while genuinely new cards get a deterministic one. Matching goes from
 * strict to loose: question+answer, then question alone, then answer alone
 * (each only when unambiguous), so re-parsing with better cleanup does not
 * orphan progress just because the wording shifted slightly.
 * Returns { deck, stats } where stats counts how many ids were reused.
 */
export function buildFlashcardDeck(parsedCards, previous) {
  const bare = (text) => text.replace(/^\[[^\]]+\]\s*/, '').replace(/^\d+\.\s*/, '');
  const frontKey = (text) => (GENERIC_STEM.test(bare(text)) ? '' : cardFingerprint(bare(text), '').slice(0, -1));
  const index = { exact: new Map(), byQuestion: new Map(), byAnswer: new Map() };
  const push = (map, key, value) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  };
  for (const question of previous?.questions ?? []) {
    const answer = question.options?.[0]?.text ?? '';
    const q = frontKey(question.text);
    const a = cardFingerprint('', answer).slice(1);
    push(index.exact, `${q}|${a}`, question);
    if (q) push(index.byQuestion, q, question);
    push(index.byAnswer, a, question);
  }

  const usedIds = new Set();
  const take = (list) => list?.find((candidate) => !usedIds.has(candidate.id));
  const unique = (list) => (list && list.filter((c) => !usedIds.has(c.id)).length === 1 ? take(list) : undefined);
  let reused = 0;

  const questions = parsedCards.map((card) => {
    const asQuestion = (text) => (/[?:]$/.test(text) ? text : `${text}?`);
    const front = card.statement
      ? `${GENERIC_STATEMENT_STEM} — ${card.chapter}:`
      : card.question.length < SHORT_QUESTION_CHARS
        ? `[${card.chapter}] ${asQuestion(card.question)}`
        : asQuestion(card.question);

    const q = card.statement ? '' : cardFingerprint(card.question, '').slice(0, -1);
    const a = cardFingerprint('', card.answer).slice(1);
    const found = take(index.exact.get(`${q}|${a}`))
      ?? (q ? unique(index.byQuestion.get(q)) : undefined)
      ?? unique(index.byAnswer.get(a));

    let id = found?.id;
    if (id) reused++;
    else id = stableId(`${card.chapter}|${card.number}|${card.question}|${card.answer}`);
    while (usedIds.has(id)) id = stableId(`${id}+`);
    usedIds.add(id);

    return {
      id,
      text: front,
      options: [{ id: `${id}-a`, text: card.answer, isCorrect: true }],
      multipleCorrect: false,
      explanation: `Extras din manual. Sursa: ${card.chapter}`,
      category: card.chapter,
      sourceBook: 'Kumar',
    };
  });

  return {
    deck: {
      id: 'rezi-kumar-flashcards-1',
      title: 'Kumar - Concepte Cheie',
      description: 'Extrase directe pentru fixare rapidă.',
      emoji: '⚡',
      category: 'Rezidențiat',
      kind: 'flashcard',
      questions,
      createdAt: previous?.createdAt ?? 1790616299720,
      color: 'blue',
    },
    stats: { total: questions.length, reused, created: questions.length - reused },
  };
}
