import { useMemo } from 'react';
import { useTheme } from '../../theme/ThemeContext';
import { useFolderStore } from '../../store/folderStore';
import ThemedSelect from '../ThemedSelect';
import { FieldLabel } from '../ui/FormControls';
import { FLASHCARDS_ROOT_CHOICE, flashcardFolderOptions, type FolderChoice, type FolderOption } from '../../lib/rezidentiatFlashcardFolders';

const NEW_VALUE = '__new__';

interface FolderChoiceFieldProps {
  value: FolderChoice;
  onChange: (value: FolderChoice) => void;
  label?: string;
  /** Folderele oferite; implicit cele din Rezidențiat › Flashcarduri. */
  options?: FolderOption[];
  /** Din ce folosește alegerea „Se creează în” când alegi un folder nou (fără opțiuni speciale ca „Automat”). */
  parentOptions?: FolderOption[];
  /** Părintele implicit al unui folder nou. */
  newParentDefault?: string;
}

/**
 * „Unde salvăm?”: un folder existent din Rezidențiat › Flashcarduri sau unul nou, creat sub el (sau sub oricare
 * dintre foldere). Folderul nou nu se creează aici, ci abia când utilizatorul apasă acțiunea principală.
 */
export default function FolderChoiceField({ value, onChange, label = 'Folder', options: given, parentOptions: givenParents, newParentDefault = FLASHCARDS_ROOT_CHOICE }: FolderChoiceFieldProps) {
  const theme = useTheme();
  const folders = useFolderStore((state) => state.folders);
  const raw = useMemo(() => given ?? flashcardFolderOptions(folders), [given, folders]);
  const asSelect = (list: FolderOption[]) => list.map((option) => ({ value: option.id, label: `${option.depth > 0 ? '↳ ' : ''}${option.label}` }));
  const options = useMemo(() => asSelect(raw), [raw]);
  const parentList = useMemo(() => asSelect(givenParents ?? raw), [givenParents, raw]);
  const selectOptions = useMemo(() => [...options, { value: NEW_VALUE, label: '＋ Folder nou…' }], [options]);

  const selected = value.mode === 'new' ? NEW_VALUE : value.id;
  const parentId = value.mode === 'new' ? value.parentId : newParentDefault;

  return (
    <div className="space-y-3">
      <div>
        <FieldLabel>{label}</FieldLabel>
        <ThemedSelect
          options={selectOptions}
          value={selected}
          onChange={(next) => {
            if (next === NEW_VALUE) onChange({ mode: 'new', name: value.mode === 'new' ? value.name : '', parentId });
            else onChange({ mode: 'existing', id: next });
          }}
        />
      </div>
      {value.mode === 'new' && (
        <div className="space-y-3 rounded-2xl p-3" style={{ background: theme.surface2, border: `1px solid ${theme.border}` }}>
          <div>
            <FieldLabel>Numele folderului</FieldLabel>
            <input
              type="text"
              autoFocus
              value={value.name}
              maxLength={60}
              placeholder="ex. Cardiologie, Recapitulare iarnă…"
              onChange={(event) => onChange({ ...value, name: event.target.value })}
              aria-label="Numele folderului nou"
              className="w-full text-[13.5px]"
            />
          </div>
          <div>
            <FieldLabel>Se creează în</FieldLabel>
            <ThemedSelect
              options={parentList}
              value={value.parentId}
              onChange={(next) => onChange({ ...value, parentId: next })}
              size="sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}
