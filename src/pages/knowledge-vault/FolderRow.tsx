import { Link } from 'react-router-dom';
import { ChevronRight, Trash2 } from 'lucide-react';
import type { AILibraryFolder } from '../../store/aiStore';
import { useTheme } from '../../theme/ThemeContext';
import { isRezidentiatRootFolder } from '../../lib/rezidentiatRoot';

interface FolderRowProps {
  folder: AILibraryFolder;
  index: number;
  docCount: number;
  subCount: number;
  fragments: number;
  onOpen: () => void;
  onDelete: () => void;
}

export default function FolderRow({ folder, index, docCount, subCount, fragments, onOpen, onDelete }: FolderRowProps) {
  const theme = useTheme();
  const isEmpty = docCount === 0 && subCount === 0;
  const isRezidentiat = isRezidentiatRootFolder(folder);
  return (
    <div
      className="group flex items-center transition-colors duration-[var(--dur-base)] hover:bg-[var(--hover-fill)]"
      style={{ borderTop: index === 0 ? undefined : '1px solid var(--hairline)' }}
    >
      <button
        type="button"
        onClick={onOpen}
        className="fine-row flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left hover:!bg-transparent"
        style={{ borderRadius: 0 }}
      >
        <div
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--r-sm)] text-lg"
          style={{ background: isEmpty ? 'var(--fill-subtle)' : `${theme.accent}18`, opacity: isEmpty ? 0.7 : 1 }}
        >
          {folder.emoji ?? '📚'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold" style={{ color: isEmpty ? theme.text2 : theme.text }}>{folder.name}</div>
          <div className="truncate text-[12px]" style={{ color: theme.text3 }}>
            {isEmpty
              ? 'Gol'
              : `${docCount} ${docCount === 1 ? 'document' : 'documente'}${fragments > 0 ? ` · ${fragments.toLocaleString('ro-RO')} fragmente` : ''}${subCount > 0 ? ` · ${subCount} ${subCount === 1 ? 'subfolder' : 'subfoldere'}` : ''}`}
          </div>
        </div>
      </button>
      <div className="flex flex-shrink-0 items-center gap-1 pr-3">
        {isRezidentiat && !isEmpty && (
          <Link
            to="/rezidentiat"
            className="press-feedback hidden whitespace-nowrap px-2 text-[12.5px] font-semibold sm:block"
            style={{ color: theme.accentText }}
          >
            Deschide în Rezidențiat
          </Link>
        )}
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Șterge folderul ${folder.name}`}
          title="Șterge folderul"
          className="fine-row flex h-7 w-7 items-center justify-center rounded-full opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
          style={{ color: theme.danger }}
        >
          <Trash2 size={13} />
        </button>
        <ChevronRight size={16} style={{ color: theme.text3 }} aria-hidden="true" />
      </div>
    </div>
  );
}
