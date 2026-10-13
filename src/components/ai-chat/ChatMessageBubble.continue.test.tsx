import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from '../../theme/ThemeContext';
import ChatMessageBubble, { type ChatMessageActions } from './ChatMessageBubble';
import type { ChatMessage } from './shared';

vi.mock('./AIMarkdown', () => ({ default: ({ content }: { content: string }) => <div>{content}</div> }));
vi.mock('./AIOrb', () => ({ default: () => null }));
vi.mock('./CrossCheckCard', () => ({ default: () => null }));

const noop = () => undefined;
const makeActions = (overrides: Partial<ChatMessageActions> = {}): ChatMessageActions => ({
  toggleCitation: noop, openBook: noop, copy: noop, saveFlashcard: noop, makeQuiz: noop, regenerate: noop, continueAnswer: noop,
  retryError: noop, switchModel: noop, suggest: noop, setCrossCheck: noop, runAgent: noop, cancelAgent: noop, undoAgent: noop,
  retryAgent: noop, editAgentParams: noop, go: noop, editOptionCard: noop, submitOptionCard: noop, cancelOptionCard: noop,
  ...overrides,
});

function Harness({ message, isLast = true, streaming = false, actions }: { message: ChatMessage; isLast?: boolean; streaming?: boolean; actions: ChatMessageActions }) {
  const theme = useTheme();
  return (
    <ChatMessageBubble
      message={message} index={3} isLastAssistant={isLast} streaming={streaming} question="Ce e HTA?" activeCitationKey={null}
      agentResult={null} fallbackMode="grounded" theme={theme} calmMotion actions={actions}
    />
  );
}
const mount = (message: ChatMessage, opts: { isLast?: boolean; streaming?: boolean; actions?: ChatMessageActions } = {}) =>
  render(<ThemeProvider><Harness message={message} isLast={opts.isLast} streaming={opts.streaming} actions={opts.actions ?? makeActions()} /></ThemeProvider>);

const answer = (extra: Partial<ChatMessage> = {}): ChatMessage => ({ role: 'assistant', content: 'HTA este creșterea persistentă a presiunii și apare când', ...extra });

describe('„Continuă” pe un răspuns tăiat', () => {
  it('apare pe ultimul răspuns tăiat și cheamă acțiunea cu indexul mesajului', () => {
    const continueAnswer = vi.fn();
    mount(answer({ truncated: true }), { actions: makeActions({ continueAnswer }) });
    fireEvent.click(screen.getByText('Continuă'));
    expect(continueAnswer).toHaveBeenCalledWith(3);
  });

  it('nu apare pe un răspuns terminat, pe unul vechi, în timpul scrierii sau pe o eroare', () => {
    const { unmount } = mount(answer());
    expect(screen.queryByText('Continuă')).toBeNull();
    unmount();
    const old = mount(answer({ truncated: true }), { isLast: false });
    expect(old.queryByText('Continuă')).toBeNull();
    old.unmount();
    const writing = mount(answer({ truncated: true }), { streaming: true });
    expect(writing.queryByText('Continuă')).toBeNull();
    writing.unmount();
    mount(answer({ truncated: true, isError: true }));
    expect(screen.queryByText('Continuă')).toBeNull();
  });
});

describe('insigna „cine a răspuns”', () => {
  it('arată furnizorul și modelul sub răspuns', () => {
    mount(answer({ served: { provider: 'groq', model: 'openai/gpt-oss-120b', local: false } }));
    expect(screen.getByText('Groq · gpt-oss-120b')).toBeTruthy();
  });

  it('nu apare pe mesaje fără informație, în timpul scrierii sau pe erori', () => {
    const { unmount } = mount(answer());
    expect(screen.queryByTitle('Cine a scris acest răspuns')).toBeNull();
    unmount();
    const writing = mount(answer({ served: { provider: 'groq', model: 'm', local: false } }), { streaming: true });
    expect(writing.queryByTitle('Cine a scris acest răspuns')).toBeNull();
    writing.unmount();
    mount(answer({ served: { provider: 'groq', model: 'm', local: false }, isError: true }));
    expect(screen.queryByTitle('Cine a scris acest răspuns')).toBeNull();
  });
});
