import { Sparkles } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';
import TourHelpButton from '../../tutorial/TourHelpButton';
import { DUE_NEW_DEFAULT } from '../../lib/flashcardDueQueue';


interface SessionEmptyStateProps {
  isDue: boolean; dueEmptyNew: number; includeNew: number; toggleNewCards: () => void;
}

/** Nimic de studiat: coada „de repetat” e goală sau pachetul nu are carduri. */
export function SessionEmptyState({ isDue, dueEmptyNew, includeNew, toggleNewCards }: SessionEmptyStateProps) {
  return (
    <div className="h-full overflow-y-auto px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-2 flex justify-end"><TourHelpButton tour="flashcardSession" label="Ghid pentru sesiunea de flashcarduri" /></div>
        {isDue ? (
          <EmptyState
            icon={Sparkles}
            title="Nimic de repetat"
            body={dueEmptyNew > 0 && includeNew === 0
              ? `Ești la zi cu repetările. Poți adăuga ${Math.min(dueEmptyNew, DUE_NEW_DEFAULT)} carduri noi din această selecție.`
              : 'Ești la zi cu repetările din această selecție. Revino mai târziu.'}
            primary={{ label: 'Înapoi la flashcarduri', to: '/flashcards' }}
            secondary={dueEmptyNew > 0 && includeNew === 0
              ? { label: 'Adaugă și carduri noi', onClick: toggleNewCards }
              : undefined}
          />
        ) : (
          <EmptyState
            icon={Sparkles}
            title="Niciun card de studiat"
            body="Toate cardurile tale sunt la zi sau nu există întrebări în acest pachet."
            primary={{ label: 'Înapoi la flashcarduri', to: '/flashcards' }}
          />
        )}
      </div>
    </div>
  );
}
