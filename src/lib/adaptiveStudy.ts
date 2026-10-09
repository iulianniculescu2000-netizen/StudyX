import type { Question, QuestionStat, Quiz } from '../types';
import { isFlashcardDeck } from './deckKind';
import { generateFromMistakes, getWeakTopicsForProfile } from '../ai/UserProfile';

function uid() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

function cloneQuestion(question: Question): Question {
  return {
    ...question,
    id: uid(),
    options: question.options.map((option) => ({ ...option, id: uid() })),
  };
}

function questionFingerprint(question: Question) {
  return `${question.text} ${question.options.filter((option) => option.isCorrect).map((option) => option.text).join(' ')}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

/** Cardurile din pachete de flashcarduri nu sunt grile: într-o sesiune de grile ar apărea ca o variantă unică „corectă". */
function gradedQuizzes(quizzes: Quiz[]): Quiz[] {
  return quizzes.filter((quiz) => !isFlashcardDeck(quiz));
}

function getQuestionStatMap(stats: Record<string, QuestionStat>) {
  return new Map(Object.values(stats).map((stat) => [`${stat.quizId}:${stat.questionId}`, stat] as const));
}

/**
 * Keeps the first (highest-scored, since callers sort by score beforehand) occurrence of each
 * fingerprint. Replaces an O(n^2) `findIndex` scan that recomputed the fingerprint on every
 * comparison with a single pass over a Set.
 */
function dedupeByFingerprint<T extends { question: Question }>(entries: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const entry of entries) {
    const fingerprint = questionFingerprint(entry.question);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    out.push(entry);
  }
  return out;
}

export function buildMistakeFlashcardQuiz(
  profileId: string,
  quizzes: Quiz[],
  stats: Record<string, QuestionStat>,
): Quiz | null {
  const mistakes = generateFromMistakes(profileId);
  const statMap = getQuestionStatMap(stats);

  const questions: Question[] = [];

  for (const mistake of mistakes) {
      const located = quizzes
        .map((quiz) => ({ quiz, question: quiz.questions.find((entry) => entry.id === mistake.questionId) }))
        .find((entry) => entry.question);
      if (!located?.question) continue;

      const original = located.question;
      const stat = statMap.get(`${located.quiz.id}:${original.id}`);
      const answerText = original.options.filter((option) => option.isCorrect).map((option) => option.text).join(', ');

      // Construiește distractori plauzibili din opțiunile greșite ale întrebării originale
      const wrongOptions = original.options
        .filter(o => !o.isCorrect)
        .slice(0, 3)
        .map(o => ({ id: uid(), text: o.text, isCorrect: false }));

      // Dacă nu există destui distractori, adaugă un placeholder
      if (wrongOptions.length === 0) {
        wrongOptions.push({ id: uid(), text: 'Nu știu / Nu-mi amintesc', isCorrect: false });
      }

      questions.push({
        id: uid(),
        text: `Unde ai ezitat: ${original.text}`,
        multipleCorrect: false,
        difficulty: original.difficulty ?? 'medium',
        explanation: [
          mistake.explanation,
          mistake.missingConcept ? `Concept lipsă: ${mistake.missingConcept}.` : '',
          stat ? `Istoric: ${stat.timesWrong} greșeli, ${stat.timesCorrect} răspunsuri corecte.` : '',
        ].filter(Boolean).join(' '),
        tags: [...new Set([...(original.tags ?? []), 'mistake-bank', mistake.topic])],
        options: [
          { id: uid(), text: answerText || mistake.correctAnswer, isCorrect: true },
          ...wrongOptions,
        ],
      });

      if (questions.length >= 20) break;
  }

  if (questions.length === 0) return null;

  return {
    id: uid(),
    title: 'Flashcards din greșeli',
    description: `Carduri create din cele mai importante ${questions.length} greșeli recente.`,
    emoji: '🧠',
    color: 'orange',
    category: 'Altele',
    kind: 'flashcard',
    folderId: null,
    shuffleQuestions: true,
    shuffleAnswers: false,
    tags: ['mistake-bank', 'flashcards', 'recovery'],
    questions,
    createdAt: Date.now(),
  };
}

export function buildWeaknessRecoveryQuiz(
  profileId: string,
  quizzes: Quiz[],
  stats: Record<string, QuestionStat>,
): Quiz | null {
  const weakTopics = getWeakTopicsForProfile(profileId);
  const statMap = getQuestionStatMap(stats);
  const scoredQuestions = gradedQuizzes(quizzes)
    .flatMap((quiz) => quiz.questions.map((question) => {
      const stat = statMap.get(`${quiz.id}:${question.id}`);
      const tags = question.tags ?? [];
      const topicBoost = weakTopics.find((topic) => tags.includes(topic.topic));
      const accuracy = stat ? stat.timesCorrect / Math.max(stat.timesCorrect + stat.timesWrong, 1) : 0.5;
      const dueBoost = stat && stat.nextReview > 0 && stat.nextReview <= Date.now() ? 0.4 : 0;
      const wrongWeight = stat ? Math.min(stat.timesWrong * 0.12, 0.72) : 0;
      const topicWeight = topicBoost ? Math.max((100 - topicBoost.accuracy) / 100, 0.18) : 0;
      const score = dueBoost + wrongWeight + topicWeight + (1 - accuracy) * 0.4;
      return { quiz, question, score };
    }))
    .filter((entry) => entry.score > 0.18)
    .sort((left, right) => right.score - left.score);

  const questions = dedupeByFingerprint(scoredQuestions)
    .slice(0, 12)
    .map((entry) => cloneQuestion(entry.question));

  if (questions.length === 0) return null;

  const focusTopics = weakTopics.slice(0, 3).map((topic) => topic.topic);

  return {
    id: uid(),
    title: 'Sesiune de recuperare focusată',
    description: focusTopics.length > 0
      ? `Sesiune ghidată pentru ${focusTopics.join(', ')}.`
      : 'Sesiune ghidată din întrebările unde ai cea mai mare nevoie de consolidare.',
    emoji: '🎯',
    color: 'red',
    category: 'Altele',
    kind: 'quiz',
    folderId: null,
    shuffleQuestions: true,
    shuffleAnswers: true,
    tags: ['recovery', 'weakness', ...focusTopics],
    questions,
    createdAt: Date.now(),
  };
}

export function buildAdaptiveExamQuiz(
  profileId: string,
  quizzes: Quiz[],
  stats: Record<string, QuestionStat>,
): Quiz | null {
  const weakTopics = getWeakTopicsForProfile(profileId);
  const statMap = getQuestionStatMap(stats);
  const pool = gradedQuizzes(quizzes).flatMap((quiz) => quiz.questions.map((question) => {
    const stat = statMap.get(`${quiz.id}:${question.id}`);
    const attempts = stat ? stat.timesCorrect + stat.timesWrong : 0;
    const accuracy = stat ? stat.timesCorrect / Math.max(attempts, 1) : 0.55;
    const topicPenalty = weakTopics.some((topic) => (question.tags ?? []).includes(topic.topic)) ? 0.25 : 0;
    const difficultyWeight = question.difficulty === 'hard' ? 0.24 : question.difficulty === 'medium' ? 0.16 : 0.08;
    const score = (1 - accuracy) * 0.45 + topicPenalty + difficultyWeight + Math.min(attempts * 0.03, 0.18);
    return { quiz, question, score };
  }));

  const sorted = [...pool].sort((left, right) => right.score - left.score);
  const selected = dedupeByFingerprint(sorted)
    .slice(0, 18)
    .map((entry) => cloneQuestion(entry.question));
  if (selected.length === 0) return null;

  const hardCount = Math.max(4, Math.floor(selected.length * 0.35));
  const mediumCount = Math.max(6, Math.floor(selected.length * 0.4));
  const easyCount = Math.max(2, selected.length - hardCount - mediumCount);

  const easy = selected.filter((question) => (question.difficulty ?? 'medium') === 'easy').slice(0, easyCount);
  const medium = selected.filter((question) => (question.difficulty ?? 'medium') === 'medium').slice(0, mediumCount);
  const hard = selected.filter((question) => (question.difficulty ?? 'medium') === 'hard').slice(0, hardCount);
  const fallback = selected.filter((question) => !easy.includes(question) && !medium.includes(question) && !hard.includes(question));
  const examQuestions = [...easy, ...medium, ...hard, ...fallback].slice(0, 18);

  return {
    id: uid(),
    title: 'Simulare adaptivă de examen',
    description: 'Simulare de examen construită din istoricul tău, cu accent pe lacune și dificultate progresivă.',
    emoji: '🎓',
    color: 'purple',
    category: 'Altele',
    kind: 'quiz',
    folderId: null,
    shuffleQuestions: false,
    shuffleAnswers: true,
    penaltyMode: true,
    tags: ['adaptive-exam', 'simulation', ...weakTopics.slice(0, 2).map((topic) => topic.topic)],
    questions: examQuestions,
    createdAt: Date.now(),
  };
}
