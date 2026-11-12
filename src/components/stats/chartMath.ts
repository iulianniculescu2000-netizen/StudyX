/** Pure helpers shared by the charts: safe numbers, round axis ticks, label thinning and spoken summaries. */

/** A finite number, or `fallback` for NaN, Infinity and non-numbers. */
export const finite = (value: unknown, fallback = 0): number =>
  (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Axis maximum and step with round ticks: at most about `maxTicks` gridlines, a step of 1, 2, 5 or 10 times a power of ten. */
export function niceScale(rawMax: number, minMax = 1, maxTicks = 6): { max: number; step: number } {
  const top = Math.max(minMax, finite(rawMax, 0));
  const rough = top / Math.max(1, maxTicks - 1);
  const pow = 10 ** Math.floor(Math.log10(rough));
  const unit = rough / pow;
  const step = (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * pow;
  return { max: Math.ceil(top / step) * step, step };
}

/** Indexes that get an axis label: every `every`-th, plus the last one when it does not crowd the previous label. */
export function labelIndexes(count: number, every: number, minGap = Math.ceil(every / 2)): number[] {
  const out: number[] = [];
  for (let k = 0; k < count; k += Math.max(1, every)) out.push(k);
  const last = count - 1;
  if (last >= 0 && !out.includes(last) && last - out[out.length - 1] >= minGap) out.push(last);
  return out;
}

const ro = (value: number, digits = 0) =>
  value.toLocaleString('ro-RO', { minimumFractionDigits: digits, maximumFractionDigits: digits });

const noun = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${ro(n)} ${many}`);

export interface DayPoint { day: string; sesiuni: number; acuratete: number }
export interface SubjectPoint { subject: string; acuratete: number }

export function activitySummary(data: DayPoint[]): string {
  const rows = data.map((d) => ({ day: d.day, n: Math.max(0, Math.round(finite(d.sesiuni))) }));
  if (rows.length === 0) return 'Activitate: nu există date.';
  const total = rows.reduce((sum, r) => sum + r.n, 0);
  if (total === 0) return `Activitate pe ${noun(rows.length, 'zi', 'zile')}: nicio sesiune.`;
  const best = rows.reduce((a, b) => (b.n > a.n ? b : a));
  return `Activitate pe ${noun(rows.length, 'zi', 'zile')}: ${noun(total, 'sesiune', 'sesiuni')}, cel mai activ ${best.day} cu ${noun(best.n, 'sesiune', 'sesiuni')}. `
    + `${rows.map((r) => `${r.day}: ${r.n}`).join('; ')}.`;
}

export function accuracySummary(data: DayPoint[]): string {
  const rows = data.map((d) => ({ day: d.day, p: Math.round(clamp(finite(d.acuratete), 0, 100)) }));
  if (rows.length === 0) return 'Acuratețe: nu există date.';
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (rows.length === 1) return `Acuratețe: ${first.p}% pe ${first.day}.`;
  const diff = last.p - first.p;
  const trend = diff === 0 ? 'neschimbată' : diff > 0 ? `în creștere cu ${diff} puncte` : `în scădere cu ${-diff} puncte`;
  return `Acuratețe pe ${noun(rows.length, 'zi', 'zile')}, ${trend}, de la ${first.p}% la ${last.p}%. ${rows.map((r) => `${r.day}: ${r.p}%`).join('; ')}.`;
}

export function radarSummary(data: SubjectPoint[]): string {
  if (data.length === 0) return 'Progres pe categorii: nu există date.';
  const rows = data.map((d) => `${d.subject}: ${Math.round(clamp(finite(d.acuratete), 0, 100))}%`);
  return `Acuratețe pe ${noun(data.length, 'categorie', 'categorii')}. ${rows.join('; ')}.`;
}

/** Shortens a long label to `max` characters with an ellipsis. */
export function truncateLabel(text: string, max = 12): string {
  const t = String(text ?? '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

export const formatRo = ro;
export const percent = (share: number) => `${Math.round(clamp(finite(share), 0, 1) * 100)}%`;
