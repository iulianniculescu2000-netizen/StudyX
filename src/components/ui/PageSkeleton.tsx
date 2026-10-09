import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';

export type PageSkeletonVariant = 'default' | 'list' | 'detail' | 'dashboard';

const FILL = { background: 'var(--fill-subtle)' } as const;

/**
 * Schelet de pagină pentru încărcări; pulsul discret se oprește în modul calm.
 * `variant`: `list` (rânduri), `detail` (hero + conținut), `dashboard` (carduri-statistici + grilă), implicit antet + blocuri.
 */
export default function PageSkeleton({ blocks = 3, variant = 'default' }: { blocks?: number; variant?: PageSkeletonVariant }) {
  const { calmMotion } = useAdaptiveMotion();
  const pulse = calmMotion ? '' : 'animate-pulse';
  const count = Math.max(1, Math.min(4, blocks));
  return (
    <div
      aria-busy="true"
      aria-label="Se încarcă pagina"
      role="status"
      className="mx-auto w-full max-w-4xl px-4 pb-6 pt-5 sm:px-8 sm:pt-8"
      data-testid="page-skeleton"
    >
      <div className={`mb-6 ${pulse}`}>
        <div className="h-3 w-24 rounded-full" style={FILL} />
        <div className="mt-3 h-8 w-56 rounded-xl" style={FILL} />
      </div>
      {variant === 'list' && (
        <div className={`glass-panel overflow-hidden rounded-2xl ${pulse}`}>
          {Array.from({ length: Math.max(4, count + 3) }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5" style={{ borderTop: i === 0 ? undefined : '1px solid var(--hairline)', opacity: 1 - i * 0.07 }}>
              <div className="h-9 w-9 flex-shrink-0 rounded-xl" style={FILL} />
              <div className="min-w-0 flex-1">
                <div className="h-3 w-2/5 rounded-full" style={FILL} />
                <div className="mt-2 h-2.5 w-3/5 rounded-full" style={FILL} />
              </div>
              <div className="h-3 w-10 flex-shrink-0 rounded-full" style={FILL} />
            </div>
          ))}
        </div>
      )}
      {variant === 'detail' && (
        <div className={`space-y-4 ${pulse}`}>
          <div className="glass-panel rounded-2xl p-6" style={{ height: 168 }}>
            <div className="h-3 w-24 rounded-full" style={FILL} />
            <div className="mt-4 h-6 w-2/3 rounded-xl" style={FILL} />
            <div className="mt-4 h-3 w-1/2 rounded-full" style={FILL} />
          </div>
          <div className="glass-panel rounded-2xl p-5" style={{ height: 220 }}>
            <div className="h-3 w-1/3 rounded-full" style={FILL} />
            <div className="mt-4 h-3 w-full rounded-full" style={FILL} />
            <div className="mt-3 h-3 w-5/6 rounded-full" style={FILL} />
            <div className="mt-3 h-3 w-2/3 rounded-full" style={FILL} />
          </div>
        </div>
      )}
      {variant === 'dashboard' && (
        <div className={`space-y-4 ${pulse}`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="glass-panel rounded-2xl p-4" style={{ height: 88, opacity: 1 - i * 0.08 }}>
                <div className="h-2.5 w-1/2 rounded-full" style={FILL} />
                <div className="mt-3 h-6 w-2/5 rounded-lg" style={FILL} />
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="glass-panel rounded-2xl p-5" style={{ height: 180, opacity: 1 - i * 0.1 }}>
                <div className="h-3 w-1/3 rounded-full" style={FILL} />
                <div className="mt-4 h-3 w-2/3 rounded-full" style={FILL} />
              </div>
            ))}
          </div>
        </div>
      )}
      {variant === 'default' && (
        <div className="space-y-3">
          {Array.from({ length: count }, (_, i) => (
            <div
              key={i}
              className={`glass-panel rounded-2xl p-5 ${pulse}`}
              style={{ height: i === 0 ? 120 : 84, opacity: 1 - i * 0.12 }}
            >
              <div className="h-3 w-1/3 rounded-full" style={FILL} />
              <div className="mt-3 h-3 w-2/3 rounded-full" style={FILL} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
