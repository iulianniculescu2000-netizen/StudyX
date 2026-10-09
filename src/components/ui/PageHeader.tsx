import type { ReactNode } from 'react';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import BackPill from '../fx/BackPill';
import HelpTip from './HelpTip';
import TourHelpButton from '../../tutorial/TourHelpButton';
import type { HelpTipId } from '../../tutorial/helpTips';
import type { TourId } from '../../tutorial/tourMeta';

export interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  back?: { to: string; label: string };
  actions?: ReactNode;
  /** Un „?” lângă titlu cu un răspuns scurt (pagini fără tur propriu). */
  help?: HelpTipId;
  /** Un „?” lângă titlu care pornește turul paginii. */
  tour?: { id: TourId; label: string };
}

/** Antet de pagină aliniat la stânga, ca în Organizare: buton înapoi, eyebrow, titlu, subtitlu și acțiuni în dreapta. */
export default function PageHeader({ eyebrow, title, subtitle, back, actions, help, tour }: PageHeaderProps) {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  return (
    <header className={`${calmMotion ? '' : 'fx-rise '}mb-5`}>
      {back && <BackPill to={back.to} label={back.label} className="mb-4" />}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {eyebrow && (
            <div className="text-[12px] font-medium uppercase tracking-wide" style={{ color: theme.text3 }}>
              {eyebrow}
            </div>
          )}
          <div className="mt-1 flex items-center gap-2">
            <h1 className="page-title-compact" style={{ color: theme.text }}>{title}</h1>
            {help && <HelpTip id={help} size={18} />}
            {tour && <TourHelpButton tour={tour.id} label={tour.label} />}
          </div>
          {subtitle && <p className="mt-1.5 text-[13px]" style={{ color: theme.text3 }}>{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
