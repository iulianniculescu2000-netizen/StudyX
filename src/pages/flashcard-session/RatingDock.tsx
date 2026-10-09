import { motion } from 'framer-motion';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { press } from '../../theme/motion';
import type { Theme } from '../../theme/themes';
import type { Rating } from './sessionTypes';
import HelpTip from '../../components/ui/HelpTip';

type Motion = ReturnType<typeof useAdaptiveMotion>['t'];

interface RatingDockProps {
  theme: Theme; t: Motion; calmMotion: boolean; flipped: boolean; cardWidthClass: string; crampedHeight: boolean;
  denseLayout: boolean; mobile: boolean; dockLabel: string | null | undefined; dockLabelTextClass: string; dockGridClass: string;
  handleRating: (rating: Rating) => void;
}

/** Dock-ul de jos: evaluarea Greu / Bine / Ușor după întoarcerea cardului. */
export function RatingDock({ theme, t, calmMotion, flipped, cardWidthClass, crampedHeight, denseLayout, mobile, dockLabel, dockLabelTextClass, dockGridClass, handleRating }: RatingDockProps) {
  return (
  <div className={`${cardWidthClass} mx-auto w-full ${crampedHeight ? 'pt-2' : 'pt-3'}`}>
    {flipped ? (
      <motion.div
        initial={{ opacity: 0, y: calmMotion ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={t.page}
        className={`glass-panel rounded-[var(--r-xl)] ${denseLayout ? 'p-3.5 sm:p-4' : 'p-4 sm:p-5'}`}
      >
        <div className={`mb-4 flex items-center justify-between gap-3 ${mobile ? 'flex-col items-start' : ''}`}>
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: theme.text3 }}>
              Evaluare card <HelpTip id="fc-rating" size={16} />
            </p>
            <p className={dockLabelTextClass} style={{ color: theme.text }}>
              {dockLabel}
            </p>
          </div>
        </div>

        <div className={`grid gap-3 ${dockGridClass}`}>
          <motion.button
            {...press}
            onClick={() => handleRating('hard')}
            className={`flex flex-col items-center rounded-[var(--r-lg)] group ${denseLayout ? 'gap-1.5 p-3' : 'gap-2 p-4'}`}
            style={{
              background: `${theme.danger}10`,
              border: `1.5px solid ${theme.danger}35`,
              color: theme.danger,
            }}
          >
            <span className={`${denseLayout ? 'text-xl' : 'text-2xl'} font-black tabular-nums`}>1</span>
            <span className="font-black">Greu</span>
            <span className="text-[10px] opacity-60 font-normal">Reia mai curând</span>
          </motion.button>

          <motion.button
            {...press}
            onClick={() => handleRating('good')}
            className={`flex flex-col items-center rounded-[var(--r-lg)] group ${denseLayout ? 'gap-1.5 p-3' : 'gap-2 p-4'}`}
            style={{
              background: `${theme.accent}10`,
              border: `1.5px solid ${theme.accent}35`,
              color: theme.accentText,
            }}
          >
            <span className={`${denseLayout ? 'text-xl' : 'text-2xl'} font-black tabular-nums`}>2</span>
            <span className="font-black">Bine</span>
            <span className="text-[10px] opacity-60 font-normal">Ritm normal</span>
          </motion.button>

          <motion.button
            {...press}
            onClick={() => handleRating('easy')}
            className={`flex flex-col items-center rounded-[var(--r-lg)] group ${denseLayout ? 'gap-1.5 p-3' : 'gap-2 p-4'}`}
            style={{
              background: `${theme.success}10`,
              border: `1.5px solid ${theme.success}35`,
              color: theme.success,
            }}
          >
            <span className={`${denseLayout ? 'text-xl' : 'text-2xl'} font-black tabular-nums`}>3</span>
            <span className="font-black">Ușor</span>
            <span className="text-[10px] opacity-60 font-normal">Revino mai târziu</span>
          </motion.button>
        </div>
      </motion.div>
    ) : (
      <div className="pb-1 text-center text-xs font-medium" style={{ color: theme.text2 }}>
        {dockLabel}
      </div>
    )}
  </div>
  );
}
