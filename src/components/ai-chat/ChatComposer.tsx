import { memo, type RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, ChevronDown, ImageIcon, SendHorizonal, Sparkles, Square, X } from 'lucide-react';
import type { Theme } from '../../theme/themes';
import { CHAT_MODES, type ChatMode } from './shared';
import HelpTip from '../ui/HelpTip';

interface ChatComposerProps {
  theme: Theme;
  immersive: boolean;
  view: 'chat' | 'studio';
  input: string;
  onInputChange: (value: string) => void;
  pastedImage: string | null;
  onPastedImage: (value: string | null) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  placeholder: string;
  loading: boolean;
  onSend: () => void;
  onStop: () => void;
  mode: ChatMode;
  manualMode: boolean;
  /** Short label of the active mode (shown on the chip while the mode is chosen by hand). */
  modeLabel: string;
  modePickerOpen: boolean;
  onModePickerOpen: (open: boolean) => void;
  onAutoMode: () => void;
  onPickMode: (mode: ChatMode) => void;
  /** The question the student is discussing from a quiz, shown above the field. */
  quizContext: { questionText: string } | null;
  onClearQuizContext: () => void;
  /** Studio view with a ready source: offers the two one-tap prompts. */
  showStudioShortcuts: boolean;
  onStudioShortcut: (kind: 'diagram' | 'summarize') => void;
}

/**
 * The message field of the chat. One calm container: a transparent auto-growing field, the response-mode chip on the
 * left of the bottom row and a round send button on the right (see `.composer` in index.css).
 */
function ChatComposer({
  theme, immersive, view, input, onInputChange, pastedImage, onPastedImage, textareaRef, placeholder, loading,
  onSend, onStop, mode, manualMode, modeLabel, modePickerOpen, onModePickerOpen, onAutoMode, onPickMode, quizContext,
  onClearQuizContext, showStudioShortcuts, onStudioShortcut,
}: ChatComposerProps) {
  const canSend = input.trim().length > 0 || pastedImage !== null;

  return (
    <div
      className="border-t px-4 pt-3 pb-4"
      style={{
        borderColor: theme.border,
        background: immersive ? 'transparent' : `color-mix(in srgb, ${theme.surface} 60%, transparent)`,
        // keep the input aligned with the centred reading column
        ...(immersive ? { paddingLeft: 'max(16px, calc((100% - 800px) / 2))', paddingRight: 'max(16px, calc((100% - 800px) / 2))' } : {}),
      }}
    >
      <AnimatePresence>
        {quizContext && (
          <motion.div
            initial={{ opacity: 0, y: 10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="mb-3 overflow-hidden"
          >
            <div
              className="flex items-start gap-2 rounded-[var(--r-md)] border px-3 py-2 text-xs"
              style={{ background: `${theme.accent}10`, borderColor: `${theme.accent}25`, color: theme.text }}
            >
              <div className="mt-0.5" style={{ color: theme.accentText }}><Sparkles size={14} /></div>
              <div className="flex-1">
                <span className="mb-1 block text-[9px] font-bold uppercase tracking-widest opacity-80">Tutor Contextual</span>
                <span className="line-clamp-2 opacity-90">{quizContext.questionText}</span>
              </div>
              <button
                onClick={onClearQuizContext}
                aria-label="Scoate contextul întrebării"
                className="fine-row rounded-full p-1 transition-colors hover:bg-[var(--hover-fill)]"
                style={{ color: theme.text3 }}
              >
                <X size={12} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="composer"
        data-immersive={immersive ? 'true' : undefined}
        style={{ background: immersive ? `color-mix(in srgb, ${theme.surface2} 55%, transparent)` : theme.surface2, borderColor: theme.border }}
      >
        {pastedImage && (
          <div className="relative mb-2 inline-block">
            <img
              src={pastedImage}
              alt="Imagine atașată"
              className="h-16 w-auto max-w-[160px] rounded-[var(--r-sm)] object-cover"
              style={{ border: `1px solid ${theme.border}` }}
            />
            <button
              onClick={() => onPastedImage(null)}
              aria-label="Scoate imaginea"
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border text-white"
              style={{ background: theme.danger, borderColor: theme.surface }}
            >
              <X size={10} />
            </button>
          </div>
        )}

        <textarea
          ref={textareaRef}
          data-autofocus
          rows={1}
          aria-label="Mesaj pentru AI"
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              onSend();
            }
          }}
          onPaste={(event) => {
            const items = Array.from(event.clipboardData.items);
            const imgItem = items.find((item) => item.type.startsWith('image/'));
            if (!imgItem) return;
            event.preventDefault();
            const file = imgItem.getAsFile();
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => onPastedImage(reader.result as string);
            reader.readAsDataURL(file);
          }}
          placeholder={placeholder}
          className="composer-input custom-scrollbar"
        />

        <div className="composer-bar">
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {!modePickerOpen ? (
              <button
                onClick={() => onModePickerOpen(true)}
                className="composer-chip"
                title="Modul răspunsului — apasă pentru a alege manual"
              >
                <Sparkles size={12} />
                {manualMode ? modeLabel : 'Auto'}
                <ChevronDown size={12} />
              </button>
            ) : (
              <>
                <button onClick={onAutoMode} className="composer-chip" data-active={!manualMode}>
                  <Sparkles size={11} /> Auto
                </button>
                {CHAT_MODES.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => onPickMode(entry.id)}
                    className="composer-chip"
                    data-active={manualMode && entry.id === mode}
                  >
                    {entry.shortLabel}
                  </button>
                ))}
                <HelpTip id="chat-mode" size={16} />
              </>
            )}
          </div>

          {loading ? (
            <button
              onClick={onStop}
              aria-label="Oprește generarea"
              title="Oprește generarea"
              className="composer-send press-feedback"
              style={{ background: `${theme.danger}1f`, color: theme.danger }}
            >
              <Square size={13} />
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={!canSend}
              aria-label="Trimite mesajul"
              className="composer-send press-feedback"
              data-ready={canSend}
            >
              {pastedImage && !input.trim() ? <ImageIcon size={15} /> : <SendHorizonal size={15} />}
            </button>
          )}
        </div>

        {view === 'studio' && showStudioShortcuts && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2" style={{ borderColor: theme.border }}>
            <div className="text-[11px] font-medium" style={{ color: theme.text3 }}>Scurtături Studio</div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => onStudioShortcut('diagram')} className="composer-chip">
                Schemă <ArrowRight size={12} />
              </button>
              <button onClick={() => onStudioShortcut('summarize')} className="composer-chip">
                Rezumat <ArrowRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(ChatComposer);
