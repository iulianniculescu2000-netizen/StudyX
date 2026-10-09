import { motion } from 'framer-motion';
import { useId, useState } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { PlusCircle, Trash2, X as XIcon } from 'lucide-react';
import type { Quiz, Question } from '../../types';
import type { Theme } from '../../theme/themes';
import { useQuizStore } from '../../store/quizStore';
import { modalIn } from '../../theme/motion';

export function EditDeckModal({
  quiz,
  theme,
  onClose,
}: {
  quiz: Quiz;
  theme: Theme;
  onClose: () => void;
}) {
  const updateQuiz = useQuizStore((state) => state.updateQuiz);
  const dialogRef = useFocusTrap(true, onClose);
  const titleId = useId();
  const [title, setTitle] = useState(quiz.title);
  const [cards, setCards] = useState<Array<{ id: string; front: string; back: string }>>(() =>
    quiz.questions.map((q) => ({
      id: q.id,
      front: q.text,
      back: q.options.find((o) => o.isCorrect)?.text ?? q.options[0]?.text ?? '',
    })),
  );

  const updateCard = (id: string, field: 'front' | 'back', value: string) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const addCard = () => {
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    setCards((prev) => [...prev, { id, front: '', back: '' }]);
  };

  const deleteCard = (id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
  };

  const save = () => {
    const updatedQuestions: Question[] = cards
      .filter((c) => c.front.trim() || c.back.trim())
      .map((card) => {
        const original = quiz.questions.find((q) => q.id === card.id);
        if (original) {
          return {
            ...original,
            text: card.front.trim() || original.text,
            options: original.options.map((opt) =>
              opt.isCorrect ? { ...opt, text: card.back.trim() || opt.text } : opt,
            ),
          };
        }
        const optId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
        return {
          id: card.id,
          text: card.front.trim() || 'Întrebare',
          options: [{ id: optId, text: card.back.trim() || 'Răspuns', isCorrect: true }],
          difficulty: 'medium' as const,
          tags: [],
          explanation: '',
        };
      });
    updateQuiz(quiz.id, { title: title.trim() || quiz.title, questions: updatedQuestions });
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto"
      style={{ background: 'var(--overlay)', backdropFilter: 'blur(6px)', padding: '2rem 1rem' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        variants={modalIn}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="glass-panel elev-4 w-full max-w-xl rounded-[var(--r-xl)] p-6"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id={titleId} className="text-[15px] font-black" style={{ color: theme.text }}>
            Editează deck
          </h2>
          <button
            onClick={onClose}
            aria-label="Închide"
            className="flex h-8 w-8 items-center justify-center rounded-[var(--r-sm)] transition-colors"
            style={{ color: theme.text3, background: theme.surface2 }}
          >
            <XIcon size={16} />
          </button>
        </div>

        <div className="mb-5">
          <div
            className="mb-1.5 text-[9px] font-black uppercase tracking-[0.18em]"
            style={{ color: theme.text3 }}
          >
            Titlu deck
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-[var(--r-md)] border px-4 py-3 text-sm font-bold outline-none focus:ring-2"
            style={{
              background: theme.surface2,
              borderColor: theme.border,
              color: theme.text,
            }}
          />
        </div>

        <div className="mb-1.5 flex items-center justify-between">
          <div
            className="text-[9px] font-black uppercase tracking-[0.18em]"
            style={{ color: theme.text3 }}
          >
            Carduri · {cards.length}
          </div>
        </div>

        <div className="mb-4 flex max-h-[50vh] flex-col gap-2.5 overflow-y-auto pr-1">
          {cards.map((card, idx) => (
            <div
              key={card.id}
              className="rounded-[var(--r-lg)] border p-3.5"
              style={{ background: theme.surface2, borderColor: theme.border }}
            >
              <div className="mb-2 flex items-center justify-between">
                <span
                  className="text-[9px] font-black uppercase tracking-wider"
                  style={{ color: theme.text3 }}
                >
                  {idx + 1}
                </span>
                <button
                  onClick={() => deleteCard(card.id)}
                  aria-label="Șterge cardul"
                  className="flex h-6 w-6 items-center justify-center rounded-[var(--r-sm)] transition-colors hover:bg-red-500/15"
                  style={{ color: theme.danger }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <textarea
                value={card.front}
                onChange={(e) => updateCard(card.id, 'front', e.target.value)}
                placeholder="Față — întrebare / concept"
                rows={2}
                className="mb-2 w-full resize-none rounded-[var(--r-sm)] border px-3 py-2 text-[13px] font-medium outline-none focus:ring-1"
                style={{ background: theme.surface, borderColor: theme.border, color: theme.text }}
              />
              <textarea
                value={card.back}
                onChange={(e) => updateCard(card.id, 'back', e.target.value)}
                placeholder="Spate — răspuns / explicație"
                rows={2}
                className="w-full resize-none rounded-[var(--r-sm)] border px-3 py-2 text-[13px] font-medium outline-none focus:ring-1"
                style={{ background: theme.surface, borderColor: theme.border, color: theme.text }}
              />
            </div>
          ))}
        </div>

        <button
          onClick={addCard}
          className="mb-5 flex w-full items-center justify-center gap-2 rounded-[var(--r-md)] border py-2.5 text-[11px] font-black uppercase tracking-wider transition-colors"
          style={{
            borderColor: `${theme.accent}44`,
            color: theme.accentText,
            borderStyle: 'dashed',
            background: `${theme.accent}08`,
          }}
        >
          <PlusCircle size={14} />
          Card nou
        </button>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-[var(--r-md)] py-3 text-[11px] font-black uppercase tracking-wider transition-colors"
            style={{ background: theme.surface2, color: theme.text3 }}
          >
            Anulează
          </button>
          <button
            onClick={save}
            disabled={cards.every((card) => !card.front.trim() && !card.back.trim())}
            title="Un pachet are nevoie de cel puțin un card"
            className="flex-1 rounded-[var(--r-md)] py-3 text-[11px] font-black uppercase tracking-wider text-white transition-colors disabled:opacity-50"
            style={{ background: theme.accent }}
          >
            Salvează
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
