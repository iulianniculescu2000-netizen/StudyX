/**
 * Un singur drum pentru „fă-mi flashcarduri / grile despre X, la nivelul Y, în folderul Z”, indiferent de unde vine cererea
 * (cartea de opțiuni din chat sau dialogurile din Rezidențiat). Alege folderul (creând unul nou doar dacă generarea reușește),
 * rulează pasul prin motorul agentului, așa că regulile de folder și de Rezidențiat sunt aceleași peste tot.
 */
import type { FlashcardDifficulty } from '../../ai/flashcardPrompts';
import { useFolderStore } from '../../store/folderStore';
import { useQuizStore } from '../../store/quizStore';
import type { FolderChoice } from '../rezidentiatFlashcardFolders';
import { executeAgentPlan, type AgentPlan, type AgentStep } from './agent';
import { friendlyAIError } from './friendlyError';
import type { SourceScope } from './sourceScope';
import { describeDestination, resolveDestination, type StudyKind } from './studyDestinations';

export interface StudyMaterialRequest {
  kind: StudyKind;
  space: SourceScope;
  topic: string;
  count: number;
  difficulty: FlashcardDifficulty;
  questionType: 'single' | 'multiple';
  folder: FolderChoice;
}

export interface StudyMaterialResult {
  kind: StudyKind;
  produced: number;
  requested: number;
  destination: string;
  /** Fals când flashcardurile nu au pornit din text de carte. */
  grounded: boolean | undefined;
  quizIds: string[];
  route: { route: string; label: string };
}

export function stepForRequest(request: StudyMaterialRequest, folderId: string | null): AgentStep {
  const topic = request.topic.trim();
  if (request.kind === 'flashcards') {
    return { action: 'create_flashcards_topic', topic, count: request.count, difficulty: request.difficulty, ...(folderId ? { folderId } : {}) };
  }
  return {
    action: 'generate_quiz_topic',
    topic,
    questionsPerPack: request.count,
    difficulty: request.difficulty,
    questionType: request.questionType,
    examStyle: request.space === 'rezidentiat' ? 'residency' : 'simple',
    ...(folderId ? { folderId } : {}),
  };
}

/** Generează și salvează. Aruncă o eroare cu motivul în clar când nu iese nimic (și curăță folderul creat pentru cerere). */
export async function generateStudyMaterial(request: StudyMaterialRequest): Promise<StudyMaterialResult> {
  const known = new Set(useFolderStore.getState().folders.map((folder) => folder.id));
  let folderId: string | null = null;
  let createdFolder = false;
  try {
    folderId = resolveDestination(request.kind, request.space, request.folder);
    createdFolder = !!folderId && !known.has(folderId);

    const plan: AgentPlan = { isCommand: true, reply: '', steps: [stepForRequest(request, folderId)], needsConfirm: false };
    const result = await executeAgentPlan(
      plan,
      { defaultPackCount: 1, defaultQuestionsPerPack: request.count, residencyScope: request.space === 'rezidentiat' },
      { onStep: () => undefined },
    );

    const created = useQuizStore.getState().quizzes.filter((quiz) => result.createdQuizIds.includes(quiz.id));
    if (created.length === 0) throw new Error(result.errors[0] ?? 'nu am putut genera nimic');

    const first = created[0];
    return {
      kind: request.kind,
      produced: created.reduce((sum, quiz) => sum + quiz.questions.length, 0),
      requested: request.count,
      destination: describeDestination(request.kind, request.space, request.folder, useFolderStore.getState().folders),
      grounded: request.kind === 'flashcards' ? !first.tags?.includes('ai-knowledge') : undefined,
      quizIds: created.map((quiz) => quiz.id),
      route: request.kind === 'flashcards'
        ? { route: `/flashcards/session/${first.id}?mode=all`, label: 'Începe sesiunea' }
        : { route: `/play/${first.id}`, label: 'Rezolvă acum' },
    };
  } catch (error) {
    // Un folder creat doar pentru cererea asta nu rămâne gol dacă n-a ieșit nimic.
    if (createdFolder && folderId && !useQuizStore.getState().quizzes.some((quiz) => quiz.folderId === folderId)) {
      useFolderStore.getState().deleteFolder(folderId);
    }
    throw new Error(friendlyAIError(error) || (error instanceof Error ? error.message : 'generarea a eșuat'));
  }
}
