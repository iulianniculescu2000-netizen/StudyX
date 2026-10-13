import { Check, Loader2, X, AlertTriangle, RotateCcw, Sparkles, Minus, Plus, Target } from 'lucide-react';
import { useAgentJobsStore, type AgentJobStep, type AgentJobStepParams } from '../../store/agentJobsStore';
import type { Theme } from '../../theme/themes';

function StepIcon({ status, color }: { status: AgentJobStep['status']; color: string }) {
  if (status === 'running') return <Loader2 size={13} className="animate-spin" style={{ color }} />;
  if (status === 'done') return <Check size={13} style={{ color }} />;
  if (status === 'error') return <X size={13} style={{ color }} />;
  if (status === 'skipped') return <span style={{ color, fontSize: 11 }}>—</span>;
  return <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ border: `1.5px solid ${color}` }} />;
}

const DIFFICULTY_OPTIONS = [
  { id: 'auto', label: 'Auto' },
  { id: 'easy', label: 'Ușor' },
  { id: 'medium', label: 'Mediu' },
  { id: 'hard', label: 'Dificil' },
] as const;

const QUESTION_TYPE_OPTIONS = [
  { id: 'single', label: 'Simplu' },
  { id: 'multiple', label: 'Multiplu' },
] as const;

/** Inline controls so the user can fix a misread count/difficulty/type instead of cancelling and retyping the whole command. */
function StepParamEditor({
  theme,
  action,
  params,
  onChange,
}: {
  theme: Theme;
  action: string;
  params: AgentJobStepParams;
  onChange: (patch: Partial<AgentJobStepParams>) => void;
}) {
  const isQuizPack = action === 'generate_quiz_pack';
  const isQuizTopic = action === 'generate_quiz_topic';
  const isMistakes = action === 'generate_from_mistakes';
  const isFlashcards = action === 'create_flashcards';
  if (!isQuizPack && !isQuizTopic && !isMistakes && !isFlashcards) return null;

  const usesPackCount = isQuizPack || isQuizTopic;
  const countKey: keyof AgentJobStepParams = usesPackCount ? 'questionsPerPack' : 'count';
  const countValue = usesPackCount ? params.questionsPerPack ?? 10 : params.count ?? (isFlashcards ? 15 : 10);
  const countStep = 5;
  const countMax = usesPackCount ? 60 : 100;

  const chipStyle = (active: boolean) => ({
    background: active ? theme.accent : theme.surface,
    color: active ? '#fff' : theme.text3,
    border: `1px solid ${active ? `${theme.accent}50` : theme.border}`,
  });

  return (
    <div className="ml-[26px] mt-1.5 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-lg px-1 py-0.5" style={{ background: theme.surface, border: `1px solid ${theme.border}` }}>
        <button
          type="button"
          onClick={() => onChange({ [countKey]: Math.max(countStep, countValue - countStep) } as Partial<AgentJobStepParams>)}
          aria-label={isFlashcards ? 'Mai puține carduri' : 'Mai puține întrebări'}
          className="flex h-5 w-5 items-center justify-center rounded"
          style={{ color: theme.text3 }}
        >
          <Minus size={11} />
        </button>
        <span className="min-w-[2.5rem] text-center text-[11px] font-bold tabular-nums" style={{ color: theme.text2 }}>
          {countValue} {isFlashcards ? 'carduri' : 'întrebări'}
        </span>
        <button
          type="button"
          onClick={() => onChange({ [countKey]: Math.min(countMax, countValue + countStep) } as Partial<AgentJobStepParams>)}
          aria-label={isFlashcards ? 'Mai multe carduri' : 'Mai multe întrebări'}
          className="flex h-5 w-5 items-center justify-center rounded"
          style={{ color: theme.text3 }}
        >
          <Plus size={11} />
        </button>
      </div>

      {(isQuizPack || isQuizTopic || isMistakes) && (
        <div className="flex gap-1">
          {QUESTION_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange({ questionType: opt.id })}
              className="rounded-lg px-2 py-1 text-[10px] font-bold"
              style={chipStyle((params.questionType ?? 'single') === opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {(isQuizPack || isQuizTopic) && (
        <div className="flex gap-1">
          {DIFFICULTY_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange({ difficulty: opt.id })}
              className="rounded-lg px-2 py-1 text-[10px] font-bold"
              style={chipStyle((params.difficulty ?? 'auto') === opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Green when the batch matches the exam, amber when it drifts, red when it doesn't. */
function conformanceColor(score: number, theme: Theme) {
  if (score >= 83) return theme.success;
  if (score >= 50) return theme.warning;
  return theme.danger;
}

export default function AgentJobCard({
  jobId,
  theme,
  onConfirm,
  onCancel,
  onUndo,
  onRetry,
  onEditParams,
}: {
  jobId: string;
  theme: Theme;
  onConfirm: () => void;
  onCancel: () => void;
  onUndo: () => void;
  onRetry?: () => void;
  onEditParams?: (stepId: string, patch: Partial<AgentJobStepParams>) => void;
}) {
  const job = useAgentJobsStore((state) => state.jobs.find((entry) => entry.id === jobId));
  if (!job) return null;

  const awaiting = job.status === 'awaiting-confirm';
  const running = job.status === 'running';
  const done = job.status === 'done';
  const errored = job.status === 'error';

  return (
    <div
      className="rounded-[var(--r-lg)] border p-3.5"
      style={{ background: theme.surface2, borderColor: `${theme.accent}30` }}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <Sparkles size={14} style={{ color: theme.accentText }} />
        <span className="text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: theme.accentText }}>
          {awaiting ? 'Plan agent · confirmă' : running ? 'Agent lucrează' : done ? 'Agent · gata' : errored ? 'Agent · cu probleme' : 'Agent'}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {job.steps.map((step) => {
          const color = step.status === 'error'
            ? theme.danger
            : step.status === 'done'
              ? theme.success
              : step.status === 'running'
                ? theme.accent
                : theme.text3;
          return (
            <div key={step.id} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center">
                <StepIcon status={step.status} color={color} />
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-[12px] font-semibold" style={{ color: theme.text2 }}>{step.label}</span>
                {step.detail && (
                  <span className="ml-1.5 text-[11px]" style={{ color: step.status === 'error' ? theme.danger : theme.text3 }}>
                    · {step.detail}
                  </span>
                )}
                {awaiting && step.action && onEditParams && (
                  <StepParamEditor
                    theme={theme}
                    action={step.action}
                    params={step.params ?? {}}
                    onChange={(patch) => onEditParams(step.id, patch)}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {job.conformance && (
        <div
          className="mt-3 flex items-start gap-2 rounded-2xl px-3 py-2"
          style={{
            background: `${conformanceColor(job.conformance.score, theme)}12`,
            border: `1px solid ${conformanceColor(job.conformance.score, theme)}30`,
          }}
          title={job.conformance.issues.length > 0
            ? `Sub țintă: ${job.conformance.issues.join(', ')}`
            : 'Toate metricile sunt în ținta măsurată pe subiectele reale.'}
        >
          <Target size={12} className="mt-0.5 flex-shrink-0" style={{ color: conformanceColor(job.conformance.score, theme) }} />
          <div className="min-w-0">
            <div className="text-[11px] font-black" style={{ color: conformanceColor(job.conformance.score, theme) }}>
              {job.conformance.score}/100 · seamănă cu examenul ({job.conformance.label})
            </div>
            {job.conformance.issues.length > 0 && (
              <div className="mt-0.5 text-[10px] font-medium" style={{ color: theme.text3 }}>
                Sub țintă: {job.conformance.issues.join(' · ')}
              </div>
            )}
          </div>
        </div>
      )}

      {awaiting && (
        <div className="mt-3 flex items-center gap-2">
          {job.summary && (
            <span className="mr-auto flex items-center gap-1.5 text-[10px] font-bold" style={{ color: theme.warning }}>
              <AlertTriangle size={12} />
              {job.summary}
            </span>
          )}
          <button
            onClick={onCancel}
            className="rounded-xl px-3 py-1.5 text-[11px] font-black"
            style={{ background: theme.surface, color: theme.text3, border: `1px solid ${theme.border}` }}
          >
            Anulează
          </button>
          <button
            onClick={onConfirm}
            className="rounded-xl px-3.5 py-1.5 text-[11px] font-black uppercase tracking-wider text-white"
            style={{ background: theme.accent }}
          >
            Execută
          </button>
        </div>
      )}

      {done && (
        <button
          onClick={onUndo}
          className="mt-3 flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-black"
          style={{ background: theme.surface, color: theme.text2, border: `1px solid ${theme.border}` }}
        >
          <RotateCcw size={12} />
          Anulează acțiunile (Undo)
        </button>
      )}

      {errored && onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[11px] font-black uppercase tracking-wider text-white"
          style={{ background: theme.accent }}
        >
          <RotateCcw size={12} />
          Reîncearcă
        </button>
      )}
    </div>
  );
}
