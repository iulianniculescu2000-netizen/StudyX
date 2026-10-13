/**
 * Template-based extractor for pre-written quiz banks ("grile").
 *
 * Unlike the AI generator (which invents new questions from study material),
 * this recognizes questions that ALREADY EXIST in a document and pulls them out
 * faithfully — including which option is correct.
 *
 * The correct answer is almost always encoded in FORMATTING (bold / red) or an
 * explicit key line ("Raspuns corect: a"). Plain text extraction throws the
 * formatting away, so this engine works on structured lines that carry an
 * optional `bold`/`red` flag, letting a .docx (bold preserved via mammoth) and
 * a plain PDF/text feed the exact same logic.
 */

export interface SourceLine {
  text: string;
  bold?: boolean;
  /** Visually marked as correct — a distinct/saturated ink color or highlight. */
  marked?: boolean;
  /** PDF page this line came from (1-based). Only set by the PDF source — used
   *  to associate a question with a clinical photo on the same page. */
  page?: number;
}

/** Normalize for loose text comparison (answer-by-text, dedup): lowercase, no diacritics/punctuation. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ParsedOption {
  text: string;
  isCorrect: boolean;
}

export type AnswerSource = 'explicit' | 'format' | 'ai' | 'none';
export type Confidence = 'high' | 'medium' | 'low';

export interface ParsedQuestion {
  text: string;
  options: ParsedOption[];
  multipleCorrect: boolean;
  answerSource: AnswerSource;
  confidence: Confidence;
  warnings: string[];
  /** PDF page(s) this question's lines came from — lets the caller attach a
   *  same-page clinical photo (e.g. "Imaginea reprezintă: ..." questions). */
  pages?: number[];
  /** Attached image (data URL), filled in by the caller (grileImport.ts) when
   *  this question's page contains an embedded image. */
  imageUrl?: string;
  /** Nearest preceding ALL-CAPS section header (e.g. "CARDIOLOGIE"), if the bank
   *  organizes itself by specialty — best-effort, used to split import into
   *  multiple quizzes instead of one flat dump. */
  specialty?: string;
}

export interface ParseResult {
  questions: ParsedQuestion[];
  stats: {
    total: number;
    withAnswer: number;
    highConfidence: number;
    needsReview: number;
    incomplete: number;
  };
}

// ---- line classification -------------------------------------------------

// Optional leading marker (some banks flag hard questions with "*3." or "#3.").
// Optional single-letter prefix too — image-based grile are often numbered in
// their own sequence, separate from the main bank ("P1.", "P2." for "poză").
// Separator after the number also covers a bare dash ("3 -") and closing bracket ("3]").
// A separator directly followed by a digit ("3.9 mmol/L", "5-10 mg") or a dash followed by
// another number ("120 - 140 mmHg") is a number inside wrapped text, not a question number.
const QUESTION_NUM_RE = /^\s*[*#]?\s*[A-Za-z]?(\d{1,3})\s*(?:[.)\]](?!\d)|[-–—](?!\s*\d))\s*(.*)$/;
// "Întrebarea 12:" / "Intrebarea 12." / "Question 12:" / "Q12." / "ÎNTREBARE 12" — a labeled
// numbering scheme some exam-generator PDFs use instead of a bare "12.".
const LABELED_QUESTION_NUM_RE =
  /^\s*(?:[îi]ntrebarea?|question|q)\s*[.:]?\s*(\d{1,3})\s*[.):]?\s*(.*)$/i;
const ENDS_STEM_RE = /[:?]\s*$/;
// Letter separator covers ".", ")", a dash, or a bare colon, plus letters wrapped
// in parens ("(a)") — banks are inconsistent about which one they export with.
const LETTER_OPTION_RE = /^\s*\(?([a-eA-E])\)?\s*[.):\-–—]\s*(.*\S)\s*$/;
const DASH_OPTION_RE = /^\s*[-–—•·▪▫◦‣⁃]\s*(.*\S)\s*$/;
const TYPE_MULTIPLE_RE =
  /complement\s+multiplu|alegere\s+multipl[aă]|r[aă]spunsuri?\s+multiple|multiple\s+(?:answer|choice|response)s?|select\s+all\s+that\s+appl(?:y|ies)|select\s+one\s+or\s+more|[([]\s*cm\s*[)\]]/i;
const TYPE_SINGLE_RE =
  /complement\s+simplu|alegere\s+simpl[aă]|r[aă]spuns\s+unic|single\s+(?:answer|choice|response)|select\s+one(?!\s+or\s+more)|[([]\s*cs\s*[)\]]/i;
// A whole line that's JUST the type marker without brackets, e.g. "CM — 4
// răspunsuri corecte" / "CS — răspuns unic" (some banks print this as its own
// caption line right under the stem instead of "(CM)"/"[CS]").
const TYPE_LINE_RE = /^\s*(cm|cs)\s*[-–—:]\s*(?:\d+\s*)?r[aă]spuns(?:uri)?(?:\s+corecte?|\s+unic[aă]?)?\s*$/i;
// Type tag glued onto the END of the stem itself (not its own line): "...: [CM]" / "...(CS)".
const TRAILING_TYPE_RE = /\s*[([]\s*(?:complement\s+multiplu|complement\s+simplu|cm|cs)\s*[)\]]\s*$/i;
// A checkmark glyph some PDF exporters place right before the correct option's
// letter (e.g. "✓ a) Placard edematos") instead of / in addition to color or
// bold. It sits BEFORE the letter, so — same problem as YES_PREFIX_RE below —
// it stops LETTER_OPTION_RE from matching (needs the letter at line start),
// and the whole line (checkmark + letter + text) falls through as raw option
// text instead of being recognized as option "a" and marked correct.
const CHECK_PREFIX_RE = /^\s*[✓✔√☑]\s*/;
// Some banks mark the correct option with an explicit "DA - " ("YES -") text
// prefix instead of (or in addition to) color/bold — e.g. "DA - a) Placard
// edematos". The prefix sits BEFORE the letter, so it also broke plain letter
// detection (a)/b)/… had to be at the start of the line), which silently
// swallowed that whole option into the previous line/stem. Stripped in a
// preprocessing pass below, same as mergeLoneOptionLabels.
const YES_PREFIX_RE = /^\s*(?:DA|YES|CORECT|TRUE|ADEV[AĂ]RAT)\s*[-:–—]\s*(.+)$/i;
// "Din curs: ..." / "Nota: ..." explanation box some banks print right after
// each question (source-material justification or a reviewer's note, not
// part of the grilă). It can wrap across several lines with no marker on the
// continuation lines, so it's handled as a skip-until-next-question state in
// segmentBlocks rather than a regex here.
const EXPLANATION_START_RE = /^\s*(?:din\s+curs|nota)\s*:/i;
// "Raspuns corect: a" / "Răspuns: a, c, d" / "R: b" / "Answer: c" / "Cheie: a"
// / "Soluție: b" / "Varianta corectă: a" / "Key: c" — AND, since real grile banks
// (e.g. the residency question banks) print this with a space instead of a colon
// ("Raspuns corect E"), the colon/equals is optional for the long, unambiguous
// phrases below. It stays MANDATORY for the short/ambiguous single-word markers
// (bare "r"/"key"/"corect"/"cheie") so a colon-less stray word doesn't false-match.
// The separator class must include plain ASCII "s": diacritic-free Romanian
// ("a si c") is the norm in OCR'd and older banks, and omitting it made the
// whole key line fall through as a bogus extra option.
// Optional trailing "*" and/or a parenthetical ("A* (dedus, de verificat)") — banks that
// merge several sources flag the answers they inferred themselves this way.
const EXPLICIT_ANSWER_RE =
  /^\s*(?:r[aă]spuns(?:ul)?(?:\s*corecte?)?|varianta?\s*corect[aă])\s*[:=]?\s*([a-eA-E](?:\s*[,;șsȘSiI/\s]+[a-eA-E])*)\s*(\*)?\s*(?:\(([^)]*)\))?\s*\.?\s*$/i;
const EXPLICIT_ANSWER_STRICT_RE =
  /^\s*(?:r|answer|corecte?|chei[ae]?|solu[țt]i[ae]|key)\s*[:=]\s*([a-eA-E](?:\s*[,;șsȘSiI/\s]+[a-eA-E])*)\s*(\*)?\s*(?:\(([^)]*)\))?\s*\.?\s*$/i;
// Matching-type key ("Răspuns corect: A-2, B-4, C-3"): cannot be expressed as a
// set of correct options, so the question is kept but left unanswered for review.
const MATCHING_KEY_RE = /^\s*(?:r[aă]spuns(?:ul)?(?:\s*corecte?)?|varianta?\s*corect[aă])\s*[:=]?\s*[a-eA-E]\s*[-–—=]\s*\d/i;
// Running page header/footer ("Pagina 12", "Pagina 3 din 40").
const PAGE_NUMBER_RE = /^\s*(?:pagina|page|pag\.?)\s*\d+(?:\s*(?:din|of|\/)\s*\d+)?\s*$/i;
// Trailing appendix some generated banks add after the last question — nothing
// below it is a question.
const APPENDIX_RE = /^\s*(?:decizii\s+pentru\s+conflicte|grilele\s+care\s+aveau\s+r[aă]spunsuri\s+diferite)/i;
// Moodle-style key that names the answer TEXT: "The correct answer is: Verruca"
const ANSWER_TEXT_RE =
  /^\s*(?:the\s+)?(?:correct\s+answers?\s+(?:is|are)|r[aă]spuns(?:ul)?\s+corect\s+este)\s*:?\s*(.+\S)\s*$/i;
// Noise lines to ignore (Moodle exports, feedback). "Select one(/or more)" is
// handled by TYPE_SINGLE_RE/TYPE_MULTIPLE_RE instead, since it also tells us
// whether the question allows multiple correct answers. "nemarcat"/"răspuns
// liber" are informational captions ("unmarked in source" / "free-response
// answer") some banks print instead of lettered options — without this they'd
// be swallowed as a bogus extra option.
const SKIP_LINE_RE =
  /^\s*(?:your\s+answer\s+is\s+(?:correct|incorrect)|question\s+\d+|marks?\s*:|mark\s+\d|flag\s+question|not\s+flagged|answer\s+saved|points?\s+out\s+of|time\s+left|question\s+text|grade\s*:|nemarcat\b|r[aă]spuns\s+liber\b)/i;

// A short ALL-CAPS line with no digits — a section/specialty header some banks print
// inline in the body ("CARDIOLOGIE", "PULMONAR") rather than only in a separate TOC.
// Excludes anything that already looks like a question start so numbering schemes
// with capitalized stems don't get misread as headers.
const SPECIALTY_HEADING_RE = /^[A-ZĂÂÎȘȚ][A-ZĂÂÎȘȚ -]{2,39}$/;

function isSpecialtyHeading(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 40) return false;
  if (QUESTION_NUM_RE.test(trimmed) || LABELED_QUESTION_NUM_RE.test(trimmed)) return false;
  return SPECIALTY_HEADING_RE.test(trimmed);
}

function letterToIndex(letter: string): number {
  return letter.trim().toLowerCase().charCodeAt(0) - 97; // a->0
}

/**
 * The letters named by an answer key, kept AS LETTERS rather than converted to
 * positions. Banks skip letters and occasionally repeat them, so "d" must mean
 * "the option printed as d", not "the fourth option".
 */
function parseAnswerLetters(raw: string): string[] {
  const letters = (raw.match(/[a-eA-E]/g) ?? []).map((l) => l.toLowerCase());
  return [...new Set(letters)];
}

// ---- block model ---------------------------------------------------------

interface Block {
  questionLines: SourceLine[];
  optionLines: SourceLine[];
  explicitAnswer?: string[]; // option LETTERS from a "Raspuns corect: a" line
  answerInferred?: boolean; // the key itself says the answer was deduced ("A* (dedus…)")
  unsupportedKey?: boolean; // matching-type key (A-2, B-4) — can't be mapped to options
  explicitAnswerText?: string; // answer named by text: "The correct answer is: X"
  typeIsMultiple?: boolean; // from a "Complement multiplu" marker
  specialty?: string; // nearest preceding section header, if any
}

/**
 * Group raw lines into per-question blocks. A block starts at a numbered line
 * (`3.` / `3)`) or, when the document has no numbering (typical .docx export),
 * at a bold line ending in ":".
 */
function segmentBlocks(lines: SourceLine[]): Block[] {
  const cleaned = lines
    .map((l) => ({ ...l, text: l.text.replace(/\u00a0/g, ' ').trim() }))
    .filter((l) => l.text.length > 0);

  const hasNumbering = cleaned.some((l) => QUESTION_NUM_RE.test(l.text) || LABELED_QUESTION_NUM_RE.test(l.text));

  // Strips a type tag glued onto the end of the stem ("...: [CM]") and reports
  // whether it means multi-answer, so a document that never puts CS/CM on its
  // own line still gets a clean stem and a confident multipleCorrect flag.
  const stripTrailingType = (stem: string): { stem: string; typeIsMultiple?: boolean } => {
    const m = stem.match(TRAILING_TYPE_RE);
    if (!m || m.index === undefined) return { stem };
    const tag = m[0];
    return { stem: stem.slice(0, m.index).trimEnd(), typeIsMultiple: TYPE_MULTIPLE_RE.test(tag) };
  };

  const isQuestionStart = (l: SourceLine): { start: boolean; text?: string; typeIsMultiple?: boolean } => {
    const m = l.text.match(QUESTION_NUM_RE);
    if (m) {
      const { stem, typeIsMultiple } = stripTrailingType(m[2]);
      return { start: true, text: stem, typeIsMultiple };
    }
    // Labeled numbering some exam-generator PDFs use: "Întrebarea 12:" / "Question 12."
    const lm = l.text.match(LABELED_QUESTION_NUM_RE);
    if (lm) {
      const { stem, typeIsMultiple } = stripTrailingType(lm[2]);
      return { start: true, text: stem, typeIsMultiple };
    }
    // Fallback for un-numbered docx: a bold line that reads like a stem.
    if (!hasNumbering && l.bold && /[:?]\s*$/.test(l.text) && l.text.length > 12) {
      return { start: true, text: l.text };
    }
    return { start: false };
  };

  const blocks: Block[] = [];
  let current: Block | null = null;
  // Once the stem is closed (first option seen, or stem ended with ":"), bare
  // lines are options — this is what makes bold-marked docx lists work.
  let optionsOpen = false;
  // Set while consuming a "Din curs: ..." explanation box, which can wrap
  // across several unmarked lines — everything is skipped until the next
  // question starts (isQuestionStart resets this below).
  let inExplanation = false;
  // Nearest preceding specialty/section header ("CARDIOLOGIE"), carried into
  // every block created until the next header line updates it.
  let currentSpecialty: string | undefined;

  for (let i = 0; i < cleaned.length; i++) {
    const line = cleaned[i];
    // A section header introduces the questions that follow it, so require that
    // a question really does start next. Without that lookahead any ALL-CAPS
    // option ("BCG", "HIV") was swallowed as a header — the option vanished AND
    // it renamed the specialty for every question after it.
    if (isSpecialtyHeading(line.text)) {
      const next = cleaned[i + 1];
      if (next && isQuestionStart(next).start) {
        currentSpecialty = line.text.trim();
        continue;
      }
    }
    const q = isQuestionStart(line);
    if (q.start) {
      const stem = q.text ?? line.text;
      current = { questionLines: [{ ...line, text: stem }], optionLines: [], typeIsMultiple: q.typeIsMultiple, specialty: currentSpecialty };
      blocks.push(current);
      optionsOpen = ENDS_STEM_RE.test(stem);
      inExplanation = false;
      continue;
    }
    if (APPENDIX_RE.test(line.text)) {
      current = null;
      continue;
    }
    if (!current) continue; // preamble/junk before the first question
    if (PAGE_NUMBER_RE.test(line.text)) continue;
    if (MATCHING_KEY_RE.test(line.text)) {
      current.unsupportedKey = true;
      inExplanation = false;
      continue;
    }

    // Checked BEFORE the explanation guard: an answer key is unambiguous, and
    // banks routinely print it after the "Din curs:" note. Skipping it there
    // left the question keyless and flagged for manual review.
    const ans = line.text.match(EXPLICIT_ANSWER_RE) ?? line.text.match(EXPLICIT_ANSWER_STRICT_RE);
    if (ans) {
      current.explicitAnswer = parseAnswerLetters(ans[1]);
      if (ans[2] || (ans[3] && /dedus|de verificat|incert|probabil/i.test(ans[3]))) current.answerInferred = true;
      inExplanation = false;
      continue;
    }

    if (inExplanation) continue;
    if (EXPLANATION_START_RE.test(line.text)) {
      inExplanation = true;
      continue;
    }

    // Moodle / exam-export noise ("Select one:", "Your answer is correct", …).
    if (SKIP_LINE_RE.test(line.text)) continue;
    // Explicit answer key by TEXT ("The correct answer is: Verruca").
    const ansText = line.text.match(ANSWER_TEXT_RE);
    if (ansText) {
      current.explicitAnswerText = ansText[1];
      continue;
    }
    // Type marker (CS/CM), on its own line either bare ("CM — 4 răspunsuri
    // corecte") or as a phrase ("Complement multiplu").
    const typeLine = line.text.match(TYPE_LINE_RE);
    if (typeLine) {
      current.typeIsMultiple = typeLine[1].toLowerCase() === 'cm';
      continue;
    }
    if (TYPE_MULTIPLE_RE.test(line.text)) {
      current.typeIsMultiple = true;
      continue;
    }
    if (TYPE_SINGLE_RE.test(line.text)) {
      current.typeIsMultiple = current.typeIsMultiple ?? false;
      continue;
    }

    if (LETTER_OPTION_RE.test(line.text) || DASH_OPTION_RE.test(line.text)) {
      current.optionLines.push(line);
      optionsOpen = true;
    } else if (optionsOpen) {
      // Bare line after options opened — a wrapped or unprefixed (docx) option.
      current.optionLines.push(line);
    } else if (ENDS_STEM_RE.test(line.text)) {
      // Stem line ending in ":" / "?": finish the stem and open options.
      current.questionLines.push(line);
      optionsOpen = true;
    } else {
      // Still accumulating a multi-line question stem.
      current.questionLines.push(line);
    }
  }

  return blocks;
}

// ---- option + answer extraction -----------------------------------------

interface ExtractedOption {
  text: string;
  /** The letter this option is actually printed with, when it has one. */
  letter?: string;
  bold: boolean;
  marked: boolean;
}

function extractOptions(block: Block): ExtractedOption[] {
  // Only when the block labels its options ("a)", "-") can an unlabelled line
  // be assumed to be a wrap. In an unnumbered .docx list every bare line really
  // is its own option, so that shape must keep splitting.
  const usesPrefixes = block.optionLines.some(
    (l) => LETTER_OPTION_RE.test(l.text) || DASH_OPTION_RE.test(l.text),
  );

  const out: ExtractedOption[] = [];
  for (const l of block.optionLines) {
    const letter = l.text.match(LETTER_OPTION_RE);
    if (letter) {
      out.push({ text: letter[2].trim(), letter: letter[1].toLowerCase(), bold: !!l.bold, marked: !!l.marked });
      continue;
    }
    const dash = l.text.match(DASH_OPTION_RE);
    if (dash) {
      out.push({ text: dash[1].trim(), bold: !!l.bold, marked: !!l.marked });
      continue;
    }

    const previous = out[out.length - 1];
    if (usesPrefixes && previous) {
      // Continuation of the option above. Treating it as a new option used to
      // shift every following letter, so the key then marked the wrong answer.
      previous.text = `${previous.text} ${l.text.trim()}`.replace(/\s+/g, ' ').trim();
      previous.bold = previous.bold || !!l.bold;
      previous.marked = previous.marked || !!l.marked;
      continue;
    }
    out.push({ text: l.text.trim(), bold: !!l.bold, marked: !!l.marked });
  }
  return out;
}

function buildQuestion(block: Block): ParsedQuestion | null {
  const stem = block.questionLines
    .map((l) => l.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/^\*+\s*/, '') // some banks prefix hard questions with "*"
    .trim();

  const rawOptions = extractOptions(block);
  const warnings: string[] = [];
  const pages = [...new Set(
    [...block.questionLines, ...block.optionLines]
      .map((l) => l.page)
      .filter((p): p is number => typeof p === 'number'),
  )];

  if (!stem || stem.length < 6) return null;
  if (rawOptions.length < 2) {
    // A stem with 0–1 options isn't a usable multiple-choice item.
    return {
      text: stem,
      options: rawOptions.map((o) => ({ text: o.text, isCorrect: false })),
      multipleCorrect: false,
      answerSource: 'none',
      confidence: 'low',
      warnings: [
        block.unsupportedKey
          ? 'Întrebare de asociere (cheie de tip A-2, B-4) — nu pot marca automat răspunsul.'
          : block.explicitAnswer?.length
            ? `Prea puține variante (${rawOptions.length}), dar cheia indică „${block.explicitAnswer.join(', ')}" — răspunsul nu a fost aplicat, de verificat.`
            : 'Prea puține variante (nu e grilă completă).',
      ],
      pages: pages.length ? pages : undefined,
      specialty: block.specialty,
    };
  }

  const correct = new Set<number>();
  let answerSource: AnswerSource = 'none';

  // Letters named by the key that match no option — usually an OCR slip, and
  // worth reporting as such instead of as "unmarked".
  const unresolvedLetters: string[] = [];

  if (block.explicitAnswer && block.explicitAnswer.length > 0) {
    const printedLetters = rawOptions.map((o) => o.letter);
    const isLettered = printedLetters.some(Boolean);

    block.explicitAnswer.forEach((letter) => {
      // Prefer the letter each option actually carries; fall back to position
      // only for lists that print no letters at all (dash/plain .docx lists).
      const index = isLettered ? printedLetters.indexOf(letter) : letterToIndex(letter);
      if (index >= 0 && index < rawOptions.length) correct.add(index);
      else unresolvedLetters.push(letter);
    });
    if (correct.size > 0) answerSource = 'explicit';
  }

  // Answer named by text (Moodle): match it against an option.
  if (answerSource === 'none' && block.explicitAnswerText) {
    const target = normalizeText(block.explicitAnswerText);
    let best = -1;
    let bestScore = 0;
    rawOptions.forEach((o, i) => {
      const opt = normalizeText(o.text);
      if (!opt) return;
      const score = opt === target ? 1 : opt.includes(target) || target.includes(opt) ? 0.8 : 0;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0 && bestScore >= 0.8) {
      correct.add(best);
      answerSource = 'explicit';
    }
  }

  if (answerSource === 'none') {
    rawOptions.forEach((o, i) => {
      if (o.bold || o.marked) correct.add(i);
    });
    if (correct.size > 0) answerSource = 'format';
  }

  if (answerSource === 'none' && block.unsupportedKey) {
    warnings.push('Întrebare de asociere (cheie de tip A-2, B-4) — nu pot marca automat răspunsul.');
  } else if (answerSource === 'none') {
    warnings.push(
      unresolvedLetters.length
        ? `Cheia indică varianta „${unresolvedLetters.join(', ')}", care nu apare în listă — de verificat.`
        : 'Răspuns nemarcat — de verificat.',
    );
  } else if (unresolvedLetters.length) {
    warnings.push(`Cheia mai indică varianta „${unresolvedLetters.join(', ')}", care nu apare în listă.`);
  }

  // A "complement simplu" tag can contradict the key. Trust the key for what is
  // correct, but never emit a single-choice question with several right answers
  // — at play time that is simply unanswerable.
  let multipleCorrect = block.typeIsMultiple ?? correct.size > 1;
  if (correct.size > 1 && !multipleCorrect) {
    multipleCorrect = true;
    warnings.push('Marcată „complement simplu", dar cheia indică mai multe variante — de verificat.');
  }

  const inferred = answerSource === 'explicit' && !!block.answerInferred;
  if (inferred) warnings.push('Răspuns dedus în sursă (marcat cu *) — de verificat.');
  const confidence: Confidence =
    inferred
      ? 'medium'
      : answerSource === 'explicit'
      ? 'high'
      : answerSource === 'format'
        ? 'high'
        : 'low';

  return {
    text: stem,
    options: rawOptions.map((o, i) => ({ text: o.text, isCorrect: correct.has(i) })),
    multipleCorrect,
    answerSource,
    confidence,
    warnings,
    pages: pages.length ? pages : undefined,
    specialty: block.specialty,
  };
}

// A line that's JUST a letter marker ("A." / "b)") with nothing else. Some PDF
// exporters emit the option label and its text as two separate text runs that
// our line-grouping (keyed on Y-position) can't always tell apart from two real
// lines — without this, "A." and "Carcinom anaplazic tiroidian" become two
// separate bogus options instead of one real one.
const LONE_LABEL_RE = /^\s*\(?([a-eA-E])\)?\s*[.):\-–—]?\s*$/;

/** Merge a standalone "A." label into the very next line's text: one option, not two. */
function mergeLoneOptionLabels(lines: SourceLine[]): SourceLine[] {
  const out: SourceLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    if (LONE_LABEL_RE.test(line.text) && next && next.text.trim() && !LONE_LABEL_RE.test(next.text)) {
      out.push({
        // Spread first so `page` survives — rebuilding the object from scratch
        // dropped it, which silently broke same-page image attachment.
        ...line,
        text: `${line.text.trim()} ${next.text.trim()}`,
        bold: line.bold || next.bold,
        marked: line.marked || next.marked,
      });
      i += 1; // consumed next line too
    } else {
      out.push(line);
    }
  }
  return out;
}

/**
 * Strip a leading "DA - " ("YES -") text marker and treat it as a correctness
 * signal, same as bold/color. It sits BEFORE the option letter (e.g. "DA - a)
 * Placard edematos"), which also broke plain letter detection — a)/b)/… had to
 * be at the very start of the line — silently swallowing that whole option
 * into the previous line/stem instead of recognizing it.
 */
function stripYesPrefix(lines: SourceLine[]): SourceLine[] {
  return lines.map((l) => {
    const m = l.text.match(YES_PREFIX_RE);
    // Only a marker sitting in FRONT of a real option letter counts. Applying
    // this to any line truncated legitimate answers that merely begin with
    // "Da - …" and force-marked them correct.
    if (!m || !LETTER_OPTION_RE.test(m[1])) return l;
    return { ...l, text: m[1].trim(), marked: true };
  });
}

/**
 * Strip a leading checkmark glyph ("✓ a) Placard edematos") and treat it as a
 * correctness signal, same as bold/color/the "DA -" prefix above. Runs first
 * (before stripYesPrefix/mergeLoneOptionLabels) so the remaining "a) text"
 * can still be recognized by those passes and by LETTER_OPTION_RE.
 */
function stripCheckPrefix(lines: SourceLine[]): SourceLine[] {
  return lines.map((l) => {
    if (!CHECK_PREFIX_RE.test(l.text)) return l;
    return { ...l, text: l.text.replace(CHECK_PREFIX_RE, ''), marked: true };
  });
}

const LONE_NUMBER_RE = /^\s*(\d{1,3})\s*$/;
const BARE_NUMBER_TEXT_RE = /^\s*(\d{1,3})\s+(?=[A-ZĂÂÎȘȚ])(.+)$/;
const BARE_LETTER_TEXT_RE = /^\s*([A-E])\s+(?=\S)(.+)$/;
const KEY_LINE_RE = /^\s*r[aă]spuns(?:ul)?\s*corect/i;

/**
 * Some PDF exports print the question number and the option letters with NO
 * punctuation ("1  Infecția reprezintă:" / "A  Pătrunderea…"), often as their own
 * text run — so they arrive as a lone "1" line followed by the stem, or a lone "A"
 * followed by the option text. Detects that shape (lone numbers + lone/bare letters
 * + "Răspuns corect" keys) and rewrites it to the usual "1." / "A." form.
 */
function normalizeBareNumbering(lines: SourceLine[]): SourceLine[] {
  const t = (l: SourceLine) => l.text.replace(/\u00a0/g, ' ').trim();
  let numbers = 0;
  let letters = 0;
  let keys = 0;
  for (const l of lines) {
    const x = t(l);
    if (LONE_NUMBER_RE.test(x) || BARE_NUMBER_TEXT_RE.test(x)) numbers += 1;
    else if (/^[A-E]$/.test(x) || BARE_LETTER_TEXT_RE.test(x)) letters += 1;
    else if (KEY_LINE_RE.test(x)) keys += 1;
  }
  if (numbers < 3 || letters < 6 || keys < 3) return lines;

  const out: SourceLine[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i];
    const x = t(l);
    const next = lines[i + 1];
    if (LONE_NUMBER_RE.test(x) && next && t(next)) {
      out.push({ ...l, text: `${x}. ${t(next)}`, marked: false });
      i += 1;
      continue;
    }
    const bn = x.match(BARE_NUMBER_TEXT_RE);
    if (bn) {
      out.push({ ...l, text: `${bn[1]}. ${bn[2]}`, marked: false });
      continue;
    }
    if (/^[A-E]$/.test(x) && next && t(next) && !/^[A-E]$/.test(t(next))) {
      out.push({ ...l, text: `${x}. ${t(next)}`, marked: !!l.marked || !!next.marked });
      i += 1;
      continue;
    }
    const bl = x.match(BARE_LETTER_TEXT_RE);
    if (bl) {
      out.push({ ...l, text: `${bl[1]}. ${bl[2]}` });
      continue;
    }
    out.push(l);
  }
  return out;
}

/** Drop lines repeated on many pages (running headers/footers like "Grile … setul 1 Pagina 7"). */
function dropRunningHeaders(lines: SourceLine[]): SourceLine[] {
  // Page numbers vary between repeats, so digits only collapse on page-number-ish lines.
  const key = (l: SourceLine) => {
    const t = l.text.replace(/\s+/g, ' ').trim().toLowerCase();
    return /pagin|\bpage\b|\bpag\b/.test(t) ? t.replace(/\d+/g, '#') : t;
  };
  const counts = new Map<string, number>();
  for (const l of lines) counts.set(key(l), (counts.get(key(l)) ?? 0) + 1);
  if (new Set(lines.map((l) => l.page).filter((p) => p !== undefined)).size < 4) return lines;
  const isPageLine = (l?: SourceLine) => !!l && PAGE_NUMBER_RE.test(l.text.trim());
  // Only lines glued to a "Pagina N" marker count as running headers — a repeated
  // option text ("Toate corecte") must never be dropped just for being frequent.
  return lines.filter((l, i) => {
    if (isPageLine(l)) return false;
    if (isPageLine(lines[i + 1])) {
      if (LETTER_OPTION_RE.test(l.text) || QUESTION_NUM_RE.test(l.text) || KEY_LINE_RE.test(l.text)) return true;
      return (counts.get(key(l)) ?? 0) < 4;
    }
    return true;
  });
}

/** Parse a whole document (as formatting-aware lines) into structured questions. */
export function parseGrile(rawLines: SourceLine[]): ParseResult {
  const lines = mergeLoneOptionLabels(stripYesPrefix(stripCheckPrefix(normalizeBareNumbering(dropRunningHeaders(rawLines)))));
  const blocks = segmentBlocks(lines);
  const questions: ParsedQuestion[] = [];

  for (const block of blocks) {
    const q = buildQuestion(block);
    if (q) questions.push(q);
  }

  const withAnswer = questions.filter((q) => q.answerSource !== 'none').length;
  const highConfidence = questions.filter((q) => q.confidence === 'high').length;
  const incomplete = questions.filter((q) => q.options.length < 2).length;

  return {
    questions,
    stats: {
      total: questions.length,
      withAnswer,
      highConfidence,
      needsReview: questions.length - highConfidence,
      incomplete,
    },
  };
}
