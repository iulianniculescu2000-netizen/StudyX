import type { Theme } from '../../theme/themes';

export interface QuizPlayLayoutInput {
  density: string;
  shortHeight: boolean;
  crampedHeight: boolean;
  mobile: boolean;
  narrow: boolean;
  tablet: boolean;
  uiScale: number;
}

/** Responsive class names for the play screen, derived once from the viewport profile. */
export function getQuizPlayLayout({ density, shortHeight, crampedHeight, mobile, narrow, tablet, uiScale }: QuizPlayLayoutInput) {
  const denseLayout = density === 'dense';
  return {
    denseLayout,
    shellPaddingClass: denseLayout
      ? 'pt-3 pb-8 px-3 sm:px-4'
      : shortHeight
        ? 'pt-4 pb-10 px-3 sm:px-5'
        : 'pt-6 pb-14 px-4 sm:px-6',
    heroPaddingClass: denseLayout
      ? 'px-3.5 py-3.5 sm:px-4 sm:py-4'
      : crampedHeight
        ? 'px-4 py-4 sm:px-5 sm:py-5'
        : 'px-5 py-5 sm:px-6 sm:py-6',
    contentCardPaddingClass: denseLayout ? 'p-3' : crampedHeight ? 'p-3 sm:p-4' : 'p-4 sm:p-5',
    questionCardPaddingClass: denseLayout ? 'p-3.5 sm:p-4' : crampedHeight ? 'p-4 sm:p-5' : 'p-5 sm:p-6',
    questionWidthClass: mobile ? 'max-w-full' : narrow ? 'max-w-[840px]' : tablet ? 'max-w-[920px]' : 'max-w-3xl',
    optionStackClass: denseLayout ? 'space-y-2 mb-3.5' : crampedHeight ? 'space-y-2.5 mb-4' : 'space-y-3 mb-5',
    optionPaddingClass: denseLayout ? 'p-3' : crampedHeight ? 'p-3.5 sm:p-4' : 'p-4',
    heroControlsWrapClass: denseLayout ? 'flex flex-wrap items-center gap-1.5' : 'flex flex-wrap items-center gap-2',
    optionTextClass: denseLayout ? 'text-[13px] sm:text-sm font-medium leading-relaxed' : 'text-sm font-medium',
    questionTextClass: denseLayout
      ? 'text-base font-semibold leading-relaxed sm:text-lg'
      : crampedHeight
        ? 'text-lg font-semibold leading-snug sm:text-xl'
        : 'text-xl font-semibold leading-snug',
    heroTitleStyle: denseLayout
      ? { fontSize: `clamp(${(1.55 * uiScale).toFixed(2)}rem, ${(2.4 * uiScale).toFixed(2)}vw, ${(2.05 * uiScale).toFixed(2)}rem)` }
      : undefined,
    heroSubtitleClass: denseLayout
      ? 'mt-1.5 max-w-2xl text-xs font-medium leading-relaxed text-white/78 sm:text-sm'
      : 'mt-2 max-w-2xl text-sm font-medium leading-relaxed text-white/78',
    questionImageMaxHeight: denseLayout ? 180 : shortHeight ? 220 : 260,
  };
}

export type QuizPlayLayout = ReturnType<typeof getQuizPlayLayout>;

/** Surface/border tokens that shift when Focus Mode is on. */
export function getFocusTokens(theme: Theme, focusMode: boolean) {
  return {
    surface: theme.surface,
    surface2: theme.surface2,
    border: focusMode ? theme.border2 : theme.border,
    panelShadow: focusMode ? 'var(--elev-2)' : undefined,
    questionCardSurface: focusMode
      ? `linear-gradient(180deg, ${theme.surface}, ${theme.surface2})`
      : `linear-gradient(180deg, color-mix(in srgb, ${theme.surface} 88%, transparent), color-mix(in srgb, ${theme.surface2} 86%, transparent))`,
  };
}
