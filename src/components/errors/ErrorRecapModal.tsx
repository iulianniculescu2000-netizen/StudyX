import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import ModalShell from '../ui/ModalShell';
import { useTheme } from '../../theme/ThemeContext';
import { dispatchOpenBook } from '../pdf/bookRequest';
import { withoutSemicolons } from '../../helpers/quizAi';
import { correctAnswersOf, findBookLink, type BookLink } from '../../lib/errorNotebookStudy';
import type { ErrorEntry } from '../../lib/errorNotebook';

interface Props {
  open: boolean;
  entries: ErrorEntry[];
  onClose: () => void;
}

const BOOK_NAME = { K: 'Kumar', L: 'Lawrence', S: 'Sinopsis' } as const;

function RecapBody({ entries, onClose }: { entries: ErrorEntry[]; onClose: () => void }) {
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [known, setKnown] = useState(0);
  const [link, setLink] = useState<{ key: string; value: BookLink | null } | null>(null);
  const entry = entries[index];

  useEffect(() => {
    if (!revealed || !entry) return;
    let cancelled = false;
    void findBookLink(entry.question).then((value) => { if (!cancelled) setLink({ key: entry.key, value }); });
    return () => { cancelled = true; };
  }, [revealed, entry]);

  if (!entry) {
    return (
      <div className="space-y-3 py-2 text-center">
        <p className="text-[15px] font-semibold" style={{ color: theme.text }}>Ai terminat mini-recapitularea</p>
        <p className="text-[13px]" style={{ color: theme.text2 }}>Ai știut {known} din {entries.length}. Ce n-a ieșit rămâne în caiet până îl răspunzi corect de 3 ori la rând.</p>
        <button type="button" onClick={onClose} className="press-feedback focus-ring rounded-full px-4 py-2 text-[13px] font-semibold text-white" style={{ background: theme.accent }}>Gata</button>
      </div>
    );
  }

  const found = link?.key === entry.key ? link.value : null;
  const next = (didKnow: boolean) => {
    if (didKnow) setKnown((n) => n + 1);
    setRevealed(false);
    setIndex((i) => i + 1);
  };

  return (
    <div className="space-y-4">
      <p className="text-[12px]" style={{ color: theme.text3 }}>Întrebarea {index + 1} din {entries.length} · {entry.quiz.title}</p>
      <p className="text-[15px] font-semibold leading-snug" style={{ color: theme.text }}>{entry.question.text}</p>
      {!revealed ? (
        <button type="button" onClick={() => setRevealed(true)} className="press-feedback focus-ring rounded-full px-4 py-2 text-[13px] font-semibold text-white" style={{ background: theme.accent }}>Arată răspunsul</button>
      ) : (
        <div className="space-y-3">
          <p className="rounded-[var(--r-sm)] px-3 py-2 text-[13px]" style={{ background: 'var(--accent-soft)', color: theme.accentText }}>✓ {correctAnswersOf(entry.question)}</p>
          {entry.question.explanation && <p className="text-[13px] leading-relaxed whitespace-pre-line" style={{ color: theme.text2 }}>{withoutSemicolons(entry.question.explanation)}</p>}
          {found && (
            <button
              type="button"
              onClick={() => { onClose(); dispatchOpenBook({ book: found.book, pdfPage: found.page }); }}
              className="fine-chip press-feedback focus-ring flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold"
              style={{ color: theme.accentText }}
            >
              <BookOpen size={13} aria-hidden="true" />Vezi în carte · {BOOK_NAME[found.book]}, p. {found.page}
            </button>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => next(true)} className="press-feedback focus-ring rounded-full px-4 py-2 text-[13px] font-semibold text-white" style={{ background: theme.accent }}>Am știut</button>
            <button type="button" onClick={() => next(false)} className="fine-chip press-feedback focus-ring rounded-full px-4 py-2 text-[13px] font-semibold" style={{ color: theme.text2 }}>Încă nu</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Mini-recapitulare: câteva greșeli, una câte una, fără AI; „Vezi în carte” apare când se găsește local o pagină. */
export default function ErrorRecapModal({ open, entries, onClose }: Props) {
  return (
    <ModalShell open={open} title="Mini-recapitulare" subtitle="Gândește răspunsul, apoi verifică-l." onClose={onClose} width="lg">
      {open && <RecapBody entries={entries} onClose={onClose} />}
    </ModalShell>
  );
}
