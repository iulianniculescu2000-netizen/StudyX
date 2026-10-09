import { notesToFlashcards } from '../../../groq';
import { useQuizStore } from '../../../../store/quizStore';
import { useFolderStore } from '../../../../store/folderStore';
import { isUnderRezidentiatRoot } from '../../../rezidentiatRoot';
import { ensureFlashcardsRoot } from '../../../rezidentiatFlashcardFolders';
import { frontsInFolder, generateFlashcardDeck } from '../../flashcardAuthor';
import { scopedReadySources } from '../../sourceScope';
import { type Quiz } from '../../../../types';
import { buildAgentFlashcard, findByName, loadSourceText, shortId } from '../shared';
import { type StepEnv } from './env';

export async function runCreateFlashcards(env: StepEnv): Promise<void> {
  const { step, index, ctx, callbacks, assertSameProfile, createdQuizIds, undoOps, summaryParts, resolveOrCreateQuizFolder } = env;
    const source = findByName(
      scopedReadySources(ctx.residencyScope ? 'rezidentiat' : 'general'),
      step.source,
    );
    if (!source) throw new Error(`Nu am găsit cursul „${step.source ?? '?'}" în bibliotecă.`);
    const text = await loadSourceText(source.id);
    if (text.trim().length < 100) throw new Error(`Cursul „${source.name}" nu are destul text indexat pentru flashcarduri.`);

    const count = Math.max(1, Math.min(100, step.count ?? 15));
    const cards = await notesToFlashcards(text, { count, sourceName: source.name });
    if (cards.length === 0) throw new Error(`Nu am putut genera flashcarduri din „${source.name}".`);

    const folder = resolveOrCreateQuizFolder(step.folder);
    const deck: Quiz = {
      id: shortId(),
      title: `Flashcarduri · ${source.name}`,
      description: `Deck de ${cards.length} flashcarduri generate din „${source.name}".`,
      emoji: '🃏',
      color: folder?.color ?? 'purple',
      category: folder?.name ?? 'AI Flashcards',
      kind: 'flashcard',
      folderId: folder?.id ?? null,
      shuffleQuestions: true,
      shuffleAnswers: false,
      tags: ['flashcard', 'ai'],
      questions: cards.map((card) => buildAgentFlashcard(card.front, card.back)),
      createdAt: Date.now(),
    };
    assertSameProfile();
    useQuizStore.getState().addQuiz(deck);
    createdQuizIds.push(deck.id);
    undoOps.push(() => useQuizStore.getState().deleteQuiz(deck.id));
    summaryParts.push(`${cards.length} flashcarduri din „${source.name}"${folder ? ` în „${folder.name}"` : ''}`);
    callbacks.onStep(index, 'done', `${cards.length} carduri`);
    return;
}

  /**
   * Flashcards on a subject rather than a library course. Without this the
   * planner had no valid action for "fă-mi 30 de flashcarduri și pune-le
   * în Bac", so it gave up and answered in chat with a table of cards that
   * were never saved anywhere.
   */
export async function runCreateFlashcardsTopic(env: StepEnv): Promise<void> {
  const { step, index, ctx, callbacks, assertSameProfile, createdQuizIds, undoOps, summaryParts, resolveOrCreateQuizFolder } = env;
    const topic = step.topic?.trim();
    if (!topic) throw new Error('Lipsește subiectul pentru flashcarduri.');

    const count = Math.max(1, Math.min(100, step.count ?? 15));
    const allFolders = useFolderStore.getState().folders;
    // Un folder ales explicit are prioritate; din chatul Rezidențiat, fără alegere, cardurile merg în „Rezidențiat / Flashcarduri”.
    const chosen = step.folderId ? allFolders.find((entry) => entry.id === step.folderId) ?? null : null;
    const folder = chosen
      ?? (ctx.residencyScope && !step.folder
        ? useFolderStore.getState().folders.find((entry) => entry.id === ensureFlashcardsRoot()) ?? null
        : resolveOrCreateQuizFolder(step.folder));
    const filedInResidency = ctx.residencyScope || (!!folder && isUnderRezidentiatRoot(folder.id, useFolderStore.getState().folders));
    const result = await generateFlashcardDeck({
      scope: { kind: 'topic', topic },
      count,
      difficulty: step.difficulty ?? 'auto',
      folderId: folder?.id ?? null,
      space: filedInResidency ? 'rezidentiat' : 'general',
      avoidFronts: frontsInFolder(folder?.id ?? null),
    });
    const deck: Quiz = { ...result.deck, category: folder?.name ?? result.deck.category, color: folder?.color ?? result.deck.color };
    assertSameProfile();
    useQuizStore.getState().addQuiz(deck);
    createdQuizIds.push(deck.id);
    undoOps.push(() => useQuizStore.getState().deleteQuiz(deck.id));
    summaryParts.push(`${result.produced} flashcarduri despre „${topic}"${folder ? ` în „${folder.name}"` : ''}`);
    callbacks.onStep(index, 'done', `${result.produced} carduri`);
    return;
}
