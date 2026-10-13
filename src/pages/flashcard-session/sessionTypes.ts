import type { Question, Quiz } from '../../types';

export interface CardItem {
  question: Question;
  quiz: Quiz;
  /** Doar în sesiunea peste mai multe pachete: capitolul cardului („Cap. 8 · Cardiologie”). */
  groupKey?: string;
  groupLabel?: string;
  isNew?: boolean;
  /** Copia reluată după „Greu”, adăugată la finalul sesiunii (se reia o singură dată). */
  isRetry?: boolean;
}

export interface SessionMeta {
  totalDue: number;
  totalNew: number;
  remainingDue: number;
}

export type Rating = 'hard' | 'good' | 'easy';
