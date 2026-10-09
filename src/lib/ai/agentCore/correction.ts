import { requestStructured } from '../structured';
import { AnswerVerdictSchema } from '../schemas';
import { useAIStore } from '../../../store/aiStore';
import { useQuizChatContextStore } from '../../../store/quizChatContextStore';
import { type AgentPlan, type AgentStep } from './types';

export interface AnswerVerdict {
  agrees?: boolean;
  correctLetters?: string[];
  reasoning?: string;
}

/**
 * Research the student's claim against the current quiz question: check the
 * library first, and only fall back to general medical knowledge if the
 * student explicitly allowed it. Returns an AgentPlan so the SAME confirm-card
 * UI (AgentJobCard) that folder/generation commands use also handles this —
 * without a needsConfirm step, nothing gets mutated.
 */
export async function proposeAnswerCorrection(claim: string, allowGeneralKnowledge: boolean): Promise<AgentPlan> {
  const ctx = useQuizChatContextStore.getState().context;
  if (!ctx) {
    return { isCommand: false, reply: '', steps: [], needsConfirm: false };
  }

  const kb = await useAIStore.getState().getKnowledgeContext(ctx.questionText, 3000);
  const grounded = kb.trim().length > 0;

  if (!grounded && !allowGeneralKnowledge) {
    return {
      isCommand: true,
      reply: 'Nu găsesc niciun curs legat de această întrebare în Biblioteca AI. Vrei să încerc să apreciez din cunoștințe medicale generale (fără sursă sigură)? Spune „da, din cunoștințele tale" dacă vrei să continui.',
      steps: [],
      needsConfirm: false,
    };
  }

  const optionLines = ctx.options
    .map((o, i) => `${String.fromCharCode(97 + i)}) ${o.text}${o.isCorrect ? '  [marcat corect acum]' : ''}`)
    .join('\n');
  const prompt = [
    'Ești examinator de Medicină. Un student contestă răspunsul corect marcat la o grilă.',
    `Întrebare: ${ctx.questionText}`,
    `Variante:\n${optionLines}`,
    `Afirmația studentului: "${claim}"`,
    grounded
      ? `Context relevant din biblioteca studentului — folosește-l ca sursă principală:\n${kb}`
      : 'Nu există context din bibliotecă pentru această întrebare — folosește DOAR cunoștințe medicale generale, stabile, și marchează asta clar în reasoning.',
    'Răspunde STRICT cu JSON, fără text în plus: {"agrees": true|false, "correctLetters": ["a"], "reasoning": "1-2 propoziții, în română"}',
    '"agrees": ești de acord că e nevoie să schimbi ce e marcat corect acum. "correctLetters": literele care AR TREBUI să fie marcate corecte (poate fi identic cu ce e marcat acum dacă agrees:false). Nu inventa fapte medicale.',
  ].join('\n\n');

  let parsed: AnswerVerdict | null = null;
  try {
    const result = await requestStructured({
      schema: AnswerVerdictSchema,
      schemaHint: '{"agrees":true|false,"correctLetters":["a"],"reasoning":"..."}',
      label: 'answerVerdict',
      task: 'analysis',
      messages: [{ role: 'user', content: prompt }],
      skipLibraryContext: true,
      temperature: 0.2,
    });
    if (!result.ok) throw new Error(result.error);
    parsed = result.data;
  } catch {
    return { isCommand: true, reply: 'Nu am putut verifica afirmația acum — încearcă din nou.', steps: [], needsConfirm: false };
  }

  if (!parsed?.agrees || !Array.isArray(parsed.correctLetters) || parsed.correctLetters.length === 0) {
    return {
      isCommand: true,
      reply: parsed?.reasoning ? `Am verificat: ${parsed.reasoning}` : 'Am verificat și răspunsul marcat acum pare corect — nu am motive să-l schimb.',
      steps: [],
      needsConfirm: false,
    };
  }

  const letterToIdx = (l: string) => l.trim().toLowerCase().charCodeAt(0) - 97;
  const correctOptionIds = [...new Set(parsed.correctLetters.map(letterToIdx))]
    .filter((i) => i >= 0 && i < ctx.options.length)
    .map((i) => ctx.options[i].id);

  if (correctOptionIds.length === 0) {
    return {
      isCommand: true,
      reply: 'Am înțeles că vrei o corectare, dar nu am putut identifica exact varianta — specifică litera (a/b/c/d/e).',
      steps: [],
      needsConfirm: false,
    };
  }

  // Resolved from the final (deduped, in-range) correctOptionIds rather than the raw
  // model output, so the label always matches exactly what execution will apply.
  const correctLabel = correctOptionIds.length === 1
    ? `varianta ${String.fromCharCode(65 + ctx.options.findIndex((o) => o.id === correctOptionIds[0]))}`
    : `variantele ${correctOptionIds
        .map((id) => String.fromCharCode(65 + ctx.options.findIndex((o) => o.id === id)))
        .join(', ')}`;

  const step: AgentStep = {
    action: 'correct_answer',
    quizId: ctx.quizId,
    questionId: ctx.questionId,
    correctOptionIds,
    correctLabel,
    reasoning: parsed.reasoning,
    groundedIn: grounded ? 'course' : 'general',
  };

  return {
    isCommand: true,
    reply: `${parsed.reasoning ?? 'Am verificat afirmația ta.'} ${grounded ? '(confirmat din biblioteca ta)' : '(din cunoștințe generale — te rog verifică oricum)'}`,
    steps: [step],
    needsConfirm: true,
    confirmReason: 'Modific răspunsul corect salvat al acestei întrebări.',
  };
}

/** Render each folder as its full "Parent / Child" path so the planner can see
 *  the subfolder hierarchy and target a nested folder by name. */
