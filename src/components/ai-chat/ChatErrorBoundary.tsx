import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useUIStore } from '../../store/uiStore';

interface State { error: Error | null }

/**
 * Keeps a failure inside the chat from taking the whole app down with it: the rest of StudyX stays usable and the chat
 * offers a one-tap retry (which also closes it, so the next open starts from a clean mount).
 */
export default class ChatErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Chat] A rendering error was contained', error, info.componentStack);
  }

  private retry = () => {
    useUIStore.getState().setChatOpen(false);
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className="fixed bottom-6 right-6 z-[9999] flex max-w-[320px] items-center gap-3 rounded-[var(--r-lg)] border px-4 py-3 text-[13px]"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)', boxShadow: 'var(--elev-3)' }}
      >
        <span className="min-w-0 flex-1">Chatul a întâmpinat o problemă, dar restul aplicației merge.</span>
        <button
          type="button"
          onClick={this.retry}
          className="press-feedback flex-shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold text-white"
          style={{ background: 'var(--accent)' }}
        >
          Reîncearcă
        </button>
      </div>
    );
  }
}
