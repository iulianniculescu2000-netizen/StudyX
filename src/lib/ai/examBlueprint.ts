/**
 * „Planificatorul” de grile: parametrii măsurați pe cele 1200 de grile reale 2021–2025 (proiectul Grile rezidentiat)
 * și un plan pe întrebări care se dă modelului ca temă obligatorie, în loc să-l lăsăm să aleagă singur.
 *
 * De ce în cod, nu în prompt: un model lăsat singur strânge totul spre mijloc (aproape toate grilele CM cu 3 corecte,
 * aceeași metodă de distractori, cheia mereu pe B sau C). Distribuția reală e mai împrăștiată, iar o împărțire
 * exactă pe lot se face deterministic, fără apel AI.
 *
 * Aici intră doar cifre agregate; nicio grilă reală și niciun text din cărți.
 */

/** Cifrele de țintă. Sursa: analiza celor 1200 de grile (codare completă, n=1183 pentru strategie). */
export const EXAM_PARAMS = {
  /** CM: câte răspunsuri corecte (din 5 opțiuni). */
  correctCount: { 2: 0.25, 3: 0.56, 4: 0.19 } as Record<number, number>,
  /** Strategia de distractori pe grilă: toți „din vecinătate”, toți „modificați”, sau amestec. */
  strategy: { external: 0.485, internal: 0.3, mixed: 0.215 } as Record<DistractorStrategy, number>,
  /** CS: litera răspunsului (A–E), Educato n=301; baremul oficial e puțin mai plat. */
  singleKeyLetter: [0.11, 0.2, 0.3, 0.25, 0.15],
  /** Enunțuri terminate cu „?”: ~10% (CS 17%). */
  questionMarkStems: 0.1,
} as const;

export type DistractorStrategy = 'external' | 'internal' | 'mixed';

export interface QuestionPlan {
  type: 'single' | 'multiple';
  /** Câte răspunsuri corecte (1 la CS). */
  correct: number;
  strategy: DistractorStrategy;
}

/**
 * Împarte `total` în coșuri proporțional cu `weights`, exact (metoda celui mai mare rest), fără aleatoriu:
 * un lot de 20 de grile primește mereu aceeași structură, iar testele rămân stabile.
 */
export function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const exact = weights.map((w) => (w / sum) * total);
  const counts = exact.map(Math.floor);
  let left = total - counts.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (let i = 0; left > 0; i = (i + 1) % order.length, left -= 1) counts[order[i].index] += 1;
  return counts;
}

/** Amestecă cu un generator dat (implicit Math.random); `rng` se injectează în teste. */
export function shuffled<T>(items: T[], rng: () => number = Math.random): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Planul unui lot de `count` grile de același tip. */
export function planQuestionSet(
  count: number,
  type: 'single' | 'multiple',
  rng: () => number = Math.random,
): QuestionPlan[] {
  if (count <= 0) return [];
  const strategies = (Object.keys(EXAM_PARAMS.strategy) as DistractorStrategy[]);
  const strategyCounts = apportion(count, strategies.map((s) => EXAM_PARAMS.strategy[s]));
  const strategyList = shuffled(strategies.flatMap((s, i) => Array<DistractorStrategy>(strategyCounts[i]).fill(s)), rng);

  let correctList: number[];
  if (type === 'multiple') {
    const sizes = [2, 3, 4];
    const sizeCounts = apportion(count, sizes.map((n) => EXAM_PARAMS.correctCount[n]));
    correctList = shuffled(sizes.flatMap((n, i) => Array<number>(sizeCounts[i]).fill(n)), rng);
  } else {
    correctList = Array<number>(count).fill(1);
  }
  return strategyList.map((strategy, i) => ({ type, correct: correctList[i], strategy }));
}

const STRATEGY_TEXT: Record<DistractorStrategy, string> = {
  external: 'distractori adevărați din vecinătate (alt rând, alt tip, entitate înrudită)',
  internal: 'distractori prin modificarea unui singur cuvânt-cheie al răspunsului (inversare, negație, altă valoare)',
  mixed: 'distractori din ambele feluri',
};

/** Cel mai mare lot pentru care planul intră în prompt; peste, modelul rămâne pe regulile generale. */
export const MAX_PLANNED_QUESTIONS = 24;

/**
 * Blocul de prompt. Scurt (≈ 12 cuvinte pe întrebare). Gol când nu merită: un singur tip nespecificat de lot
 * sau o cerere de o singură grilă.
 */
export function blueprintPromptBlock(plan: QuestionPlan[]): string {
  if (plan.length < 2 || plan.length > MAX_PLANNED_QUESTIONS) return '';
  const lines = plan.map((item, i) => {
    const head = item.type === 'multiple' ? `${item.correct} corecte` : '1 corect';
    return `${i + 1}) ${head}, ${STRATEGY_TEXT[item.strategy]}`;
  });
  return (
    'PLAN PE ÎNTREBĂRI (obligatoriu; ca la examenul real, structura variază de la o grilă la alta, nu o uniformiza):\n' +
    lines.join('\n')
  );
}
