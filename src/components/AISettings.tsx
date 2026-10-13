import { useState, useRef, useEffect, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Key, Cpu, Eye, EyeOff, Check,
  Trash2,
  Loader2, Gift, ChevronDown, ArrowUpRight, Brain, RefreshCw, Sparkles
} from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useAIStore, type AIModel, type AIProvider } from '../store/aiStore';
import { useUserStore } from '../store/userStore';
import { clearStudyPatterns, getProfileSummaryText } from '../ai/UserProfile';
import { refreshAllProviderModels, type ProviderModelCheck } from '../lib/ai/modelHealing';
import Portal from './Portal';
import ChatMemoryPanel from './ai-chat/ChatMemoryPanel';
import AIUsagePanel from './AIUsagePanel';
import { PROVIDER_CATALOG } from '../lib/ai/providerCatalog';
import { friendlyAIError } from '../lib/ai/friendlyError';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useScrollLock } from '../hooks/useScrollLock';

// Names, key hints and signup links come from the shared catalog (the tour's key guide uses it too).
const PROVIDER_DESC: Record<AIProvider, string> = {
  groq: 'Rapid pentru chat și generare de grile',
  google: 'Context mare și raționament puternic pentru explicații',
  mistral: 'Gratuit, fără card · ~1 miliard de tokeni/lună',
};



const PROVIDERS = PROVIDER_CATALOG.map((entry) => ({ ...entry, desc: PROVIDER_DESC[entry.id] }));

const MODELS: Record<AIProvider, { id: AIModel; name: string; desc: string; speed: string }[]> = {
  groq: [
    { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', desc: 'Cel mai inteligent, foarte rapid', speed: 'Rapid' },
    { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', desc: 'Ultra rapid', speed: 'Instant' },
  ],
  google: [
    { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', desc: 'Cel mai nou, rapid și inteligent', speed: 'Rapid' },
    { id: 'gemini-4-argon', name: 'Gemini 4 Argon', desc: 'Generația 4, stabil; cotă gratuită proprie (încearcă-l când 3.8 se epuizează)', speed: 'Smart' },
    { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', desc: 'Echilibrat, foarte stabil', speed: 'Rapid' },
    { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', desc: 'Cel mai economic: folosește mai puțin din limita gratuită', speed: 'Instant' },
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', desc: 'Cel mai bun pentru raționament', speed: 'Smart' },
  ],
  mistral: [
    { id: 'mistral-small-latest', name: 'Mistral Small', desc: 'Rapid, echilibrat', speed: 'Rapid' },
    { id: 'mistral-large-latest', name: 'Mistral Large', desc: 'Cel mai puternic, mai lent', speed: 'Smart' },
  ],
};

// Step-by-step guide for getting a FREE API key, per provider. Shown inline so
// users (especially on the free Google tier) know exactly where to go.
const KEY_GUIDE: Record<AIProvider, { intro: string; steps: string[] }> = {
  google: {
    intro: 'Gratuit, fără card bancar. Durează ~1 minut.',
    steps: [
      'Apasă butonul de mai jos — se deschide Google AI Studio.',
      'Conectează-te cu un cont Google (Gmail).',
      'Apasă „Create API key" (sau „Get API key").',
      'Copiază cheia generată — începe cu „AIza…".',
      'Lipește-o în câmpul de mai sus și apasă „Salvează".',
    ],
  },
  groq: {
    intro: 'Gratuit. Necesită doar un cont Groq.',
    steps: [
      'Apasă butonul de mai jos — se deschide Groq Console.',
      'Creează un cont sau conectează-te.',
      'Apasă „Create API Key".',
      'Copiază cheia generată — începe cu „gsk_…".',
      'Lipește-o în câmpul de mai sus și apasă „Salvează".',
    ],
  },
  mistral: {
    intro: '~1 miliard de tokeni/lună gratis, fără card bancar. Cere doar verificare de telefon.',
    steps: [
      'Apasă butonul de mai jos — se deschide contul Mistral.',
      'Creează un cont sau conectează-te, confirmă numărul de telefon dacă ți se cere.',
      'La primul pas, activează planul gratuit „Experiment" (nu cere card).',
      'Mergi la „API Keys" și apasă „Create new key".',
      'Lipește cheia generată în câmpul de mai sus și apasă „Salvează".',
    ],
  },
};

interface AISettingsProps {
  open: boolean;
  onClose: () => void;
}

export default function AISettings({ open, onClose }: AISettingsProps) {
  const theme = useTheme();
  const { calmMotion, t } = useAdaptiveMotion();
  const titleId = useId();
  const checkTitleId = useId();
  const {
    apiKey, provider, model, hasKey, setApiKey, setProvider, setModel,
    providerKeys
  } = useAIStore();

  const hasAnyProviderKey = Object.values(providerKeys).some((k) => (k ?? '').trim().length > 0);

  const [draft, setDraft] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [showGuide, setShowGuide] = useState(!hasKey);
  const [saved, setSaved] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; error?: string; warning?: string } | null>(null);
  const [refreshingModel, setRefreshingModel] = useState(false);
  const [providerCheckResults, setProviderCheckResults] = useState<ProviderModelCheck[] | null>(null);
  const [showProviderCheck, setShowProviderCheck] = useState(false);
  const checkOpen = showProviderCheck && !!providerCheckResults;
  // Cât timp e deschis dialogul secundar, doar el prinde Esc/Tab.
  const dialogRef = useFocusTrap(open && !checkOpen, onClose);
  const checkDialogRef = useFocusTrap(checkOpen, () => setShowProviderCheck(false));
  useScrollLock(open);

  const handleRefreshModel = async () => {
    setRefreshingModel(true);
    try {
      const results = await refreshAllProviderModels();
      setProviderCheckResults(results);
      setShowProviderCheck(true);
    } finally {
      setRefreshingModel(false);
    }
  };
  const activeProfileId = useUserStore((s) => s.activeProfileId);
  const [memorySummary, setMemorySummary] = useState('');
  
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) setDraft(apiKey);
  }, [open, apiKey]);

  useEffect(() => {
    if (!open || !activeProfileId) return;
    setMemorySummary(getProfileSummaryText(activeProfileId));
  }, [open, activeProfileId]);

  const handleResetMemory = () => {
    if (!activeProfileId) return;
    clearStudyPatterns(activeProfileId);
    setMemorySummary(getProfileSummaryText(activeProfileId));
  };

  useEffect(() => () => {
    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current);
    }
  }, []);

  const activeProvider = PROVIDERS.find((entry) => entry.id === provider) ?? PROVIDERS[0];
  const modelOptions = MODELS[provider] ?? MODELS.groq;
  // A key's provider is unambiguous ONLY when it has a distinctive prefix
  // (gsk_ = Groq) — Google and Mistral keys are both opaque
  // tokens with no recognizable prefix, so guessing between them isn't
  // possible from format alone. Returning null here for anything else lets
  // handleSave's `?? provider` fallback keep whatever the user already has
  // selected, instead of forcing a guess. This used to default to 'google'
  // unconditionally, which silently rerouted a pasted NVIDIA key onto Google
  // and burned a real API call on a 400 — never repeat that.
  const detectProviderFromKey = (k: string): AIProvider | null => {
    const trimmed = k.trim();
    if (trimmed.startsWith('gsk_') && trimmed.length > 20) return 'groq';
    return null;
  };
  const trimmedDraft = draft.trim();
  const detectedProvider = detectProviderFromKey(trimmedDraft);
  // "Invalid" only means too short to be any real key — not being able to
  // guess a prefix-less provider is a different thing entirely.
  const keyInvalid = trimmedDraft.length > 0 && trimmedDraft.length < 20;
  // Only fires for a CONFIDENTLY-detected prefix that belongs to a different
  // provider than the one selected — never a false alarm for Google/Mistral.
  const keyForOtherProvider = detectedProvider !== null && detectedProvider !== provider;

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (trimmed && keyInvalid) {
      setSaved(false);
      return;
    }

    // Auto-switch to the provider the key actually belongs to, so pasting a
    // ready-made key just works without first changing the selector.
    const targetProvider = detectProviderFromKey(trimmed) ?? provider;
    if (trimmed && targetProvider !== provider) {
      setProvider(targetProvider);
    }
    setApiKey(trimmed);
    setSaved(true);
    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current);
    }
    savedTimerRef.current = setTimeout(() => setSaved(false), 2000);

    // Live-verify the key against the provider so a green check actually means
    // "works" — not just "right format". An invalid key silently degrades the app.
    setVerifyResult(null);
    if (!trimmed) return;
    setVerifying(true);
    try {
      const { validateApiKey } = await import('../lib/groq');
      const result = await validateApiKey(targetProvider, trimmed);
      setVerifyResult(result);
    } catch (error) {
      setVerifyResult({ ok: false, error: friendlyAIError(error) });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <>
    <Portal>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: t.modal }}
              exit={{ opacity: 0, transition: t.modalExit }}
              onClick={onClose}
              className="fixed inset-0 bg-[var(--overlay)] backdrop-blur-[var(--blur-1)] z-[200]"
            />
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              initial={{ opacity: 0, y: 8, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: t.modal }}
              exit={{ opacity: 0, y: 8, scale: 0.985, transition: t.modalExit }}
              className="fixed z-[201] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl rounded-[var(--r-xl)] overflow-hidden flex flex-col premium-modal"
              style={{
                maxHeight: '85vh',
                WebkitAppRegion: 'no-drag',
              } as React.CSSProperties}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 pb-4 border-b" style={{ borderColor: theme.border }}>
                <div>
                  <h2 id={titleId} className="text-lg font-black tracking-tight" style={{ color: theme.text }}>Setări AI</h2>
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-50" style={{ color: theme.text }}>
                    Provider, model și memorie
                  </p>
                </div>
                <motion.button
                  whileTap={calmMotion ? undefined : { scale: 0.97 }}
                  onClick={onClose}
                  aria-label="Închide"
                  className="p-2 rounded-[var(--r-md)] transition-colors focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)]"
                  style={{ color: theme.text3, background: theme.surface2, border: `1px solid ${theme.border}`, cursor: 'pointer' }}
                >
                  <X size={16} />
                </motion.button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 pt-5 custom-scrollbar" style={{ minHeight: 0 }}>
                {/* API Key */}
                <div className="mb-6">
                  <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.1em] mb-2.5 opacity-60" style={{ color: theme.text }}>
                    <Key size={12} /> Cheie API {activeProvider.name}
                  </label>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={draft}
                      onChange={(e) => { setDraft(e.target.value); setVerifyResult(null); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                      placeholder={activeProvider.keyHint}
                      className="w-full px-4 py-3 rounded-[var(--r-md)] text-sm pr-10 font-medium focus:outline-none focus-visible:shadow-[var(--ring-focus)]"
                      style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text }}
                    />
                    <button onClick={() => setShowKey(!showKey)} aria-label={showKey ? 'Ascunde cheia' : 'Arată cheia'} className="fine-row absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-[var(--r-sm)] hover:bg-[var(--hover-fill)] transition-colors" style={{ color: theme.text3 }}>
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <button
                    onClick={() => setShowGuide((v) => !v)}
                    className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-black hover:opacity-80 transition-opacity"
                    style={{ color: theme.accentText }}
                  >
                    <Gift size={12} /> Cum obțin o cheie gratuită?
                    <ChevronDown size={12} style={{ transform: showGuide ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </button>
                  {showGuide && (
                    <div className="mt-3 rounded-[var(--r-md)] p-4" style={{ background: `${theme.accent}0C`, border: `1px solid ${theme.accent}25` }}>
                      <p className="mb-3 text-[11px] font-bold" style={{ color: theme.accentText }}>
                        {KEY_GUIDE[provider].intro}
                      </p>
                      <ol className="space-y-2">
                        {KEY_GUIDE[provider].steps.map((step, i) => (
                          <li key={i} className="flex items-start gap-2.5 text-[12px] leading-5" style={{ color: theme.text2 }}>
                            <span
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white"
                              style={{ background: theme.accent }}
                            >
                              {i + 1}
                            </span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                      <a
                        href={activeProvider.docs}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="elev-1 mt-3.5 inline-flex items-center gap-1.5 rounded-[var(--r-sm)] px-3.5 py-2 text-[11px] font-black text-white"
                        style={{ background: theme.accent }}
                      >
                        <ArrowUpRight size={13} /> Deschide {activeProvider.name}
                      </a>
                    </div>
                  )}
                  {keyInvalid && (
                    <div
                      className="mt-2 rounded-[var(--r-sm)] px-3 py-2 text-[11px] font-bold leading-relaxed"
                      style={{ color: theme.text, background: `${theme.danger}1A`, border: `1px solid ${theme.danger}40` }}
                    >
                      Cheia pare incompletă — copiaz-o din nou întreagă (cheia Groq începe cu „gsk_"; cheia Google e mai lungă).
                    </div>
                  )}
                  {!keyInvalid && keyForOtherProvider && detectedProvider && (
                    <div
                      className="mt-2 rounded-[var(--r-sm)] px-3 py-2 text-[11px] font-bold leading-relaxed"
                      style={{ color: theme.text, background: `${theme.accent}1A`, border: `1px solid ${theme.accent}40` }}
                    >
                      Cheie {PROVIDERS.find((p) => p.id === detectedProvider)?.name ?? detectedProvider} detectată — la „Salvează" comut automat pe acest provider.
                    </div>
                  )}
                  {verifying && (
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold" style={{ color: theme.accentText }}>
                      <Loader2 size={12} className="animate-spin" /> Verific cheia cu {activeProvider.name}…
                    </p>
                  )}
                  {!verifying && verifyResult && (() => {
                    const tone = !verifyResult.ok
                      ? theme.danger
                      : verifyResult.warning
                        ? theme.warning
                        : theme.success;
                    return (
                      <div
                        role="status"
                        className="mt-2 flex items-start gap-2 rounded-[var(--r-sm)] px-3 py-2 text-[11px] font-bold leading-relaxed"
                        style={{ color: theme.text, background: `${tone}1A`, border: `1px solid ${tone}40` }}
                      >
                        {verifyResult.ok
                          ? <><Check size={14} strokeWidth={3} className="mt-px shrink-0" style={{ color: tone }} /> <span>{verifyResult.warning ?? 'Cheie validă și funcțională.'}</span></>
                          : <><X size={14} strokeWidth={3} className="mt-px shrink-0" style={{ color: tone }} /> <span>{verifyResult.error}</span></>}
                      </div>
                    );
                  })()}
                </div>

                <div className="mb-6">
                  <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.1em] mb-2.5 opacity-60" style={{ color: theme.text }}>
                    <Cpu size={12} /> Provider AI
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {PROVIDERS.map((entry) => {
                      const active = provider === entry.id;
                      return (
                        <button
                          key={entry.id}
                          onClick={() => {
                            setProvider(entry.id);
                            setSaved(false);
                            setVerifyResult(null);
                          }}
                          className="flex min-h-[82px] items-start gap-3 rounded-[var(--r-md)] px-4 py-3 text-left transition-colors"
                          style={{
                            background: active ? `${theme.accent}14` : theme.surface2,
                            border: `1px solid ${active ? theme.accent + '50' : theme.border}`,
                          }}
                        >
                          <div className="flex-1">
                            <p className="text-sm font-black" style={{ color: theme.text }}>{entry.name}</p>
                            <p className="mt-1 text-[11px] font-medium leading-5 opacity-60" style={{ color: theme.text }}>{entry.desc}</p>
                          </div>
                          {active && <div className="elev-1 mt-0.5 flex h-6 w-6 items-center justify-center rounded-full" style={{ background: theme.accent }}><Check size={12} color="white" strokeWidth={4} /></div>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Model Selection */}
                <div className="mb-8">
                  <div className="mb-2.5 flex items-center justify-between gap-3">
                    <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.1em] opacity-60" style={{ color: theme.text }}>
                      <Cpu size={12} /> Model AI
                    </label>
                    <motion.button
                      whileTap={calmMotion ? undefined : { scale: 0.97 }}
                      onClick={() => void handleRefreshModel()}
                      disabled={refreshingModel || !hasAnyProviderKey}
                      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] disabled:opacity-40"
                      style={{ background: theme.surface2, color: theme.accentText, border: `1px solid ${theme.border}` }}
                      title="Verifică toate providerele AI configurate și trece automat pe modelele care încă funcționează"
                    >
                      {refreshingModel
                        ? <><Loader2 size={11} className="animate-spin" /> Verific…</>
                        : <><RefreshCw size={11} /> Actualizează</>}
                    </motion.button>
                  </div>
                  <div className="space-y-2">
                    {modelOptions.map((m) => (
                      <button key={m.id} onClick={() => setModel(m.id)} className="w-full flex items-center gap-3 px-4 py-3 rounded-[var(--r-md)] text-left transition-colors"
                        style={{
                          background: model === m.id ? `${theme.accent}14` : theme.surface2,
                          border: `1px solid ${model === m.id ? theme.accent + '50' : theme.border}`,
                        }}>
                        <div className="flex-1">
                          <p className="text-sm font-bold" style={{ color: theme.text }}>{m.name}</p>
                          <p className="text-[11px] font-medium opacity-50" style={{ color: theme.text }}>{m.desc} · {m.speed}</p>
                        </div>
                        {model === m.id && <div className="elev-1 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: theme.accent }}><Check size={12} color="white" strokeWidth={4} /></div>}
                      </button>
                    ))}
                  </div>
                </div>

                <motion.button whileTap={calmMotion || keyInvalid ? undefined : { scale: 0.97 }} onClick={handleSave} disabled={keyInvalid} className="elev-2 w-full py-3.5 rounded-[var(--r-md)] font-black text-sm text-white mb-8 disabled:opacity-45"
                  style={{ background: saved ? theme.success : keyInvalid ? theme.surface2 : theme.accent, color: keyInvalid ? theme.text3 : '#fff' }}>
                  {saved ? 'Salvat!' : 'Salvează Configurarea'}
                </motion.button>

                <AIUsagePanel />

                {/* What the assistant knows about you (Task 4) */}
                <div className="mb-6 rounded-[var(--r-xl)] p-4 border" style={{ borderColor: theme.border, background: 'var(--hover-fill)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2" style={{ color: theme.text }}>
                      <Brain size={14} />
                      <span className="text-[11px] font-black uppercase tracking-[0.12em]">Ce știe asistentul despre tine</span>
                    </div>
                    {memorySummary && (
                      <button
                        onClick={handleResetMemory}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--r-sm)] text-[10px] font-black uppercase"
                        style={{ color: theme.danger, background: `${theme.danger}12`, border: `1px solid ${theme.danger}30` }}
                      >
                        <Trash2 size={11} /> Resetează
                      </button>
                    )}
                  </div>
                  {memorySummary ? (
                    <p className="text-[12px] leading-relaxed" style={{ color: theme.text2 }}>{memorySummary}</p>
                  ) : (
                    <p className="text-[12px] leading-relaxed" style={{ color: theme.text3 }}>
                      Încă nu am suficiente date. Pe măsură ce rezolvi sesiuni, asistentul învață ce topicuri îți sunt grele, unde ești bun și cum studiezi.
                    </p>
                  )}
                </div>

                <ChatMemoryPanel profileId={activeProfileId} />

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </Portal>

    <Portal>
      <AnimatePresence>
        {showProviderCheck && providerCheckResults && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: t.modal }}
              exit={{ opacity: 0, transition: t.modalExit }}
              onClick={() => setShowProviderCheck(false)}
              className="fixed inset-0 bg-[var(--overlay)] backdrop-blur-[var(--blur-1)] z-[210]"
            />
            <motion.div
              ref={checkDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={checkTitleId}
              initial={{ opacity: 0, y: 8, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: t.modal }}
              exit={{ opacity: 0, y: 8, scale: 0.985, transition: t.modalExit }}
              className="premium-modal fixed left-1/2 top-1/2 z-[211] w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--r-xl)] p-6"
            >
              <div className="mb-5 flex items-center gap-3">
                <div className="elev-1 flex h-11 w-11 items-center justify-center rounded-[var(--r-md)]" style={{ background: theme.accent }}>
                  <Sparkles size={19} color="#fff" />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: theme.text3 }}>Verificare AI</div>
                  <div id={checkTitleId} className="text-base font-black" style={{ color: theme.text }}>Modele actualizate</div>
                </div>
                <motion.button
                  whileTap={calmMotion ? undefined : { scale: 0.97 }}
                  onClick={() => setShowProviderCheck(false)}
                  aria-label="Închide"
                  className="rounded-[var(--r-sm)] p-2"
                  style={{ color: theme.text3, background: theme.surface2 }}
                >
                  <X size={16} />
                </motion.button>
              </div>

              <div className="space-y-2.5">
                {providerCheckResults.map((entry, i) => {
                  const tone = !entry.hadKey ? theme.text3 : !entry.ok ? theme.danger : entry.changed ? theme.accentText : theme.success;
                  return (
                    <motion.div
                      key={entry.provider}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={calmMotion ? t.page : { delay: i * 0.06, duration: 0.3 }}
                      className="flex items-center gap-3 rounded-[var(--r-md)] px-4 py-3"
                      style={{ background: theme.surface2, border: `1px solid ${tone}30` }}
                    >
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]" style={{ background: `${tone}18`, color: tone }}>
                        {!entry.hadKey ? <Key size={15} /> : !entry.ok ? <X size={15} strokeWidth={3} /> : entry.changed ? <Sparkles size={15} /> : <Check size={15} strokeWidth={3} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-black" style={{ color: theme.text }}>{entry.providerName}</div>
                        <div className="truncate text-[11px] font-semibold" style={{ color: theme.text3 }}>
                          {entry.changed && entry.previousModel
                            ? `${entry.previousModel} → ${entry.model}`
                            : entry.model ?? entry.message}
                        </div>
                      </div>
                      <span
                        className="flex-shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider"
                        style={{ background: `${tone}18`, color: tone }}
                      >
                        {!entry.hadKey ? 'Fără cheie' : !entry.ok ? 'Eșuat' : entry.changed ? 'Actualizat' : 'La zi'}
                      </span>
                    </motion.div>
                  );
                })}
              </div>

              <motion.button
                whileTap={calmMotion ? undefined : { scale: 0.97 }}
                onClick={() => setShowProviderCheck(false)}
                className="elev-1 mt-5 w-full rounded-[var(--r-md)] py-3 text-sm font-black text-white"
                style={{ background: theme.accent }}
              >
                Am înțeles
              </motion.button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </Portal>
    </>
  );
}
