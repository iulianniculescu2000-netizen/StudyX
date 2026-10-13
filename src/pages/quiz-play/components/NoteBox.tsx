import { useId } from 'react';
import { motion } from 'framer-motion';
import { StickyNote } from 'lucide-react';
import { useNotesStore } from '../../../store/notesStore';
import type { Theme } from '../../../theme/themes';

interface NoteBoxProps {
  questionId: string;
  theme: Theme;
}

/** Per-question personal note, persisted through the notes store. */
export default function NoteBox({ questionId, theme }: NoteBoxProps) {
  const noteId = useId();
  const currentNote = useNotesStore((s) => s.notes[questionId] ?? '');
  const setNote = useNotesStore((s) => s.setNote);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 overflow-hidden rounded-[var(--r-md)] border transition-shadow focus-within:shadow-[var(--ring-focus)]"
      style={{ borderColor: theme.border }}
    >
      <div className="flex items-center gap-2 px-3 py-2"
        style={{ background: theme.surface2, borderBottom: `1px solid ${theme.border}` }}>
        <StickyNote size={12} style={{ color: theme.warning }} />
        <label htmlFor={noteId} className="text-xs font-medium" style={{ color: theme.text3 }}>Notița mea</label>
      </div>
      <div className="px-3 py-3" style={{ background: theme.surface }}>
        <textarea
          id={noteId}
          placeholder="Adaugă o notiță pentru această întrebare..."
          value={currentNote}
          onChange={e => setNote(questionId, e.target.value)}
          onFocus={e => e.currentTarget.scrollIntoView?.({ block: 'center', behavior: 'smooth' })}
          rows={3}
          className="input-bare block w-full resize-y text-[13px] leading-relaxed"
          style={{ color: theme.text2, minHeight: 64 }}
        />
      </div>
    </motion.div>
  );
}
