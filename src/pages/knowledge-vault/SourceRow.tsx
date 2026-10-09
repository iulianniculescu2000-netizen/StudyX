import { motion } from 'framer-motion';
import { FileText, Image, MoreHorizontal, RefreshCw, X } from 'lucide-react';
import type { AIKnowledgeSource } from '../../store/aiStore';
import { useTheme } from '../../theme/ThemeContext';
import type { ReindexState } from '../../hooks/useReindexSources';
import ThemedSelect from '../../components/ThemedSelect';
import Portal from '../../components/Portal';
import SourceStatusBadge from './SourceStatusBadge';

export interface MenuPos { right: number; top?: number; bottom?: number }

interface SourceRowProps {
  source: AIKnowledgeSource;
  index: number;
  performanceLite: boolean;
  folderName: string | null | undefined;
  isSearchingTop: boolean;
  menuOpen: boolean;
  menuPos: MenuPos | null;
  moving: boolean;
  missingPages: boolean;
  reindexState: ReindexState | null;
  reindexBusy: boolean;
  folderOptions: Array<{ value: string; label: string }>;
  onOpenReader: (source: AIKnowledgeSource) => void;
  onAsk: (source: AIKnowledgeSource) => void;
  onOpenStudio: (source: AIKnowledgeSource) => void;
  onReindex: (source: AIKnowledgeSource) => void;
  onToggleMenu: (source: AIKnowledgeSource, anchor: HTMLElement) => void;
  onCloseMenu: () => void;
  onStartMove: (sourceId: string) => void;
  onCancelMove: () => void;
  onMove: (sourceId: string, folderId: string | null) => void;
  onRequestDelete: (source: AIKnowledgeSource) => void;
}

export default function SourceRow({
  source, index, performanceLite, folderName, isSearchingTop, menuOpen, menuPos, moving, missingPages,
  reindexState, reindexBusy, folderOptions, onOpenReader, onAsk, onOpenStudio, onReindex, onToggleMenu,
  onCloseMenu, onStartMove, onCancelMove, onMove, onRequestDelete,
}: SourceRowProps) {
  const theme = useTheme();
  const isReady = source.indexStatus !== 'indexing' && source.indexStatus !== 'error';
  return (
    <motion.div
      layout={!performanceLite}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.02 }}
      className="relative px-4 py-3 transition-colors duration-[var(--dur-base)] hover:bg-[var(--hover-fill)]"
      style={{ borderTop: index === 0 ? undefined : '1px solid var(--hairline)' }}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => isReady && onOpenReader(source)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-label={`Deschide ${source.name}`}
        >
          <div
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]"
            style={{
              background: source.type === 'image' ? `${theme.warning}18` : `${theme.accent}18`,
              color: source.type === 'image' ? theme.warning : theme.accent,
            }}
          >
            {source.type === 'image' ? <Image size={18} /> : <FileText size={18} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold" style={{ color: theme.text }}>{source.name.replace(/\.(pdf|docx|txt|md)$/i, '')}</div>
            <div className="truncate text-[12px]" style={{ color: theme.text3 }}>
              {source.type.toUpperCase()}
              {(source.chunkCount ?? 0) > 0 && ` · ${source.chunkCount!.toLocaleString('ro-RO')} fragmente`}
              {` · ${source.wordCount.toLocaleString('ro-RO')} cuvinte`}
              {` · ${new Date(source.addedAt).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })}`}
              {isSearchingTop && folderName ? ` · ${folderName}` : ''}
            </div>
          </div>
        </button>

        <SourceStatusBadge source={source} theme={theme} />
        <button
          type="button"
          onClick={() => isReady && onAsk(source)}
          disabled={!isReady}
          className="fine-chip press-feedback hidden rounded-full px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-40 sm:block"
          style={{ color: theme.accentText }}
        >
          Întreabă
        </button>
        <button
          type="button"
          onClick={(event) => onToggleMenu(source, event.currentTarget)}
          aria-label="Mai multe acțiuni"
          aria-expanded={menuOpen}
          className="fine-row press-feedback flex h-8 w-8 items-center justify-center rounded-full"
          style={{ color: theme.text3 }}
        >
          <MoreHorizontal size={18} />
        </button>
      </div>

      {missingPages && isReady && reindexState?.sourceId !== source.id && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: `${theme.warning}18`, color: theme.warning }}>
            Fără pagini
          </span>
          <button
            type="button"
            onClick={() => onReindex(source)}
            disabled={reindexBusy}
            className="fine-chip press-feedback flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold disabled:opacity-50"
            style={{ color: theme.accentText }}
          >
            <RefreshCw size={12} /> Reindexează pentru pagini
          </button>
        </div>
      )}
      {reindexState?.sourceId === source.id && (
        <div className="mt-2.5">
          <div className="h-[3px] overflow-hidden rounded-full" style={{ background: 'var(--fill-subtle)' }}>
            <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.max(4, reindexState.percent)}%`, background: theme.accent }} />
          </div>
        </div>
      )}
      {source.indexStatus === 'indexing' && (
        <div className="mt-2.5 h-[3px] overflow-hidden rounded-full" style={{ background: 'var(--fill-subtle)' }}>
          <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.max(4, Math.round(source.indexProgress ?? 0))}%`, background: theme.accent }} />
        </div>
      )}
      {source.indexStatus === 'error' && source.indexError && (
        <p className="mt-2 text-[11.5px] font-medium" style={{ color: theme.danger }}>{source.indexError}</p>
      )}

      {moving && (
        <div className="mt-2.5 flex items-center gap-2" style={{ maxWidth: 320 }}>
          <div className="flex-1">
            <ThemedSelect
              size="sm"
              defaultOpen
              value={source.folderId ?? ''}
              onChange={(folderId) => onMove(source.id, folderId || null)}
              onRequestClose={onCancelMove}
              options={[{ value: '', label: 'Neclasificate' }, ...folderOptions]}
            />
          </div>
          <button type="button" onClick={onCancelMove} aria-label="Renunță" style={{ color: theme.text3 }}><X size={14} /></button>
        </div>
      )}

      {menuOpen && menuPos && (
        <Portal>
          <div className="fixed inset-0 z-[9990]" onClick={onCloseMenu} aria-hidden="true" />
          <div
            className="fixed z-[9991] w-52 overflow-hidden rounded-[var(--r-sm)] py-1"
            style={{ ...menuPos, background: theme.modalBg, border: '1px solid var(--hairline)', boxShadow: 'var(--elev-3)' }}
            role="menu"
          >
            {[
              { label: 'Deschide', run: () => onOpenReader(source), needsReady: true },
              { label: 'Întreabă AI', run: () => onAsk(source), needsReady: true },
              { label: 'AI Studio', run: () => onOpenStudio(source), needsReady: true },
              { label: 'Mută în folder', run: () => onStartMove(source.id), needsReady: false },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.needsReady && !isReady}
                onClick={() => { onCloseMenu(); item.run(); }}
                className="fine-row block w-full px-3.5 py-2 text-left text-[13px] disabled:opacity-40"
                style={{ color: theme.text, borderRadius: 0 }}
              >
                {item.label}
              </button>
            ))}
            <div className="my-1" style={{ borderTop: '1px solid var(--hairline)' }} />
            <button
              type="button"
              role="menuitem"
              onClick={() => { onCloseMenu(); onRequestDelete(source); }}
              className="fine-row block w-full px-3.5 py-2 text-left text-[13px]"
              style={{ color: theme.danger, borderRadius: 0 }}
            >
              Șterge documentul
            </button>
          </div>
        </Portal>
      )}
    </motion.div>
  );
}
