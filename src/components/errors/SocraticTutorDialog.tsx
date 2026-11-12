import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Loader2, Send } from 'lucide-react';
import ModalShell from '../ui/ModalShell';
import { useTheme } from '../../theme/ThemeContext';
import { useAIStore } from '../../store/aiStore';
import { useStatsStore } from '../../store/statsStore';
import type { ErrorEntry } from '../../lib/errorNotebook';
import { ERROR_TYPES, errorTypeInfo, localSocraticQuestions, normalizeErrorType, type ErrorTypeId } from '../../lib/errorTypes';
import { MAX_STUDENT_TURNS, nextSocraticStep, type SocraticTurn } from '../../lib/socraticTutor';

interface Props {
  entry: ErrorEntry;
  onClose: () => void;
}

/** Cheie AI configurată (principală sau oricare furnizor de rezervă): fără ea, dialogul rulează local. */
function useHasAIKey(): boolean {
  return useAIStore((state) => state.hasKey || Object.values(state.providerKeys).some((key) => !!key?.trim()));
}

/**
 * „Tutor socratic”: AI-ul nu dă răspunsul, pune 2-3 întrebări de ghidare și apoi propune tipul erorii
 * (definiție, mecanism, excepție, vecin adevărat, inversare), pe care studentul îl confirmă sau îl schimbă.
 * Fără cheie AI (sau dacă AI-ul nu răspunde) rămân întrebările-șablon și alegerea manuală.
 */
export default function SocraticTutorDialog({ entry, onClose }: Props) {
  const theme = useTheme();
  const aiKey = useHasAIKey();
  const setErrorType = useStatsStore((state) => state.setErrorType);
  const saved = normalizeErrorType(entry.stat.errorType);

  const [aiMode, setAiMode] = useState(aiKey);
  const [loading, setLoading] = useState(aiKey);
  const [turns, setTurns] = useState<SocraticTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<ErrorTypeId | null>(saved ?? null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [localIndex, setLocalIndex] = useState(0);
  const localQuestions = useRef(localSocraticQuestions(entry.question)).current;
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const ask = async (history: SocraticTurn[]) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const step = await nextSocraticStep(entry, history, controller.signal);
      if (controller.signal.aborted) return;
      if (step.kind === 'question') {
        setTurns([...history, { role: 'assistant', text: step.text }]);
      } else if (step.kind === 'verdict') {
        setPicked(step.verdict.type);
        setReason(step.verdict.reason);
        setPicking(true);
      } else {
        setNote(step.text);
        setPicking(true);
      }
    } catch {
      if (controller.signal.aborted) return;
      // AI indisponibil: continuăm cu întrebările-șablon și alegerea manuală.
      setAiMode(false);
      setNote('AI-ul nu a răspuns acum. Continuăm cu câteva întrebări de reflecție, iar tipul îl alegi tu.');
      setTurns([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    if (!aiKey) return undefined;
    void ask([]);
    const controller = abortRef;
    return () => controller.current?.abort();
    // Pornește o singură dată, la deschidere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [turns, loading, localIndex, picking]);

  const studentTurns = turns.filter((turn) => turn.role === 'student').length;

  const submitAI = (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || loading) return;
    const history: SocraticTurn[] = [...turns, { role: 'student', text }];
    setTurns(history);
    setDraft('');
    setLoading(true);
    void ask(history);
  };

  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    submitAI();
  };

  const nextLocal = () => {
    setDraft('');
    if (localIndex + 1 >= localQuestions.length) setPicking(true);
    else setLocalIndex(localIndex + 1);
  };

  const save = () => {
    if (!picked) return;
    setErrorType(entry.key, picked);
    onClose();
  };

  const bubble = (role: SocraticTurn['role']) => ({
    background: role === 'assistant' ? 'var(--fill-subtle)' : 'var(--accent-soft)',
    color: role === 'assistant' ? theme.text : theme.accentText,
  });

  return (
    <ModalShell
      open
      width="lg"
      title="Tutor socratic"
      subtitle="Nu primești răspunsul, ci întrebări care arată unde s-a rupt raționamentul."
      onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} className="press-feedback focus-ring rounded-full px-4 py-2 text-[13px] font-semibold" style={{ color: theme.text2 }}>
            Închide
          </button>
          {picking && (
            <button
              type="button"
              onClick={save}
              disabled={!picked}
              className="press-feedback focus-ring rounded-full px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
              style={{ background: theme.accent }}
            >
              Salvează tipul erorii
            </button>
          )}
        </>
      )}
    >
      <p className="rounded-[var(--r-md)] px-3.5 py-2.5 text-[13px] font-semibold leading-snug" style={{ background: 'var(--fill-subtle)', color: theme.text }}>
        {entry.question.text}
      </p>

      {note && <p role="status" className="text-[12.5px] leading-snug" style={{ color: theme.text3 }}>{note}</p>}

      {aiMode ? (
        <div className="space-y-2.5" aria-live="polite">
          {turns.map((turn, index) => (
            <p key={index} className={`max-w-[88%] rounded-[var(--r-md)] px-3.5 py-2.5 text-[13.5px] leading-relaxed ${turn.role === 'student' ? 'ml-auto' : ''}`} style={bubble(turn.role)}>
              {turn.text}
            </p>
          ))}
          {loading && (
            <p className="flex items-center gap-2 text-[12.5px]" style={{ color: theme.text3 }}>
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />Tutorul se gândește...
            </p>
          )}
        </div>
      ) : (
        !picking && (
          <div className="space-y-2.5">
            <p className="text-[12px] font-semibold" style={{ color: theme.text3 }}>Întrebarea {localIndex + 1} din {localQuestions.length}</p>
            <p className="rounded-[var(--r-md)] px-3.5 py-2.5 text-[13.5px] leading-relaxed" style={bubble('assistant')}>{localQuestions[localIndex]}</p>
          </div>
        )
      )}

      {!picking && aiMode && !loading && turns.length > 0 && (
        <form onSubmit={submitAI} className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKey}
            rows={2}
            aria-label="Răspunsul tău"
            placeholder="Spune-ți gândirea, cu cuvintele tale..."
            className="input-bare min-w-0 flex-1 resize-none rounded-[var(--r-md)] border border-[var(--hairline)] bg-[var(--fill-subtle)] px-3.5 py-2.5 text-[13px]"
            style={{ color: theme.text }}
          />
          <button type="submit" disabled={!draft.trim()} aria-label="Trimite" className="press-feedback focus-ring rounded-full p-2.5 text-white disabled:opacity-50" style={{ background: theme.accent }}>
            <Send size={15} aria-hidden="true" />
          </button>
        </form>
      )}

      {!picking && !aiMode && (
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            aria-label="Gândirea ta (rămâne doar aici, pentru reflecție)"
            placeholder="Notează-ți gândul (opțional)..."
            className="input-bare min-w-0 flex-1 resize-none rounded-[var(--r-md)] border border-[var(--hairline)] bg-[var(--fill-subtle)] px-3.5 py-2.5 text-[13px]"
            style={{ color: theme.text }}
          />
          <button type="button" onClick={nextLocal} className="press-feedback focus-ring rounded-full px-4 py-2.5 text-[13px] font-semibold text-white" style={{ background: theme.accent }}>
            {localIndex + 1 >= localQuestions.length ? 'Alege tipul' : 'Mai departe'}
          </button>
        </div>
      )}

      {!picking && (
        <button type="button" onClick={() => setPicking(true)} className="focus-ring text-[12.5px] font-semibold underline-offset-2 hover:underline" style={{ color: theme.accentText }}>
          {aiMode && studentTurns < MAX_STUDENT_TURNS ? 'Știu deja unde am greșit: aleg tipul' : 'Aleg tipul erorii'}
        </button>
      )}

      {picking && (
        <div className="space-y-3">
          {reason && (
            <p className="text-[13px] leading-relaxed" style={{ color: theme.text2 }}>
              <span className="font-semibold" style={{ color: theme.text }}>Ce s-a văzut: </span>{reason}
            </p>
          )}
          <div role="radiogroup" aria-label="Tipul erorii" className="flex flex-wrap gap-2">
            {ERROR_TYPES.map((type) => (
              <button
                key={type.id}
                type="button"
                role="radio"
                aria-checked={picked === type.id}
                onClick={() => setPicked(type.id)}
                className="fine-chip press-feedback focus-ring rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold"
                style={picked === type.id ? { background: theme.accent, color: '#fff' } : { color: theme.accentText }}
              >
                {type.label}
              </button>
            ))}
          </div>
          {picked && <p className="text-[12.5px] leading-snug" style={{ color: theme.text3 }}>{errorTypeInfo(picked).description}</p>}
        </div>
      )}
      <div ref={endRef} />
    </ModalShell>
  );
}
