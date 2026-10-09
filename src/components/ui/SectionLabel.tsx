import type { ReactNode } from 'react';
import { useTheme } from '../../theme/ThemeContext';

/** Etichetă mică majusculă deasupra unui bloc, aceeași ca în pagina Rezidențiat. */
export default function SectionLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  const theme = useTheme();
  return (
    <h2 className={`px-1 text-[12px] font-medium uppercase tracking-wide ${className}`} style={{ color: theme.text3 }}>
      {children}
    </h2>
  );
}
