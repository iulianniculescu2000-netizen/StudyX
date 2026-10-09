import { clampStudioPackCount, clampStudioQuestionCount } from '../studioGeneration';
import { DEFAULT_EXAM_STYLE, EXAM_STYLE_META } from '../examStyle';
import { type AgentStep } from './types';

export function describeStep(step: AgentStep): string {
  switch (step.action) {
    case 'create_folder':
      return step.parent ? `Creez subfolderul „${step.name}" în „${step.parent}"` : `Creez folderul „${step.name}"`;
    case 'create_library_folder':
      return step.parent
        ? `Creez subfolderul de bibliotecă „${step.name}" în „${step.parent}"`
        : `Creez folderul de bibliotecă „${step.name}"`;
    case 'generate_quiz_pack': {
      const packs = clampStudioPackCount(step.packCount ?? 1);
      const perPack = clampStudioQuestionCount(step.questionsPerPack ?? 10);
      const dest = step.folder ? ` în „${step.folder}"` : '';
      const typeLabel = step.questionType === 'multiple' ? ' (complement multiplu)' : '';
      const countLabel = packs === 1 ? `${perPack} grile` : `${packs}×${perPack} grile`;
      return `Generez ${countLabel}${typeLabel} din „${step.source}"${dest}`;
    }
    case 'generate_quiz_topic': {
      const n = clampStudioQuestionCount(step.questionsPerPack ?? 10);
      const typeLabel = step.questionType === 'multiple' ? ' (complement multiplu)' : '';
      const dest = step.folder ? ` în „${step.folder}"` : '';
      const styleLabel = EXAM_STYLE_META[step.examStyle ?? DEFAULT_EXAM_STYLE].short;
      return `Generez ${n} grile${typeLabel} despre „${step.topic}" · ${styleLabel}${dest}`;
    }
    case 'correct_answer': {
      const src = step.groundedIn === 'course' ? 'confirmat din biblioteca ta' : step.groundedIn === 'general' ? 'din cunoștințe medicale generale — verifică' : 'după observația ta';
      const answer = step.correctLabel ? ` → devine corectă ${step.correctLabel}` : '';
      return `Actualizez răspunsul corect al întrebării${answer} (${src})`;
    }
    case 'generate_from_mistakes': {
      const n = clampStudioQuestionCount(step.count ?? 10);
      const typeLabel = step.questionType === 'multiple' ? ' (complement multiplu)' : '';
      const dest = step.folder ? ` în „${step.folder}"` : '';
      return `Creez ${n} grile de recapitulare${typeLabel} din greșelile tale${dest}`;
    }
    case 'create_flashcards': {
      const cards = Math.max(1, Math.min(100, step.count ?? 15));
      const dest = step.folder ? ` în „${step.folder}"` : '';
      return `Creez ${cards} flashcarduri din „${step.source}"${dest}`;
    }
    case 'create_flashcards_topic': {
      const cards = Math.max(1, Math.min(100, step.count ?? 15));
      const dest = step.folder ? ` în „${step.folder}"` : '';
      return `Creez ${cards} flashcarduri despre „${step.topic}"${dest}`;
    }
    case 'summarize_document':
      return `Rezum cursul „${step.source}"`;
    case 'move_quiz':
      return `Mut setul „${step.quiz}" în „${step.folder}"`;
    case 'rename_quiz':
      return `Redenumesc „${step.quiz}" → „${step.newName}"`;
    case 'create_study_plan': {
      const days = step.studyDays ?? 7;
      const exam = step.examName ? `„${step.examName}"` : 'examen';
      return `Creez plan de studiu ${days} zile pentru ${exam}`;
    }
    case 'delete_quiz':
      return `Șterg setul „${step.quiz}"`;
    case 'rename_folder':
      return `Redenumesc folderul „${step.name}" → „${step.newName}"`;
    case 'delete_folder':
      return `Șterg folderul „${step.name}"`;
    default:
      return 'Acțiune necunoscută';
  }
}
