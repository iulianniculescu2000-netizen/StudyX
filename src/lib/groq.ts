/**
 * Public AI-request API. The implementation lives in `./groqCore/`:
 *   types · keys · errors · providers (chain, sticky fallback) · retry · capabilities ·
 *   governors · requestConfig · requests (groqRequest/groqChat/vision) · streaming ·
 *   validation · questions · flashcards · study.
 * This file only re-exports it, so imports across the app stay `from '…/lib/groq'`.
 */
export type { GroqMessagePart, GroqMessage } from './groqCore/types';
export { GROQ_VISION_MODEL, supportsVision } from './groqCore/types';
export { resetProviderCapabilityMemory } from './groqCore/capabilities';
export { getLastServedModel } from './groqCore/providers';
export { groqRequest, groqChat, groqVisionRequest } from './groqCore/requests';
export { groqStream } from './groqCore/streaming';
export { validateApiKey } from './groqCore/validation';
export type { GeneratedQuestion } from './groqCore/questions';
export { isDuplicateQuestion, isValidQuestion, generateQuestionsFromText, generateClinicalCase } from './groqCore/questions';
export { isDuplicateFlashcard, FlashcardGenerationInterrupted, NoNewFlashcardsError, notesToFlashcards } from './groqCore/flashcards';
export {
  explainWrongAnswer,
  explainAnswerInline,
  generateStudyRecommendation,
  generateWeakSpotReport,
  generateMnemonic,
} from './groqCore/study';
