import { useMemo, useState } from 'react';
import { Gauge } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useAIStore } from '../store/aiStore';
import { useAIUsageStore, type UsageProvider } from '../store/aiUsageStore';
import { localDateStr } from '../lib/studyPlan';

const NAMES: Record<UsageProvider, string> = {
  groq: 'Groq',
  google: 'Google Gemini',
  mistral: 'Mistral AI',
};
const ORDER: UsageProvider[] = ['groq', 'google', 'mistral'];
const DAYS_SHOWN = 7;

/** 950 → "950", 12 400 → "12,4k", 1 250 000 → "1,25M". */
function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2).replace('.', ',').replace(/,?0+$/, '')}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace('.', ',').replace(/,0$/, '')}k`;
  return String(value);
}

function lastDays(count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (count - 1 - index));
    return localDateStr(date);
  });
}

/**
 * How much AI this device has used, per provider with a saved key. Counts come
 * from the replies themselves (exact when the provider reports tokens, an
 * estimate for streamed chat); "left in the window" appears only when the
 * provider sends rate-limit headers. Providers do not expose a total balance.
 */
export default function AIUsagePanel() {
  const theme = useTheme();
  const providerKeys = useAIStore((state) => state.providerKeys);
  const days = useAIUsageStore((state) => state.days);
  const windows = useAIUsageStore((state) => state.windows);

  const dates = useMemo(() => lastDays(DAYS_SHOWN), []);
  // Read once when the panel opens; the age of a limit reading only needs to be roughly right.
  const [openedAt] = useState(() => Date.now());
  const today = localDateStr();
  const providers = ORDER.filter((id) => (providerKeys[id] ?? '').trim().length > 0 || days[today]?.[id]);

  if (providers.length === 0) return null;

  const rows = providers.map((id) => {
    const series = dates.map((date) => days[date]?.[id]?.tokens ?? 0);
    const todayUsage = days[today]?.[id];
    const week = series.reduce((sum, value) => sum + value, 0);
    const peak = Math.max(1, ...series);
    const window = windows[id];
    const windowAgeSeconds = window ? Math.round((openedAt - window.at) / 1000) : null;
    return { id, series, peak, today: todayUsage, week, window, windowAgeSeconds };
  });

  return (
    <div
      className="mb-6 rounded-[28px] border p-4"
      style={{ borderColor: theme.border, background: theme.isDark ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.03)' }}
    >
      <div className="mb-3 flex items-center gap-2" style={{ color: theme.text }}>
        <Gauge size={14} />
        <span className="text-[11px] font-black uppercase tracking-[0.12em]">Consum AI</span>
      </div>

      <ul className="space-y-2.5">
        {rows.map((row) => (
          <li
            key={row.id}
            className="rounded-2xl border p-3"
            style={{ background: theme.surface, borderColor: theme.border }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold" style={{ color: theme.text }}>{NAMES[row.id]}</div>
                <div className="mt-0.5 text-[12px]" style={{ color: theme.text2 }}>
                  {row.today
                    ? `Azi: ${row.today.estimated ? '≈ ' : ''}${compact(row.today.tokens)} tokeni · ${row.today.requests} ${row.today.requests === 1 ? 'cerere' : 'cereri'}`
                    : 'Azi: încă nicio cerere'}
                </div>
                <div className="text-[11.5px]" style={{ color: theme.text3 }}>
                  Ultimele 7 zile: {row.week > 0 ? `${compact(row.week)} tokeni` : '—'}
                </div>
              </div>

              <div className="flex h-9 flex-shrink-0 items-end gap-[3px]" aria-hidden>
                {row.series.map((value, index) => (
                  <div
                    key={dates[index]}
                    className="w-[6px] rounded-sm"
                    style={{
                      height: `${Math.max(value > 0 ? 12 : 4, Math.round((value / row.peak) * 100))}%`,
                      background: index === row.series.length - 1 ? theme.accent : `${theme.accent}55`,
                      opacity: value > 0 ? 1 : 0.35,
                    }}
                  />
                ))}
              </div>
            </div>

            {row.window?.remainingTokens !== undefined && row.window.limitTokens !== undefined && (
              <div className="mt-2.5">
                <div className="mb-1 flex justify-between text-[11px]" style={{ color: theme.text3 }}>
                  <span>Limită pe minut, la ultima cerere</span>
                  <span>
                    {compact(row.window.remainingTokens)} din {compact(row.window.limitTokens)} rămase
                    {row.windowAgeSeconds !== null && row.windowAgeSeconds > 60 ? ' · valoare veche' : ''}
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full" style={{ background: theme.surface2 }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(0, Math.min(100, (row.window.remainingTokens / row.window.limitTokens) * 100))}%`,
                      background: row.window.remainingTokens / row.window.limitTokens < 0.2 ? theme.warning : theme.success,
                    }}
                  />
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed" style={{ color: theme.text3 }}>
        Numără doar ce ai folosit din StudyX, pe acest dispozitiv; „≈" înseamnă estimare (răspunsurile din chat vin în flux, fără număr exact).
        Soldul total și limitele zilnice le vezi pe pagina furnizorului — nu toți le trimit aplicației.
      </p>
    </div>
  );
}
