import type { AIAnalysisResult, HintResult } from '../ai/types';
import type { Option, Question } from '../types';

function normalizeInlineText(value?: string | null) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

// Internal/meta tags that must never surface as a study "topic" to the user.
const META_TAGS = new Set([
  'ai-studio', 'document-pack', 'ai', 'pdf', 'docx', 'pptx', 'txt', 'image', 'visual',
  'flashcard', 'deck', 'manual', 'quick', 'document', 'curs', 'cursul',
]);

function isMetaTag(tag: string) {
  const t = tag.trim().toLowerCase();
  if (!t || META_TAGS.has(t)) return true;
  if (/^\d+$/.test(t)) return true;                 // pure numbers ("1")
  if (/\.(pdf|docx|pptx|txt)\b/.test(t)) return true; // filename-ish ("cursul 1.pdf")
  if (/^curs(ul)?\b/.test(t)) return true;           // source-name artifacts
  return false;
}

/** True when an explanation is the baked meta-text that leaks document/fragment names. */
function isMetaExplanation(text?: string | null) {
  const t = normalizeInlineText(text).toLowerCase();
  if (!t) return true;
  return /din documentul|fragmentul despre|intrebarea este construita|întrebarea este construită|\.pdf\b|\.docx\b|cursul incarcat|cursul încărcat/.test(t);
}

/**
 * Explanation safe to render under a question. Hides the legacy baked meta-text
 * ("Întrebarea este construită din fragmentul ... din documentul X.pdf") that
 * leaked into older AI-generated sets, so the UI shows nothing instead of junk.
 */
export function cleanQuestionExplanation(text?: string | null): string {
  return isMetaExplanation(text) ? '' : normalizeInlineText(text);
}

// Common short Romanian function words (interrogatives, articles, prepositions,
// conjunctions) that happen to clear the ">=4 chars" bar in pickLeadKeywords but
// are never a real topic — "Care clasă de medicamente e contraindicată..." was
// producing the "topic" *"Care"* (the question's own first word) as a fallback
// hint anchor, which reads as nonsense to the user ("Gândește-te la Care...").
const LEAD_KEYWORD_STOPWORDS = new Set([
  'care', 'ceea', 'este', 'sunt', 'fost', 'fiind', 'daca', 'dacă', 'sau', 'unde',
  'cand', 'când', 'cum', 'catre', 'către', 'dupa', 'după', 'peste', 'intre',
  'între', 'prin', 'fara', 'fără', 'asupra', 'toate', 'toti', 'toți', 'orice',
  'fiecare', 'atunci', 'dintre', 'despre', 'unei', 'unui', 'acei', 'acele',
  'acest', 'această', 'aceasta', 'acesti', 'aceștia', 'aceste', 'acel', 'acea',
  'cele', 'cei', 'din', 'spre', 'pana', 'până', 'insa', 'însă', 'insă', 'deci',
  'deoarece', 'pentru', 'poate', 'trebuie', 'exista', 'există', 'avand', 'având',
]);

function pickQuestionTopic(question: Question) {
  const realTag = question.tags?.find((tag) => tag && !isMetaTag(tag))?.trim();
  if (realTag) return realTag;
  // No usable tag — derive a topic anchor from the question text itself.
  const keyword = pickLeadKeywords(question.text, 1)[0];
  return keyword || question.difficulty || 'conceptul-cheie';
}

function pickLeadKeywords(text: string, limit = 3) {
  const words = normalizeInlineText(text)
    .split(/[^A-Za-z0-9ĂÂÎȘȚăâîșț]+/)
    .filter((word) => word.length >= 4 && !LEAD_KEYWORD_STOPWORDS.has(word.toLowerCase()));
  return uniqueStrings(words).slice(0, limit);
}

function summarizeExplanation(explanation?: string, maxLength = 220) {
  const clean = normalizeInlineText(explanation);
  if (!clean) return '';
  if (clean.length <= maxLength) return clean;

  const sentenceBreak = clean.lastIndexOf('. ', maxLength);
  if (sentenceBreak > 80) {
    return `${clean.slice(0, sentenceBreak + 1).trim()}`;
  }

  return `${clean.slice(0, maxLength).trim()}...`;
}

export function getCorrectOptionTexts(options: Option[]) {
  return options.filter((option) => option.isCorrect).map((option) => normalizeInlineText(option.text)).filter(Boolean);
}

export function getCorrectAnswerText(question: Question) {
  return getCorrectOptionTexts(question.options).join(', ');
}

export function getAnswerTextForOptionIds(
  options: Option[],
  selectedIds: string[],
  emptyFallback = 'niciun raspuns',
) {
  const selected = options
    .filter((option) => selectedIds.includes(option.id))
    .map((option) => normalizeInlineText(option.text))
    .filter(Boolean);

  return selected.length > 0 ? selected.join(', ') : emptyFallback;
}

export function buildHintFallback(question: Question): HintResult {
  const topic = pickQuestionTopic(question);
  const correctAnswer = getCorrectAnswerText(question) || 'varianta corecta';
  const explanationSummary = isMetaExplanation(question.explanation)
    ? ''
    : summarizeExplanation(question.explanation, 200);
  const anchorWords = pickLeadKeywords(correctAnswer, 2);
  const keywordHint = anchorWords.length > 0
    ? `Cauta varianta care se leaga direct de ${anchorWords.join(' si ')}.`
    : 'Cauta varianta care respecta criteriul cerut exact in intrebare.';

  return {
    light: `Gandeste-te mai intai la ${topic} si elimina variantele care suna corect, dar nu raspund exact la ce se cere.`,
    medium: `${keywordHint} Verifica mecanismul central, nu doar termenii familiari.`,
    full: explanationSummary
      ? `Raspunsul corect este: ${correctAnswer}. ${explanationSummary}`
      : `Raspunsul corect este: ${correctAnswer}.`,
  };
}

export function buildAnalysisFallback({
  question,
  userAnswer,
  correctAnswer,
  isCorrect,
}: {
  question: Question;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
}): AIAnalysisResult {
  const topic = pickQuestionTopic(question);
  const explanationSummary = isMetaExplanation(question.explanation)
    ? ''
    : summarizeExplanation(question.explanation, 240);
  const relatedConcepts = uniqueStrings([topic, ...(question.tags ?? []).filter((tag) => !isMetaTag(tag))]).slice(0, 5);
  const rule = explanationSummary || `Compara fiecare varianta doar cu criteriul principal din intrebare si revino la ${topic} cand ai dubii.`;
  const answerLabel = normalizeInlineText(userAnswer);
  const answerPrefix = answerLabel && answerLabel !== 'niciun raspuns'
    ? `Raspunsul tau (${answerLabel})`
    : 'Nu ai confirmat un raspuns';
  const correctOptionLine = correctAnswer
    ? `Varianta corecta este ${correctAnswer}: ea raspunde cel mai direct la mecanismul sau criteriul cerut.`
    : 'Varianta corecta trebuie legata de mecanismul central al intrebarii.';
  const selectedOptionLine = answerLabel && answerLabel !== 'niciun raspuns'
    ? `${answerPrefix} este gresit sau incomplet cand nu explica acel mecanism-cheie.`
    : `${answerPrefix}; trateaza asta ca pe un semn ca trebuie reconstruit rationamentul de la mecanism spre raspuns.`;
  const wrongDistractors = question.options
    .filter((option) => !option.isCorrect)
    .map((option) => normalizeInlineText(option.text))
    .filter((text) => text && text !== answerLabel)
    .slice(0, 2);
  const distractorLine = wrongDistractors.length > 0
    ? `Distractorii precum ${wrongDistractors.join(' / ')} pot suna plauzibil, dar pica daca ii compari strict cu datele din intrebare.`
    : 'Distractorii pica atunci cand ii compari strict cu datele din intrebare, nu cu termenii familiari.';
  const mechanismLine = `Fiziologic/fiziopatologic, porneste de la ${topic}: identifica procesul afectat, apoi semnul clinic, diagnosticul sau tratamentul care decurge logic din el.`;

  const explanation = isCorrect
    ? explanationSummary
      ? `Ai ales corect. ${correctOptionLine} ${mechanismLine} ${explanationSummary}`
      : `Ai ales corect. ${correctOptionLine} ${mechanismLine} Pastreaza in minte criteriul central pentru ${topic}.`
    : explanationSummary
      ? `${selectedOptionLine} ${correctOptionLine} ${distractorLine} ${mechanismLine} ${explanationSummary}`
      : `${selectedOptionLine} ${correctOptionLine} ${distractorLine} ${mechanismLine} Revino la ${topic} si compara mecanismul-cheie cu fiecare optiune.`;

  return {
    explanation,
    mistakeType: isCorrect
      ? 'Raspuns corect consolidat'
      : answerLabel && answerLabel !== 'niciun raspuns'
        ? 'Confuzie intre optiuni apropiate'
        : 'Lipsa de confirmare',
    rule,
    confidence: isCorrect ? 0.74 : 0.58,
    missingConcept: topic,
    recommendedTopic: topic,
    relatedConcepts,
    sources: relatedConcepts.slice(0, 3),
  };
}

export function buildMnemonicFallback(concept: string, correctAnswer: string) {
  const cleanConcept = normalizeInlineText(concept) || 'conceptul';
  const cleanAnswer = normalizeInlineText(correctAnswer) || 'raspunsul corect';
  // Long inputs are usually copied sentences — compress to keywords so the
  // mnemonic stays short instead of echoing the whole phrase twice.
  const conceptLabel = cleanConcept.length > 70
    ? (pickLeadKeywords(cleanConcept, 4).join(' ') || cleanConcept.slice(0, 60))
    : cleanConcept;
  const keywords = pickLeadKeywords(cleanAnswer, 5);
  const isSentence = cleanAnswer.split(/\s+/).filter(Boolean).length > 2;

  if (isSentence && keywords.length >= 2) {
    const acronym = keywords.map((word) => word[0]?.toUpperCase() ?? '').join('');
    return `Pentru „${conceptLabel}", reține acronimul **${acronym}** din cuvintele-cheie: ${keywords.join(', ')}. Repetă-l de câteva ori până se fixează.`;
  }

  // Short, single-term answer — anchor directly on the term.
  return `Pentru „${conceptLabel}", ancorează în minte termenul-cheie **${cleanAnswer}**. Asociază-l cu o imagine clară ca să-l reții mai ușor.`;
}

export function buildClarificationFallback(
  question: Question,
  userAnswerText: string,
  correctAnswerText: string,
) {
  return buildAnalysisFallback({
    question,
    userAnswer: userAnswerText,
    correctAnswer: correctAnswerText,
    isCorrect: false,
  }).explanation;
}
