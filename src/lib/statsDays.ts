import { localDateStr } from './studyPlan';

/** Cheia zilei LOCALE (an-lună-zi) pentru un moment dat (ms). Sesiunile păstrează `startedAt` în ms, deci gruparea se face doar la afișare. */
export function localDayKey(ms: number): string {
  return localDateStr(new Date(ms));
}

/** Ultimele `n` zile calendaristice locale, de la cea mai veche la `now`. Folosește aritmetică de calendar (nu 24h), ca să reziste la schimbarea orei. */
export function lastLocalDays(now: Date, n: number): { key: string; date: Date }[] {
  return Array.from({ length: n }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1 - i));
    return { key: localDateStr(date), date };
  });
}

const TOOLTIP_LABELS: Record<string, { label: string; unit: string }> = {
  sesiuni: { label: 'Sesiuni', unit: '' },
  acuratete: { label: 'Acuratețe', unit: '%' },
  intrebari: { label: 'Întrebări', unit: '' },
};

/** Etichetă română și unitate pentru un câmp de grafic. */
export function tooltipMeta(key: string): { label: string; unit: string } {
  return TOOLTIP_LABELS[key] ?? { label: key, unit: '' };
}
