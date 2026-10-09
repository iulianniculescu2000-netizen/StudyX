import { useFolderStore } from '../../../store/folderStore';
import { useAIStore } from '../../../store/aiStore';
import { useUserStore } from '../../../store/userStore';
import { suggestFolderAppearance } from '../../folderAppearance';
import { REZIDENTIAT_ROOT_NAME, findOrCreateRezidentiatLibraryRoot, findOrCreateRezidentiatQuizRoot } from '../../rezidentiatRoot';
import { friendlyAIError } from '../friendlyError';
import { profileGuard } from '../../../store/profileEpoch';
import { type Folder } from '../../../types';
import { type AgentContext, type AgentPlan, type AgentRunResult, type ExecuteCallbacks } from './types';
import { findByName, normalizeName } from './shared';
import { type StepEnv } from './steps/env';
import { runCreateFolder, runCreateLibraryFolder, runRenameFolder, runDeleteFolder } from './steps/folders';
import { runGenerateQuizPack, runCorrectAnswer, runGenerateQuizTopic, runGenerateFromMistakes, runMoveQuiz, runRenameQuiz, runDeleteQuiz } from './steps/quizzes';
import { runCreateFlashcards, runCreateFlashcardsTopic } from './steps/flashcards';
import { runSummarizeDocument, runCreateStudyPlan } from './steps/documents';

export async function executeAgentPlan(
  plan: AgentPlan,
  ctx: AgentContext,
  callbacks: ExecuteCallbacks,
): Promise<AgentRunResult> {
  const folderStore = useFolderStore.getState();
  const aiStore = useAIStore.getState();
  const activeProfileId = useUserStore.getState().activeProfileId;
  // Steps can take a while (AI calls); if the profile changes meanwhile, nothing more may be written.
  const assertSameProfile = profileGuard();

  const createdFolderByName = new Map<string, Folder>();
  const createdQuizIds: string[] = [];
  const errors: string[] = [];
  const undoOps: Array<() => void> = [];
  const summaryParts: string[] = [];

  const resolveQuizFolder = (folderName: string | undefined): Folder | null => {
    if (!folderName) return null;
    const created = createdFolderByName.get(normalizeName(folderName));
    if (created) return created;
    return findByName(useFolderStore.getState().folders, folderName);
  };

  // When the command was typed from inside the Rezidențiat-scoped chat and
  // doesn't name an explicit destination, "no folder" must mean "the
  // Rezidențiat root", not the true tree root — the latter is one level up,
  // the general/"toate folderele" screen. Memoized so a plan with several
  // steps (and repeated calls below) all land on the same folder instead of
  // each creating their own.
  let residencyRoot: Folder | null = null;
  const defaultParentFolder = (): Folder | null => {
    if (!ctx.residencyScope) return null;
    if (!residencyRoot) residencyRoot = findOrCreateRezidentiatQuizRoot();
    return residencyRoot;
  };

  // Same idea, for the separate AI library folder tree (`create_library_folder`).
  let residencyLibraryRoot: { id: string; name: string } | null = null;
  const defaultLibraryParent = (): { id: string; name: string } | null => {
    if (!ctx.residencyScope) return null;
    if (!residencyLibraryRoot) residencyLibraryRoot = { id: findOrCreateRezidentiatLibraryRoot(), name: REZIDENTIAT_ROOT_NAME };
    return residencyLibraryRoot;
  };

  /**
   * Destination folder for generated content. A named folder that doesn't exist
   * yet is created instead of silently ignored — "pune-l în Bac" must put it in
   * Bac, not drop the deck at the root because no such folder was there.
   */
  const resolveOrCreateQuizFolder = (folderName: string | undefined): Folder | null => {
    if (!folderName?.trim()) return defaultParentFolder();
    const existing = resolveQuizFolder(folderName);
    if (existing) return existing;

    const name = folderName.trim();
    const appearance = suggestFolderAppearance(name);
    const parent = defaultParentFolder();
    const id = folderStore.addFolder(name, appearance.emoji, appearance.color, parent?.id ?? null);
    const folder: Folder = {
      id,
      name,
      emoji: appearance.emoji,
      color: appearance.color,
      parentId: parent?.id ?? null,
      createdAt: Date.now(),
    };
    createdFolderByName.set(normalizeName(name), folder);
    undoOps.push(() => useFolderStore.getState().deleteFolder(id));
    summaryParts.push(`folder „${name}"`);
    return folder;
  };

  for (let index = 0; index < plan.steps.length; index += 1) {
    const step = plan.steps[index];
    callbacks.onStep(index, 'running');

    try {
      assertSameProfile();
      const env: StepEnv = {
        plan, step, index, ctx, callbacks, folderStore, aiStore, activeProfileId, assertSameProfile,
        createdFolderByName, createdQuizIds, errors, undoOps, summaryParts,
        resolveQuizFolder, defaultParentFolder, defaultLibraryParent, resolveOrCreateQuizFolder,
      };
      switch (step.action) {
        case 'create_folder':
          await runCreateFolder(env);
          break;
        case 'create_library_folder':
          await runCreateLibraryFolder(env);
          break;
        case 'rename_folder':
          await runRenameFolder(env);
          break;
        case 'delete_folder':
          await runDeleteFolder(env);
          break;
        case 'generate_quiz_pack':
          await runGenerateQuizPack(env);
          break;
        case 'correct_answer':
          await runCorrectAnswer(env);
          break;
        case 'generate_quiz_topic':
          await runGenerateQuizTopic(env);
          break;
        case 'generate_from_mistakes':
          await runGenerateFromMistakes(env);
          break;
        case 'move_quiz':
          await runMoveQuiz(env);
          break;
        case 'rename_quiz':
          await runRenameQuiz(env);
          break;
        case 'delete_quiz':
          await runDeleteQuiz(env);
          break;
        case 'create_flashcards':
          await runCreateFlashcards(env);
          break;
        case 'create_flashcards_topic':
          await runCreateFlashcardsTopic(env);
          break;
        case 'summarize_document':
          await runSummarizeDocument(env);
          break;
        case 'create_study_plan':
          await runCreateStudyPlan(env);
          break;
        default:
          callbacks.onStep(index, 'skipped');
      }
    } catch (error) {
      const message = error instanceof Error ? friendlyAIError(error) : 'Pas eșuat.';
      // Surfaced only as a short message in the confirm card otherwise — log the
      // full error (with stack) so a real crash is diagnosable, not just "X failed".
      console.error(`[Agent] step "${step.action}" failed:`, error);
      errors.push(message);
      callbacks.onStep(index, 'error', message);
    }
  }

  const summary = summaryParts.length
    ? `Gata: ${summaryParts.join(', ')}.`
    : 'Nu am putut finaliza nicio acțiune.';

  return {
    summary: errors.length ? `${summary} (${errors.length} pași cu probleme)` : summary,
    createdQuizIds,
    errors,
    undo: undoOps.length ? () => { undoOps.slice().reverse().forEach((op) => { try { op(); } catch { /* ignore */ } }); } : null,
  };
}
