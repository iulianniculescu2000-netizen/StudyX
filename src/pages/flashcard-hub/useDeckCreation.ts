import type { Folder, Quiz } from '../../types';
import { useAiRun } from './deck-creation/useAiRun';
import { useDeckTarget } from './deck-creation/useDeckTarget';
import { useGeneratedDeck } from './deck-creation/useGeneratedDeck';
import { usePdfDeckGeneration } from './deck-creation/usePdfDeckGeneration';
import { useLibraryDeckGeneration } from './deck-creation/useLibraryDeckGeneration';
import { useResumeGeneration } from './deck-creation/useResumeGeneration';
import { useDeckImport } from './deck-creation/useDeckImport';
import { useManualDeck } from './deck-creation/useManualDeck';

/** Thin composition of the deck-creation flows in ./deck-creation; the returned shape is what FlashcardHub consumes. */
export function useDeckCreation({ rezScope, quizzes, folders }: { rezScope: boolean; quizzes: Quiz[]; folders: Folder[] }) {
  const ai = useAiRun(quizzes);
  const target = useDeckTarget(folders);
  const generated = useGeneratedDeck(quizzes);
  const { generateDeckFromPdf, processPdfFile } = usePdfDeckGeneration(ai, target, generated);
  const { readyLibrarySources, generateDeckFromLibrary } = useLibraryDeckGeneration(ai, target, generated, rezScope);
  const { resumeGeneration } = useResumeGeneration(ai, generated, quizzes);
  const importer = useDeckImport(ai, target, generateDeckFromPdf);
  const { createMistakeDeck, createQuickDeck } = useManualDeck(ai, target, generated, quizzes);

  return {
    fileInputRef: importer.fileInputRef, csvInputRef: importer.csvInputRef, photoInputRef: importer.photoInputRef,
    processPdfFile, processCsvFile: importer.processCsvFile, processPhotoFiles: importer.processPhotoFiles,
    aiLoading: ai.aiLoading, aiError: ai.aiError, aiCount: ai.aiCount, setAiCount: ai.setAiCount, aiProgress: ai.aiProgress,
    csvImporting: importer.csvImporting, csvError: importer.csvError,
    photoImporting: importer.photoImporting, photoError: importer.photoError,
    libraryGenerating: ai.libraryGenerating, ankiModalOpen: importer.ankiModalOpen, setAnkiModalOpen: importer.setAnkiModalOpen,
    setCreatedDeck: generated.setCreatedDeck, setResume: generated.setResume, resuming: ai.resuming,
    createdCardRef: generated.createdCardRef, visibleCreatedDeck: generated.visibleCreatedDeck,
    targetFolderId: target.targetFolderId, handleTargetFolderChange: target.handleTargetFolderChange,
    handleCreateFolder: target.handleCreateFolder, moveCreatedDeck: generated.moveCreatedDeck,
    resumeGeneration, readyLibrarySources, generateDeckFromLibrary,
    handleCsvImport: importer.handleCsvImport, handlePhotoImport: importer.handlePhotoImport,
    handlePdfImport: importer.handlePdfImport, guardBusy: ai.guardBusy,
    createMistakeDeck, createQuickDeck,
  };
}
