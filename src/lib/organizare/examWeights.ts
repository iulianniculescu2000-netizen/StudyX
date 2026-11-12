import raw from '../../data/organizare/examWeights.json';

/**
 * Cât de des au picat paginile unei teme la Rezidențiat 2021–2025 (doar cifre agregate, fără textul subiectelor).
 * Generat de `scripts/build-exam-weights.py`; un indiciu din frecvența trecută, nu o garanție pentru examenul viitor.
 */
export interface ExamWeight {
  /** Grile din 2021–2025 care cad pe paginile temei (fracționar dacă pagina e comună cu altă temă). */
  questions: number;
  /** Cel mai mare număr de ani distincți în care a picat o pagină a temei. */
  years: number;
  /** Pagini „fierbinți” (reluate în mai mulți ani). */
  hotPages: number;
}

type RawWeights = { src: Record<string, string>; w: Record<string, { n: number; y: number; hot: number }> };
const DATA = raw as RawWeights;

/** Ponderea unei teme, sau null dacă n-a picat niciodată (sau planul s-a schimbat și tema nu mai corespunde). */
export function examWeightOf(topic: { index: number; src: string }): ExamWeight | null {
  const key = String(topic.index);
  const w = DATA.w[key];
  if (!w || DATA.src[key] !== topic.src) return null;
  return { questions: w.n, years: w.y, hotPages: w.hot };
}

/** Eticheta scurtă din detaliul unei teme. */
export function describeExamWeight(w: ExamWeight | null): string {
  if (!w) return 'nu a picat în 2021–2025';
  const n = Math.round(w.questions);
  const q = n === 1 ? '1 grilă' : `${n} grile`;
  const y = w.years === 1 ? 'într-un an' : `în până la ${w.years} ani`;
  return `${q} în 2021–2025, ${y}${w.hotPages ? ` · ${w.hotPages} ${w.hotPages === 1 ? 'pagină fierbinte' : 'pagini fierbinți'}` : ''}`;
}

/** Temele cu cele mai multe grile reale, pentru sortări și priorități. */
export function topExamTopics<T extends { index: number; src: string }>(topics: T[], limit: number): T[] {
  return topics
    .map((t) => ({ t, q: examWeightOf(t)?.questions ?? 0 }))
    .filter((x) => x.q > 0)
    .sort((a, b) => b.q - a.q)
    .slice(0, limit)
    .map((x) => x.t);
}
