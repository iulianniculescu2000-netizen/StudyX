import { memo } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Copy, CreditCard, ListChecks, RotateCcw, Sparkles } from 'lucide-react';
import type { Theme } from '../../theme/themes';
import type { AgentJobStepParams } from '../../store/agentJobsStore';
import AgentJobCard from './AgentJobCard';
import AIMarkdown from './AIMarkdown';
import Mascot from '../Mascot';
import AIThinkingIndicator from './AIThinkingIndicator';
import CrossCheckCard from './CrossCheckCard';
import { CITATION_TIER_TAG, citationChipParts, citationLabel, citationOpenLabel, useCitationTiers } from './citations';
import type { Citation as CitationType } from './shared';
import { CHAT_MODES, getContextState, type ChatMessage, type ChatMode, type Citation, type OptionCard } from './shared';
import OptionCardView from './OptionCardView';
import { servedBadgeText } from './servedBadge';
import HelpTip from '../ui/HelpTip';

/**
 * Everything a message can do. The drawer hands over ONE stable object (its methods always call the latest
 * handlers), so a streamed token re-renders only the last bubble instead of the whole list.
 */
export interface ChatMessageActions {
  toggleCitation: (key: string | null) => void;
  openBook: (citation: Citation) => void;
  copy: (content: string) => void;
  saveFlashcard: (index: number) => void;
  makeQuiz: (index: number) => void;
  regenerate: (index: number) => void;
  continueAnswer: (index: number) => void;
  retryError: (index: number) => void;
  switchModel: (index: number) => void;
  suggest: (text: string, mode?: ChatMode) => void;
  setCrossCheck: (index: number, crossCheck: NonNullable<ChatMessage['crossCheck']>) => void;
  runAgent: (jobId: string) => void;
  cancelAgent: (jobId: string) => void;
  undoAgent: (jobId: string) => void;
  retryAgent: (jobId: string) => void;
  editAgentParams: (jobId: string, stepId: string, patch: Partial<AgentJobStepParams>) => void;
  go: (route: string) => void;
  editOptionCard: (index: number, patch: Partial<OptionCard>) => void;
  submitOptionCard: (index: number) => void;
  cancelOptionCard: (index: number) => void;
}

interface ChatMessageBubbleProps {
  message: ChatMessage;
  index: number;
  isLastAssistant: boolean;
  /** The last assistant answer while it is still being written. */
  streaming: boolean;
  /** Text of the user message this answer replies to (for „Verifică cu alt model”). */
  question: string;
  /** Only the active citation key that belongs to THIS message, so a click elsewhere doesn't re-render every bubble. */
  activeCitationKey: string | null;
  agentResult: { route: string; label: string } | null;
  fallbackMode: ChatMode;
  theme: Theme;
  calmMotion: boolean;
  actions: ChatMessageActions;
}

const NO_CITATIONS: readonly CitationType[] = [];
const citationKeyOf = (index: number, citation: Citation) => `${index}-${citation.n ?? ''}-${citation.source}-${citation.topic}`;

function ChatMessageBubble({
  message, index, isLastAssistant, streaming, question, activeCitationKey, agentResult, fallbackMode, theme, calmMotion, actions,
}: ChatMessageBubbleProps) {
  const tiers = useCitationTiers(message.citations ?? NO_CITATIONS);
  return (
    <motion.div
      initial={false}
      className={`group flex items-start gap-2.5 ${calmMotion ? '' : 'fx-rise'} ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      {message.role === 'assistant' && (
        <div className="mt-0.5">
          <Mascot accent={theme.accent} size={26} static calm={calmMotion} />
        </div>
      )}
      <div
        className={`chat-bubble-content max-w-[84%] rounded-[var(--r-lg)] p-4 text-sm leading-relaxed ${message.role === 'user' ? 'text-white' : ''}`}
        style={{
          background: message.role === 'user' ? theme.accent : theme.surface2,
          color: message.role === 'user' ? '#fff' : theme.text,
          borderRadius: message.role === 'user' ? 'var(--r-lg) var(--r-lg) 8px var(--r-lg)' : 'var(--r-lg) var(--r-lg) var(--r-lg) 8px',
          border: message.role === 'assistant' ? `1px solid ${theme.border}` : 'none',
          boxShadow: message.role === 'user' ? 'var(--elev-1)' : 'none',
        }}
      >
        {message.role === 'assistant' && message.autoMode && message.mode && (
          <div
            className="mb-2 flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]"
            style={{ background: `${theme.accent}14`, color: theme.accentText }}
            title="Mod ales automat din mesajul tău"
          >
            <Sparkles size={10} aria-hidden="true" /> {CHAT_MODES.find((m) => m.id === message.mode)?.label ?? message.mode}
          </div>
        )}

        {streaming && !message.content.trim() ? (
          <AIThinkingIndicator compact size="sm" className="my-1.5" />
        ) : (
          <>
            <AIMarkdown content={message.content} className="font-medium" streaming={streaming} citations={message.citations} />
            {streaming && (
              <span className="streaming-cursor" style={{ color: theme.accentText }}>▌</span>
            )}
          </>
        )}

        {message.role === 'assistant' && message.localAnswer && !streaming && (
          <div className="mt-2 text-[11px]" style={{ color: theme.text3 }}>
            {message.completedWithCloud
              ? 'Început cu AI-ul local, completat cu cloud.'
              : 'Răspuns de la AI-ul local, mai simplu. Pentru o explicație completă, încearcă din nou când serviciile cloud sunt disponibile.'}
          </div>
        )}

        {message.role === 'assistant' && message.served && !streaming && !message.isError && !message.agentJobId && message.content.trim() && (
          <div className="mt-2 text-[11px]" style={{ color: theme.text3 }} title="Cine a scris acest răspuns">
            {servedBadgeText(message.served, message.completedWithCloud)}
          </div>
        )}

        {message.optionCard && (
          <OptionCardView
            card={message.optionCard}
            theme={theme}
            onEdit={(patch) => actions.editOptionCard(index, patch)}
            onSubmit={() => actions.submitOptionCard(index)}
            onCancel={() => actions.cancelOptionCard(index)}
            onOpen={actions.go}
          />
        )}

        {message.role === 'assistant' && message.agentJobId && (
          <div className="mt-3">
            <AgentJobCard
              jobId={message.agentJobId}
              theme={theme}
              onConfirm={() => actions.runAgent(message.agentJobId!)}
              onCancel={() => actions.cancelAgent(message.agentJobId!)}
              onUndo={() => actions.undoAgent(message.agentJobId!)}
              onRetry={() => actions.retryAgent(message.agentJobId!)}
              onEditParams={(stepId, patch) => actions.editAgentParams(message.agentJobId!, stepId, patch)}
            />
            {agentResult && (
              <button
                onClick={() => actions.go(agentResult.route)}
                className="press-feedback mt-2.5 inline-flex items-center gap-2 rounded-[var(--r-md)] px-4 py-2.5 text-[12px] font-black text-white shadow-md"
                style={{ background: theme.accent, boxShadow: `0 8px 20px ${theme.accent}33` }}
              >
                <ArrowRight size={14} /> {agentResult.label}
              </button>
            )}
          </div>
        )}

        {message.role === 'assistant' && message.openRoute && (
          <button
            onClick={() => actions.go(message.openRoute!.route)}
            className="press-feedback mt-3 inline-flex items-center gap-2 rounded-[var(--r-md)] px-4 py-2.5 text-[12px] font-black text-white shadow-md"
            style={{ background: theme.accent, boxShadow: `0 8px 20px ${theme.accent}33` }}
          >
            <ArrowRight size={14} /> {message.openRoute.label}
          </button>
        )}

        {message.role === 'assistant' && message.citations && message.citations.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex flex-wrap gap-2">
              <span className="citation-pill">{getContextState(message.citations)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {message.citations.map((citation, citationIndex) => {
                const citationKey = citationKeyOf(index, citation);
                const tier = tiers[citationIndex] ?? 'general';
                const isActiveCitation = activeCitationKey === citationKey;
                const chip = citationChipParts(citation);
                return (
                  <button
                    key={citationKey}
                    onClick={() => actions.toggleCitation(isActiveCitation ? null : citationKey)}
                    className="citation-source"
                    data-tier={tier}
                    data-active={isActiveCitation}
                    title={chip.full}
                    aria-label={`${citation.n ? `Sursa ${citation.n}: ` : ''}${CITATION_TIER_TAG[tier] ? `${CITATION_TIER_TAG[tier]}, ` : ''}${chip.full}`}
                  >
                    {citation.n ? <span className="citation-source-n" aria-hidden="true">{citation.n}</span> : null}
                    {CITATION_TIER_TAG[tier] && <span className="citation-source-tier" aria-hidden="true">{CITATION_TIER_TAG[tier]}</span>}
                    <span className="citation-source-title">{chip.title}</span>
                    {chip.where && <span className="citation-source-page">{chip.where}</span>}
                  </button>
                );
              })}
            </div>
            {message.citations.map((citation) => {
              const citationKey = citationKeyOf(index, citation);
              if (activeCitationKey !== citationKey) return null;
              return (
                <div
                  key={`${citationKey}-excerpt`}
                  className="mt-3 rounded-[var(--r-lg)] p-3 text-xs leading-6"
                  style={{ background: theme.surface, border: `1px solid ${theme.border}`, color: theme.text2 }}
                >
                  <div className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: theme.text3 }}>
                    Fragment relevant
                    <HelpTip id="chat-citations" size={14} />
                  </div>
                  {citation.excerpt}
                  {citation.excerpt.length >= 220 ? '…' : ''}
                  {(citation.page !== undefined || citation.printedPage !== undefined || citation.sourceId) && (
                    <button
                      type="button"
                      className="citation-pill mt-2 block transition-colors"
                      aria-label={`${citationOpenLabel(citation)}: ${citationLabel(citation)}`}
                      onClick={() => actions.openBook(citation)}
                    >
                      {citationOpenLabel(citation)}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {message.role === 'assistant' && message.isError && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              onClick={() => actions.retryError(index)}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors hover:opacity-80"
              style={{ background: theme.surface, color: theme.text2, border: `1px solid ${theme.border}` }}
            >
              <RotateCcw size={12} /> Încearcă din nou
            </button>
            <button
              onClick={() => actions.switchModel(index)}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors hover:opacity-80"
              style={{ background: theme.surface, color: theme.text2, border: `1px solid ${theme.border}` }}
            >
              <Sparkles size={12} /> Alt model
            </button>
          </div>
        )}

        {message.role === 'assistant' && !message.isError && !message.optionCard && (!message.citations || message.citations.length === 0) && (
          <div className="mt-4">
            <span className="citation-pill">Răspuns general</span>
          </div>
        )}

        {message.role === 'assistant' && !message.agentJobId && !message.isError && !message.optionCard && message.content.trim() && !streaming && (
          <div className={`mt-3 flex flex-wrap gap-1.5 transition-opacity duration-150 ${isLastAssistant ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100'}`}>
            {([
              ...(message.truncated && isLastAssistant
                ? [{ key: 'continue', label: 'Continuă', icon: <ArrowRight size={12} />, onClick: () => actions.continueAnswer(index) }]
                : []),
              { key: 'copy', label: 'Copiază', icon: <Copy size={12} />, onClick: () => actions.copy(message.content) },
              { key: 'flashcard', label: 'Flashcard', icon: <CreditCard size={12} />, onClick: () => actions.saveFlashcard(index) },
              { key: 'quiz', label: 'Fă quiz', icon: <ListChecks size={12} />, onClick: () => actions.makeQuiz(index) },
              { key: 'regen', label: 'Regenerează', icon: <RotateCcw size={12} />, onClick: () => actions.regenerate(index) },
            ] as const).map((action) => (
              <button
                key={action.key}
                onClick={action.onClick}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors hover:opacity-80"
                style={{ background: theme.surface, color: theme.text3, border: `1px solid ${theme.border}` }}
              >
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>
        )}

        {message.role === 'assistant' && !message.agentJobId && !message.isError && !message.optionCard && message.content.trim() && !message.content.startsWith('Eroare:') && !streaming && (
          <CrossCheckCard
            question={question}
            answer={message.content}
            sources={message.citations?.map((c) => ({ label: `${c.n ? `[${c.n}] ` : ''}${citationLabel(c)}`, text: c.excerpt }))}
            producer={message.producer}
            saved={message.crossCheck}
            onResult={(crossCheck) => actions.setCrossCheck(index, crossCheck)}
          />
        )}

        {isLastAssistant && message.suggestions && message.suggestions.length > 0 && !streaming && (
          <div className="mt-4 flex flex-wrap gap-2">
            {message.suggestions.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => actions.suggest(suggestion, message.mode ?? fallbackMode)}
                className="rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors"
                style={{ background: theme.surface, color: theme.text2, border: `1px solid ${theme.border}` }}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default memo(ChatMessageBubble);
