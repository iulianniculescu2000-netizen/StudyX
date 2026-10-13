import type { Confidence, Difficulty, Question, QuestionStat } from '../types';

export type AIRequestTask =
  | 'questions'
  | 'explanation'
  | 'mnemonic'
  | 'hint'
  | 'chat'
  | 'analysis';

export interface WeakTopic {
  topic: string;
  accuracy: number;
  wrongCount: number;
  total: number;
  recencyScore: number;
}

export interface RecentMistake {
  questionId: string;
  topic: string;
  answer: string;
  correctAnswer: string;
  mistakeType?: string;
  timestamp: number;
}

export interface MistakeBankEntry {
  id: string;
  questionId: string;
  questionText: string;
  topic: string;
  userAnswer: string;
  correctAnswer: string;
  explanation?: string;
  mistakeType?: string;
  missingConcept?: string;
  recommendedTopic?: string;
  mnemonic?: string;
  sourceRefs?: string[];
  createdAt: number;
  wrongCount: number;
}

export type TopicTrend = 'improving' | 'stable' | 'worsening';

export interface TopicPerformance {
  correct: number;
  total: number;
  accuracy: number;
  /** Rolling last-10 outcomes (oldest→newest), used to derive `TopicTrend`. */
  recent: boolean[];
  lastSeen: number;
}

export interface StrongTopic {
  topic: string;
  accuracy: number;
  total: number;
}

export interface StudyPatterns {
  /** Minutes, average of the last 20 sessions. */
  preferredSessionLength: number;
  /** Hour of day (0-23) with the highest accuracy, or null until enough samples exist. */
  bestPerformanceHour: number | null;
  /** 0-1, average of the last 100 self-rated confidence values. */
  averageConfidence: number;
}

export interface UserProfileData {
  profileId: string;
  globalAccuracy: number;
  topicAccuracy: Record<string, TopicPerformance>;
  strongTopics: StrongTopic[];
  studyPatterns: StudyPatterns;
  recentMistakes: RecentMistake[];
  mistakeBank: MistakeBankEntry[];
  currentDifficulty: Difficulty;
  streak: number;
  recentQuestions: string[];
  updatedAt: number;
  /** Bumped when the stored shape changes in a way that needs a one-time migration. */
  schemaVersion: number;
  // Internal rolling aggregates backing `studyPatterns` — not part of the "public" API,
  // kept on the same record for simplicity (mirrors the shape userMemory.ts used to own).
  _hourStats: Record<string, { correct: number; total: number }>;
  _sessionLengths: number[];
  _confidences: number[];
}

export interface RecordQuizSessionInput {
  /** Authoritative SM-2 per-question outcome map (statsStore's questionStats). */
  stats: Record<string, QuestionStat>;
  questions: WeakTopicInput['questions'];
  streak: number;
  /** Per-question outcome for *this* session only — not derivable from `stats` alone. */
  sessionItems: Array<{
    questionId: string;
    correct: boolean;
    confidence?: Confidence;
    userAnswer?: string;
    correctAnswer?: string;
  }>;
  durationSeconds: number;
  finishedAt: number;
}

export interface RetrievedChunk {
  id: string;
  sourceId?: string;
  text: string;
  topic: string;
  source: string;
  difficulty: Difficulty;
  score: number;
  keywordScore: number;
  semanticScore: number;
  recencyBoost: number;
  weaknessBoost: number;
  /** Pagina din document (index de pagină PDF, de la 1), dacă parserul a știut-o. */
  page?: number;
  pageEnd?: number;
  /** Numărul tipărit pe pagină în carte (ex. 1136), când parserul îl știe. */
  printedPage?: number;
  heading?: string;
  chapter?: string;
}

export interface AIContextPayload {
  query: string;
  summary: string;
  chunks?: ChunkRecord[] | RetrievedChunk[];
  weakTopics?: WeakTopic[];
  recentMistakes?: RecentMistake[];
  level?: Difficulty;
  availableTime?: number;
}

export interface AIAnalysisResult {
  explanation: string;
  mistakeType: string;
  rule: string;
  confidence: number;
  missingConcept?: string;
  recommendedTopic?: string;
  relatedConcepts?: string[];
  sources?: string[];
}

export interface AIQuestionRequest {
  context: string;
  count?: number;
  difficulty?: Difficulty;
  weakTopics?: WeakTopic[];
  userProfile?: UserProfileData;
  mode?: 'standard' | 'exam' | 'tutor';
  /** 'multiple' = complement multiplu (2-4 răspunsuri corecte). Default 'single'. */
  questionType?: 'single' | 'multiple';
  /** Optional mix of question shapes to spread across the batch (Task 3). */
  questionTypes?: import('../lib/ai/questionTypes').QuestionType[];
  /** Which track to generate: rezidențiat (5 options) or plain subject quiz (4). */
  examStyle?: import('../lib/ai/examStyle').ExamStyle;
  prefetchedContext?: AIContextPayload;
  /**
   * Subiect obligatoriu: toate întrebările rămân pe el. Taie din prompt topicurile slabe și istoricul de greșeli
   * (care împingeau modelul spre alte patologii) și adaugă regula explicită. Fără el, generarea rămâne personalizată.
   */
  subject?: string;
  /** Enunțuri deja acceptate, pe care modelul nu trebuie să le repete (cererile de completare). */
  avoidTexts?: string[];
}

export interface AIQuestionResult {
  questions: Question[];
  sources: string[];
  mode: 'standard' | 'exam' | 'tutor';
  /** How many questions the medical-correctness pass dropped (0 if none/unavailable). */
  medicallyFlaggedCount?: number;
  /** How many raw model questions were dropped as malformed (empty text, no valid options, no correct answer) before the medical pass ever saw them. */
  malformedDroppedCount?: number;
  flaggedReasons?: string[];
  /** Câte întrebări s-au cerut și câte runde de completare au fost necesare (0 = primul lot a ajuns). */
  requested?: number;
  topUpRounds?: number;
}

export interface AINextQuestionState {
  previousQuestions: string[];
  weakTopics: WeakTopic[];
  recentMistakes: RecentMistake[];
  accuracy: number;
  streak: number;
  availableTime?: number;
  preferredDifficulty?: Difficulty;
}

export interface AdaptiveDifficultyInput {
  accuracy: number;
  streak: number;
  time?: number;
}

export interface ChunkRecord {
  id: string;
  sourceId?: string;
  text: string;
  topic: string;
  source: string;
  difficulty: Difficulty;
  embedding: number[];
  createdAt: number;
  /** Nearest preceding detected chapter/section heading, if any (best-effort). */
  heading?: string;
  /** Pagina PDF (de la 1) la care începe fragmentul; absentă la bibliotecile mai vechi și la surse fără pagini. */
  page?: number;
  /** Pagina la care se termină, dacă diferă de `page`. */
  pageEnd?: number;
  /** Numărul tipărit pe pagină în carte (ex. 1136), când parserul îl știe. */
  printedPage?: number;
  /** Capitolul din lista curriculară verificată a cărții, când sursa e o carte cunoscută. */
  chapter?: string;
}

export interface CoverageRecord {
  topic: string;
  coverageScore: number;
  lastUpdated: number;
}

export interface ValidateJsonResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
  repaired?: string;
}

export interface QuestionGenerationResponse {
  questions: Array<{
    text: string;
    options: Array<{ text: string; isCorrect: boolean }>;
    explanation: string;
    tags?: string[];
    difficulty?: Difficulty;
    sources?: string[];
    type?: import('../lib/ai/questionTypes').QuestionType;
  }>;
}

export interface HintResult {
  light: string;
  medium: string;
  full: string;
}

export interface TutorSessionState {
  currentTopic: string;
  difficulty: Difficulty;
  progress: number;
  questionIds: string[];
}

/**
 * One distractor, analysed. `buildWrongOptionsPrompt` asks the model for all
 * four fields, but the type only modelled the first two, so the reasoning about
 * when an option WOULD be right — the genuinely instructive part — was parsed
 * and then dropped on the floor.
 */
export interface WrongOptionAnalysis {
  option: string;
  whyWrong: string;
  /** The context in which this option would have been the correct one. */
  whenCorrect?: string;
  /** The classic exam confusion this distractor is testing for. */
  classicConfusion?: string;
}

export interface ExplainWrongOptionsResult {
  options: WrongOptionAnalysis[];
}

export type TopicStatsMap = Record<string, { correct: number; total: number; wrong: number; lastWrongAt: number }>;

export interface WeakTopicInput {
  stats: Record<string, QuestionStat>;
  /** `category` is the parent quiz's category — used as a fallback grouping when a question has no tags. */
  questions: Array<Pick<Question, 'id' | 'tags' | 'text'> & { category?: string }>;
}
