/**
 * Sursa unică a datei examenului, pentru ecranele care au nevoie de ea (Perspective AI, Realizări...).
 * Funcții pure: nu citesc niciun store. Data din Organizare are prioritate; dacă lipsește, se folosește
 * planul de examen al unui folder din Biblioteca AI. Nu se inventează nicio dată.
 */
import type { AILibraryFolder } from '../store/aiStore';
import type { PlanSummary } from './organizare/types';

export type ExamDateSource = 'organizare' | 'plan-folder';

export interface ExamDateInfo {
  /** YYYY-MM-DD */
  date: string;
  source: ExamDateSource;
  label: string;
  /** Poate fi negativ când examenul a trecut. */
  daysLeft: number;
  passed: boolean;
  /** True când data nu a fost aleasă de utilizator (valoarea implicită din plan sau doar rezumatul), deci e o estimare. */
  estimate: boolean;
}

export interface ExamDateInput {
  organizareState: unknown;
  organizareSummary: PlanSummary | null;
  folders: AILibraryFolder[];
  /** YYYY-MM-DD, ziua locală de azi. */
  today: string;
}

export const ORGANIZARE_EXAM_LABEL = 'Examen rezidențiat (din Organizare)';
export const ORGANIZARE_ESTIMATE_LABEL = 'Examen rezidențiat (estimare)';

/** Data din planul de bază (src/data/organizare/plan.json), cea cu care pornește Organizare până o schimbă utilizatorul. */
export const DEFAULT_PLAN_EXAM = '2027-11-21';

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True pentru un string YYYY-MM-DD care este o dată reală din calendar (nu 2026-02-31). */
export function isValidDay(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/** Zile întregi de la `from` la `to` (ambele YYYY-MM-DD); negativ dacă `to` e înaintea lui `from`. Fără probleme de fus orar sau oră de vară. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS);
}

function info(date: string, source: ExamDateSource, label: string, today: string, estimate = false): ExamDateInfo {
  const daysLeft = daysBetween(today, date);
  return { date, source, label, daysLeft, passed: daysLeft < 0, estimate };
}

function fromOrganizare(date: string, today: string, onlySummary: boolean): ExamDateInfo {
  const estimate = onlySummary || date === DEFAULT_PLAN_EXAM;
  return info(date, 'organizare', estimate ? ORGANIZARE_ESTIMATE_LABEL : ORGANIZARE_EXAM_LABEL, today, estimate);
}

/** Citire defensivă: starea din Organizare poate veni dintr-un export vechi sau stricat. */
function examFromState(state: unknown): string | null {
  if (!state || typeof state !== 'object') return null;
  const exam = (state as { exam?: unknown }).exam;
  return isValidDay(exam) ? exam : null;
}

/** Celelalte examene (planurile de examen ale folderelor), doar cele viitoare, de la cel mai apropiat. */
function upcomingFolderExams(folders: AILibraryFolder[], today: string): ExamDateInfo[] {
  const out: ExamDateInfo[] = [];
  for (const folder of folders ?? []) {
    const date = folder.examPlan?.examDate;
    if (!isValidDay(date) || date < today) continue;
    out.push(info(date, 'plan-folder', `Examen — ${folder.name}`, today));
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function resolveExamDate(input: ExamDateInput): { primary: ExamDateInfo | null; others: ExamDateInfo[] } {
  const { organizareState, organizareSummary, folders, today } = input;
  const upcoming = upcomingFolderExams(folders, today);

  const fromState = examFromState(organizareState);
  if (fromState) return { primary: fromOrganizare(fromState, today, false), others: upcoming };

  const fromSummary = organizareSummary && isValidDay(organizareSummary.exam) ? organizareSummary.exam : null;
  if (fromSummary) return { primary: fromOrganizare(fromSummary, today, true), others: upcoming };

  if (upcoming.length > 0) return { primary: upcoming[0], others: upcoming.slice(1) };
  return { primary: null, others: [] };
}
