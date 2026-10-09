import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BookPlus, FolderPlus, Loader2, PenLine, Plus, Sparkles, Trash2, Upload } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { useFolderStore } from '../../store/folderStore';
import { useQuizStore } from '../../store/quizStore';
import { useToastStore } from '../../store/toastStore';
import { deleteQuizFolder, userQuizFolders } from '../../lib/rezidentiatQuizFolders';
import ImportQuizButton from '../ImportQuizButton';
import ModalShell from '../ui/ModalShell';
import SectionLabel from '../ui/SectionLabel';
import HelpTip from '../ui/HelpTip';
import { AiQuizDialog, ImportQuizFolderDialog, NewFolderDialog } from './RezidentiatFlashcardDialogs';

type Dialog = 'ai' | 'folder' | 'import-folder' | null;

interface MenuItem { id: string; label: string; hint: string; icon: ReactNode; run: () => void }

interface Props {
  onAddBook: () => void;
  addingBook: boolean;
}

/**
 * Butonul „+” din antetul paginii Rezidențiat: grile cu AI, import de grile, folder nou, grilă scrisă de mână și cartea nouă.
 * Grilele aterizează în Rezidențiat › Grile, în folderul ales.
 */
export default function RezidentiatQuizActions({ onAddBook, addingBook }: Props) {
  const theme = useTheme();
  const navigate = useNavigate();
  const { calmMotion, t } = useAdaptiveMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [importFolder, setImportFolder] = useState<string | null>(null);

  const open = (next: Dialog) => { setMenuOpen(false); setDialog(next); };
  const items: MenuItem[] = [
    { id: 'ai', label: 'Grile cu AI', hint: 'Format de rezidențiat, la nivelul ales', icon: <Sparkles size={16} />, run: () => open('ai') },
    { id: 'import', label: 'Importă grile', hint: 'JSON, document sau din alt AI', icon: <Upload size={16} />, run: () => open('import-folder') },
    { id: 'manual', label: 'Grilă scrisă de mână', hint: 'O creezi tu, întrebare cu întrebare', icon: <PenLine size={16} />, run: () => { setMenuOpen(false); navigate('/create'); } },
    { id: 'folder', label: 'Folder nou', hint: 'Îți organizezi grilele', icon: <FolderPlus size={16} />, run: () => open('folder') },
    { id: 'book', label: 'Adaugă o carte', hint: 'PDF pentru capitole și AI', icon: <BookPlus size={16} />, run: () => { setMenuOpen(false); onAddBook(); } },
  ];

  return (
    <div className="relative" data-tutorial="rez-quiz-add">
      <button
        type="button"
        onClick={() => setMenuOpen((value) => !value)}
        aria-label="Adaugă în Rezidențiat"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title="Adaugă"
        disabled={addingBook}
        className="fine-row press-feedback flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full disabled:opacity-60"
        style={{ background: menuOpen ? `${theme.accent}18` : theme.surface2, color: menuOpen ? theme.accent : theme.text2 }}
      >
        {addingBook ? <Loader2 size={16} className="animate-spin" /> : <Plus size={18} style={{ transform: menuOpen ? 'rotate(45deg)' : undefined, transition: 'transform 0.2s' }} />}
      </button>

      <AnimatePresence>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-[40]" onClick={() => setMenuOpen(false)} aria-hidden="true" />
            <motion.div
              role="menu"
              initial={calmMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={t.pop}
              className="absolute right-0 top-full z-[41] mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-[var(--r-lg)] border p-1.5"
              style={{ background: theme.modalBg, borderColor: theme.border2, boxShadow: 'var(--elev-3)', maxHeight: 'calc(100vh - 6rem)', overflowY: 'auto' }}
            >
              <div role="presentation" className="flex items-center justify-between px-3 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: theme.text3 }}>
                <span>Adaugă</span>
                <HelpTip id="rez-plus" size={16} />
              </div>
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  onClick={item.run}
                  className="fine-row flex w-full items-center gap-3 rounded-[var(--r-sm)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--hover-fill)]"
                >
                  <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl" style={{ background: `${theme.accent}14`, color: theme.accentText }}>{item.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold" style={{ color: theme.text }}>{item.label}</span>
                    <span className="block truncate text-[11.5px]" style={{ color: theme.text3 }}>{item.hint}</span>
                  </span>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AiQuizDialog open={dialog === 'ai'} onClose={() => setDialog(null)} />
      <NewFolderDialog kind="quiz" open={dialog === 'folder'} onClose={() => setDialog(null)} onCreated={() => undefined} />
      <ImportQuizFolderDialog
        open={dialog === 'import-folder'}
        onClose={() => setDialog(null)}
        onChosen={(folderId) => { setDialog(null); setImportFolder(folderId); }}
      />
      {importFolder && <ImportQuizButton hideTrigger open targetFolderId={importFolder} onClose={() => setImportFolder(null)} />}
    </div>
  );
}

/** „Folderele tale” de grile: le vezi chiar goale, le deschizi și le ștergi (cu grile sau păstrându-le). */
export function UserQuizFolders() {
  const theme = useTheme();
  const navigate = useNavigate();
  const addToast = useToastStore((state) => state.addToast);
  const folders = useFolderStore((state) => state.folders);
  const quizzes = useQuizStore((state) => state.quizzes);
  const rows = useMemo(() => userQuizFolders(folders, quizzes), [folders, quizzes]);
  const [pending, setPending] = useState<string | null>(null);
  const target = rows.find((row) => row.folder.id === pending);

  if (rows.length === 0) return null;

  const confirm = (withQuizzes: boolean) => {
    if (!target) return;
    const { quizzes: moved } = deleteQuizFolder(target.folder.id, withQuizzes);
    addToast(
      withQuizzes || moved === 0 ? `Folderul „${target.folder.name}” a fost șters.` : `Folderul „${target.folder.name}” a fost șters; ${moved} seturi au rămas în Grile.`,
      'success',
    );
    setPending(null);
  };

  return (
    <section data-tutorial="rez-quiz-folders">
      <div className="mb-2 flex items-center gap-1.5">
        <SectionLabel>Folderele tale de grile</SectionLabel>
        <HelpTip id="rez-quiz-folders" size={16} />
      </div>
      <div className="glass-panel overflow-hidden rounded-2xl">
        {rows.map((row, index) => (
          <div key={row.folder.id} className="flex items-center gap-2 px-4 py-2.5" style={{ borderTop: index === 0 ? undefined : `1px solid ${theme.border}`, paddingLeft: 16 + row.depth * 18 }}>
            <button
              type="button"
              onClick={() => navigate(`/folder/${row.folder.id}?plain=1`)}
              className="press-feedback min-w-0 flex-1 text-left"
            >
              <span className="block truncate text-[13.5px] font-semibold" style={{ color: theme.text }}>{row.folder.name}</span>
              <span className="block text-[11.5px]" style={{ color: theme.text3 }}>{row.quizCount === 0 ? 'Gol' : `${row.quizCount} ${row.quizCount === 1 ? 'set' : 'seturi'}`}</span>
            </button>
            <button
              type="button"
              onClick={() => setPending(row.folder.id)}
              aria-label={`Șterge folderul ${row.folder.name}`}
              title="Șterge folderul"
              className="press-feedback grid h-8 w-8 flex-shrink-0 place-items-center rounded-full"
              style={{ color: theme.text3 }}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      <ModalShell
        open={!!target}
        title={`Ștergi „${target?.folder.name ?? ''}”?`}
        subtitle={target && target.quizCount > 0 ? `Are ${target.quizCount} ${target.quizCount === 1 ? 'set' : 'seturi'} de grile.` : 'Folderul e gol.'}
        onClose={() => setPending(null)}
        width="sm"
        footer={(
          <>
            <button type="button" onClick={() => setPending(null)} className="press-feedback rounded-full px-4 py-2.5 text-[13px] font-semibold" style={{ background: theme.surface2, color: theme.text2 }}>Anulează</button>
            {target && target.quizCount > 0 && (
              <button type="button" onClick={() => confirm(false)} className="press-feedback rounded-full px-4 py-2.5 text-[13px] font-semibold" style={{ background: theme.surface2, color: theme.text }}>Șterge, păstrează grilele</button>
            )}
            <button type="button" onClick={() => confirm(true)} className="press-feedback rounded-full px-5 py-2.5 text-[13px] font-semibold text-white" style={{ background: theme.danger }}>
              {target && target.quizCount > 0 ? 'Șterge tot' : 'Șterge'}
            </button>
          </>
        )}
      >
        <p className="text-[13px]" style={{ color: theme.text2 }}>
          {target && target.quizCount > 0
            ? 'Poți păstra grilele (rămân în Rezidențiat › Grile) sau le ștergi odată cu folderul.'
            : 'Subfolderele goale se șterg împreună cu el.'}
        </p>
      </ModalShell>
    </section>
  );
}
