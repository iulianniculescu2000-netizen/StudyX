import type { Transition, Variants } from 'framer-motion';

/**
 * Sursa unică pentru mișcare. Orice durată, curbă sau resort din componente vine de aici
 * (sau, în CSS, din tokenii `--dur-*` / `--ease-*` din index.css). Valorile sunt oglindite
 * în CSS și verificate de `src/test/motionTokens.test.ts` — dacă schimbi una, schimbă-o în ambele locuri.
 */

type Bezier = [number, number, number, number];

/** Durate în secunde (CSS: --dur-instant/-fast/-base/-slow). */
export const dur = {
  /** Răspuns imediat: apăsare, ieșiri scurte, mișcare redusă. */
  instant: 0.12,
  /** Hover, popover, culori. */
  fast: 0.2,
  /** Intrări de pagină/modal, ridicări de card. */
  base: 0.32,
  /** Intrări mari (hero), tranziții lente. */
  slow: 0.5,
} as const;

/** Curbe (CSS: --ease-snap/-standard/-emphasized). `linear` rămâne doar pentru spinner/shimmer; `--ease-release` doar pentru apăsare. */
export const ease = {
  snap: [0.4, 0, 0.2, 1] as Bezier,
  standard: [0.2, 0.7, 0.2, 1] as Bezier,
  emphasized: [0.16, 1, 0.3, 1] as Bezier,
};

/** Resorturi. `tap` doar pentru whileTap. */
export const spring = {
  /** Indicatori de navigare/selecție, toast. */
  nav: { type: 'spring', stiffness: 420, damping: 34 } as Transition,
  /** Suprafețe mari: sertare, panouri, cardul hero. */
  panel: { type: 'spring', stiffness: 300, damping: 30 } as Transition,
  /** Apăsare: aterizează imediat, se eliberează cu un pic de revenire. */
  tap: { type: 'spring', stiffness: 460, damping: 26, mass: 0.7 } as Transition,
};

/** Pasul cascadei între elemente (secunde) și plafonul de elemente care o primesc. */
export const staggerStep = 0.04;
export const staggerMax = 8;

/* ── Preseturi (variante pentru <motion.* variants={…} initial="hidden" animate="visible" exit="exit">) ── */

/** Modal / dialog: opacitate + y 8→0 + scale .985→1; ieșire scurtă. */
export const modalIn: Variants = {
  hidden: { opacity: 0, y: 8, scale: 0.985 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: dur.base, ease: ease.emphasized } },
  exit: { opacity: 0, y: 8, scale: 0.985, transition: { duration: 0.16, ease: ease.snap } },
};

/** Toast: urcă 12px cu resort. */
export const toastIn: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: spring.nav },
  exit: { opacity: 0, y: 12, transition: { duration: dur.fast } },
};

/** Intrare de pagină: opacitate + y 8→0, fără scale. */
export const pageEnter: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: dur.base, ease: ease.standard } },
  exit: { opacity: 0, transition: { duration: dur.instant } },
};

/** Card hero / suprafață mare: ceva mai multă cursă verticală decât un modal, fără scale. */
export const heroIn: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: dur.slow, ease: ease.emphasized } },
};

/* ── Gesturi ── */

/** Apăsare: buton/chip normal (.97) și card mare (.985). Se folosește doar pe `whileTap`. */
export const press = {
  whileTap: { scale: 0.97, transition: spring.tap },
};
export const pressLarge = {
  whileTap: { scale: 0.985, transition: spring.tap },
};

/* ── Rezolvare pentru mișcare redusă ── */

/**
 * Setul de tranziții rezolvat. Cu `calm` (reduced-motion sau performanță lite) totul devine
 * o tranziție instantanee de opacitate. Ia `calm` din `useAdaptiveMotion().calmMotion`
 * sau direct `const { t } = useAdaptiveMotion()`.
 */
export function resolve(calm: boolean) {
  const instant: Transition = { duration: dur.instant };
  return {
    modal: calm ? instant : ({ duration: dur.base, ease: ease.emphasized } as Transition),
    modalExit: calm ? instant : ({ duration: 0.16, ease: ease.snap } as Transition),
    pop: calm ? instant : ({ duration: dur.fast, ease: ease.standard } as Transition),
    popExit: instant,
    toast: calm ? instant : spring.nav,
    toastExit: calm ? instant : ({ duration: dur.fast } as Transition),
    page: calm ? instant : ({ duration: dur.base, ease: ease.standard } as Transition),
    panel: calm ? instant : spring.panel,
    hero: calm ? instant : ({ duration: dur.slow, ease: ease.emphasized } as Transition),
    tap: calm ? instant : spring.tap,
    stagger: calm ? 0 : staggerStep,
  };
}

export type ResolvedMotion = ReturnType<typeof resolve>;
