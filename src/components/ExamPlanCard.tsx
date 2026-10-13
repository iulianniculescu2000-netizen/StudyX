/**
 * Compact "Plan examen" affordance mounted inside a Knowledge Vault folder's
 * view (KnowledgeVault.tsx). Deliberately slim when unused — a folder that
 * never sets an exam plan shows a one-line CTA, not a full card, so folders
 * that don't need this feature aren't burdened by it.
 */
import { plural } from '../lib/plural';
import ProgressBar from './fx/ProgressBar';
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, ChevronDown, Loader2, Pencil, Trash2 } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useAIStore, type AILibraryFolder, type AIKnowledgeSource } from '../store/aiStore';
import { useToastStore } from '../store/toastStore';
import { useFolderChapters } from '../hooks/useFolderChapters';
import { useAdaptiveMotion } from '../hooks/useAdaptiveMotion';
import { daysUntil } from '../lib/examSplit';
import { localDateStr } from '../lib/studyPlan';
import ExamPlanSetupModal from './ExamPlanSetupModal';
import ExamPlanSessionRow from './ExamPlanSessionRow';
import { dur, ease, press, pressLarge, staggerMax, staggerStep } from '../theme/motion';

export default function ExamPlanCard({ folder, sources }: { folder: AILibraryFolder; sources: AIKnowledgeSource[] }) {
  const theme = useTheme();
  const { calmMotion, t } = useAdaptiveMotion();
  const tap = calmMotion ? {} : press;
  const setFolderExamPlan = useAIStore((state) => state.setFolderExamPlan);
  const addToast = useToastStore((state) => state.addToast);
  const [expanded, setExpanded] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  const folderSources = useMemo(
    () => sources.map((s) => ({ id: s.id, name: s.name, addedAt: s.addedAt })),
    [sources],
  );
  const { chapters, loading } = useFolderChapters(folderSources);

  const plan = folder.examPlan;
  const today = localDateStr();
  const examPast = plan ? plan.examDate < today : false;
  const daysLeft = plan && !examPast ? daysUntil(new Date(`${plan.examDate}T12:00:00`)) : null;
  const doneCount = plan ? plan.sessions.filter((s) => s.done).length : 0;
  const totalCount = plan ? plan.sessions.length : 0;
  const newDocsCount = plan ? sources.filter((s) => !plan.sourceIds.includes(s.id)).length : 0;
  const progressPercent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const handleDelete = () => {
    setFolderExamPlan(folder.id, null);
    addToast('Planul de examen a fost șters.', 'info');
    setExpanded(false);
  };

  if (!plan) {
    return (
      <>
        <motion.button
          onClick={() => setSetupOpen(true)}
          {...(calmMotion ? {} : pressLarge)}
          className="flex w-full items-center justify-between gap-3 rounded-[var(--r-md)] px-4 py-3 text-left transition-colors"
          style={{ background: theme.surface2, border: `1px dashed ${theme.border}` }}
        >
          <span className="flex items-center gap-2 text-xs font-bold" style={{ color: theme.text3 }}>
            <CalendarDays size={15} style={{ color: theme.text3 }} />
            Plan examen — nesetat
            {loading && <Loader2 size={12} className="animate-spin" />}
          </span>
          <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: theme.accentText }}>
            Configurează
          </span>
        </motion.button>
        {setupOpen && <ExamPlanSetupModal folder={folder} chapters={chapters} onClose={() => setSetupOpen(false)} />}
      </>
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: calmMotion ? 0 : 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={t.page}
        className="rounded-[var(--r-md)] p-4"
        style={{ background: `${theme.accent}0d`, border: `1px solid ${theme.accent}25` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <motion.button
            onClick={() => setExpanded((v) => !v)}
            className="flex min-w-0 items-center gap-2.5 text-left transition-opacity hover:opacity-80"
          >
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)]"
              style={{ background: examPast ? theme.surface2 : `${theme.accent}18` }}
            >
              <CalendarDays size={16} style={{ color: examPast ? theme.text3 : theme.accent }} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black" style={{ color: theme.text }}>
                {examPast ? 'Examen încheiat' : `${plural(daysLeft ?? 0, 'zi', 'zile')} până la examen`}
              </div>
              <div className="text-[11px] font-semibold" style={{ color: theme.text3 }}>
                Notă țintă {plan.targetGrade} · {doneCount}/{plural(totalCount, 'sesiune bifată', 'sesiuni bifate')}
              </div>
            </div>
          </motion.button>

          <div className="flex flex-shrink-0 items-center gap-1.5">
            <motion.button
              onClick={() => setSetupOpen(true)}
              {...tap}
              className="flex h-7 w-7 items-center justify-center rounded-[var(--r-sm)] transition-colors hover:bg-[var(--hover-fill)]"
              style={{ color: theme.text3 }}
              aria-label="Editează planul"
              title="Editează planul"
            >
              <Pencil size={13} />
            </motion.button>
            {examPast && (
              <motion.button
                onClick={handleDelete}
                {...tap}
                className="flex h-7 w-7 items-center justify-center rounded-[var(--r-sm)] transition-colors hover:bg-[var(--hover-fill)]"
                style={{ color: theme.danger }}
                aria-label="Șterge planul"
                title="Șterge planul"
              >
                <Trash2 size={13} />
              </motion.button>
            )}
            <motion.button
              onClick={() => setExpanded((v) => !v)}
              {...tap}
              className="flex h-7 w-7 items-center justify-center rounded-[var(--r-sm)] transition-colors hover:bg-[var(--hover-fill)]"
              style={{ color: theme.text3 }}
              aria-label={expanded ? 'Restrânge' : 'Extinde'}
            >
              <motion.span
                animate={{ rotate: expanded ? 180 : 0 }}
                transition={calmMotion ? { duration: dur.instant } : { duration: dur.fast, ease: ease.standard }}
                className="flex items-center justify-center"
              >
                <ChevronDown size={15} />
              </motion.span>
            </motion.button>
          </div>
        </div>

        {!examPast && totalCount > 0 && (
          <div className="mt-3">
            <ProgressBar
              percent={progressPercent}
              heightClass="h-1.5"
              track={theme.surface2}
              color={progressPercent === 100 ? theme.success : theme.accent}
              transition={{ duration: dur.slow, ease: ease.emphasized }}
              label="Progres plan de examen"
            />
          </div>
        )}

        {newDocsCount > 0 && (
          <motion.button
            onClick={() => setSetupOpen(true)}
            {...tap}
            className="mt-3 flex w-full items-center justify-between gap-2 rounded-[var(--r-sm)] px-3 py-2 text-left text-[11px] font-semibold transition-colors"
            style={{ background: theme.surface2, color: theme.text2 }}
          >
            <span>Ai adăugat {newDocsCount === 1 ? 'un document nou' : `${newDocsCount} documente noi`} — planul nu {newDocsCount === 1 ? 'îl' : 'le'} include încă.</span>
            <span style={{ color: theme.accentText }}>Actualizează</span>
          </motion.button>
        )}

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, y: calmMotion ? 0 : -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={t.pop}
            >
              <div className="mt-3 space-y-2">
                {plan.sessions.map((session, i) => (
                  <motion.div
                    key={session.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={calmMotion ? { duration: 0 } : { delay: Math.min(i, staggerMax - 1) * staggerStep, duration: dur.fast, ease: ease.standard }}
                  >
                    <ExamPlanSessionRow folderId={folder.id} session={session} />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      {setupOpen && <ExamPlanSetupModal folder={folder} chapters={chapters} onClose={() => setSetupOpen(false)} />}
    </>
  );
}
