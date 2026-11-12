/** Salvează rezultatele „Studiază schema” prin mecanismele existente (seturi generate, notițe). Fără AI, fără prompturi. */
import { upsertGeneratedQuiz } from '../generatedQuiz';
import { useNotesStore } from '../../store/notesStore';
import type { Quiz } from '../../types';
import { buildSchemaFlashcards, buildSchemaQuestions, parseSchemaSource, schemaNoteId, schemaNoteText, schemaTitle } from './schemaStudy';

export type StudyOutcome = { ok: true; message: string } | { ok: false; message: string };

const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

function deck(kind: 'quiz' | 'flashcard', title: string, count: number, questions: Quiz['questions']): Quiz {
  const quiz = kind === 'quiz';
  return {
    id: newId(),
    title: `Schemă: ${title}`,
    description: `${count} ${quiz ? 'grile' : 'flashcarduri'} construite din pașii schemei · ${new Date().toLocaleDateString('ro-RO')}.`,
    emoji: quiz ? '🧪' : '🃏',
    color: quiz ? 'blue' : 'purple',
    category: quiz ? 'AI Studio' : 'AI Flashcards',
    kind,
    folderId: null,
    shuffleQuestions: quiz,
    shuffleAnswers: false, // ordinea A–E e deja variată; nu amestecăm
    tags: quiz ? ['ai', 'chat', 'schema'] : ['flashcard', 'ai', 'chat', 'schema'],
    questions,
    createdAt: Date.now(),
  };
}

export function saveSchemaQuiz(code: string): StudyOutcome {
  const diagram = parseSchemaSource(code);
  const built = buildSchemaQuestions(diagram, newId);
  if (!built.ok) return built;
  upsertGeneratedQuiz(deck('quiz', schemaTitle(diagram), built.items.length, built.items));
  return { ok: true, message: `Am salvat ${built.items.length} grile din schemă, în Toate grilele.` };
}

export function saveSchemaFlashcards(code: string): StudyOutcome {
  const diagram = parseSchemaSource(code);
  const built = buildSchemaFlashcards(diagram, newId);
  if (!built.ok) return built;
  upsertGeneratedQuiz(deck('flashcard', schemaTitle(diagram), built.items.length, built.items));
  return { ok: true, message: `Am salvat ${built.items.length} flashcarduri din schemă.` };
}

export function saveSchemaNote(code: string): StudyOutcome {
  if (!code.trim()) return { ok: false, message: 'Schema nu are cod de salvat.' };
  const title = schemaTitle(parseSchemaSource(code));
  useNotesStore.getState().setNote(schemaNoteId(code), schemaNoteText(title, code));
  return { ok: true, message: 'Am salvat schema în Notițe.' };
}
