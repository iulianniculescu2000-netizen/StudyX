import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Bot, Check, Loader2, LogOut, RefreshCw, ShieldCheck, WifiOff } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { useAIStore } from '../../store/aiStore';

interface CopilotStatusSectionProps {
  onStatusChanged?: () => void;
}

export default function CopilotStatusSection({ onStatusChanged }: CopilotStatusSectionProps) {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  const provider = useAIStore((s) => s.provider);
  const setProvider = useAIStore((s) => s.setProvider);
  const copilotStatusInfo = useAIStore((s) => s.copilotStatusInfo);
  const refreshCopilotStatus = useAIStore((s) => s.refreshCopilotStatus);
  const disconnectCopilot = useAIStore((s) => s.disconnectCopilot);

  const [busyAction, setBusyAction] = useState<'connect' | 'refresh' | 'disconnect' | null>(null);
  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI?.copilotStatus);

  const state = copilotStatusInfo.state;
  const isUsingCopilot = provider === 'copilot';

  const handleConnectOrRetry = async (mode: 'connect' | 'refresh') => {
    if (busyAction || !isElectron) return;
    setBusyAction(mode);
    try {
      const next = await refreshCopilotStatus({ connect: true });
      if (mode === 'connect' && next.state === 'connected' && next.isAuthenticated) {
        setProvider('copilot');
      }
      onStatusChanged?.();
    } finally {
      setBusyAction(null);
    }
  };

  const handleDisconnect = async () => {
    if (busyAction) return;
    setBusyAction('disconnect');
    try {
      await disconnectCopilot();
      onStatusChanged?.();
    } finally {
      setBusyAction(null);
    }
  };

  const badge = (() => {
    switch (state) {
      case 'connected':
        return { label: 'Conectat', color: theme.success, Icon: Check };
      case 'quota_exhausted':
        return { label: 'Cotă atinsă', color: theme.warning, Icon: AlertTriangle };
      case 'error':
        return { label: 'Eroare', color: theme.danger, Icon: WifiOff };
      case 'disconnected':
      default:
        return { label: 'Neconectat', color: theme.text3, Icon: WifiOff };
    }
  })();

  const quotaText = (() => {
    const q = copilotStatusInfo.quota;
    if (!q) return null;
    if (q.isUnlimitedEntitlement) return 'Cotă nelimitată';
    if (typeof q.remainingPercentage === 'number') {
      const pct = Math.max(0, Math.min(100, Math.round(q.remainingPercentage)));
      return `${pct}% cotă rămasă`;
    }
    return null;
  })();

  return (
    <section
      aria-labelledby="copilot-section-title"
      className="mb-6 rounded-[var(--r-xl)] border p-4"
      style={{
        borderColor: isUsingCopilot && state === 'connected' ? `${theme.accent}55` : theme.border,
        background: isUsingCopilot && state === 'connected' ? `${theme.accent}0D` : 'var(--hover-fill)',
      }}
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-[var(--r-sm)]"
            style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text }}
          >
            <Bot size={14} aria-hidden />
          </div>
          <div>
            <h3 id="copilot-section-title" className="text-[13px] font-black tracking-tight" style={{ color: theme.text }}>
              GitHub Copilot
            </h3>
            <p className="text-[10.5px] font-medium" style={{ color: theme.text3 }}>
              Chat AI și explicații la grile · autentificare locală
            </p>
          </div>
        </div>

        <span
          role="status"
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-black uppercase tracking-[0.06em]"
          style={{
            color: badge.color,
            background: `${badge.color}18`,
            border: `1px solid ${badge.color}40`,
          }}
        >
          <badge.Icon size={11} strokeWidth={2.75} aria-hidden />
          {badge.label}
        </span>
      </div>

      {state === 'disconnected' && (
        <div className="space-y-3">
          <p className="text-[12px] leading-relaxed" style={{ color: theme.text2 }}>
            Folosește conectarea existentă din GitHub CLI (<code className="font-mono text-[11px]">gh auth login</code>) sau Copilot CLI de pe acest calculator. StudyX pornește motorul fără unelte și fără acces la fișiere.
          </p>
          {copilotStatusInfo.statusMessage && copilotStatusInfo.statusMessage !== 'Deconectat în StudyX' && (
            <p className="text-[11.5px] font-medium" style={{ color: theme.text3 }}>
              {copilotStatusInfo.statusMessage}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <motion.button
              type="button"
              whileTap={calmMotion || !isElectron ? undefined : { scale: 0.97 }}
              disabled={!isElectron || busyAction !== null}
              onClick={() => void handleConnectOrRetry('connect')}
              className="elev-1 inline-flex items-center gap-1.5 rounded-[var(--r-md)] px-3.5 py-2 text-[12px] font-black text-white focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)] disabled:opacity-45"
              style={{ background: theme.accent }}
            >
              {busyAction === 'connect' ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Bot size={13} aria-hidden />}
              {busyAction === 'connect' ? 'Se verifică conectarea…' : 'Conectează GitHub Copilot'}
            </motion.button>
            {!isElectron && (
              <span className="text-[11px] font-medium" style={{ color: theme.text3 }}>
                Disponibil în aplicația desktop StudyX.
              </span>
            )}
          </div>
        </div>
      )}

      {state === 'connected' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[12px]" style={{ color: theme.text2 }}>
            {copilotStatusInfo.login && (
              <span
                className="rounded-full px-2.5 py-0.5 font-bold"
                style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text }}
              >
                @{copilotStatusInfo.login}
              </span>
            )}
            {quotaText && (
              <span
                className="rounded-full px-2.5 py-0.5 font-semibold"
                style={{ background: `${theme.success}14`, color: theme.success }}
              >
                {quotaText}
              </span>
            )}
            {copilotStatusInfo.lastModel && (
              <span className="text-[11.5px] font-medium" style={{ color: theme.text3 }}>
                Ultimul model: {copilotStatusInfo.lastModel}
              </span>
            )}
          </div>

          <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed" style={{ color: theme.text2 }}>
            <ShieldCheck size={14} className="mt-0.5 shrink-0" style={{ color: theme.accentText }} aria-hidden />
            <span>
              În această versiune, GitHub Copilot răspunde la Chat AI și la explicațiile grilelor. Generarea de grile și verificatorul folosesc cheile API de mai jos.
            </span>
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {isUsingCopilot ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-[var(--r-md)] px-3 py-1.5 text-[11.5px] font-black"
                style={{ background: `${theme.accent}1C`, color: theme.accentText, border: `1px solid ${theme.accent}45` }}
              >
                <Check size={12} strokeWidth={3} aria-hidden /> Activ pentru Chat & Explicații
              </span>
            ) : (
              <motion.button
                type="button"
                whileTap={calmMotion ? undefined : { scale: 0.97 }}
                onClick={() => setProvider('copilot')}
                className="elev-1 inline-flex items-center gap-1.5 rounded-[var(--r-md)] px-3 py-1.5 text-[11.5px] font-black text-white focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)]"
                style={{ background: theme.accent }}
              >
                Folosește pentru Chat & Explicații
              </motion.button>
            )}

            <button
              type="button"
              disabled={!isElectron || busyAction !== null}
              onClick={() => void handleConnectOrRetry('refresh')}
              className="inline-flex items-center gap-1.5 rounded-[var(--r-md)] px-3 py-1.5 text-[11.5px] font-bold focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)] disabled:opacity-45"
              style={{ background: theme.surface2, color: theme.text2, border: `1px solid ${theme.border}` }}
            >
              {busyAction === 'refresh' ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <RefreshCw size={12} aria-hidden />}
              Verifică starea
            </button>

            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => void handleDisconnect()}
              className="inline-flex items-center gap-1.5 rounded-[var(--r-md)] px-3 py-1.5 text-[11.5px] font-bold focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)] disabled:opacity-45"
              style={{ background: theme.surface2, color: theme.danger, border: `1px solid ${theme.border}` }}
            >
              <LogOut size={12} aria-hidden />
              Deconectează
            </button>
          </div>
        </div>
      )}

      {state === 'quota_exhausted' && (
        <div className="space-y-3">
          <p className="text-[12px] font-medium leading-relaxed" style={{ color: theme.text2 }}>
            {copilotStatusInfo.statusMessage || 'Cota GitHub Copilot pentru chat a fost atinsă.'}
            {copilotStatusInfo.quota?.resetDate ? ` Resetare estimată: ${copilotStatusInfo.quota.resetDate}.` : ''}
          </p>
          <p className="text-[11.5px]" style={{ color: theme.text3 }}>
            Cât timp cota este atinsă, StudyX trece automat pe cheile API configurate mai jos.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <motion.button
              type="button"
              whileTap={calmMotion ? undefined : { scale: 0.97 }}
              disabled={!isElectron || busyAction !== null}
              onClick={() => void handleConnectOrRetry('refresh')}
              className="inline-flex items-center gap-1.5 rounded-[var(--r-md)] px-3 py-1.5 text-[11.5px] font-bold focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)] disabled:opacity-45"
              style={{ background: theme.surface2, color: theme.accentText, border: `1px solid ${theme.border}` }}
            >
              {busyAction === 'refresh' ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <RefreshCw size={12} aria-hidden />}
              Reîncearcă
            </motion.button>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => void handleDisconnect()}
              className="inline-flex items-center gap-1.5 rounded-[var(--r-md)] px-3 py-1.5 text-[11.5px] font-bold focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)] disabled:opacity-45"
              style={{ background: theme.surface2, color: theme.danger, border: `1px solid ${theme.border}` }}
            >
              <LogOut size={12} aria-hidden />
              Deconectează
            </button>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="space-y-3">
          <p className="text-[12px] font-medium leading-relaxed" style={{ color: theme.danger }}>
            {copilotStatusInfo.statusMessage || 'Nu s-a putut porni sau verifica motorul GitHub Copilot.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <motion.button
              type="button"
              whileTap={calmMotion ? undefined : { scale: 0.97 }}
              disabled={!isElectron || busyAction !== null}
              onClick={() => void handleConnectOrRetry('refresh')}
              className="inline-flex items-center gap-1.5 rounded-[var(--r-md)] px-3 py-1.5 text-[11.5px] font-bold focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)] disabled:opacity-45"
              style={{ background: theme.surface2, color: theme.accentText, border: `1px solid ${theme.border}` }}
            >
              {busyAction === 'refresh' ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <RefreshCw size={12} aria-hidden />}
              Reîncearcă
            </motion.button>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => void handleDisconnect()}
              className="inline-flex items-center gap-1.5 rounded-[var(--r-md)] px-3 py-1.5 text-[11.5px] font-bold focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)] disabled:opacity-45"
              style={{ background: theme.surface2, color: theme.danger, border: `1px solid ${theme.border}` }}
            >
              <LogOut size={12} aria-hidden />
              Deconectează
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
