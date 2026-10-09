import { useEffect, useMemo, useState } from 'react';
import { generateQuizPackagesFromSource } from '../../lib/ai/batchQuizGeneration';
import { generateQuizFromChapter, WHOLE_DOCUMENT_HEADING } from '../../lib/ai/chapterQuizGeneration';
import { useSourceChapters } from '../../hooks/useSourceChapters';
import {
  clampStudioPackCount,
  clampStudioQuestionCount,
} from '../../lib/ai/studioGeneration';
import {
  buildStudioCommandHelp,
  parseStudioChatCommand,
  resolveStudioFolderFromCommand,
  resolveStudioSourceFromCommand,
} from '../../lib/ai/studioChatCommands';
import { DEFAULT_EXAM_STYLE, type ExamStyle } from '../../lib/ai/examStyle';
import { suggestFolderAppearance } from '../../lib/folderAppearance';
import { useFolderStore } from '../../store/folderStore';
import { useQuizStore } from '../../store/quizStore';
import { useToastStore } from '../../store/toastStore';
import { useAIStore, type AIKnowledgeSource } from '../../store/aiStore';
import { friendlyAIError } from '../../lib/ai/friendlyError';
import { ensureFolderForPlacement, isResidencySource, resolveResidencyPlacement } from '../../lib/rezidentiatPlacement';
import { detectDifficultyInText } from '../../lib/ai/optionRequest';
import { frontsInFolder, generateFlashcardDeck } from '../../lib/ai/flashcardAuthor';
import { FLASHCARD_DIFFICULTY_LABEL, type FlashcardDifficulty } from '../../ai/flashcardPrompts';
import type { ChatMessage, ChatMode } from './shared';
import { formatFolderPath } from './chatHelpers';
import { profileGuard } from '../../store/profileEpoch';

export type DrawerView = 'chat' | 'studio';
export type StudioDifficulty = 'auto' | 'easy' | 'medium' | 'hard';

interface UseStudioGenerationOptions {
  readySources: AIKnowledgeSource[];
  hasKey: boolean;
  activeProfileId: string | null;
  scopedSource: { id: string; name: string } | null;
  setScopedSource: (value: { id: string; name: string } | null) => void;
  contextCacheRef: React.RefObject<Map<string, unknown[]>>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setThinkingPhase: (phase: string | null) => void;
  setView: (view: DrawerView) => void;
  generationAbortedRef: React.RefObject<boolean>;
  /** Bumped by every Stop press. A run remembers its value at start, so a stopped run can never save its result later, even if a new request reset the boolean flag in the meantime. */
  generationStopCountRef?: React.RefObject<number>;
  loadAIChatRuntime: () => Promise<{ getVaultChunksBySource: typeof import('../../ai/vectorStore').getVaultChunksBySource }>;
  /** True in the dedicated "AI · Rezidențiat" conversation, where everything generated belongs to Rezidențiat. */
  isResidencyThread?: boolean;
}

/**
 * Everything about AI Studio: the form state (source/chapter/folder/pack
 * settings), the core generator, and the two chat-driven entry points
 * (deterministic flashcard command + studio "fă-mi N grile din X" command).
 *
 * Shares a few pieces of state with the rest of the drawer by design, not by
 * accident: `scopedSource` is the same "active document" chat's own RAG lookup
 * uses, `generationAbortedRef` is the same Stop-button signal streaming chat
 * sets, and `setView`/`setMessages` are how a studio-driven generation
 * announces itself back in the chat thread. Those are passed in rather than
 * owned here.
 */
export function useStudioGeneration({
  readySources,
  hasKey,
  activeProfileId,
  scopedSource,
  setScopedSource,
  contextCacheRef,
  setMessages,
  setThinkingPhase,
  setView,
  generationAbortedRef,
  generationStopCountRef,
  isResidencyThread = false,
}: UseStudioGenerationOptions) {
  const folders = useFolderStore((state) => state.folders);
  const addFolder = useFolderStore((state) => state.addFolder);
  const quizzes = useQuizStore((state) => state.quizzes);
  const addQuiz = useQuizStore((state) => state.addQuiz);
  const addToast = useToastStore((state) => state.addToast);

  const [studioSourceId, setStudioSourceId] = useState<string>('');
  const [studioHeading, setStudioHeading] = useState<string>(WHOLE_DOCUMENT_HEADING);
  const [studioFolderId, setStudioFolderId] = useState<string>('__uncategorized__');
  const [studioPackCount, setStudioPackCount] = useState(4);
  const [studioQuestionsPerPack, setStudioQuestionsPerPack] = useState(12);
  const [studioDifficulty, setStudioDifficulty] = useState<StudioDifficulty>('auto');
  /** Rezidențiat (5 variante) vs grilă simplă de materie (4). */
  const [studioExamStyle, setStudioExamStyle] = useState<ExamStyle>(isResidencyThread ? DEFAULT_EXAM_STYLE : 'simple');
  // Each space starts from its own style: Rezidențiat questions in Rezidențiat, plain subject questions elsewhere.
  useEffect(() => {
    setStudioExamStyle(isResidencyThread ? DEFAULT_EXAM_STYLE : 'simple');
  }, [isResidencyThread]);
  const [studioGenerating, setStudioGenerating] = useState(false);
  const [generatedSummary, setGeneratedSummary] = useState<string | null>(null);

  const selectedStudioSourceId = studioSourceId || scopedSource?.id || readySources[0]?.id || '';
  const selectedStudioSource = readySources.find((source) => source.id === selectedStudioSourceId) ?? null;
  const { chapters: studioChapters } = useSourceChapters(selectedStudioSourceId || null);
  const studioChapterOptions = useMemo(() => [
    { value: WHOLE_DOCUMENT_HEADING, label: 'Tot documentul' },
    ...studioChapters
      .filter((chapter) => chapter.heading !== WHOLE_DOCUMENT_HEADING)
      .map((chapter) => ({ value: chapter.heading, label: `${chapter.label} (${chapter.chunkCount})` })),
  ], [studioChapters]);
  const selectedStudioFolder = studioFolderId === '__uncategorized__'
    ? null
    : folders.find((folder) => folder.id === studioFolderId) ?? null;
  const studioSourceOptions = useMemo(
    () => readySources.map((source) => ({
      value: source.id,
      label: source.name,
      hint: `${source.chunkCount ?? 0} fragmente indexate`,
    })),
    [readySources],
  );
  const studioFolderOptions = useMemo(
    () => [
      {
        value: '__uncategorized__',
        label: 'Neclasificate',
        hint: 'Grilele rămân fără folder dedicat.',
      },
      ...folders.map((folder) => ({
        value: folder.id,
        label: `${folder.emoji} ${formatFolderPath(folders, folder)}`,
        hint: 'Salvează pachetele direct în acest folder.',
      })),
    ],
    [folders],
  );

  useEffect(() => {
    if (!selectedStudioSourceId && readySources[0]) {
      setStudioSourceId(readySources[0].id);
    }
  }, [readySources, selectedStudioSourceId]);

  const runStudioGeneration = async ({
    source,
    folder: requestedFolder,
    packCount,
    questionsPerPack,
    difficulty,
    heading = WHOLE_DOCUMENT_HEADING,
    announceInChat = true,
    forceChatView = true,
    announceMode = 'summarize',
  }: {
    source: NonNullable<typeof selectedStudioSource>;
    folder: typeof selectedStudioFolder;
    packCount: number;
    questionsPerPack: number;
    difficulty: StudioDifficulty;
    heading?: string;
    announceInChat?: boolean;
    forceChatView?: boolean;
    announceMode?: ChatMode;
  }) => {
    generationAbortedRef.current = false;
    const assertSameProfile = profileGuard();
    const stopsAtStart = generationStopCountRef?.current ?? 0;
    const wasStopped = () => generationAbortedRef.current || (generationStopCountRef?.current ?? 0) !== stopsAtStart;
    const isChapterScoped = heading !== WHOLE_DOCUMENT_HEADING;

    // Anything generated for the Rezidențiat section is filed into its
    // discipline → specialty folder, so it shows up on the Rezidențiat pages.
    // The placement is only decided here; the folders are created after the
    // generation succeeds, so a failed or stopped run leaves no empty folders.
    const forResidency = isResidencyThread
      || isResidencySource(source, useAIStore.getState().libraryFolders);
    const residencyPlacement = forResidency
      ? resolveResidencyPlacement(source.name, isChapterScoped ? heading : null, useFolderStore.getState().folders)
      : null;
    const existingSpecialty = residencyPlacement?.specialtyId
      ? useFolderStore.getState().folders.find((entry) => entry.id === residencyPlacement.specialtyId) ?? null
      : null;
    const folder = forResidency ? existingSpecialty : requestedFolder;

    setStudioGenerating(true);
    setGeneratedSummary(null);
    setStudioSourceId(source.id);
    setScopedSource({ id: source.id, name: source.name });
    // The Studio's folder picker keeps the user's own choice: an automatic Rezidențiat
    // destination must not become the "sticky" target of the next, unrelated command.
    setStudioFolderId(requestedFolder?.id ?? '__uncategorized__');
    setStudioPackCount(packCount);
    setStudioQuestionsPerPack(questionsPerPack);
    setStudioDifficulty(difficulty);

    try {
      const result = isChapterScoped
        ? await (async () => {
            const chapterResult = await generateQuizFromChapter({
              sourceId: source.id,
              sourceName: source.name,
              heading,
              folder,
              folderId: folder?.id ?? null,
              questionCount: questionsPerPack,
              difficulty,
              examStyle: studioExamStyle,
              activeProfileId,
              existingQuizzes: quizzes,
            });
            return { ...chapterResult, quizzes: [chapterResult.quiz] };
          })()
        : await generateQuizPackagesFromSource({
            sourceId: source.id,
            sourceName: source.name,
            folder,
            folderId: folder?.id ?? null,
            packCount,
            questionsPerPack,
            difficulty,
            examStyle: studioExamStyle,
            activeProfileId,
            existingQuizzes: quizzes,
          });

      if (wasStopped()) return false; // user pressed Stop — discard
      assertSameProfile();

      const targetFolder = residencyPlacement ? ensureFolderForPlacement(residencyPlacement) : folder;
      result.quizzes.forEach((quiz) => addQuiz(
        residencyPlacement && targetFolder
          ? { ...quiz, folderId: targetFolder.id, category: targetFolder.name, tags: [...new Set([...(quiz.tags ?? []), 'rezidentiat'])] }
          : quiz,
      ));

      const folderLabel = targetFolder ? formatFolderPath(useFolderStore.getState().folders, targetFolder) : 'Neclasificate';
      const sourceLabel = isChapterScoped ? `${source.name} · ${heading}` : source.name;
      const summary = result.fallbackQuestionCount > 0
        ? `Am generat ${result.quizzes.length} pachete din "${sourceLabel}" și le-am trimis în folderul "${folderLabel}". ${result.aiQuestionCount} întrebări au venit din AI, iar ${result.fallbackQuestionCount} au fost completate inteligent din document pentru stabilitate. Dificultate folosită: ${result.difficulty}.`
        : `Am generat ${result.quizzes.length} pachete din "${sourceLabel}" și le-am trimis în folderul "${folderLabel}". Dificultate folosită: ${result.difficulty}.`;
      const fullSummary = result.warnings.length > 0
        ? `${summary}\n\nNotă: ${friendlyAIError(result.warnings[0])}`
        : summary;

      setGeneratedSummary(fullSummary);
      if (announceInChat) {
        setMessages((prev) => [...prev, { role: 'assistant', content: fullSummary, mode: announceMode }]);
      }
      addToast(
        result.fallbackQuestionCount > 0
          ? `${result.quizzes.length} pachete generate. Am completat inteligent și local ce nu a livrat AI-ul.`
          : `${result.quizzes.length} pachete generate cu succes.`,
        'success',
      );
      if (forceChatView) {
        setView('chat');
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Generarea pachetelor a eșuat.';
      addToast(message, 'error');
      if (announceInChat) {
        setMessages((prev) => [...prev, { role: 'assistant', content: friendlyAIError(message), isError: true, mode: announceMode }]);
      }
      return false;
    } finally {
      setStudioGenerating(false);
    }
  };

  const tryHandleStudioCommand = async (text: string, activeMode: ChatMode) => {
    const parsed = parseStudioChatCommand(text);
    if (!parsed.shouldGenerate) return false;

    setView('studio');

    if (readySources.length === 0) {
      const message = `Nu ai încă documente indexate în Biblioteca AI, deci nu am din ce să generez grile.\n\nÎncarcă un curs în Bibliotecă și apoi poți scrie direct aici comanda.\n\n${buildStudioCommandHelp([], folders)}`;
      setMessages((prev) => [...prev, { role: 'assistant', content: message, mode: activeMode }]);
      addToast('Încarcă mai întâi un curs în Biblioteca AI.', 'warning');
      return true;
    }

    const scopedReadySource = scopedSource
      ? readySources.find((entry) => entry.id === scopedSource.id) ?? null
      : null;
    const source = resolveStudioSourceFromCommand(text, readySources, scopedReadySource);
    if (!source) {
      const sourceList = readySources.slice(0, 6).map((entry) => `- ${entry.name}`).join('\n');
      const message = `Am înțeles că vrei să generez pachete de grile, dar nu e clar din ce document.\n\nSpune-mi explicit cursul sau documentul dorit. Exemple disponibile acum:\n${sourceList}\n\n${buildStudioCommandHelp(readySources, folders)}`;
      setMessages((prev) => [...prev, { role: 'assistant', content: message, mode: activeMode }]);
      addToast('Spune-mi și documentul din care vrei să generez.', 'warning');
      return true;
    }

    const folderResolution = resolveStudioFolderFromCommand(text, folders, selectedStudioFolder);
    let targetFolder = selectedStudioFolder;
    // Rezidențiat sets are filed by runStudioGeneration into Grile › specialty and the requested folder is
    // ignored, so creating it here would only leave an empty folder behind.
    const folderIsIgnored = isResidencyThread || isResidencySource(source, useAIStore.getState().libraryFolders);

    if (folderResolution.kind === 'existing') {
      targetFolder = folderResolution.folder;
    } else if (folderResolution.kind === 'create' && folderIsIgnored) {
      targetFolder = selectedStudioFolder;
    } else if (folderResolution.kind === 'create') {
      const appearance = suggestFolderAppearance(folderResolution.name);
      const id = addFolder(folderResolution.name, appearance.emoji, appearance.color);
      targetFolder = {
        id,
        name: folderResolution.name,
        emoji: appearance.emoji,
        color: appearance.color,
        createdAt: Date.now(),
      };
      addToast(`Am creat folderul ${appearance.emoji} "${folderResolution.name}".`, 'success');
    } else {
      targetFolder = null;
    }

    const nextPackCount = clampStudioPackCount(parsed.packCount ?? studioPackCount);
    const nextQuestionCount = clampStudioQuestionCount(parsed.questionsPerPack ?? studioQuestionsPerPack);
    const nextDifficulty = parsed.difficulty ?? studioDifficulty;

    await runStudioGeneration({
      source,
      folder: targetFolder,
      packCount: nextPackCount,
      questionsPerPack: nextQuestionCount,
      difficulty: nextDifficulty,
      announceInChat: true,
      forceChatView: true,
      announceMode: activeMode,
    });

    return true;
  };

  // Deterministic flashcard generator for the chat — mirrors the grile studio
  // command but builds a flashcard deck. Runs WITHOUT the LLM planner, so
  // "fă-mi 3 flashcarduri din X" works even when the planner is rate-limited.
  const tryHandleFlashcardCommand = async (text: string, activeMode: ChatMode): Promise<boolean> => {
    const assertSameProfile = profileGuard();
    // Lookarounds instead of \b: a word boundary does not exist next to ă/ș/ț, so
    // "Generează 20 flashcarduri" and "Fă 20 flashcarduri" never matched.
    const plainText = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const wantsFlashcards = /(?<![a-z])(flash\s?carduri|flash\s?card|fise|carduri)(?![a-z])/i.test(plainText);
    const wantsGeneration = /(?<![a-z])(fa|fa[- ]?mi|da[- ]?mi|genereaza|creeaza|creaza|vreau|pregateste|construieste|adauga)(?![a-z])/i.test(plainText);
    if (!wantsFlashcards || !wantsGeneration) return false;

    if (!hasKey) {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Pentru flashcarduri AI ai nevoie de o cheie în Setări AI.', mode: activeMode }]);
      addToast('Adaugă o cheie AI în Setări.', 'warning');
      return true;
    }
    // No library at all — don't dead-end here. The planner-driven agent path
    // (create_flashcards_topic) can still build a deck from general medical
    // knowledge; this deterministic handler existing at all used to mean a
    // flat "no course" refusal even for "fă-mi flashcarduri despre acnee" with
    // an empty library, when what the user wanted just needed no library.
    if (readySources.length === 0) return false;

    const scopedReadySource = scopedSource
      ? readySources.find((entry) => entry.id === scopedSource.id) ?? null
      : null;
    const source = resolveStudioSourceFromCommand(text, readySources, scopedReadySource);
    if (!source) {
      const sourceList = readySources.slice(0, 6).map((entry) => `- ${entry.name}`).join('\n');
      setMessages((prev) => [...prev, { role: 'assistant', content: `Din ce curs vrei flashcardurile? Exemple disponibile:\n${sourceList}`, mode: activeMode }]);
      addToast('Spune-mi din ce curs să fac flashcardurile.', 'warning');
      return true;
    }

    const folderResolution = resolveStudioFolderFromCommand(text, folders, selectedStudioFolder);
    let targetFolder = selectedStudioFolder;
    if (folderResolution.kind === 'existing') {
      targetFolder = folderResolution.folder;
    } else if (folderResolution.kind === 'create') {
      const appearance = suggestFolderAppearance(folderResolution.name);
      const id = addFolder(folderResolution.name, appearance.emoji, appearance.color);
      targetFolder = { id, name: folderResolution.name, emoji: appearance.emoji, color: appearance.color, createdAt: Date.now() };
      addToast(`Am creat folderul ${appearance.emoji} "${folderResolution.name}".`, 'success');
    } else {
      targetFolder = null;
    }

    const countMatch = text
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .match(/(\d+)\s*(?:de\s+)?(?:flash\s?carduri|flash\s?card|carduri|fise|card)(?![a-z])/i);
    const count = Math.max(1, Math.min(60, countMatch ? Number(countMatch[1]) : 15));

    // „din cursul X” e o cerere din document: detectStudyRequest se abține acolo, dar nivelul se citește la fel.
    const difficulty: FlashcardDifficulty = detectDifficultyInText(text) ?? 'auto';
    const forResidency = isResidencyThread || isResidencySource(source, useAIStore.getState().libraryFolders);

    setThinkingPhase(`Generez ${count} flashcarduri din „${source.name}"…`);
    try {
      const flashStopsAtStart = generationStopCountRef?.current ?? 0;
      const result = await generateFlashcardDeck({
        scope: { kind: 'source', sourceId: source.id, sourceName: source.name },
        count,
        difficulty,
        folderId: targetFolder?.id ?? null,
        space: forResidency ? 'rezidentiat' : 'general',
        title: `Flashcarduri · ${source.name.replace(/\.[^.]+$/, '')}`,
        avoidFronts: [
          ...frontsInFolder(targetFolder?.id ?? null),
          ...quizzes
            .filter((quiz) => (quiz.tags ?? []).some((tag) => /flashcard|deck|anki/i.test(tag)))
            .flatMap((quiz) => quiz.questions.map((question) => question.text)),
        ],
      });
      if (generationAbortedRef.current || (generationStopCountRef?.current ?? 0) !== flashStopsAtStart) return true; // user pressed Stop — drop the result
      assertSameProfile();

      const deck = {
        ...result.deck,
        color: targetFolder?.color ?? result.deck.color,
        category: targetFolder?.name ?? 'AI Flashcards',
        tags: [...result.deck.tags ?? [], 'chat'],
        description: `${result.deck.questions.length} flashcarduri AI generate din „${source.name}"${difficulty === 'auto' ? '' : `, nivel ${FLASHCARD_DIFFICULTY_LABEL[difficulty].toLowerCase()}`}.`,
      };
      addQuiz(deck);

      const folderNote = targetFolder ? ` în folderul „${targetFolder.name}"` : '';
      const levelNote = difficulty === 'auto' ? '' : ` (nivel ${FLASHCARD_DIFFICULTY_LABEL[difficulty].toLowerCase()})`;
      const warningNote = result.warnings.length > 0 ? `

Notă: ${result.warnings[0]}` : '';
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `Am creat **${deck.questions.length} flashcarduri**${levelNote} din „${source.name}"${folderNote}. Apasă pentru a începe sesiunea.${warningNote}`,
        mode: activeMode,
        openRoute: { route: `/flashcards/session/${deck.id}?mode=all`, label: 'Începe flashcardurile' },
      }]);
      addToast(`${deck.questions.length} flashcarduri generate.`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Generarea flashcardurilor a eșuat.';
      setMessages((prev) => [...prev, { role: 'assistant', content: friendlyAIError(message), isError: true, mode: activeMode }]);
      addToast(message, 'error');
    }
    return true;
  };

  const handleGeneratePackages = async () => {
    if (!selectedStudioSource) {
      addToast('Alege mai întâi un document din bibliotecă.', 'warning');
      return;
    }

    await runStudioGeneration({
      source: selectedStudioSource,
      folder: selectedStudioFolder,
      packCount: studioPackCount,
      questionsPerPack: studioQuestionsPerPack,
      difficulty: studioDifficulty,
      heading: studioHeading,
      announceInChat: true,
      forceChatView: true,
    });
  };

  return {
    studioSourceId, setStudioSourceId,
    studioHeading, setStudioHeading,
    studioFolderId, setStudioFolderId,
    studioPackCount, setStudioPackCount,
    studioQuestionsPerPack, setStudioQuestionsPerPack,
    studioDifficulty, setStudioDifficulty,
    studioExamStyle, setStudioExamStyle,
    studioGenerating, setStudioGenerating,
    generatedSummary,
    selectedStudioSourceId,
    selectedStudioSource,
    selectedStudioFolder,
    studioChapterOptions,
    studioSourceOptions,
    studioFolderOptions,
    contextCacheRef,
    runStudioGeneration,
    tryHandleStudioCommand,
    tryHandleFlashcardCommand,
    handleGeneratePackages,
  };
}
