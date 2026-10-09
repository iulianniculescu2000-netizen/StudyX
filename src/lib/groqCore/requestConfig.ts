import type { AIRequestTask } from '../../ai/types';
import { estimateTokens } from '../../store/aiUsageStore';
import type { GroqMessage, GroqMessagePart } from './types';

export function buildKnowledgeQuery(messages: GroqMessage[]): string {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUserMsg) return 'Context medical general';
  if (typeof lastUserMsg.content === 'string') {
    return lastUserMsg.content.slice(0, 1200).trim() || 'Context medical general';
  }
  const textPart = lastUserMsg.content.find((p): p is Extract<GroqMessagePart, { type: 'text' }> => p.type === 'text');
  return (textPart?.text ?? '').slice(0, 1200).trim() || 'Context medical general';
}

export const TASK_TEMPERATURE: Record<AIRequestTask, number> = {
  questions: 0.3,
  explanation: 0.3,
  mnemonic: 0.8,
  hint: 0.4,
  chat: 0.5,
  analysis: 0.4,
};

export const TASK_MAX_TOKENS: Record<AIRequestTask, number> = {
  questions: 2200,
  explanation: 1800,
  mnemonic: 300,
  hint: 500,
  chat: 2000,
  analysis: 1000,
};

export function estimateMessagesTokens(messages: GroqMessage[]): number {
  return estimateTokens(messages.reduce((text, message) => text + (typeof message.content === 'string' ? message.content : ''), ''));
}
