import { useState, type RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, FolderOpen, Info, Layers3, Loader2, Wand2, X } from 'lucide-react';
import type { Theme } from '../../theme/themes';
import type { AIKnowledgeSource } from '../../store/aiStore';
import type { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { describePlacement, type resolveResidencyPlacement } from '../../lib/rezidentiatPlacement';
import { WHOLE_DOCUMENT_HEADING } from '../../lib/ai/chapterQuizGeneration';
import { EXAM_STYLE_META, type ExamStyle } from '../../lib/ai/examStyle';
import {
  STUDIO_MAX_PACK_COUNT,
  STUDIO_MAX_QUESTIONS_PER_PACK,
  clampStudioPackCount,
  clampStudioQuestionCount,
} from '../../lib/ai/studioGeneration';
import StudioSelect from './StudioSelect';
import { FieldLabel, Segmented, Stepper } from '../ui/FormControls';
import HelpTip from '../ui/HelpTip';
import type { useStudioGeneration } from './useStudioGeneration';

interface StudioPanelProps {
  studio: ReturnType<typeof useStudioGeneration>;
  theme: Theme;
  calmMotion: boolean;
  t: ReturnType<typeof useAdaptiveMotion>['t'];
  view: 'chat' | 'studio';
  setView: (view: 'chat' | 'studio') => void;
  mobile: boolean;
  /** Wide windows show Studio as a fixed column next to the chat instead of an overlay drawer. */
  studioAsColumn: boolean;
  weakTopics: Array<{ topic: string }>;
  readySources: AIKnowledgeSource[];
  studioResidencyPlacement: ReturnType<typeof resolveResidencyPlacement> | null;
  contextCacheRef: RefObject<Map<string, unknown>>;
  setScopedSource: (source: { id: string; name: string } | null) => void;
}

const DIFFICULTIES = [
  { id: 'auto', label: 'Auto' },
  { id: 'easy', label: 'Ușor' },
  { id: 'medium', label: 'Mediu' },
  { id: 'hard', label: 'Dificil' },
] as const;

/**
 * The AI Studio side panel: pick a document and chapter, check where the packs will land, set the size, then generate.
 * Anything rarely changed (difficulty, exam style) sits in a collapsed „Avansat” row that summarises the current choice.
 */
export default function StudioPanel({
  studio, theme, calmMotion, t, view, setView, mobile, studioAsColumn, weakTopics, readySources, studioResidencyPlacement,
  contextCacheRef, setScopedSource,
}: StudioPanelProps) {
  const {
    setStudioSourceId,
    studioHeading, setStudioHeading,
    studioFolderId, setStudioFolderId,
    studioPackCount, setStudioPackCount,
    studioQuestionsPerPack, setStudioQuestionsPerPack,
    studioDifficulty, setStudioDifficulty,
    studioExamStyle, setStudioExamStyle,
    studioGenerating,
    generatedSummary,
    selectedStudioSourceId,
    selectedStudioSource,
    selectedStudioFolder,
    studioChapterOptions,
    studioSourceOptions,
    studioFolderOptions,
    handleGeneratePackages,
  } = studio;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const wholeDocument = studioHeading === WHOLE_DOCUMENT_HEADING;
  const difficultyLabel = DIFFICULTIES.find((entry) => entry.id === studioDifficulty)?.label ?? 'Auto';
  const styleMeta = EXAM_STYLE_META[studioExamStyle];
  const sizeSummary = wholeDocument
    ? `${studioPackCount} ${studioPackCount === 1 ? 'pachet' : 'pachete'} × ${studioQuestionsPerPack} întrebări`
    : `${studioQuestionsPerPack} întrebări din capitol`;
  const placementLabel = studioResidencyPlacement
    ? describePlacement(studioResidencyPlacement)
    : selectedStudioFolder ? `${selectedStudioFolder.emoji} ${selectedStudioFolder.name}` : 'Neclasificate';

  return (
    <AnimatePresence>
      {view === 'studio' && (
        <>
          {!studioAsColumn && (
            <motion.div
              key="studio-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={t.pop}
              onClick={() => setView('chat')}
              className="absolute inset-0 z-10"
              style={{ background: 'var(--overlay)' }}
            />
          )}
          <motion.div
            key="studio-drawer"
            initial={calmMotion ? { opacity: 0 } : { x: '100%' }}
            animate={calmMotion ? { opacity: 1 } : { x: 0 }}
            exit={calmMotion ? { opacity: 0 } : { x: '100%' }}
            transition={t.panel}
            className={`relative z-20 flex flex-col overflow-hidden border-l ${studioAsColumn ? 'w-[340px] flex-shrink-0' : `absolute right-0 top-0 bottom-0 ${mobile ? 'w-full' : 'w-full max-w-[360px]'}`}`}
            style={{
              borderColor: theme.border,
              background: theme.surface,
              boxShadow: studioAsColumn ? 'none' : 'var(--elev-4)',
            }}
          >
            {/* Header stays put while the fields scroll underneath it. */}
            <div className="flex flex-shrink-0 items-center gap-3 border-b px-5 py-3.5" style={{ borderColor: theme.border }}>
              <div className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${theme.accent}18`, color: theme.accentText }}>
                <Wand2 size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[14px] font-semibold leading-tight" style={{ color: theme.text }}>AI Studio <HelpTip id="chat-studio" size={16} /></div>
                <div className="truncate text-[11.5px]" style={{ color: theme.text3 }}>Pachete de grile din documentele tale</div>
              </div>
              <motion.button
                whileHover={calmMotion ? undefined : { scale: 1.05, rotate: 90 }}
                whileTap={calmMotion ? undefined : { scale: 0.9 }}
                onClick={() => setView('chat')}
                aria-label="Închide Studio"
                className="flex-shrink-0 rounded-full p-2"
                style={{ color: theme.text3, background: theme.surface2 }}
              >
                <X size={14} />
              </motion.button>
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-4">
              <StudioSelect
                label="Document"
                value={selectedStudioSourceId}
                onChange={(nextValue) => {
                  setStudioSourceId(nextValue);
                  setStudioHeading(WHOLE_DOCUMENT_HEADING);
                  const nextSource = readySources.find((source) => source.id === nextValue);
                  if (nextSource) {
                    setScopedSource({ id: nextSource.id, name: nextSource.name });
                    contextCacheRef.current?.clear();
                  }
                }}
                options={studioSourceOptions}
                placeholder="Nu există documente indexate"
                theme={theme}
              />

              {studioChapterOptions.length > 1 && (
                <StudioSelect
                  label="Capitol"
                  value={studioHeading}
                  onChange={setStudioHeading}
                  options={studioChapterOptions}
                  placeholder="Tot documentul"
                  theme={theme}
                />
              )}

              <div className={wholeDocument ? 'grid grid-cols-2 gap-3' : ''}>
                {wholeDocument && (
                  <Stepper
                    label="Pachete"
                    value={studioPackCount}
                    min={1}
                    max={STUDIO_MAX_PACK_COUNT}
                    onChange={(next) => setStudioPackCount(clampStudioPackCount(next))}
                  />
                )}
                <Stepper
                  label={wholeDocument ? 'Întrebări / pachet' : 'Întrebări'}
                  value={studioQuestionsPerPack}
                  min={3}
                  max={STUDIO_MAX_QUESTIONS_PER_PACK}
                  onChange={(next) => setStudioQuestionsPerPack(clampStudioQuestionCount(next))}
                />
              </div>

              {studioResidencyPlacement ? (
                <div>
                  <FieldLabel>Se salvează în</FieldLabel>
                  <div className="flex items-start gap-2.5 rounded-2xl px-3.5 py-3" style={{ background: theme.surface2, border: `1px solid ${theme.border}` }}>
                    <FolderOpen size={15} className="mt-0.5 flex-shrink-0" style={{ color: theme.accentText }} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold [overflow-wrap:anywhere]" style={{ color: theme.text }}>{placementLabel}</div>
                      <div className="mt-0.5 text-[11.5px]" style={{ color: theme.text3 }}>Se creează automat și apare în Rezidențiat.</div>
                    </div>
                  </div>
                </div>
              ) : (
                <StudioSelect
                  label="Se salvează în"
                  value={studioFolderId}
                  onChange={setStudioFolderId}
                  options={studioFolderOptions}
                  placeholder="Alege unde salvăm pachetele"
                  theme={theme}
                />
              )}

              <div className="border-t pt-3" style={{ borderColor: theme.border }}>
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((open) => !open)}
                  aria-expanded={advancedOpen}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <span className="text-[13px] font-semibold" style={{ color: theme.text }}>Avansat</span>
                  <span className="flex min-w-0 items-center gap-1.5 text-[12px]" style={{ color: theme.text3 }}>
                    <span className="truncate">{difficultyLabel} · {styleMeta.short}</span>
                    <ChevronDown size={14} className="flex-shrink-0" style={{ transform: advancedOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {advancedOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: calmMotion ? 0.12 : 0.22 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-4 pt-3">
                        <div>
                          <FieldLabel>Dificultate</FieldLabel>
                          <Segmented label="Dificultate" value={studioDifficulty} options={DIFFICULTIES} onChange={setStudioDifficulty} />
                        </div>
                        <div>
                          <FieldLabel>Tip de grilă</FieldLabel>
                          <Segmented
                            label="Tip de grilă"
                            value={studioExamStyle}
                            options={(['residency', 'simple'] as ExamStyle[]).map((style) => ({ id: style, label: EXAM_STYLE_META[style].short }))}
                            onChange={setStudioExamStyle}
                          />
                          <p className="mt-1.5 text-[11.5px] leading-5" style={{ color: theme.text3 }}>{styleMeta.description}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {generatedSummary && (
                <div
                  className="rounded-2xl border px-3.5 py-3 text-xs leading-6"
                  style={{ background: `${theme.success}10`, borderColor: `${theme.success}25`, color: theme.text }}
                >
                  {generatedSummary}
                </div>
              )}

              <div>
                <button
                  type="button"
                  onClick={() => setInfoOpen((open) => !open)}
                  aria-expanded={infoOpen}
                  className="flex items-center gap-1.5 text-[12px] font-medium"
                  style={{ color: theme.text3 }}
                >
                  <Info size={13} /> Cum funcționează?
                  <ChevronDown size={12} style={{ transform: infoOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
                </button>
                <AnimatePresence initial={false}>
                  {infoOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: calmMotion ? 0.12 : 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-2 pt-2.5 text-[12px] leading-5" style={{ color: theme.text2 }}>
                        <p>Alegi documentul, iar StudyX generează pachete de grile adaptate profilului tău și le pune direct în folderul ales.</p>
                        <p>
                          {weakTopics[0]
                            ? `Ține cont de tema vulnerabilă „${weakTopics[0].topic}” și își ajustează accentul.`
                            : 'Folosește documentul selectat și preferințele de mai sus.'}
                          {' '}Până la {STUDIO_MAX_PACK_COUNT} pachete și {STUDIO_MAX_QUESTIONS_PER_PACK} întrebări per pachet; dacă un apel AI cade, completează din document ca să nu pierzi sesiunea.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* The action: a soft fade instead of a hard rule, a one-line summary, then the button. */}
            <div className="relative flex-shrink-0 px-5 pb-4 pt-3" style={{ background: theme.surface }}>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 -top-6 h-6"
                style={{ background: `linear-gradient(to top, ${theme.surface}, transparent)` }}
              />
              <div className="mb-2 text-center text-[12px]" style={{ color: theme.text3 }}>{sizeSummary}</div>
              <button
                onClick={() => void handleGeneratePackages()}
                disabled={!selectedStudioSource || studioGenerating}
                className="press-feedback flex w-full items-center justify-center gap-2 rounded-[var(--r-lg)] px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-45"
                style={{ background: theme.accent, boxShadow: `0 10px 24px ${theme.accent}30` }}
              >
                {studioGenerating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Generez pachetele...
                  </>
                ) : (
                  <>
                    <Layers3 size={16} />
                    Generează pachetele
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
