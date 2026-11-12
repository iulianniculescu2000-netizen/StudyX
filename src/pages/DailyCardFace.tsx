import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../theme/ThemeContext';
import { press } from '../theme/motion';
import type { Question } from '../types';

type Rating = 'hard' | 'good' | 'easy';

const RATINGS: ReadonlyArray<{ id: Rating; label: string }> = [
  { id: 'hard', label: 'Greu' },
  { id: 'good', label: 'Bine' },
  { id: 'easy', label: 'Ușor' },
];

/** Verso-ul unui card din coada zilei: răspunsul se arată la cerere, apoi se notează ca în sesiunea de flashcarduri. */
export default function DailyCardFace({ question, onRate }: { question: Question; onRate: (rating: Rating) => void }) {
  const theme = useTheme();
  const [shown, setShown] = useState(false);
  const answers = question.options.filter((option) => option.isCorrect);

  if (!shown) {
    return (
      <motion.button
        {...press}
        onClick={() => setShown(true)}
        className="w-full rounded-[var(--r-lg)] py-4 font-semibold text-white"
        style={{ background: theme.accent }}>
        Arată răspunsul
      </motion.button>
    );
  }

  return (
    <div>
      <div className="fine-chip mb-4 rounded-[var(--r-lg)] p-5" data-active="true">
        {answers.map((option) => (
          <p key={option.id} className="text-base font-medium leading-relaxed" style={{ color: theme.text }}>{option.text}</p>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {RATINGS.map((rating) => (
          <motion.button
            key={rating.id}
            {...press}
            onClick={() => onRate(rating.id)}
            className="fine-chip rounded-[var(--r-md)] py-3.5 text-sm font-semibold"
            style={{ color: rating.id === 'hard' ? theme.danger : rating.id === 'easy' ? theme.success : theme.accentText }}>
            {rating.label}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
