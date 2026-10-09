import { generateQuizPackagesFromSource } from '../../batchQuizGeneration';
import { clampStudioPackCount, clampStudioQuestionCount } from '../../studioGeneration';
import { DEFAULT_EXAM_STYLE, EXAM_STYLE_META, examStyleTags } from '../../examStyle';
import { describeShortfall } from '../../questionTopUp';
import { generateQuestions, generateQuestionsFromTopic, getUserProfile } from '../../../../ai/AIEngine';
import { generateFromMistakes, getWeakTopicsForProfile } from '../../../../ai/UserProfile';
import { useQuizStore } from '../../../../store/quizStore';
import { useFolderStore } from '../../../../store/folderStore';
import { useAIStore } from '../../../../store/aiStore';
import { isUnderRezidentiatRoot } from '../../../rezidentiatRoot';
import { ensureResidencyFolder, ensureTopicFolder, isResidencySource } from '../../../rezidentiatPlacement';
import { scopedReadySources } from '../../sourceScope';
import { type Difficulty, type Question, type Quiz } from '../../../../types';
import { findByName, shortId } from '../shared';
import { type StepEnv } from './env';

export async function runGenerateQuizPack(env: StepEnv): Promise<void> {
  const { step, index, ctx, callbacks, activeProfileId, assertSameProfile, createdQuizIds, errors, undoOps, summaryParts, resolveOrCreateQuizFolder } = env;
    const source = findByName(
      scopedReadySources(ctx.residencyScope ? 'rezidentiat' : 'general'),
      step.source,
    );
    if (!source) throw new Error(`Nu am găsit cursul „${step.source ?? '?'}" în bibliotecă.`);
    // Rezidențiat material (from that thread, or from a book in that section) is filed into
    // Rezidențiat → discipline → specialty unless the user named another folder.
    const packForResidency = !step.folder && (ctx.residencyScope || isResidencySource(source, useAIStore.getState().libraryFolders));
    const folder = packForResidency ? null : resolveOrCreateQuizFolder(step.folder);
    const packCount = clampStudioPackCount(step.packCount ?? ctx.defaultPackCount);
    const questionsPerPack = clampStudioQuestionCount(step.questionsPerPack ?? ctx.defaultQuestionsPerPack);

    const result = await generateQuizPackagesFromSource({
      sourceId: source.id,
      sourceName: source.name,
      folder,
      folderId: folder?.id ?? null,
      packCount,
      questionsPerPack,
      difficulty: (step.difficulty ?? 'auto') as Difficulty | 'auto',
      questionType: step.questionType ?? 'single',
      examStyle: step.examStyle ?? DEFAULT_EXAM_STYLE,
      activeProfileId,
      existingQuizzes: useQuizStore.getState().quizzes,
    });

    // Created only now that there is something to file, so a failed run leaves no empty folders.
    const packTarget = packForResidency ? ensureResidencyFolder(source.name, null) : folder;
    result.quizzes.forEach((rawQuiz) => {
      const quiz = packForResidency && packTarget
        ? { ...rawQuiz, folderId: packTarget.id, category: packTarget.name, tags: [...new Set([...(rawQuiz.tags ?? []), 'rezidentiat'])] }
        : rawQuiz;
      assertSameProfile();
      useQuizStore.getState().addQuiz(quiz);
      createdQuizIds.push(quiz.id);
      undoOps.push(() => useQuizStore.getState().deleteQuiz(quiz.id));
    });
    // Warn when the AI failed and questions came from the local fallback —
    // otherwise the user silently gets low-quality, copied-sentence questions.
    const totalGenerated = result.aiQuestionCount + result.fallbackQuestionCount;
    const mostlyFallback = totalGenerated > 0 && result.fallbackQuestionCount >= totalGenerated / 2;
    if (mostlyFallback) {
      errors.push(`„${source.name}": AI-ul nu a răspuns, am folosit generare locală de rezervă (calitate redusă). Cel mai probabil e o limită de utilizare sau o cheie nevalidă — verifică Setări AI și încearcă din nou.`);
    }
    if (result.medicallyFlaggedCount > 0) {
      errors.push(`„${source.name}": ${result.medicallyFlaggedCount} întrebări eliminate de verificarea medicală (răspuns marcat greșit).`);
    }
    // Names the folder it ACTUALLY resolved to, not just the raw name the
    // planner asked for — those can differ (fuzzy name match landed on an
    // unexpected existing folder, or none matched and a new one got
    // created) and the user has no other way to find out where content
    // went without this line.
    summaryParts.push(`${result.quizzes.length} seturi din „${source.name}"${packTarget ? ` în „${packTarget.name}"` : ''}`);
    callbacks.onStep(
      index,
      mostlyFallback ? 'error' : 'done',
      mostlyFallback ? `${result.quizzes.length} seturi (rezervă locală — verifică cheia AI)` : `${result.quizzes.length} seturi`,
    );
    return;
}

export async function runCorrectAnswer(env: StepEnv): Promise<void> {
  const { step, index, callbacks, undoOps, summaryParts } = env;
    if (!step.quizId || !step.questionId || !step.correctOptionIds?.length) {
      throw new Error('Date lipsă pentru corectarea răspunsului.');
    }
    const targetQuiz = useQuizStore.getState().quizzes.find((q) => q.id === step.quizId);
    if (!targetQuiz) throw new Error('Grila nu mai există.');
    const qIndex = targetQuiz.questions.findIndex((q) => q.id === step.questionId);
    if (qIndex === -1) throw new Error('Întrebarea nu mai există în grilă (poate a fost editată).');

    const previousQuestions = targetQuiz.questions;
    const correctIds = new Set(step.correctOptionIds);
    const updatedQuestion: Question = {
      ...previousQuestions[qIndex],
      options: previousQuestions[qIndex].options.map((o) => ({ ...o, isCorrect: correctIds.has(o.id) })),
      multipleCorrect: correctIds.size > 1,
    };
    const nextQuestions = previousQuestions.map((q, i) => (i === qIndex ? updatedQuestion : q));
    useQuizStore.getState().updateQuiz(targetQuiz.id, { questions: nextQuestions });
    undoOps.push(() => useQuizStore.getState().updateQuiz(targetQuiz.id, { questions: previousQuestions }));
    summaryParts.push(`răspuns corectat în „${targetQuiz.title}"`);
    callbacks.onStep(index, 'done', 'Răspuns actualizat');
    return;
}

export async function runGenerateQuizTopic(env: StepEnv): Promise<void> {
  const { step, index, ctx, callbacks, activeProfileId, assertSameProfile, createdQuizIds, errors, undoOps, summaryParts, resolveOrCreateQuizFolder } = env;
    if (!step.topic) throw new Error('Lipsește subiectul grilelor.');
    const count = clampStudioQuestionCount(step.questionsPerPack ?? ctx.defaultQuestionsPerPack);
    const profile = activeProfileId ? getUserProfile(activeProfileId) : null;
    const difficulty = (step.difficulty && step.difficulty !== 'auto' ? step.difficulty : profile?.currentDifficulty ?? 'medium') as Difficulty;

    // NOT generateQuestions() — that always grounds in the user's library (RAG),
    // which silently mixes in unrelated content when the topic isn't covered
    // there (e.g. asking for "mielom multiplu" pulled in dermatology chunks).
    // A freeform topic like this should use general medical knowledge only.
    const result = await generateQuestionsFromTopic(
      step.topic,
      count,
      difficulty,
      step.questionType ?? 'single',
      profile,
      step.examStyle ?? DEFAULT_EXAM_STYLE,
    );
    if (result.questions.length === 0) throw new Error(`Nu am putut genera grile despre „${step.topic}".`);
    // Raport cinstit: „ai cerut 5, am reușit 3 — …”, după rundele de completare (vezi `fillShortfall`).
    errors.push(...describeShortfall(step.topic, {
      requested: result.requested ?? count,
      received: result.questions.length,
      rounds: result.topUpRounds ?? 0,
      medicallyFlaggedCount: result.medicallyFlaggedCount,
      malformedDroppedCount: result.malformedDroppedCount,
    }));

    // A topic asked for from the Rezidențiat thread goes to the specialty it belongs to
    // (mielom multiplu → Hematologie), not to the section's root where nothing lists it.
    const topicForResidency = ctx.residencyScope && !step.folder && !step.folderId;
    const chosenFolder = step.folderId ? useFolderStore.getState().folders.find((entry) => entry.id === step.folderId) ?? null : null;
    const folder = chosenFolder ?? (topicForResidency ? ensureTopicFolder(step.topic) : resolveOrCreateQuizFolder(step.folder));
    // Un folder ales sub Rezidențiat face din set o grilă de Rezidențiat (apare acolo, nu în „Toate grilele”).
    const filedInResidency = !!folder && isUnderRezidentiatRoot(folder.id, useFolderStore.getState().folders);
    const quiz: Quiz = {
      id: shortId(),
      title: step.topic,
      description: `${result.questions.length} grile generate de AI despre „${step.topic}" · ${EXAM_STYLE_META[step.examStyle ?? DEFAULT_EXAM_STYLE].description}.`,
      emoji: '✨',
      color: folder?.color ?? 'blue',
      category: folder?.name ?? 'Altele',
      kind: 'quiz',
      folderId: folder?.id ?? null,
      shuffleQuestions: true,
      shuffleAnswers: true,
      tags: [...examStyleTags(step.examStyle ?? DEFAULT_EXAM_STYLE), 'topic', ...(topicForResidency || filedInResidency ? ['rezidentiat'] : [])],
      questions: result.questions,
      createdAt: Date.now(),
    };
    assertSameProfile();
      useQuizStore.getState().addQuiz(quiz);
    createdQuizIds.push(quiz.id);
    undoOps.push(() => useQuizStore.getState().deleteQuiz(quiz.id));
    summaryParts.push(`${result.questions.length} grile despre „${step.topic}"${folder ? ` în „${folder.name}"` : ''}`);
    callbacks.onStep(index, 'done', `${result.questions.length} grile`);
    return;
}

export async function runGenerateFromMistakes(env: StepEnv): Promise<void> {
  const { step, index, callbacks, activeProfileId, assertSameProfile, createdQuizIds, errors, undoOps, summaryParts, resolveOrCreateQuizFolder } = env;
    if (!activeProfileId) throw new Error('Nu există profil activ pentru banca de greșeli.');
    const mistakes = generateFromMistakes(activeProfileId);
    if (mistakes.length === 0) {
      throw new Error('Nu am găsit greșeli salvate. Rezolvă întâi câteva grile ca să le pot ținti.');
    }
    const profile = getUserProfile(activeProfileId);
    const weakTopics = getWeakTopicsForProfile(activeProfileId);
    const count = clampStudioQuestionCount(step.count ?? 10);
    const focus = Array.from(new Set(
      mistakes.map((m) => m.missingConcept?.trim() || m.topic?.trim()).filter((t): t is string => Boolean(t)),
    )).slice(0, 8);
    const difficulty = (step.difficulty && step.difficulty !== 'auto'
      ? step.difficulty
      : profile.currentDifficulty) as Difficulty;

    const result = await generateQuestions({
      context: `Recapitulare țintită pe greșelile recurente ale studentului: ${focus.join(', ')}`,
      count,
      difficulty,
      weakTopics,
      userProfile: profile,
      mode: 'standard',
      questionType: step.questionType ?? 'single',
    });
    if (result.questions.length === 0) throw new Error('Nu am putut genera grile din greșeli.');
    if (result.medicallyFlaggedCount) {
      errors.push(`Recapitulare greșeli: ${result.medicallyFlaggedCount} întrebări eliminate de verificarea medicală (răspuns marcat greșit).`);
    }

    const folder = resolveOrCreateQuizFolder(step.folder);
    const quiz: Quiz = {
      id: shortId(),
      title: `Recapitulare greșeli · ${new Date().toLocaleDateString('ro-RO')}`,
      description: `${result.questions.length} grile țintite pe conceptele unde greșești des: ${focus.slice(0, 4).join(', ')}.`,
      emoji: '🎯',
      color: folder?.color ?? 'red',
      category: folder?.name ?? 'Recapitulare',
      kind: 'quiz',
      folderId: folder?.id ?? null,
      shuffleQuestions: true,
      shuffleAnswers: true,
      tags: ['ai', 'remediere', 'greseli'],
      questions: result.questions,
      createdAt: Date.now(),
    };
    assertSameProfile();
      useQuizStore.getState().addQuiz(quiz);
    createdQuizIds.push(quiz.id);
    undoOps.push(() => useQuizStore.getState().deleteQuiz(quiz.id));
    summaryParts.push(`${result.questions.length} grile de recapitulare din greșeli${folder ? ` în „${folder.name}"` : ''}`);
    callbacks.onStep(index, 'done', `${result.questions.length} grile țintite`);
    return;
}

export async function runMoveQuiz(env: StepEnv): Promise<void> {
  const { step, index, callbacks, undoOps, summaryParts, resolveQuizFolder } = env;
    const quiz = findByName(useQuizStore.getState().quizzes.map((q) => ({ name: q.title, id: q.id })), step.quiz);
    const folder = resolveQuizFolder(step.folder);
    if (!quiz) throw new Error(`Nu am găsit setul „${step.quiz ?? '?'}".`);
    const previous = useQuizStore.getState().quizzes.find((q) => q.id === quiz.id)?.folderId ?? null;
    useQuizStore.getState().moveToFolder(quiz.id, folder?.id ?? null);
    undoOps.push(() => useQuizStore.getState().moveToFolder(quiz.id, previous));
    summaryParts.push(`mutat „${quiz.name}"`);
    callbacks.onStep(index, 'done');
    return;
}

export async function runRenameQuiz(env: StepEnv): Promise<void> {
  const { step, index, callbacks, undoOps, summaryParts } = env;
    const quiz = findByName(useQuizStore.getState().quizzes.map((q) => ({ name: q.title, id: q.id })), step.quiz);
    if (!quiz || !step.newName) throw new Error(`Nu am putut redenumi „${step.quiz ?? '?'}".`);
    const previous = useQuizStore.getState().quizzes.find((q) => q.id === quiz.id)?.title ?? '';
    useQuizStore.getState().updateQuiz(quiz.id, { title: step.newName });
    undoOps.push(() => useQuizStore.getState().updateQuiz(quiz.id, { title: previous }));
    summaryParts.push(`redenumit „${step.newName}"`);
    callbacks.onStep(index, 'done');
    return;
}

export async function runDeleteQuiz(env: StepEnv): Promise<void> {
  const { step, index, callbacks, undoOps, summaryParts } = env;
    const match = findByName(useQuizStore.getState().quizzes.map((q) => ({ name: q.title, id: q.id })), step.quiz);
    const target = match ? useQuizStore.getState().quizzes.find((q) => q.id === match.id) : undefined;
    if (!target) throw new Error(`Nu am găsit setul „${step.quiz ?? '?'}".`);
    const snapshot: Quiz = target;
    // Keep the flashcard images: this deletion is undoable, and purging
    // them here left an undone deck with all its pictures missing.
    useQuizStore.getState().deleteQuiz(target.id, { keepImages: true });
    undoOps.push(() => useQuizStore.getState().addQuiz(snapshot));
    summaryParts.push(`șters „${target.title}"`);
    callbacks.onStep(index, 'done');
    return;
}
