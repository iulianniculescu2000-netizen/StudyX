import type { EvalCase } from './scoring.ts'
import data from './localEvalSet.json'

/**
 * Setul de 40 de cazuri în română pentru compararea modelelor locale.
 * Sursa de adevăr este localEvalSet.json (citit și de scripts/eval-local-model.mjs).
 */
export const LOCAL_EVAL_SET = data.cases as EvalCase[]
export const LOCAL_EVAL_VERSION: number = data.version
