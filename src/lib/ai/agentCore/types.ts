import { type ExamStyle } from '../examStyle';

export type AgentActionType =
  | 'create_folder'
  | 'create_library_folder'
  | 'generate_quiz_pack'
  | 'generate_quiz_topic'
  | 'generate_from_mistakes'
  | 'correct_answer'
  | 'create_flashcards'
  | 'create_flashcards_topic'
  | 'summarize_document'
  | 'create_study_plan'
  | 'move_quiz'
  | 'rename_quiz'
  | 'delete_quiz'
  | 'rename_folder'
  | 'delete_folder';

export interface AgentStep {
  action: AgentActionType;
  name?: string;
  newName?: string;
  parent?: string;
  source?: string;
  /** For generate_quiz_topic: freeform subject when no library course matches (e.g. "fiziologia plămânului"). */
  topic?: string;
  folder?: string;
  /** Folder ales explicit (din „cartea de opțiuni” a chatului): are prioritate față de `folder`, care e doar un nume. */
  folderId?: string;
  quiz?: string;
  packCount?: number;
  questionsPerPack?: number;
  /** For create_flashcards: number of cards to generate. */
  count?: number;
  /** For generate_quiz_pack: single-answer (complement simplu) vs multi-answer. */
  questionType?: 'single' | 'multiple';
  /** Which track: rezidențiat (5 variante A-E) or a plain subject quiz (4, A-D). */
  examStyle?: ExamStyle;
  difficulty?: 'auto' | 'easy' | 'medium' | 'hard';
  /** For create_study_plan: exam name, number of study days, hours per day. */
  examName?: string;
  studyDays?: number;
  hoursPerDay?: number;
  /** For correct_answer: exact quiz/question identity (never guessed from text). */
  quizId?: string;
  questionId?: string;
  correctOptionIds?: string[];
  /** Human-readable letter(s) for correctOptionIds ("varianta C"), resolved once at plan time — so the confirm card can show exactly what will change instead of a vague "updating the answer". */
  correctLabel?: string;
  reasoning?: string;
  groundedIn?: 'course' | 'general' | 'user_claim';
}

export interface AgentPlan {
  isCommand: boolean;
  reply: string;
  steps: AgentStep[];
  needsConfirm: boolean;
  confirmReason?: string;
  /**
   * True when the message clearly wanted an action but the planner is missing
   * something it needs to build valid steps (which course, which folder, how
   * many). `reply` then holds the actual question to ask back — callers must
   * show it and keep routing the user's next message through the agent
   * instead of silently falling through to normal chat, or the clarifying
   * question becomes a dead end.
   */
  needsClarification?: boolean;
}

export interface AgentContext {
  defaultPackCount: number;
  defaultQuestionsPerPack: number;
  /**
   * True when the command was typed in the Rezidențiat-scoped chat thread
   * (see `useChatThread`). An action that creates a folder or places
   * generated content WITHOUT an explicit destination name must default to
   * inside the Rezidențiat root, not the true tree root — otherwise "fă-mi
   * un folder X" typed from inside Rezidențiat lands one level up, on the
   * general screen, next to Rezidențiat itself instead of inside it.
   */
  residencyScope: boolean;
}

export interface AgentRunResult {
  summary: string;
  createdQuizIds: string[];
  errors: string[];
  undo: (() => void) | null;
}

export interface ExecuteCallbacks {
  onStep: (index: number, status: 'running' | 'done' | 'error' | 'skipped', detail?: string) => void;
}
