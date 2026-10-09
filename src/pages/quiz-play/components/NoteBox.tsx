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
  const currentNote = useNotesStore((s) => s.notes[questionId] ?? '');
  const setNote = useNotesStore((s) => s.setNote);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 rounded-2xl overflow-hidden"
      style={{ border: `1px solid ${theme.border}` }}
    >
      <div className="flex items-center gap-2 px-3 py-2"
        style={{ background: theme.surface2, borderBottom: `1px solid ${theme.border}` }}>
        <StickyNote size={12} style={{ color: theme.warning }} />
        <span className="text-xs font-medium" style={{ color: theme.text3 }}>Notița mea</span>
      </div>
      <textarea
        placeholder="Adaugă o notiță pentru această întrebare..."
        value={currentNote}
        onChange={e => setNote(questionId, e.target.value)}
        rows={2}
        className="w-full px-3 py-2 text-xs resize-none bg-transparent"
        style={{ color: theme.text2, outline: 'none', border: 'none' }}
      />
    </motion.div>
  );
}
