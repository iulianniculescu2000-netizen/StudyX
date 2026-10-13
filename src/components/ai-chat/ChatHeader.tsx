import { AnimatePresence, motion } from 'framer-motion';
import { Maximize2, Minimize2, MoreHorizontal, PanelRightClose, PanelRightOpen, RotateCcw, SlidersHorizontal, Trash2, X } from 'lucide-react';
import type { Transition } from 'framer-motion';
import type { Theme } from '../../theme/themes';
import TourHelpButton from '../../tutorial/TourHelpButton';
import Mascot from '../Mascot';
import ChatGlassControls from './ChatGlassControls';
import type { useChatGlass } from './useChatGlass';
import type { ChatThread } from './useChatMessages';

interface ChatHeaderProps {
  theme: Theme;
  calmMotion: boolean;
  popTransition: Transition;
  chatThread: ChatThread;
  loading: boolean;
  visualState: 'idle' | 'waiting' | 'streaming' | 'success' | 'error' | 'stopped' | 'unconfigured';
  immersive: boolean;
  mobile: boolean;
  view: 'chat' | 'studio';
  onViewChange: (view: 'chat' | 'studio') => void;
  scopedSourceName: string | null;
  weakTopics: Array<{ topic: string }>;
  memoryInteractions: number;
  glass: ReturnType<typeof useChatGlass>;
  glassPanelOpen: boolean;
  setGlassPanelOpen: (update: boolean | ((value: boolean) => boolean)) => void;
  overflowMenuOpen: boolean;
  setOverflowMenuOpen: (update: boolean | ((value: boolean) => boolean)) => void;
  wideChat: boolean;
  setWideChat: (update: boolean | ((value: boolean) => boolean)) => void;
  hasMessages: boolean;
  /** Index of the last assistant answer, or undefined when there is none. */
  lastAssistantIndex: number | undefined;
  onRegenerate: (index: number) => void;
  onClearRequest: () => void;
  onClose: () => void;
}

/** Title, Chat/Studio switch, glass and full-screen controls, the overflow menu and the close button. */
export default function ChatHeader({
  theme, calmMotion, popTransition, chatThread, loading, visualState, immersive, mobile, view, onViewChange, scopedSourceName, weakTopics,
  memoryInteractions, glass, glassPanelOpen, setGlassPanelOpen, overflowMenuOpen, setOverflowMenuOpen, wideChat, setWideChat,
  hasMessages, lastAssistantIndex, onRegenerate, onClearRequest, onClose,
}: ChatHeaderProps) {
  const status = {
    idle: 'Pregătit', waiting: 'Pregătesc răspunsul', streaming: 'Scriu răspunsul',
    success: 'Răspuns finalizat', error: 'Răspuns întrerupt de o eroare',
    stopped: 'Răspuns oprit', unconfigured: 'Configurează AI în Setări',
  }[visualState];
  return (
    <div className="flex items-center gap-3 border-b px-5 py-4" style={{ borderColor: theme.border }}>
      <div className="shrink-0"><Mascot accent={theme.accent} size={42} expression={visualState} calm={calmMotion} /></div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="min-w-0 truncate whitespace-nowrap text-base font-black tracking-tight leading-normal" style={{ color: theme.text }}>
            StudyX AI{chatThread === 'rezidentiat' ? ' · Rezidențiat' : ''}
          </h3>
          <TourHelpButton tour="chat" label="Vezi turul chatului AI" />
        </div>
        <p role="status" className="mt-0.5 truncate text-[11px] font-semibold" style={{ color: visualState === 'error' ? theme.danger : theme.accentText }}>{status}</p>
        <p className="mt-0.5 text-[11px] font-medium truncate" style={{ color: theme.text3 }}>
          {chatThread === 'rezidentiat'
            ? 'Conversație separată, dedicată pregătirii de rezidențiat'
            : view === 'studio'
              ? 'Generare grile și pachete din cursuri'
              : scopedSourceName
                ? `Focus activ: ${scopedSourceName}`
                : weakTopics[0]
                  ? `Arii slabe: ${weakTopics.slice(0, 2).map(t => t.topic).join(', ')}`
                  : memoryInteractions >= 3
                    ? `Te cunoaște după ${memoryInteractions} interacțiuni`
                    : 'Asistent calibrat pe profilul tău de studiu'}
        </p>
      </div>

      <div className="hidden flex-shrink-0 items-center gap-1 rounded-full border p-1 sm:flex" style={{ borderColor: theme.border, background: theme.surface2 }}>
        {([
          { id: 'chat', label: 'Chat', icon: <PanelRightClose size={14} /> },
          { id: 'studio', label: 'Studio', icon: <PanelRightOpen size={14} /> },
        ] as const).map((entry) => {
          const active = view === entry.id;
          return (
            <button
              key={entry.id}
              onClick={() => onViewChange(entry.id)}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.1em]"
              style={{
                background: active ? theme.accent : 'transparent',
                color: active ? '#fff' : theme.text3,
              }}
            >
              {entry.icon}
              {entry.label}
            </button>
          );
        })}
      </div>

      {!mobile && immersive && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setGlassPanelOpen((value) => !value)}
            aria-label="Transparență și estompare"
            aria-expanded={glassPanelOpen}
            title="Transparență și estompare"
            className="fine-row press-feedback rounded-2xl p-2.5 transition-colors hover:bg-[var(--hover-fill)]"
            style={{ color: glassPanelOpen ? theme.accent : theme.text3, background: glassPanelOpen ? `${theme.accent}18` : undefined }}
          >
            <SlidersHorizontal size={18} />
          </button>
          {glassPanelOpen && (
            <>
              <div className="fixed inset-0 z-[10001]" onClick={() => setGlassPanelOpen(false)} />
              <div
                className="absolute right-0 top-full z-[10002] mt-2 overflow-hidden rounded-[var(--r-lg)] border"
                style={{
                  background: theme.surface,
                  borderColor: theme.border,
                  boxShadow: 'var(--elev-3)',
                }}
              >
                <ChatGlassControls settings={glass.settings} onChange={glass.update} onPreset={glass.applyPreset} />
              </div>
            </>
          )}
        </div>
      )}

      {!mobile && (
        <button
          type="button"
          onClick={glass.toggleImmersive}
          aria-label={immersive ? 'Restrânge chatul (Esc)' : 'Ecran complet (Ctrl+Shift+F)'}
          title={immersive ? 'Restrânge chatul (Esc)' : 'Ecran complet (Ctrl+Shift+F)'}
          className="fine-row press-feedback rounded-2xl p-2.5 transition-colors hover:bg-[var(--hover-fill)]"
          style={{ color: immersive ? theme.accent : theme.text3, background: immersive ? `${theme.accent}18` : undefined }}
        >
          {immersive ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      )}

      <div className="relative">
        <motion.button
          whileHover={calmMotion ? undefined : { scale: 1.05 }}
          whileTap={calmMotion ? undefined : { scale: 0.92 }}
          onClick={() => setOverflowMenuOpen((value) => !value)}
          aria-label="Mai multe opțiuni"
          title="Mai multe opțiuni"
          className="fine-row rounded-2xl p-2.5 transition-colors hover:bg-[var(--hover-fill)] press-feedback"
          style={{
            color: overflowMenuOpen ? theme.accentText : theme.text3,
            background: overflowMenuOpen ? `${theme.accent}18` : undefined,
          }}
        >
          <MoreHorizontal size={18} />
        </motion.button>

        <AnimatePresence>
          {overflowMenuOpen && (
            <>
              <div className="fixed inset-0 z-[10001]" onClick={() => setOverflowMenuOpen(false)} />
              <motion.div
                initial={calmMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={popTransition}
                className="absolute right-0 top-full z-[10002] mt-2 w-56 max-w-[calc(100vw-1.5rem)] rounded-[var(--r-lg)] border p-1.5"
                style={{
                  background: theme.surface,
                  borderColor: theme.border,
                  boxShadow: 'var(--elev-3)',
                  maxHeight: 'calc(100vh - 6rem)',
                  overflowY: 'auto',
                }}
              >
                {view === 'chat' && !mobile && !immersive && (
                  <button
                    onClick={() => { setWideChat((value) => !value); setOverflowMenuOpen(false); }}
                    className="fine-row flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-3 py-2.5 text-left text-[12.5px] font-bold transition-colors hover:bg-[var(--hover-fill)]"
                    style={{ color: theme.text }}
                  >
                    {wideChat ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                    {wideChat ? 'Îngustează chatul' : 'Lățește chatul'}
                  </button>
                )}
                {lastAssistantIndex !== undefined && !loading && (
                  <button
                    onClick={() => { setOverflowMenuOpen(false); onRegenerate(lastAssistantIndex); }}
                    className="fine-row flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-3 py-2.5 text-left text-[12.5px] font-bold transition-colors hover:bg-[var(--hover-fill)]"
                    style={{ color: theme.text }}
                  >
                    <RotateCcw size={15} />
                    Regenerează ultimul răspuns
                  </button>
                )}
                {hasMessages && (
                  <>
                    <div className="my-1 h-px" style={{ background: theme.border }} />
                    <button
                      onClick={() => { onClearRequest(); setOverflowMenuOpen(false); }}
                      className="fine-row flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-3 py-2.5 text-left text-[12.5px] font-bold transition-colors hover:bg-[var(--hover-fill)]"
                      style={{ color: theme.danger }}
                    >
                      <Trash2 size={15} />
                      Golește conversația
                    </button>
                  </>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      <motion.button
        whileHover={calmMotion ? undefined : { rotate: 90, scale: 1.05 }}
        whileTap={calmMotion ? undefined : { scale: 0.92 }}
        onClick={onClose}
        aria-label="Închide chatul AI"
        className="fine-row rounded-2xl p-2.5 transition-colors hover:bg-[var(--hover-fill)] press-feedback"
        style={{ color: theme.text3 }}
      >
        <X size={20} />
      </motion.button>
    </div>

  );
}
