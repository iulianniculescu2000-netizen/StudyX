import type { Folder, Quiz } from '../../types';
import type { Theme } from '../../theme/themes';

export interface FlashcardDeckSummary {
  accentColor: string;
  due: number;
  masteryPct: number;
  mastered: number;
  quiz: Quiz;
  seen: number;
  total: number;
}

export interface GeneratedDeckInfo {
  id: string;
  title: string;
  count: number;
  folderId: string | null;
  /** True when the folder was picked from the course name rather than by the user. */
  suggested: boolean;
  /** Set when the AI stopped before reaching the requested count; the deck keeps what was made. */
  interrupted?: {
    requested: number;
    reason: string;
    /** Seconds the provider asked to wait, when it said so. */
    waitSeconds: number | null;
    /** Distinguishes one interruption from the next, so the countdown restarts. */
    at: number;
  };
}

export interface FlashcardHubActionsProps {
  aiCount: number;
  aiError: string;
  aiLoading: boolean;
  aiProgress: string;
  csvError: string;
  csvImporting: boolean;
  hasAI: boolean;
  folders: Folder[];
  photoError: string;
  photoImporting: boolean;
  theme: Theme;
  targetFolderId: string;
  librarySources: Array<{ id: string; name: string }>;
  libraryGenerating: boolean;
  onAiCountChange: (count: number) => void;
  onAnkiImport: () => void;
  onCreateFolder: (name: string, parentId: string | null) => string;
  onCsvImport: () => void;
  onLibraryGenerate: (sourceId: string) => void;
  onMistakeDeckCreate: () => void;
  onPhotoImport: () => void;
  onPdfImport: () => void;
  onTargetFolderChange: (folderId: string) => void;
}
