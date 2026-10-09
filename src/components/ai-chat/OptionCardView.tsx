import { memo, useMemo } from 'react';
import { ArrowRight, Check, Layers, ListChecks, Loader2 } from 'lucide-react';
import type { Theme } from '../../theme/themes';
import { FLASHCARD_DIFFICULTY_LABEL, type FlashcardDifficulty } from '../../ai/flashcardPrompts';
import { countLabel } from '../../ai/studyRequestScripts';
import { useFolderStore } from '../../store/folderStore';
import { QUIZ_AUTO_CHOICE, defaultNewFolderParent, describeDestination, destinationOptions } from '../../lib/ai/studyDestinations';
import FolderChoiceField from '../residency/FolderChoiceField';
import { FieldLabel, Segmented, Stepper } from '../ui/FormControls';
import HelpTip from '../ui/HelpTip';
import type { OptionCard } from './shared';

const DIFFICULTY_OPTIONS = (['auto', 'easy', 'medium', 'hard'] as const).map((id) => ({ id, label: FLASHCARD_DIFFICULTY_LABEL[id] }));
const TYPE_OPTIONS = [{ id: 'single', label: 'Complement simplu' }, { id: 'multiple', label: 'Complement multiplu' }] as const;

interface OptionCardViewProps {
  card: OptionCard;
  theme: Theme;
  onEdit: (patch: Partial<OptionCard>) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onOpen: (route: string) => void;
}

/**
 * Cartea de opțiuni din chat: aici alegi subiectul, nivelul, numărul și folderul (existent sau nou) înainte să se genereze.
 * După generare rămâne ca un rezumat cu un buton care duce la rezultat.
 */
function OptionCardView({ card, theme, onEdit, onSubmit, onCancel, onOpen }: OptionCardViewProps) {
  const folders = useFolderStore((state) => state.folders);
  const options = useMemo(() => destinationOptions(card.kind, card.space, folders), [card.kind, card.space, folders]);
  const parentOptions = useMemo(() => options.filter((option) => option.id !== QUIZ_AUTO_CHOICE), [options]);
  const noun = card.kind === 'flashcards' ? 'flashcarduri' : 'grile';
  const Icon = card.kind === 'flashcards' ? Layers : ListChecks;

  const folderReady = card.folder.mode === 'existing' || card.folder.name.trim().length > 0;
  const canSubmit = card.topic.trim().length >= 3 && folderReady;
  const destination = describeDestination(card.kind, card.space, card.folder, folders);
  const summary = [
    countLabel(card.kind, card.count),
    card.topic.trim() ? `„${card.topic.trim()}”` : null,
    `nivel ${FLASHCARD_DIFFICULTY_LABEL[card.difficulty].toLowerCase()}`,
    destination,
  ].filter(Boolean).join(' · ');

  const shell = 'mt-3 rounded-2xl p-3.5';
  const shellStyle = { background: theme.surface, border: `1px solid ${theme.border}` } as const;

  if (card.status === 'cancelled') {
    return <div className={`${shell} text-[12px]`} style={{ ...shellStyle, color: theme.text3 }}>Cerere anulată · {summary}</div>;
  }

  if (card.status === 'running') {
    return (
      <div className={`${shell} flex items-center gap-2.5 text-[12.5px]`} style={{ ...shellStyle, color: theme.text2 }} role="status">
        <Loader2 size={15} className="animate-spin" style={{ color: theme.accentText }} />
        <span className="min-w-0">Generez {noun}… <span style={{ color: theme.text3 }}>{summary}</span></span>
      </div>
    );
  }

  if (card.status === 'done') {
    return (
      <div className={shell} style={shellStyle}>
        <div className="flex items-start gap-2 text-[12.5px]" style={{ color: theme.text2 }}>
          <Check size={15} className="mt-0.5 flex-shrink-0" style={{ color: theme.success }} />
          <span className="min-w-0">{summary}</span>
        </div>
        {card.route && (
          <button
            type="button"
            onClick={() => onOpen(card.route!.route)}
            className="press-feedback mt-2.5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-semibold text-white"
            style={{ background: theme.accent }}
          >
            <ArrowRight size={13} /> {card.route.label}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={shell} style={shellStyle}>
      <div className="mb-3 flex items-center gap-2 text-[12.5px] font-semibold" style={{ color: theme.text }}>
        <span className="grid h-7 w-7 place-items-center rounded-xl" style={{ background: `${theme.accent}18`, color: theme.accentText }}><Icon size={14} /></span>
        {card.kind === 'flashcards' ? 'Flashcarduri' : 'Grile'}
        <HelpTip id="chat-option-cards" size={16} />
        {card.status === 'error' && <span className="ml-auto text-[11.5px] font-medium" style={{ color: theme.danger }}>Încearcă din nou</span>}
      </div>

      <div className="space-y-3.5">
        <div>
          <FieldLabel>Subiect</FieldLabel>
          <input
            type="text"
            value={card.topic}
            maxLength={120}
            placeholder="ex. fibrilația atrială, pancreatita acută…"
            onChange={(event) => onEdit({ topic: event.target.value })}
            aria-label="Subiectul"
            className="w-full text-[13px]"
          />
        </div>
        <div>
          <FieldLabel>Nivel</FieldLabel>
          <Segmented label="Nivel" value={card.difficulty} options={DIFFICULTY_OPTIONS} onChange={(difficulty: FlashcardDifficulty) => onEdit({ difficulty })} />
        </div>
        <Stepper label={card.kind === 'flashcards' ? 'Câte carduri' : 'Câte grile'} value={card.count} min={5} max={60} step={5} onChange={(count) => onEdit({ count })} />
        {card.kind === 'quiz' && (
          <div>
            <FieldLabel>Tip de grilă</FieldLabel>
            <Segmented label="Tip de grilă" value={card.questionType} options={TYPE_OPTIONS} onChange={(questionType) => onEdit({ questionType })} />
          </div>
        )}
        <FolderChoiceField
          value={card.folder}
          onChange={(folder) => onEdit({ folder })}
          label="Se salvează în"
          options={options}
          parentOptions={parentOptions}
          newParentDefault={defaultNewFolderParent(card.kind, card.space)}
        />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="press-feedback rounded-full px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-45"
          style={{ background: theme.accent }}
        >
          Generează {countLabel(card.kind, card.count)}
        </button>
        <button type="button" onClick={onCancel} className="press-feedback rounded-full px-4 py-2.5 text-[12.5px] font-semibold" style={{ color: theme.text3 }}>
          Renunț
        </button>
      </div>
    </div>
  );
}

export default memo(OptionCardView);
