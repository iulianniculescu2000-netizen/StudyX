import { motion } from 'framer-motion';
import { ArrowUpRight, Ban, Check, CircleHelp, Clock, KeyRound, Loader2, RefreshCw, WifiOff, Activity } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { MODEL_OPTIONS, MODEL_CANDIDATES, PROVIDER_NAMES, type ProviderId } from '../../lib/ai/modelCatalog';
import { MISTRAL_LIMITS_URL, PROVIDER_IDS, type ModelStatus } from '../../lib/ai/providerStatus';
import { describeStatus, type StatusTone } from '../../lib/ai/providerStatusText';
import type { ProviderStatusApi } from './useProviderStatus';

interface ProviderStatusCardProps {
  status: ProviderStatusApi;
  /** Duce la câmpul cheii pentru furnizorul fără cheie. */
  onAddKey: (provider: ProviderId) => void;
}

const ICONS: Record<ModelStatus['kind'], typeof Check> = {
  ok: Check, quota: Clock, rate: Clock, keyRejected: KeyRound, retired: Ban, error: WifiOff, unknown: CircleHelp,
};

/**
 * „Stare furnizori”: ce model merge, care are cota epuizată, care e retras pentru cheia ta și de ce cererile pot trece pe alt furnizor.
 * Starea e mereu text, nu doar culoare (pictogramă + cuvinte).
 */
export default function ProviderStatusCard({ status, onAddKey }: ProviderStatusCardProps) {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  const busy = status.running !== null;
  const anyKey = PROVIDER_IDS.some((id) => status.hasKey(id));

  const toneColor = (tone: StatusTone) => (tone === 'ok' ? theme.success : tone === 'warn' ? theme.warning : tone === 'bad' ? theme.danger : theme.text3);

  return (
    <section
      aria-labelledby="provider-status-title"
      className="mb-6 rounded-[var(--r-xl)] border p-4"
      style={{ borderColor: theme.border, background: 'var(--hover-fill)' }}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 id="provider-status-title" className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em]" style={{ color: theme.text }}>
          <Activity size={14} aria-hidden /> Stare furnizori
        </h3>
        <motion.button
          type="button"
          whileTap={calmMotion ? undefined : { scale: 0.97 }}
          onClick={() => (busy ? status.cancel() : void status.verify())}
          disabled={!anyKey}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)] disabled:opacity-40"
          style={{ background: theme.surface2, color: theme.accentText, border: `1px solid ${theme.border}` }}
          title="Trimite o cerere de un singur token fiecărui model, pe rând"
        >
          {busy ? <><Loader2 size={11} className="animate-spin" aria-hidden /> Oprește</> : <><RefreshCw size={11} aria-hidden /> Verifică acum</>}
        </motion.button>
      </div>

      <p className="mb-4 text-[11.5px] leading-relaxed" style={{ color: theme.text2 }}>
        Cererile pornesc pe furnizorul ales. Când un model își epuizează cota, aplicația încearcă automat celelalte modele ale lui,
        apoi următorul furnizor cu cheie (Groq, Gemini, Mistral). Groq are cea mai mare cotă, de aceea cererile ajung adesea acolo.
      </p>

      <ul className="space-y-2.5">
        {PROVIDER_IDS.map((provider) => {
          const hasKey = status.hasKey(provider);
          const rows = MODEL_OPTIONS[provider];
          const knownIds = new Set<string>([...rows.map((r) => r.id), ...MODEL_CANDIDATES[provider]]);
          const extra = provider === 'mistral' ? status.discovered(provider).filter((m) => !knownIds.has(m.id)) : [];
          const mistralStuck = provider === 'mistral' && hasKey
            && rows.some((r) => status.lastKind(provider, r.id) === 'rate')
            && !rows.some((r) => status.lastKind(provider, r.id) === 'ok');
          const runningHere = status.running === provider || status.running === 'all';
          return (
            <li key={provider} className="rounded-[var(--r-md)] border p-3" style={{ background: theme.surface, borderColor: theme.border }}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-semibold" style={{ color: theme.text }}>{PROVIDER_NAMES[provider]}</span>
                {hasKey ? (
                  <button
                    type="button"
                    onClick={() => void status.verify(provider)}
                    disabled={busy}
                    className="rounded-[var(--r-sm)] px-2 py-1 text-[11px] font-bold focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)] disabled:opacity-40"
                    style={{ color: theme.accentText }}
                  >
                    {runningHere && busy ? 'Verific…' : 'Verifică'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onAddKey(provider)}
                    className="rounded-[var(--r-sm)] px-2 py-1 text-[11px] font-bold focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)]"
                    style={{ color: theme.accentText }}
                  >
                    Adaugă cheia
                  </button>
                )}
              </div>

              {!hasKey ? (
                <p className="mt-1 text-[12px]" style={{ color: theme.text3 }}>Fără cheie · nu intră în lanțul de rezerve.</p>
              ) : (
                <ul className="mt-1.5 divide-y" style={{ borderColor: theme.border }}>
                  {rows.map((row) => {
                    const st = status.statusOf(provider, row.id);
                    const text = describeStatus(st, status.now);
                    const color = toneColor(text.tone);
                    const Icon = ICONS[st.kind];
                    return (
                      <li key={row.id} className="flex items-start justify-between gap-3 py-2" style={{ borderColor: theme.border }}>
                        <span className="text-[12.5px] font-medium" style={{ color: theme.text }}>{row.name}</span>
                        <span className="flex min-w-0 flex-col items-end text-right">
                          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: theme.text }}>
                            <Icon size={12} strokeWidth={3} style={{ color }} aria-hidden />
                            {text.label}
                          </span>
                          {text.detail && <span className="text-[11px]" style={{ color: theme.text3 }}>{text.detail}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {mistralStuck && (
                <p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: theme.text2 }}>
                  Mistral refuză cererile cu „Rate limit exceeded” chiar de la prima. Limitele sunt pe organizație: verifică planul
                  (planul gratuit cere verificarea telefonului) în{' '}
                  <a href={MISTRAL_LIMITS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-bold underline" style={{ color: theme.accentText }}>
                    consola Mistral <ArrowUpRight size={11} aria-hidden />
                  </a>.
                </p>
              )}

              {extra.length > 0 && (
                <p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: theme.text3 }}>
                  Alte modele de chat găsite pentru cheia ta: {extra.map((m) => m.id).join(', ')}.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {!anyKey && (
        <p className="mt-3 text-[11.5px]" style={{ color: theme.text3 }}>Adaugă o cheie ca să poți verifica modelele.</p>
      )}
      <p className="mt-3 text-[11px] leading-relaxed" style={{ color: theme.text3 }}>
        „Verifică acum” trimite o cerere de un singur token fiecărui model (la Gemini folosește o cerere din cota zilnică a fiecăruia).
        Modelele cu cota deja epuizată sunt sărite.
      </p>
    </section>
  );
}
