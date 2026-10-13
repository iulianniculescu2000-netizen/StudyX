export type ChatVisualState = 'idle' | 'waiting' | 'streaming' | 'success' | 'error' | 'stopped' | 'unconfigured';

/** Ephemeral UI feedback; never stored with conversation messages. */
export type ChatVisualRun = { id: number; context: string; state: ChatVisualState };

export function advanceChatVisualRun(run: ChatVisualRun | null, id: number, state: ChatVisualState): ChatVisualRun | null {
  if (!run || run.id !== id || run.state === 'stopped') return run;
  return run.state === state ? run : { ...run, state };
}

export function deriveChatVisualState(run: ChatVisualRun | null, context: string, configured: boolean): ChatVisualState {
  if (run?.context === context && run.state !== 'idle') return run.state;
  return configured ? 'idle' : 'unconfigured';
}
