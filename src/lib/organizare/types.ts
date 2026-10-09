/** A chapter-sized topic of the syllabus, as stored in plan.json. */
export interface RawTopic {
  grp: number;
  b: 'K' | 'L' | 'S';
  cap: string;
  n: string;
  p: number;
  gr: number;
  src: string;
  pdf: string;
  miss: string[];
  res: string;
  fold: string;
  note: string;
  file: string;
  a1: string; b1: string; h1: number;
  a2: string; b2: string; h2: number;
  a3: string; b3: string; h3: number;
  a4: string; b4: string; h4: number;
}

export type WeekKind = '1' | '2' | '3' | '4' | 't' | 's' | 'm';

/** One calendar week (Monday) of the plan: which pass it belongs to, or a buffer / simulation / final week. */
export interface Week {
  d: string;
  k: WeekKind;
  t: string;
}

export interface RawPlan {
  ch: RawTopic[];
  groups: string[];
  weeks: Week[];
  start: string;
  exam: string;
  ends: string[];
  starts: string[];
  sim0: string;
  sim1: string;
  maint0: string;
  /** Reading speed per pass, pages per hour. */
  pph: number[];
  /** Share of each topic's quizzes done in each pass. */
  pct: number[];
}

/** A topic with its four passes gathered into arrays, so `a[ph - 1]` is the start of pass `ph`. */
export interface Topic {
  index: number;
  group: number;
  book: 'K' | 'L' | 'S';
  chapter: string;
  name: string;
  pages: number;
  quizzes: number;
  src: string;
  pdf: string;
  resources: string;
  folder: string;
  note: string;
  file: string;
  a: string[];
  b: string[];
  h: number[];
}

export interface Plan {
  topics: Topic[];
  groups: string[];
  weeks: Week[];
  start: string;
  exam: string;
  ends: string[];
  starts: string[];
  sim0: string;
  sim1: string;
  maint0: string;
  pph: number[];
  pct: number[];
}

/** 0 = to do, 1 = in progress, 2 = done. */
export type Status = 0 | 1 | 2;

export interface DayLog {
  /** Hours studied. */
  h?: number;
  /** Quizzes solved / correct. */
  g?: number;
  ok?: number;
  /** How the day felt, 1–5. */
  e?: number;
  /** A short note. */
  n?: string;
}

/** The student's own progress. The shape is the one the standalone plan page used, so its backups still load. */
export interface PlanState {
  ts: number;
  s1: Record<number, Status>;
  s2: Record<number, Status>;
  s3: Record<number, Status>;
  s4: Record<number, Status>;
  exam: string;
  /** date → what was logged that day */
  log: Record<string, DayLog>;
  /** Monday of a week → topics the student chose for it */
  wk: Record<string, number[]>;
  /** "pass:topic" → the day it was finished */
  dn: Record<string, string>;
  /** Day → seconds already sent to the app's study statistics, so a re-saved day is not counted twice. */
  synced?: Record<string, number>;
}

/** What the plan tells the rest of the app about itself. */
export interface PlanSummary {
  /** When the summary was written (ms). */
  ts: number;
  /** Exam date, YYYY-MM-DD. */
  exam: string;
  /** 1–4 are the study passes, 5 means simulations / final week. */
  phase: number;
  /** Topics finished / total in the active pass. */
  done: number;
  total: number;
  /** Pages finished in the active pass, in percent. */
  pct: number;
  /** Consecutive days with study hours logged. */
  streak: number;
  /** The topic to work on now, if a pass is running. */
  today: null | {
    n: string;
    /** Group (chapter) the topic belongs to. */
    g: string;
    /** Book and pages, e.g. "Kumar p.151-153". */
    src: string;
    pages: number;
  };
  /**
   * The curriculum chapter (index in `curriculumChapters()`) the current topic belongs to, and how many of
   * its topics are finished in the active pass. Absent in summaries saved before chapters were shared.
   */
  chapter?: { index: number; done: number; total: number };
}
