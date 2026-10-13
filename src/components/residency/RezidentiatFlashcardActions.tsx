import { useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FolderPlus, Layers, PenLine, Plus, Sparkles, Upload } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useAdaptiveMotion } from '../../hooks/useAdaptiveMotion';
import { useFolderStore } from '../../store/folderStore';
import { ensureFlashcardsRoot } from '../../lib/rezidentiatFlashcardFolders';
import { folderSubtreeIds } from '../../lib/flashcardGroups';
import { AnkiImportModal } from '../../pages/flashcard-hub/AnkiImportModal';
import { useRezidentiatFolderDialog } from '../../store/rezidentiatFolderDialogStore';
import { AiDeckDialog, ImportCsvDialog, ManualDeckDialog, NewFolderDialog } from './RezidentiatFlashcardDialogs';

type Dialog = 'manual' | 'ai' | null;

interface MenuItem { id: 'ai' | 'manual' | 'folder' | 'csv' | 'anki'; label: string; hint: string; icon: ReactNode }

/**
 * Butonul „+” din antetul paginii Flashcarduri Rezidențiat: folder nou, pachet scris de mână, pachet cu AI și import
 * (CSV sau Anki). Toate aterizează în Rezidențiat › Flashcarduri, în folderul ales.
 */
export default function RezidentiatFlashcardActions() {
  const theme = useTheme();
  const { calmMotion, t } = useAdaptiveMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [ankiParent, setAnkiParent] = useState<string | null>(null);
  const csvInput = useRef<HTMLInputElement>(null);
  const folderDialogOpen = useRezidentiatFolderDialog((state) => state.open);
  const folderDialogParent = useRezidentiatFolderDialog((state) => state.parentId);

  const openAnki = () => setAnkiParent(ensureFlashcardsRoot());
  const open = (next: Dialog) => { setMenuOpen(false); setDialog(next); };
  const ankiFolders = ankiParent
    ? (() => {
        const all = useFolderStore.getState().folders;
        const inside = folderSubtreeIds(ankiParent, all);
        return all.filter((folder) => inside.has(folder.id));
      })()
    : [];

  const runItem = (id: MenuItem['id']) => {
    if (id === 'ai' || id === 'manual') return open(id);
    setMenuOpen(false);
    if (id === 'folder') useRezidentiatFolderDialog.getState().show();
    else if (id === 'csv') csvInput.current?.click();
    else openAnki();
  };

  const items: MenuItem[] = [
    { id: 'ai', label: 'Cu AI', hint: 'Din tematica cărților, la nivelul ales', icon: <Sparkles size={16} /> },
    { id: 'manual', label: 'Pachet nou', hint: 'Scrii tu cardurile', icon: <PenLine size={16} /> },
    { id: 'folder', label: 'Folder nou', hint: 'Îți organizezi pachetele', icon: <FolderPlus size={16} /> },
    { id: 'csv', label: 'Importă CSV', hint: 'Față și spate, câte un card pe linie', icon: <Upload size={16} /> },
    { id: 'anki', label: 'Importă din Anki', hint: 'Fișier .apkg', icon: <Layers size={16} /> },
  ];

  return (
    <div className="relative" data-tutorial="rez-flash-add">
      <button
        type="button"
        onClick={() => setMenuOpen((value) => !value)}
        aria-label="Adaugă flashcarduri"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title="Adaugă flashcarduri"
        className="fine-row press-feedback flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
        style={{ background: menuOpen ? `${theme.accent}18` : theme.surface2, color: menuOpen ? theme.accentText : theme.text2 }}
      >
        <Plus size={18} style={{ transform: menuOpen ? 'rotate(45deg)' : undefined, transition: 'transform 0.2s' }} />
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
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  onClick={() => runItem(item.id)}
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

      <input
        ref={csvInput}
        type="file"
        accept=".csv,.tsv,.txt,text/csv,text/plain"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = '';
          if (file) setCsvFile(file);
        }}
      />

      <NewFolderDialog open={folderDialogOpen} initialParentId={folderDialogParent} onClose={() => useRezidentiatFolderDialog.getState().hide()} onCreated={() => undefined} />
      <ManualDeckDialog open={dialog === 'manual'} onClose={() => setDialog(null)} onCreated={() => undefined} />
      <AiDeckDialog open={dialog === 'ai'} onClose={() => setDialog(null)} onCreated={() => undefined} />
      <ImportCsvDialog file={csvFile} onClose={() => setCsvFile(null)} onCreated={() => undefined} />
      {ankiParent && (
        <AnkiImportModal
          folders={ankiFolders}
          theme={theme}
          requireParent
          defaultParentId={ankiParent}
          onClose={() => setAnkiParent(null)}
          onImported={() => setAnkiParent(null)}
        />
      )}
    </div>
  );
}
