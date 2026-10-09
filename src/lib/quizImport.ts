import type { QuizImportData, Quiz, Question, Option } from '../types';
import { useFolderStore } from '../store/folderStore';
import { recoverJsonArray } from './ai/jsonRecover';
import { REZIDENTIAT_TAG } from './rezidentiatBank';
import { isUnderRezidentiatRoot } from './rezidentiatRoot';

function generateId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

export function validateQuizSchema(data: unknown): data is QuizImportData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (typeof d.title !== 'string' || !d.title.trim()) return false;
  if (!Array.isArray(d.questions) || d.questions.length === 0) return false;
  for (const q of d.questions as unknown[]) {
    if (!q || typeof q !== 'object') return false;
    const qo = q as Record<string, unknown>;
    if (typeof qo.text !== 'string' || !qo.text.trim()) return false;
    if (!Array.isArray(qo.options) || qo.options.length < 2) return false;
    const hasCorrect = (qo.options as unknown[]).some(
      (o) => o && typeof o === 'object' && (o as Record<string, unknown>).isCorrect === true
    );
    if (!hasCorrect) return false;
  }
  return true;
}

export function parseImportedQuiz(data: QuizImportData, folderId?: string | null): Quiz {
  const questions: Question[] = data.questions.map((q) => ({
    id: generateId(),
    text: q.text,
    imageUrl: q.imageUrl ?? undefined,
    multipleCorrect: q.multipleCorrect ?? false,
    explanation: q.explanation,
    difficulty: q.difficulty,
    tags: q.tags,
    options: q.options.map((o, i) => ({
      id: String.fromCharCode(97 + i),
      text: o.text,
      isCorrect: o.isCorrect,
    } as Option)),
  }));

  return {
    id: generateId(),
    title: data.title,
    description: data.description ?? '',
    emoji: data.emoji ?? '📋',
    category: data.category ?? 'Altele',
    color: data.color ?? 'blue',
    folderId: folderId !== undefined ? folderId : null,
    // Un set importat într-un folder din Rezidențiat e un set de Rezidențiat: apare acolo, nu în „Toate grilele”.
    ...(folderId && isUnderRezidentiatRoot(folderId, useFolderStore.getState().folders) ? { tags: [REZIDENTIAT_TAG] } : {}),
    shuffleQuestions: data.shuffleQuestions ?? false,
    shuffleAnswers: data.shuffleAnswers ?? false,
    questions,
    createdAt: Date.now(),
  };
}

/**
 * External AI chat tools (ChatGPT, Gemini, etc.) rarely return raw JSON — they wrap it in
 * ```json fences, or add a sentence before/after. Strip that so paste-to-import doesn't
 * force the student to hand-edit the response first.
 */
export function extractJsonFromText(raw: string): unknown {
  let text = (raw ?? '').trim();
  if (!text) throw new Error('Nu ai lipit niciun conținut. Lipește răspunsul AI sau alege un fișier JSON.');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
  if (fenced) text = fenced[1].trim();

  const firstBrace = text.search(/[[{]/);
  if (firstBrace > 0) text = text.slice(firstBrace);

  const lastBrace = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (lastBrace >= 0 && lastBrace < text.length - 1) text = text.slice(0, lastBrace + 1);

  try {
    return JSON.parse(text);
  } catch {
    // Răspuns tăiat la jumătate (limită de tokeni): păstrăm obiectele complete.
    const salvaged = recoverJsonArray(text);
    if (salvaged.length > 0) return salvaged;
    throw new Error('Textul nu este JSON valid sau a fost tăiat înainte de primul element complet. Cere AI-ului să regenereze, eventual în bucăți mai mici.');
  }
}

/** Parses one or many quizzes from raw text (file content or pasted AI response) and adds the valid ones. */
export function importQuizzesFromJsonText(
  content: string,
  folderId: string | null | undefined,
  addQuiz: (quiz: Quiz) => void,
): number {
  const raw = extractJsonFromText(content);
  const items: unknown[] = Array.isArray(raw) ? raw : [raw];
  const valid = items.filter(validateQuizSchema);
  if (valid.length === 0) {
    throw new Error('Schema invalidă: lipsesc câmpuri obligatorii (title, questions, options, isCorrect).');
  }
  valid.forEach((item) => addQuiz(parseImportedQuiz(item, folderId)));
  return valid.length;
}

const EXAMPLE_SCHEMA = {
  title: 'Titlul grilei',
  description: 'Scurtă descriere',
  emoji: '📚',
  category: 'Categorie (ex: Anatomie)',
  color: 'blue',
  shuffleQuestions: false,
  shuffleAnswers: false,
  questions: [
    {
      text: 'Textul întrebării',
      multipleCorrect: false,
      difficulty: 'easy',
      explanation: 'Explicație opțională, afișată după răspuns',
      options: [
        { text: 'Răspuns corect', isCorrect: true },
        { text: 'Răspuns greșit 1', isCorrect: false },
        { text: 'Răspuns greșit 2', isCorrect: false },
        { text: 'Răspuns greșit 3', isCorrect: false },
      ],
    },
  ],
};

/** Ready-to-paste prompt for any external AI chat (ChatGPT, Gemini, etc.) that returns our exact import schema. */
export function buildExternalAIPrompt(topicOrText: string, questionCount = 15): string {
  return [
    'Generează o grilă de întrebări pentru studenți la Medicină, în format STRICT JSON, fără text explicativ înainte sau după, fără ```markdown code fences.',
    'Respectă EXACT această schemă (aceleași chei, aceleași tipuri):',
    JSON.stringify(EXAMPLE_SCHEMA, null, 2),
    [
      'Reguli:',
      `- Generează ${questionCount} întrebări dacă subiectul permite (altfel câte poți acoperi corect).`,
      '- Fiecare întrebare are exact 5 opțiuni (A-E) cu un singur "isCorrect": true — formatul de la rezidențiat (sau 5 opțiuni cu 2-3 corecte dacă "multipleCorrect": true).',
      '- Explicațiile sunt scurte, corecte medical, fără informații inventate.',
      '- "color" trebuie să fie una din: blue, purple, green, orange, pink, red, teal.',
      '- "difficulty" este una din: easy, medium, hard.',
      '- Returnează un singur obiect JSON (nu un array), fără text în plus.',
    ].join('\n'),
    topicOrText.trim()
      ? `SUBIECT / TEXT SURSĂ:\n${topicOrText.trim()}`
      : 'Nu am indicat un subiect — alege un subiect relevant de Medicină și menționează-l în "title".',
  ].join('\n\n');
}
