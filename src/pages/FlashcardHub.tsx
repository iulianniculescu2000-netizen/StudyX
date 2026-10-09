import { useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useQuizStore } from '../store/quizStore';
import { useStatsStore } from '../store/statsStore';
import { useFolderStore } from '../store/folderStore';
import { useAIStore } from '../store/aiStore';
import TourHelpButton from '../tutorial/TourHelpButton';
import PageHeader from '../components/ui/PageHeader';
import { isFlashcardDeck } from '../lib/deckKind';
import {
  FlashcardHubActions,
  GeneratedDeckCard,
  ReviewHeroCard,
} from './flashcard-hub/sections';
import { FlashcardDeckTree } from './flashcard-hub/DeckTree';
import RezidentiatFlashcardActions from '../components/residency/RezidentiatFlashcardActions';
import { AnkiImportModal } from './flashcard-hub/AnkiImportModal';
import { ChapterBooks, ChapterSplitCard } from './flashcard-hub/chapters';
import SegmentedTabs from '../components/fx/SegmentedTabs';
import { flashcardPickerFolders } from '../lib/flashcardTreeView';
import { buildResidencyContext, classifyResidencyDeck } from '../lib/flashcardGroups';
import { HubFileInputs } from './flashcard-hub/HubFileInputs';
import { useDeckCreation } from './flashcard-hub/useDeckCreation';
import { useChapterView } from './flashcard-hub/useChapterView';
import { buildDeckSummaries, computeActiveStreak } from './flashcard-hub/deckSummaries';

/** `rezidentiat`: doar pachetele de Rezidențiat (capitole, Kumar etc.), în secțiunea Rezidențiat; `general`: tot restul. */
export default function FlashcardHub({ scope = 'general' }: { scope?: 'general' | 'rezidentiat' } = {}) {
  const rezScope = scope === 'rezidentiat';
  const theme = useTheme();
  const navigate = useNavigate();
  const allQuizzes = useQuizStore((s) => s.quizzes);
  const folders = useFolderStore((state) => state.folders);
  // Pachetele de Rezidențiat trăiesc doar în secțiunea Rezidențiat; hub-ul general nu le amestecă cu restul.
  const residencyContext = useMemo(() => buildResidencyContext(folders), [folders]);
  const quizzes = useMemo(
    () => allQuizzes.filter((quiz) => !isFlashcardDeck(quiz) || (classifyResidencyDeck(quiz, residencyContext) !== null) === rezScope),
    [allQuizzes, residencyContext, rezScope],
  );
  // În „Salvează în” / „Mută în…” apar doar folderele Flashcardurilor, nu cele de grile.
  const pickerFolders = useMemo(
    () => flashcardPickerFolders(folders, quizzes, buildResidencyContext(folders).folderIds),
    [folders, quizzes],
  );
  const questionStats = useStatsStore((s) => s.questionStats);
  const streak = useStatsStore((state) => state.streak);
  const hasKey = useAIStore((s) => s.hasKey);
  const createSectionRef = useRef<HTMLDivElement>(null);

  const creation = useDeckCreation({ rezScope, quizzes, folders });
  const {
    fileInputRef, csvInputRef, photoInputRef, processPdfFile, processCsvFile, processPhotoFiles,
    aiLoading, aiError, aiCount, setAiCount, aiProgress, csvImporting, csvError, photoImporting, photoError,
    libraryGenerating, ankiModalOpen, setAnkiModalOpen, setCreatedDeck, setResume, resuming, createdCardRef,
    visibleCreatedDeck, targetFolderId, handleTargetFolderChange, handleCreateFolder, moveCreatedDeck,
    resumeGeneration, readyLibrarySources, generateDeckFromLibrary, handleCsvImport, handlePhotoImport,
    handlePdfImport, guardBusy, createMistakeDeck, createQuickDeck,
  } = creation;

  const decks = useMemo(() => buildDeckSummaries(quizzes, questionStats), [quizzes, questionStats]);
  const chapterView = useChapterView(quizzes, questionStats);
  const {
    query, setQuery, chapterSections, splitPlan, splitting, splitDeck, dismissSplit,
    hasChapters, view, setView, setBook, activeBook, chapterFilter,
  } = chapterView;

  const totalCards = decks.reduce((sum, deck) => sum + deck.total, 0);
  const totalMastered = decks.reduce((sum, deck) => sum + deck.mastered, 0);
  // Summed from the flashcard decks above, not from the store's app-wide due
  // list — that counted every due multiple-choice question too, so the hub
  // advertised far more "carduri restante" than it actually had cards.
  const totalDue = decks.reduce((sum, deck) => sum + deck.due, 0);

  // What the "Începe repetarea" button actually serves: the session for "all"
  // takes every due card plus every card that was never studied.
  const totalFresh = totalCards - decks.reduce((sum, deck) => sum + deck.seen, 0);

  const activeStreak = useMemo(
    () => computeActiveStreak(streak),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [streak.currentStreak, streak.lastStudyDate],
  );

  return (
    <div data-tutorial="flashcard-hub" className="h-full overflow-y-auto px-4 py-6 sm:px-8 sm:py-10">
      <HubFileInputs
        fileInputRef={fileInputRef}
        csvInputRef={csvInputRef}
        photoInputRef={photoInputRef}
        onPdfFile={processPdfFile}
        onCsvFile={processCsvFile}
        onPhotoFiles={processPhotoFiles}
      />

      <div className="mx-auto max-w-4xl space-y-7">
        {/* ── Header (compact, Residency-style) ── */}
        <PageHeader
          title={rezScope ? 'Flashcarduri Rezidențiat' : 'Flashcarduri'}
          back={rezScope ? { to: '/rezidentiat', label: 'Rezidențiat' } : undefined}
          subtitle={decks.length > 0
            ? `${decks.length} ${decks.length === 1 ? 'pachet' : 'pachete'} · ${totalCards} carduri · SM-2`
            : rezScope ? 'Pachetele pe capitole apar aici, din Carduri Kumar sau din cărțile tale.' : 'Repetare spațiată și carduri inteligente.'}
          actions={(
            <>
              <TourHelpButton tour={rezScope ? 'residencyFlashcards' : 'flashcards'} label={rezScope ? 'Vezi turul Flashcardurilor din Rezidențiat' : 'Vezi turul paginii Flashcarduri'} />
              {!rezScope && <button
                type="button"
                onClick={() => createSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                aria-label="Creează pachet nou"
                title="Creează pachet nou"
                className="fine-row press-feedback flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
                style={{ background: theme.surface2, color: theme.text2 }}
              >
                <Plus size={18} />
              </button>}
              {rezScope && <RezidentiatFlashcardActions />}
            </>
          )}
        />

        {/* ── Pachet generat: unde a ajuns + mută ── */}
        {visibleCreatedDeck && (
          <div ref={createdCardRef} className="scroll-mt-6">
            <GeneratedDeckCard
              info={visibleCreatedDeck}
              folders={pickerFolders}
              theme={theme}
              resuming={resuming}
              progress={aiProgress}
              onMove={moveCreatedDeck}
              onCreateFolder={handleCreateFolder}
              onStart={() => navigate(`/flashcards/session/${visibleCreatedDeck.id}?mode=all`)}
              onResume={() => void resumeGeneration()}
              onDismiss={() => {
                setResume(null);
                setCreatedDeck(null);
              }}
            />
          </div>
        )}

        {/* ── De repetat azi ── */}
        <div data-tutorial="flashcards-due" className="empty:hidden">
        <ReviewHeroCard
          totalDue={totalDue}
          totalFresh={totalFresh}
          totalCards={totalCards}
          totalMastered={totalMastered}
          streak={activeStreak}
          theme={theme}
        />
        </div>

        {splitPlan && (
          <ChapterSplitCard
            plan={splitPlan}
            theme={theme}
            busy={splitting}
            onSplit={splitDeck}
            onDismiss={() => dismissSplit(splitPlan.sourceId)}
          />
        )}

        {hasChapters && (
          <SegmentedTabs
            layoutId="flashcard-hub-view"
            ariaLabel="Cum vezi pachetele"
            value={view}
            onChange={setView}
            tabs={[
              { id: 'capitole', label: 'Pe capitole' },
              { id: 'pachete', label: 'Toate pachetele' },
            ]}
          />
        )}

        {view === 'capitole' && (
          <div data-tutorial="flashcards-decks">
          <ChapterBooks
            sections={chapterSections}
            book={activeBook}
            chapterIndex={chapterFilter}
            theme={theme}
            onBookChange={setBook}
          />
          </div>
        )}

        {/* ── Pachetele tale ── */}
        {view === 'pachete' && (
        <div data-tutorial="flashcards-decks" className="empty:hidden">
          <FlashcardDeckTree decks={decks} folders={folders} theme={theme} query={query} onQueryChange={setQuery} residency={rezScope} />
        </div>
        )}

        {/* ── Creează pachet nou (doar în hub-ul general; Rezidențiat își face pachetele din capitole) ── */}
        {!rezScope && <div ref={createSectionRef} data-tutorial="flashcards-create" className="scroll-mt-6">
          <FlashcardHubActions
            aiCount={aiCount}
            aiError={aiError}
            aiLoading={aiLoading || resuming}
            aiProgress={aiProgress}
            csvError={csvError}
            csvImporting={csvImporting}
            folders={pickerFolders}
            hasAI={hasKey}
            photoError={photoError}
            photoImporting={photoImporting}
            theme={theme}
            targetFolderId={targetFolderId}
            librarySources={readyLibrarySources.map((source) => ({ id: source.id, name: source.name }))}
            libraryGenerating={libraryGenerating || aiLoading || resuming}
            onAiCountChange={setAiCount}
            onCreateFolder={handleCreateFolder}
            onCsvImport={handleCsvImport}
            onAnkiImport={() => { if (!guardBusy()) setAnkiModalOpen(true); }}
            onLibraryGenerate={generateDeckFromLibrary}
            onMistakeDeckCreate={createMistakeDeck}
            onPhotoImport={handlePhotoImport}
            onPdfImport={handlePdfImport}
            onQuickDeckCreate={createQuickDeck}
            onTargetFolderChange={handleTargetFolderChange}
          />
        </div>}
      </div>

      {ankiModalOpen && (
        <AnkiImportModal
          folders={pickerFolders}
          theme={theme}
          onClose={() => setAnkiModalOpen(false)}
          onImported={(firstQuizId) => {
            setAnkiModalOpen(false);
            if (firstQuizId) navigate(`/flashcards/session/${firstQuizId}?mode=all`);
          }}
        />
      )}
    </div>
  );
}
