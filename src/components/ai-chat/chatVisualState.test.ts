import { describe, expect, it } from 'vitest';
import { advanceChatVisualRun, deriveChatVisualState, type ChatVisualRun } from './chatVisualState';

describe('chat visual feedback', () => {
  const waiting: ChatVisualRun = { id: 1, context: 'profile:general', state: 'waiting' };
  it('stays neutral for restored history and reflects missing configuration', () => {
    expect(deriveChatVisualState(null, waiting.context, true)).toBe('idle');
    expect(deriveChatVisualState(null, waiting.context, false)).toBe('unconfigured');
  });
  it('moves from request to first token and successful completion', () => {
    const streaming = advanceChatVisualRun(waiting, 1, 'streaming');
    expect(streaming?.state).toBe('streaming');
    expect(advanceChatVisualRun(streaming, 1, 'success')?.state).toBe('success');
  });
  it('does not celebrate a stopped stream, even if its finally completes', () => {
    const stopped = advanceChatVisualRun(waiting, 1, 'stopped');
    expect(advanceChatVisualRun(stopped, 1, 'success')).toBe(stopped);
    expect(advanceChatVisualRun(stopped, 1, 'streaming')).toBe(stopped);
  });
  it('ignores old callbacks after retry starts', () => {
    const retry = { ...waiting, id: 2 };
    expect(advanceChatVisualRun(retry, 1, 'error')).toBe(retry);
    expect(advanceChatVisualRun(retry, 2, 'error')?.state).toBe('error');
  });
  it('does not show another profile or thread activity', () => {
    expect(deriveChatVisualState(waiting, 'profile:rezidentiat', true)).toBe('idle');
    expect(deriveChatVisualState(waiting, 'other:general', false)).toBe('unconfigured');
  });
  it('handles immediate abort directly from waiting without subsequent error contamination', () => {
    const aborted = advanceChatVisualRun(waiting, 1, 'stopped');
    expect(aborted?.state).toBe('stopped');
    expect(advanceChatVisualRun(aborted, 1, 'error')).toBe(aborted);
    expect(advanceChatVisualRun(aborted, 1, 'streaming')).toBe(aborted);
  });
  it('returns unconfigured whenever configured is false and idle is reached', () => {
    const idleRun: ChatVisualRun = { id: 1, context: 'profile:general', state: 'idle' };
    expect(deriveChatVisualState(idleRun, 'profile:general', false)).toBe('unconfigured');
    expect(deriveChatVisualState(idleRun, 'profile:general', true)).toBe('idle');
  });
  it('is idempotent when advancing to the identical state', () => {
    expect(advanceChatVisualRun(waiting, 1, 'waiting')).toBe(waiting);
  });
});
