export interface Option {
  id: string;
  text: string;
  isCorrect: boolean;
}

export type Difficulty = 'easy' | 'medium' | 'hard';
export type QuizColor = 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'red' | 'teal';

export interface Question {
  id: string;
  text: string;
  imageUrl?: string; // base64 data URL or external URL
  options: Option[];
  explanation?: string;
  multipleCorrect?: boolean;
  difficulty?: Difficulty;
  tags?: string[];
  /** Shape of the question (definition, clinical_case, ...) when AI-generated. */
  type?: import('../lib/ai/questionTypes').QuestionType;
  /** Duplicate copy the user hid from study sessions (reversible; the question and its stats stay). */
  hidden?: boolean;
}

export interface Quiz {
  id: string;
  title: string;
  description: string;
  emoji: string;
  category: string;
  /**
   * How this set was created and should always be studied:
   * 'flashcard' = active-recall deck (flip cards), 'quiz' = multiple-choice grilă.
   * Set explicitly at creation so a flashcard never opens as a quiz (and vice
   * versa). When absent (legacy sets), fall back to isFlashcardDeck() heuristics.
   */
  kind?: 'quiz' | 'flashcard';
  folderId?: string | null;
  questions: Question[];
  createdAt: number;
  updatedAt?: number;
  color: QuizColor;
  shuffleQuestions?: boolean;
  shuffleAnswers?: boolean;
  pinned?: boolean;
  archived?: boolean;
  tags?: string[];
  /** Rezidențiat scoring: -0.25 pts per wrong option selected, +1 per correct */
  penaltyMode?: boolean;
}

export interface Folder {
  id: string;
  name: string;
  emoji: string;
  color: QuizColor;
  createdAt: number;
  parentId?: string | null;
  /** `'flashcards'`: creat din Flashcarduri; nu se arată în bara laterală și în Grile. */
  scope?: 'flashcards';
}

export interface QuizSession {
  id: string;
  quizId: string;
  answers: Record<string, string[]>;
  startedAt: number;
  finishedAt?: number;
  score: number;
  total: number;
  mode: 'study' | 'test' | 'exam';
  timePerQuestion?: Record<string, number>; // questionId -> seconds
  /** Only set when quiz.penaltyMode is true. Score net: +1 correct, -0.25/wrong option */
  penalizedScore?: number;
  /** Question IDs answered partially correct (some correct selected, no wrong selected) */
  partialAnswers?: string[];
}

/**
 * Self-assessment of how the user knew an answer, captured after reveal in quiz
 * play. Feeds the SM-2 quality score so spaced repetition reflects genuine
 * recall, not lucky guesses.
 */
export type Confidence = 'blackout' | 'guess' | 'confident';

// Spaced repetition per question
export interface QuestionStat {
  questionId: string;
  quizId: string;
  timesCorrect: number;
  timesWrong: number;
  lastSeen: number;
  nextReview: number; // timestamp
  interval: number; // days until next review
  eFactor?: number; // SM-2 ease factor (default 2.5)
  consecutiveCorrect?: number; // SM-2: resetat la 0 la greșeală, folosit pentru faza de repetare
  lastConfidence?: Confidence; // ultima auto-evaluare (Task 2 → quality SM-2)
  retired?: boolean; // istoric copiat pe pachetele de capitol: rămâne la sursă pentru „Anulează”, dar nu se mai numără
}

export interface StudyStreak {
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: string; // YYYY-MM-DD
  studyDates: string[]; // all dates studied
}

// JSON import/export format
export interface QuizImportData {
  title: string;
  description?: string;
  emoji?: string;
  category?: string;
  color?: QuizColor;
  shuffleQuestions?: boolean;
  shuffleAnswers?: boolean;
  questions: {
    text: string;
    imageUrl?: string;
    multipleCorrect?: boolean;
    explanation?: string;
    difficulty?: Difficulty;
    tags?: string[];
    options: { text: string; isCorrect: boolean }[];
  }[];
}
