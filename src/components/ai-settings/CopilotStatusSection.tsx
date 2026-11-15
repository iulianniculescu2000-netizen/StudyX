import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Bot, Check, Copy, ExternalLink, Loader2, LogOut, RefreshCw, ShieldCheck, WifiOff, X } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { useAIStore, type CopilotQuotaSnapshot } from '../../store/aiStore';

interface CopilotStatusSectionProps {
  onStatusChanged?: () => void;
}

/**
 * De unde a luat motorul Copilot contul. StudyX nu are o conectare proprie la GitHub: motorul folosește contul deja
 * conectat pe calculator, iar utilizatorul trebuie să vadă care și de unde, nu doar „Conectat”.
 */
const ACCOUNT_SOURCE: Record<string, string> = {
  'gh-cli': 'GitHub CLI',
  user: 'Copilot CLI',
  env: 'un token din variabilele de mediu',
  token: 'un token GitHub',
  'api-key': 'o cheie GitHub',
  hmac: 'o cheie GitHub',
};

/** Cota în cuvinte: mesaje rămase când contul le numără, altfel procentul. */
function describeQuota(quota: CopilotQuotaSnapshot | null | undefined): string | null {
  if (!quota) return null;
  if (quota.isUnlimitedEntitlement) return 'Cotă nelimitată';
  const { entitlementRequests: total, usedRequests: used } = quota;
  if (typeof total === 'number' && total > 0 && typeof used === 'number') {
    const left = Math.max(0, Math.round(total - used));
    return `${left} din ${total} mesaje rămase`;
  }
  if (typeof quota.remainingPercentage === 'number') {
    const pct = Math.max(0, Math.min(100, Math.round(quota.remainingPercentage)));
    return `${pct}% cotă rămasă`;
  }
  return null;
}

/** Data de resetare, pe românește. Motorul trimite doar date din viitor. */
function describeReset(quota: CopilotQuotaSnapshot | null | undefined): string | null {
  if (!quota?.resetDate) return null;
  const at = new Date(quota.resetDate);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' });
}

/** Conectarea cu cod: nepornită, în pornire, în așteptarea codului introdus pe github.com sau eșuată. */
type LoginPhase =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'waiting'; code: string; minutes: number }
  | { kind: 'failed'; message: string };

export default function CopilotStatusSection({ onStatusChanged }: CopilotStatusSectionProps) {
  const theme = useTheme();
  const { calmMotion } = useAdaptiveMotion();
  const provider = useAIStore((s) => s.provider);
  const setProvider = useAIStore((s) => s.setProvider);
  const copilotStatusInfo = useAIStore((s) => s.copilotStatusInfo);
  const refreshCopilotStatus = useAIStore((s) => s.refreshCopilotStatus);
  const disconnectCopilot = useAIStore((s) => s.disconnectCopilot);

  const [busyAction, setBusyAction] = useState<'connect' | 'refresh' | 'disconnect' | null>(null);
  const [login, setLogin] = useState<LoginPhase>({ kind: 'idle' });
  const [codeCopied, setCodeCopied] = useState(false);
  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI?.copilotStatus);
  const canLogin = isElectron && Boolean(window.electronAPI?.copilotLoginStart);
  const waitingForCode = login.kind === 'waiting';

  // Cât timp așteptăm codul, ascultăm când motorul termină (sau eșuează). La final verificăm contul și, fiind o
  // conectare cerută chiar de utilizator, îl punem ca AI principal.
  useEffect(() => {
    if (!waitingForCode) return undefined;
    return window.electronAPI?.copilotOnLoginEvent?.((event) => {
      if (event.type === 'error') {
        setLogin({ kind: 'failed', message: event.error || 'Conectarea a eșuat.' });
        return;
      }
      setLogin({ kind: 'idle' });
      void refreshCopilotStatus({ connect: true }).then((info) => {
        if (info.state === 'connected' && info.isAuthenticated) setProvider('copilot');
        onStatusChanged?.();
      });
    });
  }, [waitingForCode, refreshCopilotStatus, setProvider, onStatusChanged]);

  // Dacă dialogul se închide cât timp așteptăm, anulăm conectarea, ca să nu rămână un cod deschis pe fundal.
  const waitingRef = useRef(false);
  useEffect(() => {
    waitingRef.current = waitingForCode;
  }, [waitingForCode]);
  useEffect(() => () => {
    if (waitingRef.current) void window.electronAPI?.copilotLoginCancel?.();
  }, []);

  const state = copilotStatusInfo.state;
  const isUsingCopilot = provider === 'copilot';
  const accountSource = copilotStatusInfo.authType ? ACCOUNT_SOURCE[copilotStatusInfo.authType] ?? null : null;
  const accounts = copilotStatusInfo.accounts ?? [];
  const quotaText = describeQuota(copilotStatusInfo.quota);
  const resetText = describeReset(copilotStatusInfo.quota);

  // „Verifică starea” și „Reîncearcă” doar recitesc contul. Folosirea lui rămâne o alegere separată.
  const handleConnectOrRetry = async (mode: 'refresh') => {
    if (busyAction || !isElectron) return;
    setBusyAction(mode);
    try {
      await refreshCopilotStatus({ connect: true });
      onStatusChanged?.();
    } finally {
      setBusyAction(null);
    }
  };

  // Butonul principal: întâi folosește contul deja conectat pe calculator (GitHub CLI), iar dacă nu există niciunul
  // pornește conectarea cu cod. Apăsarea lui arată intenția de a folosi Copilot, deci îl face AI principal.
  const handleConnect = async () => {
    if (busyAction || !isElectron || login.kind === 'starting') return;
    setBusyAction('connect');
    setLogin({ kind: 'starting' });
    try {
      const info = await refreshCopilotStatus({ connect: true });
      if (info.state === 'connected' && info.isAuthenticated) {
        setLogin({ kind: 'idle' });
        setProvider('copilot');
        onStatusChanged?.();
        return;
      }
      if (!canLogin) {
        setLogin({ kind: 'failed', message: info.statusMessage || 'Nu am găsit un cont GitHub conectat.' });
        return;
      }
      const started = await window.electronAPI!.copilotLoginStart!();
      if (started.ok) {
        setCodeCopied(false);
        setLogin({ kind: 'waiting', code: started.userCode, minutes: Math.max(1, Math.round(started.expiresIn / 60)) });
      } else {
        setLogin({ kind: 'failed', message: started.error || 'Nu am putut începe conectarea.' });
      }
    } finally {
      setBusyAction(null);
    }
  };

  // Alt cont GitHub (de pildă cel plătit, când pe calculator e conectat doar cel gratuit): conectarea cu cod te lasă să
  // alegi în browser contul dorit. Motorul îl păstrează alături de cel existent, iar cel nou devine activ.
  const handleAddAccount = async () => {
    if (busyAction || !canLogin || login.kind === 'starting') return;
    setBusyAction('connect');
    setLogin({ kind: 'starting' });
    try {
      const started = await window.electronAPI!.copilotLoginStart!();
      if (started.ok) {
        setCodeCopied(false);
        setLogin({ kind: 'waiting', code: started.userCode, minutes: Math.max(1, Math.round(started.expiresIn / 60)) });
      } else {
        setLogin({ kind: 'failed', message: started.error || 'Nu am putut începe conectarea.' });
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleSwitchAccount = async (accountKey: string) => {
    if (busyAction || !window.electronAPI?.copilotSwitchAccount) return;
    setBusyAction('refresh');
    try {
      const res = await window.electronAPI.copilotSwitchAccount(accountKey);
      if (!res.ok) setLogin({ kind: 'failed', message: res.error || 'Nu am putut comuta contul.' });
      else setLogin({ kind: 'idle' });
      await refreshCopilotStatus({ connect: true });
      onStatusChanged?.();
    } finally {
      setBusyAction(null);
    }
  };

  const handleCancelLogin = () => {
    void window.electronAPI?.copilotLoginCancel?.();
    setLogin({ kind: 'idle' });
  };

  const handleCopyCode = async () => {
    if (login.kind !== 'waiting') return;
    try {
      await navigator.clipboard.writeText(login.code);
      setCodeCopied(true);
    } catch {
      // Codul rămâne afișat, se poate copia de mână.
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
        return isUsingCopilot
          ? { label: 'Conectat', color: theme.success, Icon: Check }
          : { label: 'Cont găsit', color: theme.accentText, Icon: Check };
      case 'quota_exhausted':
        return { label: 'Cotă atinsă', color: theme.warning, Icon: AlertTriangle };
      case 'error':
        return { label: 'Eroare', color: theme.danger, Icon: WifiOff };
      case 'disconnected':
      default:
        return { label: 'Neconectat', color: theme.text3, Icon: WifiOff };
    }
  })();

  const secondaryButtonClass =
    'inline-flex items-center gap-1.5 rounded-[var(--r-md)] px-3 py-1.5 text-[11.5px] font-bold focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)] disabled:opacity-45';

  const retryButton = (label: string): ReactNode => (
    <button
      type="button"
      disabled={!isElectron || busyAction !== null}
      onClick={() => void handleConnectOrRetry('refresh')}
      className={secondaryButtonClass}
      style={{ background: theme.surface2, color: theme.text2, border: `1px solid ${theme.border}` }}
    >
      {busyAction === 'refresh' ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <RefreshCw size={12} aria-hidden />}
      {label}
    </button>
  );

  const disconnectButton: ReactNode = (
    <button
      type="button"
      disabled={busyAction !== null}
      onClick={() => void handleDisconnect()}
      className={secondaryButtonClass}
      style={{ background: theme.surface2, color: theme.danger, border: `1px solid ${theme.border}` }}
    >
      <LogOut size={12} aria-hidden />
      Deconectează
    </button>
  );

  const disconnectNote: ReactNode = (
    <p className="text-[11px] leading-relaxed" style={{ color: theme.text3 }}>
      „Deconectează” scoate contul din StudyX. Dacă l-ai conectat de aici, e deconectat de tot; dacă a fost preluat din GitHub CLI, acolo rămâi conectat.
    </p>
  );

  const loginPanel: ReactNode = login.kind === 'waiting' ? (
            <div className="space-y-3" aria-live="polite">
              <p className="text-[12px] leading-relaxed" style={{ color: theme.text2 }}>
                GitHub se deschide în browser; dacă nu, apasă „Deschide GitHub”. Introdu acolo acest cod și confirmă. StudyX nu vede parola ta și continuă singur când termini.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="rounded-[var(--r-md)] px-4 py-2 font-mono text-[22px] font-black tracking-[0.18em]"
                  style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text }}
                  aria-label={`Cod de conectare ${login.code.split('').join(' ')}`}
                >
                  {login.code}
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopyCode()}
                  className={secondaryButtonClass}
                  style={{ background: theme.surface2, color: theme.text2, border: `1px solid ${theme.border}` }}
                >
                  {codeCopied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
                  {codeCopied ? 'Copiat' : 'Copiază codul'}
                </button>
                <button
                  type="button"
                  onClick={() => void window.electronAPI?.copilotLoginOpenPage?.()}
                  className={secondaryButtonClass}
                  style={{ background: theme.surface2, color: theme.accentText, border: `1px solid ${theme.border}` }}
                >
                  <ExternalLink size={12} aria-hidden />
                  Deschide GitHub
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: theme.text3 }}>
                  <Loader2 size={12} className="animate-spin" aria-hidden />
                  Se așteaptă confirmarea · codul e valabil {login.minutes} minute
                </span>
                <button
                  type="button"
                  onClick={handleCancelLogin}
                  className={secondaryButtonClass}
                  style={{ background: theme.surface2, color: theme.text2, border: `1px solid ${theme.border}` }}
                >
                  <X size={12} aria-hidden />
                  Anulează
                </button>
              </div>
            </div>
  ) : null;

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
              AI-ul principal · contul GitHub de pe acest calculator
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
          {login.kind === 'waiting' ? (
            loginPanel
          ) : (
            <>
              <p className="text-[12px] leading-relaxed" style={{ color: theme.text2 }}>
                Te conectezi direct de aici, fără terminal. Dacă ești deja conectat la GitHub pe calculator (GitHub CLI), contul e preluat fără cod; altfel apeși butonul și introduci un cod pe github.com. StudyX nu îți cere și nu vede parola. Ai nevoie de acces la GitHub Copilot (merge și planul gratuit, cu cotă limitată). Motorul pornește fără unelte și fără acces la fișiere.
              </p>
              <p className="text-[11.5px] leading-relaxed" style={{ color: theme.text3 }}>
                Nu vrei Copilot? Chatul merge la fel cu o cheie API gratuită, mai jos.
              </p>
              {login.kind === 'failed' && (
                <p role="alert" className="text-[11.5px] font-medium" style={{ color: theme.danger }}>
                  {login.message}
                </p>
              )}
              {login.kind !== 'failed' && copilotStatusInfo.statusMessage && copilotStatusInfo.statusMessage !== 'Deconectat în StudyX' && copilotStatusInfo.statusMessage !== 'Neconectat' && (
                <p className="text-[11.5px] font-medium" style={{ color: theme.text3 }}>
                  {copilotStatusInfo.statusMessage}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <motion.button
                  type="button"
                  whileTap={calmMotion || !isElectron ? undefined : { scale: 0.97 }}
                  disabled={!isElectron || busyAction !== null}
                  onClick={() => void handleConnect()}
                  className="elev-1 inline-flex items-center gap-1.5 rounded-[var(--r-md)] px-3.5 py-2 text-[12px] font-black text-white focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)] disabled:opacity-45"
                  style={{ background: theme.accent }}
                >
                  {busyAction === 'connect' ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Bot size={13} aria-hidden />}
                  {busyAction === 'connect' ? 'Se pregătește conectarea… prima pornire durează puțin' : 'Conectează GitHub Copilot'}
                </motion.button>
                {!isElectron && (
                  <span className="text-[11px] font-medium" style={{ color: theme.text3 }}>
                    Disponibil în aplicația desktop StudyX.
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {state === 'connected' && (
        <div className="space-y-3">
          {login.kind === 'waiting' ? loginPanel : null}
          <div className="flex flex-wrap items-center gap-2 text-[12px]" style={{ color: theme.text2 }}>
            {copilotStatusInfo.login && (
              <span
                className="rounded-full px-2.5 py-0.5 font-bold"
                style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text }}
              >
                @{copilotStatusInfo.login}
              </span>
            )}
            {accountSource && (
              <span className="text-[11.5px] font-medium" style={{ color: theme.text3 }}>
                cont preluat din {accountSource}
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
              GitHub Copilot se ocupă de partea principală: chatul, explicațiile și generarea de grile. Fiecare cerere consumă un mesaj din cota acestui cont. Sugestiile, analizele, memoria conversațiilor și verificarea merg pe cheile API de mai jos, iar dacă Copilot nu răspunde, cheile preiau tot.
            </span>
          </p>

          {login.kind !== 'waiting' && accounts.length > 1 && (
            <div role="radiogroup" aria-label="Contul GitHub folosit" className="space-y-1.5">
              <p className="text-[10.5px] font-black uppercase tracking-[0.12em]" style={{ color: theme.text2 }}>Contul folosit</p>
              {accounts.map((account) => (
                <button
                  key={account.key}
                  type="button"
                  role="radio"
                  aria-checked={account.active}
                  disabled={account.active || !account.switchable || busyAction !== null}
                  onClick={() => void handleSwitchAccount(account.key)}
                  className="flex w-full items-center gap-2 rounded-[var(--r-md)] px-3 py-2 text-left text-[12px] focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)] disabled:cursor-default"
                  style={{
                    background: account.active ? `${theme.accent}14` : theme.surface2,
                    border: `1px solid ${account.active ? `${theme.accent}50` : theme.border}`,
                    color: theme.text,
                    opacity: account.active || account.switchable ? 1 : 0.55,
                  }}
                >
                  <span className="font-bold">@{account.login}</span>
                  <span className="text-[11px] font-medium" style={{ color: theme.text3 }}>
                    {account.source ? `din ${account.source === 'gh' ? 'GitHub CLI' : account.source}` : ''}
                  </span>
                  {account.active && <Check size={12} strokeWidth={3} className="ml-auto" style={{ color: theme.accentText }} aria-label="Folosit acum" />}
                </button>
              ))}
            </div>
          )}

          {login.kind === 'failed' && (
            <p role="alert" className="text-[11.5px] font-medium" style={{ color: theme.danger }}>{login.message}</p>
          )}

          {login.kind !== 'waiting' && (
          <div className="flex flex-wrap items-center gap-2">
            {isUsingCopilot ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-[var(--r-md)] px-3 py-1.5 text-[11.5px] font-black"
                style={{ background: `${theme.accent}1C`, color: theme.accentText, border: `1px solid ${theme.accent}45` }}
              >
                <Check size={12} strokeWidth={3} aria-hidden /> Activ ca AI principal
              </span>
            ) : (
              <motion.button
                type="button"
                whileTap={calmMotion ? undefined : { scale: 0.97 }}
                onClick={() => setProvider('copilot')}
                className="elev-1 inline-flex items-center gap-1.5 rounded-[var(--r-md)] px-3 py-1.5 text-[11.5px] font-black text-white focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)]"
                style={{ background: theme.accent }}
              >
                Folosește ca AI principal
              </motion.button>
            )}
            {retryButton('Verifică starea')}
            {canLogin && (
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void handleAddAccount()}
                className={secondaryButtonClass}
                style={{ background: theme.surface2, color: theme.accentText, border: `1px solid ${theme.border}` }}
              >
                <Bot size={12} aria-hidden />
                Alt cont GitHub
              </button>
            )}
            {disconnectButton}
          </div>
          )}
          {login.kind !== 'waiting' && (
            <p className="text-[11px] leading-relaxed" style={{ color: theme.text3 }}>
              Ai mai multe conturi GitHub (de exemplu unul plătit și unul gratuit)? Cu „Alt cont GitHub” alegi în browser contul pe care vrei să-l folosești; cota depinde de planul lui.
            </p>
          )}
          {disconnectNote}
        </div>
      )}

      {state === 'quota_exhausted' && (
        <div className="space-y-3">
          <p className="text-[12px] font-medium leading-relaxed" style={{ color: theme.text2 }}>
            {copilotStatusInfo.statusMessage || 'Cota GitHub Copilot pentru chat a fost atinsă.'}
            {resetText ? ` Se reface pe ${resetText}.` : ''}
          </p>
          <p className="text-[11.5px]" style={{ color: theme.text3 }}>
            Până atunci cheile API de mai jos fac tot, iar StudyX reîncearcă singur Copilot din când în când.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {retryButton('Reîncearcă acum')}
            {disconnectButton}
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="space-y-3">
          <p className="text-[12px] font-medium leading-relaxed" style={{ color: theme.danger }}>
            {copilotStatusInfo.statusMessage || 'Nu s-a putut porni sau verifica motorul GitHub Copilot.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {retryButton('Reîncearcă')}
            {disconnectButton}
          </div>
        </div>
      )}
    </section>
  );
}
