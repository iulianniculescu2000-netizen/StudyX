import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';

export interface ErrorStateProps {
  title: string;
  body: string;
  /** Dacă e dat, apare butonul principal; `retryLabel` îi schimbă textul (implicit „Încearcă din nou”). */
  onRetry?: () => void;
  retryLabel?: string;
  /** Text tehnic (stack), arătat într-un `<details>` strâns. */
  details?: string;
  /** Acțiuni suplimentare (ex. „Copiază detaliile”). */
  children?: ReactNode;
}

/** Ecran de eroare tematic, în română, fără stack brut la vedere. */
export default function ErrorState({ title, body, onRetry, retryLabel = 'Încearcă din nou', details, children }: ErrorStateProps) {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  return (
    <div role="alert" className="flex h-full w-full items-center justify-center overflow-auto px-4 py-8">
      <div className={`glass-panel w-full max-w-md rounded-[var(--r-lg)] px-6 py-8 text-center ${calmMotion ? '' : 'fx-rise'}`}>
        <div
          className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[var(--r-md)]"
          style={{ background: `${theme.danger}18`, color: theme.danger }}
        >
          <AlertTriangle size={24} aria-hidden="true" />
        </div>
        <h2 className="text-[16px] font-semibold" style={{ color: theme.text }}>{title}</h2>
        <p className="mx-auto mt-1.5 text-[13px]" style={{ color: theme.text3 }}>{body}</p>
        {(onRetry || children) && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="press-feedback rounded-full px-5 py-2 text-[13px] font-semibold text-white"
                style={{ background: theme.accent }}
              >
                {retryLabel}
              </button>
            )}
            {children}
          </div>
        )}
        {details && (
          <details className="mt-5 text-left">
            <summary className="cursor-pointer text-center text-[12px]" style={{ color: theme.text3 }}>Detalii tehnice</summary>
            <pre
              className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-[var(--r-md)] p-3 text-[11px]"
              style={{ background: 'var(--fill-subtle)', color: theme.text2 }}
            >
              {details}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
