/** Procent „făcute azi / (făcute azi + restante)”; `null` când nu există nimic de arătat. */
export function todayProgressPercent(doneToday: number, due: number): number | null {
  const total = doneToday + due;
  return total > 0 ? Math.round((doneToday / total) * 100) : null;
}
