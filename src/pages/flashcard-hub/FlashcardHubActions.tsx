import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { AlertCircle, BookOpen, Bot, Brain, Image as ImageIcon, Layers, Loader2, Sparkles, Upload } from 'lucide-react';
import { SectionLabel, ResourceRow } from './sectionParts';
import HelpTip from '../../components/ui/HelpTip';
import { FolderTargetSelect } from './FolderTargetSelect';
import { LibrarySourceSelect } from './LibrarySourceSelect';
import type { FlashcardHubActionsProps } from './sectionTypes';

const AI_COUNTS = [10, 25, 50, 100];

export function FlashcardHubActions({
  aiCount,
  aiError,
  aiLoading,
  aiProgress,
  csvError,
  csvImporting,
  hasAI,
  folders,
  photoError,
  photoImporting,
  theme,
  targetFolderId,
  librarySources,
  libraryGenerating,
  onAiCountChange,
  onAnkiImport,
  onCreateFolder,
  onCsvImport,
  onLibraryGenerate,
  onMistakeDeckCreate,
  onPhotoImport,
  onPdfImport,
  onTargetFolderChange,
}: FlashcardHubActionsProps) {
  const [librarySourceId, setLibrarySourceId] = useState('');
  const activeLibrarySourceId = librarySources.some((source) => source.id === librarySourceId)
    ? librarySourceId
    : librarySources[0]?.id ?? '';
  const cardStyle = { background: theme.surface, border: '1px solid var(--hairline)' };
  const busy = aiLoading || libraryGenerating;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.14 }}
    >
      <div className="flex items-start gap-1.5">
        <SectionLabel>CREEAZĂ PACHET NOU</SectionLabel>
        <HelpTip id="fc-import" className="-mt-px" />
      </div>

      {/* Error banner — right under the title so a failed run is never off-screen */}
      <AnimatePresence>
        {(aiError || csvError || photoError) && (
          <motion.div
            role="alert"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-3 flex items-start gap-2.5 rounded-[var(--r-md)] border p-3"
            style={{
              background: `${theme.danger}08`,
              borderColor: `${theme.danger}20`,
              color: theme.danger,
            }}
          >
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <div className="text-[12px] font-medium leading-relaxed">
              {aiError || csvError || photoError}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-3">
        <FolderTargetSelect
          folders={folders}
          value={targetFolderId}
          theme={theme}
          onChange={onTargetFolderChange}
          onCreateFolder={onCreateFolder}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* ── AI din curs ── */}
        <div className="flex flex-col rounded-[var(--r-md)] p-4" style={cardStyle}>
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]"
              style={{ background: `${theme.accent}14`, color: theme.accentText }}
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Bot size={18} />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[14px] font-semibold" style={{ color: theme.text }}>
                  AI din curs
                </span>
                <Sparkles size={12} style={{ color: theme.accent2 }} />
              </div>
              <div className="truncate text-[12px]" style={{ color: theme.text3 }}>
                {busy ? aiProgress || 'Se procesează...' : 'Din PDF-ul cursului tău'}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 text-[11.5px]" style={{ color: theme.text3 }}>
              Câte carduri
            </div>
            <div className="flex rounded-full p-0.5" style={{ background: theme.surface2 }}>
              {AI_COUNTS.map((count) => (
                <button
                  key={count}
                  type="button"
                  aria-pressed={aiCount === count}
                  onClick={() => onAiCountChange(count)}
                  className="flex-1 rounded-full py-1.5 text-[12.5px] font-semibold transition-colors"
                  style={{
                    background: aiCount === count ? theme.accent : 'transparent',
                    color: aiCount === count ? '#fff' : theme.text2,
                  }}
                >
                  {count}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px]" style={{ color: theme.text3 }}>
              Cursurile cu poze se importă întregi.
            </p>
          </div>

          <button
            type="button"
            onClick={onPdfImport}
            disabled={busy}
            className="press-feedback mt-4 flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-[13px] font-semibold text-white transition-[filter] duration-[var(--dur-base)] hover:brightness-110 disabled:opacity-60"
            style={{ background: theme.accent }}
          >
            <BookOpen size={15} />
            Alege PDF-ul cursului
          </button>

          {hasAI && librarySources.length > 0 && (
            <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--hairline)' }}>
              <div className="mb-2 text-[11.5px]" style={{ color: theme.text3 }}>
                Sau din Biblioteca AI
              </div>
              <div className="flex flex-col gap-2">
                <LibrarySourceSelect
                  sources={librarySources}
                  value={activeLibrarySourceId}
                  disabled={libraryGenerating}
                  theme={theme}
                  onChange={setLibrarySourceId}
                />
                <button
                  type="button"
                  onClick={() => activeLibrarySourceId && onLibraryGenerate(activeLibrarySourceId)}
                  disabled={libraryGenerating || !activeLibrarySourceId}
                  className="press-feedback flex items-center justify-center gap-2 rounded-full py-2 text-[12.5px] font-semibold transition-colors disabled:opacity-60"
                  style={{ background: theme.surface2, color: theme.text }}
                >
                  {libraryGenerating ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Sparkles size={14} style={{ color: theme.accentText }} />
                  )}
                  {libraryGenerating ? 'Generez...' : 'Generează din bibliotecă'}
                </button>
              </div>
            </div>
          )}

          {!hasAI && (
            <p className="mt-3 text-[11px]" style={{ color: theme.text3 }}>
              Cursurile cu poze merg fără cheie AI. Pentru text, adaugă o cheie în Setări AI.
            </p>
          )}
        </div>

        {/* ── Din greșeli ── */}
        <div className="flex flex-col rounded-[var(--r-md)] p-4" style={cardStyle}>
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]"
              style={{ background: `${theme.warning}14`, color: theme.warning }}
            >
              <Brain size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold" style={{ color: theme.text }}>
                Din greșeli
              </div>
              <div className="truncate text-[12px]" style={{ color: theme.text3 }}>
                Din ce ai greșit repetat
              </div>
            </div>
          </div>
          <p className="mt-4 text-[12.5px] leading-relaxed" style={{ color: theme.text3 }}>
            Pentru fiecare întrebare pe care ai greșit-o de mai multe ori primești 2 carduri, ca să le
            fixezi în memorie.
          </p>
          <button
            type="button"
            onClick={onMistakeDeckCreate}
            className="press-feedback mt-auto flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-[13px] font-semibold transition-colors"
            style={{ background: theme.surface2, color: theme.text, marginTop: '1rem' }}
          >
            Creează pachetul
          </button>
        </div>
      </div>

      {/* ── Importuri și pachet rapid ── */}
      <div className="mt-3 overflow-hidden rounded-[var(--r-md)]" style={cardStyle}>
        <ResourceRow
          first
          icon={<ImageIcon size={18} />}
          title="Import poze"
          detail="JPG, PNG, WEBP sau PDF scanat"
          iconBg={`${theme.success}14`}
          iconColor={theme.success}
          theme={theme}
          busy={photoImporting}
          onClick={onPhotoImport}
        />
        <ResourceRow
          icon={<Upload size={18} />}
          title="Import CSV"
          detail="CSV, TSV — o linie per card"
          iconBg={`${theme.accent2}14`}
          iconColor={theme.accent2}
          theme={theme}
          busy={csvImporting}
          onClick={onCsvImport}
        />
        <ResourceRow
          icon={<Layers size={18} />}
          title="Import Anki (.apkg)"
          detail="Deck-uri Anki exportate"
          iconBg={`${theme.accent}14`}
          iconColor={theme.accent}
          theme={theme}
          onClick={onAnkiImport}
        />
      </div>
    </motion.section>
  );
}
