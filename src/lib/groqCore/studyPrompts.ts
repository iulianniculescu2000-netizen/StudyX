import { ANSWER_KEY_CHECK_RULE } from '../../ai/promptKit';

/** Shared study payloads: send each answer once, retaining all marked correct options. */
export function buildWrongAnswerPrompt(question: string, chosen: string, correct: string) {
  const student = /am uitat contextul/i.test(chosen)
    ? 'Studentul folosește flashcardul pentru active recall și nu a formulat răspunsul din memorie.'
    : `Răspunsul studentului: ${JSON.stringify(chosen)}`;
  return `${ANSWER_KEY_CHECK_RULE}
Maximum 4–5 propoziții în română: mecanismul decisiv al răspunsului corect (1–2), confuzia din răspunsul ales (1), regula memorabilă/capcana de examen (1). Fără eseu, fără repetarea întrebării sau enumerarea tuturor variantelor.
Întrebare: ${JSON.stringify(question)}
${student}
Cheia de verificat: ${JSON.stringify(correct)}`;
}

export function buildInlineExplanationPrompt(question: string, options: { text: string; isCorrect: boolean }[]) {
  return `${ANSWER_KEY_CHECK_RULE} Pot exista mai multe răspunsuri corecte: verifică toată cheia.
Dacă cheia este corectă, explică pentru un student la medicină: răspunsurile directe și mecanismul decisiv; de ce fiecare variantă greșită pică și când ar deveni corectă; capcana de examen; regula de reținut. Română, concis, fără superficialitate.
Întrebare: ${JSON.stringify(question)}
Variante (corect = marcajul din cheia care trebuie verificată): ${JSON.stringify(options.map(({ text, isCorrect }) => ({ text, corect: isCorrect })))}`;
}
