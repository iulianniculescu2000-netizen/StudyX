/**
 * Conversational agent for StudyX — fațadă subțire.
 *
 * Logica e împărțită în `./agentCore/*` (tipuri, intenții, detecție, planificare,
 * descriere, execuție + pași). Exporturile publice rămân aici neschimbate.
 */
export type {
  AgentActionType,
  AgentStep,
  AgentPlan,
  AgentContext,
  AgentRunResult,
} from './agentCore/types';
export { extractQuizIntent, type QuizIntentOverride } from './agentCore/intent';
export {
  looksLikeAgentCommand,
  isRetryPhrase,
  looksLikeAnswerDispute,
  looksLikePlaceThemRequest,
  PLACE_THEM_QUESTION,
  grantsGeneralKnowledgePermission,
} from './agentCore/detection';
export { proposeAnswerCorrection } from './agentCore/correction';
export { isReferentialTopic, resolveDiscussedTopic, planAgentCommand } from './agentCore/plan';
export { describeStep } from './agentCore/describe';
export { executeAgentPlan } from './agentCore/execute';
