/**
 * Realizări câștigate definitiv. Până acum starea unei realizări se recalcula la fiecare deschidere, deci
 * ștergerea unui set, arhivarea lui sau împărțirea lui pe capitole o putea pierde. Aici o realizare, odată
 * îndeplinită, se înregistrează cu data și nu se mai pierde. Funcții pure: primesc starea și întorc starea nouă.
 *
 * Persistența: starea stă în `statsStore` (câmpul `achievements`) și se salvează odată cu statisticile
 * profilului; un profil vechi, fără câmp, se citește ca „nimic înregistrat încă”.
 */

export interface EarnedRecord {
  /** Momentul (ms) în care a fost înregistrată. */
  at: number;
  /** Titlul de la momentul câștigării (ex. „Maestru — Cardiologie”): materia rămâne chiar dacă setul dispare. */
  title?: string;
  /** True când condiția era deja îndeplinită la prima rulare: data e a verificării, nu a momentului real. */
  backfilled?: boolean;
}

/** Valorile maxime atinse vreodată pentru nivel: nivelul nu scade dacă ștergi, arhivezi sau împarți un set. */
export interface LevelMarks {
  sets: number;
  sessions: number;
  longestStreak: number;
}

export interface AchievementsState {
  earned: Record<string, EarnedRecord>;
  /** False până la prima evaluare: atunci condițiile deja îndeplinite se înregistrează în tăcere, fără sărbătoare. */
  seeded: boolean;
  marks: LevelMarks;
}

export const EMPTY_MARKS: LevelMarks = { sets: 0, sessions: 0, longestStreak: 0 };

export function emptyAchievements(): AchievementsState {
  return { earned: {}, seeded: false, marks: { ...EMPTY_MARKS } };
}

const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

/** Citește defensiv starea salvată (lipsă, veche sau coruptă => stare goală sau parțială). */
export function normalizeAchievements(raw: unknown): AchievementsState {
  if (!raw || typeof raw !== 'object') return emptyAchievements();
  const data = raw as { earned?: unknown; seeded?: unknown; marks?: unknown };
  const earned: Record<string, EarnedRecord> = {};
  if (data.earned && typeof data.earned === 'object' && !Array.isArray(data.earned)) {
    for (const [id, value] of Object.entries(data.earned as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const record = value as Partial<EarnedRecord>;
      if (typeof record.at !== 'number' || !Number.isFinite(record.at)) continue;
      earned[id] = {
        at: record.at,
        ...(typeof record.title === 'string' ? { title: record.title } : {}),
        ...(record.backfilled ? { backfilled: true } : {}),
      };
    }
  }
  const marks = (data.marks && typeof data.marks === 'object' ? data.marks : {}) as Partial<LevelMarks>;
  return {
    earned,
    seeded: data.seeded === true,
    marks: { sets: count(marks.sets), sessions: count(marks.sessions), longestStreak: count(marks.longestStreak) },
  };
}

export interface DoneAchievement {
  id: string;
  title: string;
}

export interface EvaluationResult {
  state: AchievementsState;
  /** Realizările câștigate acum, pentru sărbătoare; gol la prima rulare (backfill silențios). */
  newlyEarned: DoneAchievement[];
  changed: boolean;
}

/**
 * Înregistrează realizările îndeplinite acum și ridică reperele de nivel. Ce e deja înregistrat nu se
 * atinge niciodată (nici data, nici titlul). La prima rulare (`seeded` false) înregistrează fără să anunțe.
 */
export function evaluateAchievements(
  state: AchievementsState,
  done: readonly DoneAchievement[],
  live: LevelMarks,
  now: number,
): EvaluationResult {
  const earned = { ...state.earned };
  const newlyEarned: DoneAchievement[] = [];
  let changed = false;
  for (const item of done) {
    if (earned[item.id]) continue;
    earned[item.id] = { at: now, title: item.title, ...(state.seeded ? {} : { backfilled: true }) };
    if (state.seeded) newlyEarned.push(item);
    changed = true;
  }
  const marks: LevelMarks = {
    sets: Math.max(state.marks.sets, count(live.sets)),
    sessions: Math.max(state.marks.sessions, count(live.sessions)),
    longestStreak: Math.max(state.marks.longestStreak, count(live.longestStreak)),
  };
  if (marks.sets !== state.marks.sets || marks.sessions !== state.marks.sessions || marks.longestStreak !== state.marks.longestStreak) changed = true;
  if (!state.seeded) changed = true;
  return { state: changed ? { earned, seeded: true, marks } : state, newlyEarned, changed };
}

/** Nivelul se calculează din maximul dintre valorile curente și cele atinse vreodată. */
export function permanentLevelInput(
  live: { quizCount: number; sessionCount: number; longestStreak: number },
  marks: LevelMarks,
): { quizCount: number; sessionCount: number; longestStreak: number } {
  return {
    quizCount: Math.max(count(live.quizCount), marks.sets),
    sessionCount: Math.max(count(live.sessionCount), marks.sessions),
    longestStreak: Math.max(count(live.longestStreak), marks.longestStreak),
  };
}

/** „Câștigat la 6 octombrie 2026”; pentru backfill „Câștigat până la …” (data verificării, nu a momentului real). */
export function earnedLabel(record: EarnedRecord): string {
  const date = new Date(record.at).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
  return record.backfilled ? `Câștigat până la ${date}` : `Câștigat la ${date}`;
}
