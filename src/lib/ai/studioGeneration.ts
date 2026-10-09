import type { AIContextPayload, ChunkRecord, RetrievedChunk, WeakTopic } from '../../ai/types';
import type { Difficulty, Question } from '../../types';

type StudioChunk = Pick<ChunkRecord, 'id' | 'text' | 'topic' | 'source'> | Pick<RetrievedChunk, 'id' | 'text' | 'topic' | 'source'>;
type FactKind = 'definition' | 'feature' | 'symptom' | 'treatment' | 'diagnosis' | 'evaluation' | 'objective' | 'summary';

interface FactCandidate {
  topic: string;
  kind: FactKind;
  prompt: string;
  answer: string;
}

const FACT_PATTERNS: Array<{ kind: FactKind; pattern: RegExp; buildPrompt: (topic: string) => string }> = [
  {
    kind: 'definition',
    pattern: /\b(?:este definita?|este definit prin|apare atunci cand)\b/i,
    buildPrompt: (topic) => `Cum este descrisă corect ${topic}?`,
  },
  {
    kind: 'feature',
    pattern: /\b(?:se caracterizeaza prin|caracterizata prin)\b/i,
    buildPrompt: (topic) => `Care afirmație descrie corect ${topic}?`,
  },
  {
    kind: 'symptom',
    pattern: /\b(?:simptome(?:le)?(?: frecvente)?(?: includ| sunt)?|manifestar(?:ea|ile)(?: clinice)?(?: includ| sunt)?)\b/i,
    buildPrompt: (topic) => `Care manifestare este asociată frecvent cu ${topic}?`,
  },
  {
    kind: 'treatment',
    pattern: /\b(?:tratamentul(?: .*?)?(?: include| necesita)|terapia(?: .*?)?(?: include| necesita)|conduita(?: .*?)?(?: include| necesita))\b/i,
    buildPrompt: (topic) => `Ce face parte din abordarea pentru ${topic}?`,
  },
  {
    kind: 'diagnosis',
    pattern: /\b(?:diagnosticul(?: .*?)?(?: necesita| se bazeaza pe)|trebuie suspectat[ae]? la|este esential(?:a|e)? pentru diagnostic)\b/i,
    buildPrompt: (topic) => `Ce element susține diagnosticul de ${topic}?`,
  },
  {
    kind: 'evaluation',
    pattern: /\b(?:evaluarea(?: .*?)?(?: se face prin| include)|bilantul initial(?: include| presupune))\b/i,
    buildPrompt: (topic) => `Ce intră în evaluarea inițială a ${topic}?`,
  },
  {
    kind: 'objective',
    pattern: /\b(?:obiective(?:le)?(?: majore)?(?: sunt)?|scopul(?: principal)?(?: este)?)\b/i,
    buildPrompt: (topic) => `Care este un obiectiv important în ${topic}?`,
  },
];

export const STUDIO_MAX_PACK_COUNT = 36;
export const STUDIO_MAX_QUESTIONS_PER_PACK = 60;
export const STUDIO_AI_BATCH_SIZE = 10;
const STUDIO_CONTEXT_WINDOW = 5;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function normalizeTopic(topic: string | undefined) {
  const safeTopic = normalizeText(topic ?? '');
  return safeTopic || 'subiectul selectat';
}

function trimDecorators(text: string) {
  return normalizeText(text)
    .replace(/^[•\-–:;,.\s]+/, '')
    .replace(/[•\-–:;,.\s]+$/, '');
}

function toSentenceCase(text: string) {
  const trimmed = trimDecorators(text);
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function stripDiacritics(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function countWords(text: string) {
  return normalizeText(text).split(/\s+/).filter(Boolean).length;
}

function shortenOption(text: string, maxWords = 14, maxChars = 100) {
  const cleaned = toSentenceCase(text)
    .replace(/\b(?:prin|cu|care|iar|unde)\b\s*$/i, '')
    .replace(/\s+/g, ' ');

  if (!cleaned) return '';

  const commaParts = cleaned.split(/\s*[;,]\s*/).map(trimDecorators).filter(Boolean);
  const candidate = commaParts.find((part) => countWords(part) >= 2 && countWords(part) <= maxWords) ?? commaParts[0] ?? cleaned;
  const words = candidate.split(/\s+/);

  if (candidate.length <= maxChars && words.length <= maxWords) {
    return candidate;
  }

  const shortened = words.slice(0, maxWords).join(' ');
  return shortened.length > maxChars ? `${shortened.slice(0, maxChars - 1).trim()}…` : shortened;
}

function splitIntoSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((entry) => normalizeText(entry))
    .filter((entry) => entry.length >= 30);
}

/**
 * Match a FACT_PATTERN ignoring Romanian diacritics, then return the clause that
 * follows it — sliced from the ORIGINAL sentence so the answer keeps diacritics.
 * Stripping NFD combining marks preserves 1:1 character offsets (each precomposed
 * letter → one base letter), so the ASCII match index maps back exactly.
 */
function extractTail(sentence: string, pattern: RegExp, ascii = stripDiacritics(sentence)) {
  const match = ascii.match(pattern);
  if (!match || typeof match.index !== 'number') return '';
  return sentence.slice(match.index + match[0].length).replace(/^[:\s-]+/, '').replace(/[.]+$/, '').trim();
}

/**
 * Rejects sentence fragments that read as broken/unprofessional as a quiz
 * option: unbalanced parentheses ("…gălbuie (ex"), a dangling opener, a trailing
 * connector word (clause cut mid-thought), or trailing punctuation.
 */
/**
 * `allowTrailingColon` exists for question stems: the rezidențiat format ends
 * the stem with a colon that the options complete ("Sifilisul este cauzat de:"),
 * and the dangling-punctuation rule below would otherwise throw away every
 * exam-shaped question we generate. Options themselves must still end cleanly.
 */
function isCleanOptionText(text: string, options: { allowTrailingColon?: boolean } = {}): boolean {
  const t = normalizeText(text);
  if (!t) return false;
  const open = (t.match(/\(/g) ?? []).length;
  const close = (t.match(/\)/g) ?? []).length;
  if (open !== close) return false;
  if (/\($/.test(t)) return false;
  // Truncated abbreviation like "(ex", "(de ex", "(vezi …" with no closing paren.
  if (/\(\s*(?:ex|de|cf|vezi|fig)\b[^)]*$/i.test(t)) return false;
  // Clause cut mid-thought on a connector.
  if (/\b(?:prin|cu|care|iar|unde|de|in|într|la|pe|si|și|sau|ca|spre|din|sub|fără|fara|după|dupa|pentru)\s*$/i.test(t)) return false;
  // Must not end on dangling punctuation.
  if (options.allowTrailingColon ? /[,;\-–(]$/.test(t) : /[,;:\-–(]$/.test(t)) return false;
  return true;
}

function extractFactCandidates(chunk: StudioChunk): FactCandidate[] {
  const topic = normalizeTopic(chunk.topic);
  const sentences = splitIntoSentences(chunk.text);
  const facts: FactCandidate[] = [];

  sentences.forEach((sentence) => {
    const asciiSentence = stripDiacritics(sentence);
    FACT_PATTERNS.forEach(({ kind, pattern, buildPrompt }) => {
      if (!pattern.test(asciiSentence)) return;
      const tail = shortenOption(extractTail(sentence, pattern, asciiSentence), 14, 100);
      if (!tail || countWords(tail) < 2 || !isCleanOptionText(tail)) return;
      facts.push({
        topic,
        kind,
        prompt: buildPrompt(topic),
        answer: tail,
      });
    });

    // NOTE: the old generic "Care afirmație este corectă despre {topic}?" summary
    // fallback was removed — it paired a vague prompt with a raw sentence
    // fragment (often truncated mid-word, e.g. "…gălbuie (ex"), which produced
    // unprofessional questions. We now only keep pattern-matched, clean facts.
  });

  // Duplicates (within and across chunks) are removed once, in uniqueFacts().
  return facts;
}

/** First occurrence wins; Set lookup instead of a findIndex scan per fact. */
function dedupeFacts(facts: FactCandidate[]): FactCandidate[] {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = `${fact.kind}\u0000${fact.topic}\u0000${fact.answer}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hashSeed(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function rotateIndex(length: number, seed: number) {
  if (length <= 0) return 0;
  return Math.abs(seed) % length;
}

function buildOptionId(questionIndex: number, optionIndex: number) {
  return `studio-${questionIndex}-${optionIndex}-${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`;
}

function buildExplanation(topic: string) {
  return `Varianta corectă urmărește exact ideea-cheie despre „${topic}". Celelalte opțiuni provin din concepte apropiate, dar diferite — compară-le cu mecanismul central înainte să alegi.`;
}

function buildTags(topic: string, sourceName: string) {
  const topicTokens = stripDiacritics(topic)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 3);

  return Array.from(new Set(['ai-studio', stripDiacritics(sourceName).toLowerCase(), ...topicTokens])).slice(0, 5);
}

function isBadStudioPrompt(text: string, sourceName: string) {
  const normalized = stripDiacritics(text).toLowerCase();
  const safeSourceName = stripDiacritics(sourceName).toLowerCase();

  return normalized.includes(safeSourceName)
    || /\.pdf\b|\.docx\b|\.pptx\b|cursul incarcat|documentul|fisierul|materialul incarcat/.test(normalized);
}

export function clampStudioPackCount(value: number) {
  return clamp(value, 1, STUDIO_MAX_PACK_COUNT);
}

export function clampStudioQuestionCount(value: number) {
  return clamp(value, 1, STUDIO_MAX_QUESTIONS_PER_PACK);
}

export function buildStudioContextPayload({
  sourceName,
  chunks,
  packIndex,
  totalPacks,
  difficulty,
  weakTopics = [],
}: {
  sourceName: string;
  chunks: StudioChunk[];
  packIndex: number;
  totalPacks: number;
  difficulty: Difficulty;
  weakTopics?: WeakTopic[];
}): AIContextPayload {
  const safeWindowSize = clamp(totalPacks > 3 ? STUDIO_CONTEXT_WINDOW : STUDIO_CONTEXT_WINDOW + 1, 4, 6);
  const maxStart = Math.max(0, chunks.length - safeWindowSize);
  const start = maxStart === 0 ? 0 : (packIndex * 3) % (maxStart + 1);
  const scopedChunks = chunks.slice(start, start + safeWindowSize);
  const focusTopics = Array.from(new Set(scopedChunks.map((chunk) => normalizeTopic(chunk.topic)))).slice(0, 4);
  const weakTopicSummary = weakTopics.slice(0, 4).map((entry) => entry.topic).join(', ');
  const summary = scopedChunks
    .map((chunk, index) => `Fragment ${index + 1} | ${normalizeTopic(chunk.topic)}\n${normalizeText(chunk.text).slice(0, 1000)}`)
    .join('\n\n');

  return {
    query: `Întrebări despre ${focusTopics.join(', ') || 'temele selectate'}`,
    summary: [
      `Document sursă: ${sourceName}`,
      `Teme prioritare pentru acest pachet: ${focusTopics.join(', ') || 'temele selectate'}.`,
      weakTopicSummary ? `Puncte slabe ale utilizatorului de urmărit: ${weakTopicSummary}.` : '',
      'Generează întrebări numai din conținutul medical de mai jos.',
      'Nu menționa numele documentului, numele fișierului sau formulări precum "cursul încărcat" în întrebare ori în opțiuni.',
      'Opțiunile trebuie să fie concise și utile pentru examen, nu propoziții lungi copiate integral.',
      '',
      summary,
    ].filter(Boolean).join('\n'),
    chunks: scopedChunks.map((chunk) => ({
      ...chunk,
      difficulty,
      score: 1,
      keywordScore: 1,
      semanticScore: 1,
      recencyBoost: 0,
      weaknessBoost: 0,
    })),
    weakTopics,
    level: difficulty,
  };
}

export function isStudioQuestionQualityAcceptable(question: Question, sourceName: string) {
  const correctCount = question.options.filter((option) => option.isCorrect).length;
  if (question.multipleCorrect || correctCount > 1) {
    // Complement multiplu: 4-6 opțiuni cu 2-4 răspunsuri corecte (în bancă: 1-4, cel mai des 3).
    if (question.options.length < 4 || question.options.length > 6) return false;
    if (correctCount < 2 || correctCount > 4) return false;
  } else {
    // Complement simplu: 4-5 opțiuni, exact 1 corectă. Rezidențiatul cere 5
    // (A-E) și asta cerem și noi generatorului, dar seturile create înainte de
    // calibrare au 4 și nu au de ce să fie respinse la revalidare.
    if (question.options.length < 4 || question.options.length > 5) return false;
    if (correctCount !== 1) return false;
  }
  if (question.text.length < 18 || question.text.length > 180) return false;
  if (isBadStudioPrompt(question.text, sourceName)) return false;
  if (!isCleanOptionText(question.text, { allowTrailingColon: true })) return false;

  // The correct answer must not be copied verbatim into the question stem — that
  // happened when a bad chunk topic ("Se disting două tipuri") became both the
  // question subject and the correct option.
  const correctText = normalizeText(question.options.find((option) => option.isCorrect)?.text ?? '');
  if (correctText && normalizeText(question.text).toLowerCase().includes(correctText.toLowerCase())) {
    return false;
  }

  return question.options.every((option) => {
    const text = normalizeText(option.text);
    if (!text || text.length > 120) return false;
    if (countWords(text) < 2 || countWords(text) > 18) return false;
    if (isBadStudioPrompt(text, sourceName)) return false;
    if (!isCleanOptionText(text)) return false;
    return true;
  });
}

export function buildFallbackQuestionsFromChunks({
  sourceName,
  chunks,
  count,
  difficulty,
  packIndex,
}: {
  sourceName: string;
  chunks: StudioChunk[];
  count: number;
  difficulty: Difficulty;
  packIndex: number;
}): Question[] {
  const requestedCount = clamp(count, 1, STUDIO_MAX_QUESTIONS_PER_PACK);
  const factPool = chunks.flatMap((chunk) => extractFactCandidates(chunk));
  const uniqueFacts = dedupeFacts(factPool);

  if (uniqueFacts.length < 4) {
    return [];
  }

  const questions: Question[] = [];
  const usedQuestionSignatures = new Set<string>();

  for (let questionIndex = 0; questionIndex < requestedCount; questionIndex += 1) {
    const baseSeed = hashSeed(`${sourceName}-${packIndex}-${questionIndex}`);
    const correct = uniqueFacts[rotateIndex(uniqueFacts.length, baseSeed)];
    const signature = `${correct.prompt}::${correct.answer}`;
    if (usedQuestionSignatures.has(signature)) continue;

    const preferredDistractors = uniqueFacts.filter((entry) => entry.answer !== correct.answer && entry.topic !== correct.topic && entry.kind === correct.kind);
    const fallbackDistractors = uniqueFacts.filter((entry) => entry.answer !== correct.answer && entry.topic !== correct.topic);
    const distractorSource = preferredDistractors.length >= 3 ? preferredDistractors : fallbackDistractors;

    if (distractorSource.length < 3) continue;

    const distractorStart = rotateIndex(distractorSource.length, baseSeed + 11);
    // Walk the pool cyclically from distractorStart, keeping the first 3 entries
    // with distinct answers (stops early instead of de-duplicating the whole pool).
    const distractors: FactCandidate[] = [];
    const distractorAnswers = new Set<string>();
    for (let offset = 0; offset < distractorSource.length && distractors.length < 3; offset += 1) {
      const entry = distractorSource[(distractorStart + offset) % distractorSource.length];
      if (distractorAnswers.has(entry.answer)) continue;
      distractorAnswers.add(entry.answer);
      distractors.push(entry);
    }

    if (distractors.length < 3) continue;

    const correctSlot = rotateIndex(4, baseSeed + 7);
    const optionTexts = distractors.map((entry) => entry.answer);
    optionTexts.splice(correctSlot, 0, correct.answer);

    const question: Question = {
      id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
      text: correct.prompt,
      options: optionTexts.map((optionText, optionIndex) => ({
        id: buildOptionId(questionIndex, optionIndex),
        text: optionText,
        isCorrect: optionText === correct.answer,
      })),
      explanation: buildExplanation(correct.topic),
      difficulty,
      tags: buildTags(correct.topic, sourceName),
    };

    if (!isStudioQuestionQualityAcceptable(question, sourceName)) continue;

    questions.push(question);
    usedQuestionSignatures.add(signature);
  }

  return questions;
}
