import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronDown, Loader2, ShieldCheck, ShieldX, ShieldAlert, ScanSearch } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import HelpTip from '../ui/HelpTip';
import { useAIStore, getConfiguredProviderModels } from '../../store/aiStore';
import {
  VERDICT_LABEL,
  canCrossCheck,
  runCrossCheck,
  verifierLabel,
  type CrossCheckInput,
  type CrossCheckOutcome,
  type CrossCheckResult,
  type ModelRef,
} from '../../lib/ai/crossCheck';

export interface CrossCheckSaved {
  result: CrossCheckResult;
  verifier: ModelRef;
  tokens: number;
  estimated: boolean;
}

type Phase = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'done'; saved: CrossCheckSaved };

const CLAIM_LABEL = { confirmat: 'Confirmat', discutabil: 'Discutabil', greșit: 'Greșit' } as const;

/**
 * Compact "Verifică cu alt model" control + verdict card. Never starts by itself: the click is the consent
 * to spend a request (and a few thousand tokens) on the OTHER provider's free quota.
 */
export default function CrossCheckCard({
  question,
  answer,
  sources,
  producer,
  saved,
  onResult,
  run = runCrossCheck,
}: Pick<CrossCheckInput, 'question' | 'answer' | 'sources'> & {
  producer?: ModelRef | null;
  /** A verdict kept with the message, shown without another request. */
  saved?: CrossCheckSaved;
  onResult?: (saved: CrossCheckSaved) => void;
  /** Injection point for tests. */
  run?: (input: CrossCheckInput) => Promise<CrossCheckOutcome>;
}) {
  const theme = useTheme();
  const navigate = useNavigate();
  const providerKeys = useAIStore((s) => s.providerKeys);
  const providerModels = useAIStore((s) => s.providerModels);
  const provider = useAIStore((s) => s.provider);
  const model = useAIStore((s) => s.model);
  const apiKey = useAIStore((s) => s.apiKey);
  const [phase, setPhase] = useState<Phase>(saved ? { kind: 'done', saved } : { kind: 'idle' });
  const [expanded, setExpanded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const available = canCrossCheck(getConfiguredProviderModels({ providerKeys, providerModels, provider, model, apiKey }));

  const start = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: 'loading' });
    try {
      const outcome = await run({ question, answer, sources, producer, abortSignal: controller.signal });
      if (controller.signal.aborted) return;
      if (outcome.ok) {
        const next = { result: outcome.result, verifier: outcome.verifier, tokens: outcome.tokens, estimated: outcome.estimated };
        setPhase({ kind: 'done', saved: next });
        onResult?.(next);
      } else {
        setPhase({ kind: 'error', message: outcome.error });
      }
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        setPhase({ kind: 'idle' });
        return;
      }
      setPhase({ kind: 'error', message: error instanceof Error ? error.message : 'Verificarea a eșuat.' });
    }
  };

  const chip = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors hover:opacity-80';
  const chipStyle = { background: theme.surface, color: theme.text3, border: `1px solid ${theme.border}` };

  if (phase.kind === 'done') {
    const { result, verifier, tokens, estimated } = phase.saved;
    const tone = result.verdict === 'verificat' ? theme.success : result.verdict === 'atentie' ? theme.warning : theme.danger;
    const Icon = result.verdict === 'verificat' ? ShieldCheck : result.verdict === 'atentie' ? ShieldAlert : ShieldX;
    const panelId = `crosscheck-${result.claims.length}-${result.verdict}`;
    return (
      <div
        data-testid="crosscheck-card"
        className="mt-3 rounded-[var(--r-md)] p-3"
        style={{ background: theme.surface, border: `1px solid ${tone}55` }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="crosscheck-verdict"
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-[0.1em]"
            style={{ background: `${tone}1f`, color: tone }}
          >
            <Icon size={12} aria-hidden="true" />{VERDICT_LABEL[result.verdict]}
          </span>
          <span className="text-[11px]" style={{ color: theme.text3 }}>
            de {verifierLabel(verifier)}{tokens > 0 ? ` · ${estimated ? '≈' : ''}${tokens} tokeni` : ''}
          </span>
        </div>
        {result.summary && <p className="mt-2 text-[12px] leading-relaxed" style={{ color: theme.text2 }}>{result.summary}</p>}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold"
          style={{ color: theme.accentText }}
        >
          {result.claims.length} {result.claims.length === 1 ? 'afirmație' : 'afirmații'}
          <ChevronDown size={12} aria-hidden="true" style={{ transform: expanded ? 'rotate(180deg)' : undefined }} />
        </button>
        {expanded && (
          <ul id={panelId} className="mt-2 space-y-1.5">
            {result.claims.map((claim, index) => {
              const claimTone = claim.status === 'confirmat' ? theme.success : claim.status === 'discutabil' ? theme.warning : theme.danger;
              return (
                <li key={index} className="text-[12px] leading-snug" style={{ color: theme.text2 }}>
                  <span className="mr-1.5 rounded-full px-1.5 py-px text-[10px] font-bold" style={{ background: `${claimTone}1f`, color: claimTone }}>
                    {CLAIM_LABEL[claim.status]}
                  </span>
                  <span style={{ color: theme.text }}>{claim.claim}</span>
                  {claim.reason && <span> — {claim.reason}</span>}
                  {claim.inSource === false && !/în sursă nu apare/i.test(claim.reason) && (
                    <span className="ml-1.5 text-[10px] font-semibold" style={{ color: theme.warning }}>în sursă nu apare</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-[10px]" style={{ color: theme.text3 }}>
          Un model nu garantează adevărul: confirmă din curs înainte de examen.
        </p>
      </div>
    );
  }

  if (!available) {
    return (
      <div className="mt-3 text-[11px]" style={{ color: theme.text3 }} data-testid="crosscheck-hint">
        <ScanSearch size={12} className="mr-1 inline" aria-hidden="true" />
        <button type="button" onClick={() => navigate('/settings?s=ai')} className="font-semibold underline" style={{ color: theme.accentText }}>
          Adaugă încă o cheie ca să verifici
        </button>
      </div>
    );
  }

  if (phase.kind === 'loading') {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]" role="status" style={{ color: theme.text3 }}>
        <Loader2 size={12} className="animate-spin" aria-hidden="true" />
        Verific cu alt model…
        <button type="button" onClick={() => abortRef.current?.abort()} className="font-semibold underline" style={{ color: theme.accentText }}>
          Anulează
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      {phase.kind === 'error' && (
        <p role="alert" className="mb-1.5 flex items-start gap-1.5 text-[11px] leading-snug" style={{ color: theme.danger }}>
          <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />{phase.message}
        </p>
      )}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => void start()}
          className={chip}
          style={chipStyle}
          title="Trimite întrebarea, răspunsul și sursele la alt furnizor AI (consumă din cota lui gratuită, câteva mii de tokeni)"
        >
          <ScanSearch size={12} aria-hidden="true" />
          {phase.kind === 'error' ? 'Reîncearcă verificarea' : 'Verifică cu alt model'}
        </button>
        <HelpTip id="chat-cross-check" size={16} />
      </div>
    </div>
  );
}
