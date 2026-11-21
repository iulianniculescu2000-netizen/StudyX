import { Loader2 } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';

interface Props {
  deckCount: number;
  startingDeck: boolean;
  onOrganizare: () => void;
  onFlashcards: () => void;
  onAsk: () => void;
}

/** Selectorul de sus: „Grile” e pagina curentă; celelalte trei duc la Organizare, flashcarduri și chatul din cărți. */
export default function ResidencyNav({ deckCount, startingDeck, onOrganizare, onFlashcards, onAsk }: Props) {
  const theme = useTheme();
  const items: Array<{ label: string; onClick?: () => void; busy?: boolean; hint?: string }> = [
    { label: 'Grile' },
    { label: 'Organizare', onClick: onOrganizare },
    { label: 'Flashcarduri', onClick: onFlashcards, busy: startingDeck, hint: deckCount > 0 ? `${deckCount} ${deckCount === 1 ? 'pachet' : 'pachete'}` : undefined },
    { label: 'Întreabă', onClick: onAsk, hint: 'Răspunsuri din cărțile de bază, cu pagina' },
  ];
  return (
    <nav data-tutorial="residency-resources" aria-label="Secțiunile Rezidențiatului" className="flex gap-1 rounded-[14px] p-[3px]" style={{ background: 'var(--fill-subtle)' }}>
      {items.map((item) => {
        const current = !item.onClick;
        return (
          <button
            key={item.label}
            type="button"
            aria-current={current ? 'page' : undefined}
            title={item.hint}
            disabled={item.busy}
            onClick={item.onClick}
            className={`press-feedback flex flex-1 items-center justify-center gap-1.5 rounded-[10px] px-2 py-2 text-[13px] font-semibold transition-colors ${current ? '' : 'hover:bg-[var(--hover-fill)]'}`}
            style={current
              ? { background: 'var(--glass-panel)', color: theme.text, outline: '1px solid var(--hairline)' }
              : { color: theme.text2 }}
          >
            {item.busy && <Loader2 size={13} className="animate-spin" aria-hidden />}
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
