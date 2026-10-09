/**
 * La deschiderea chatului, conversația trebuie să arate ULTIMUL mesaj, nu începutul. Chatul se montează de fiecare dată cu
 * scroll 0, iar derularea veche făcea ceva doar la mesaj nou sau dacă erai deja lângă capăt: la redeschidere rămâneai sus.
 */
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_STORAGE_KEY, useChatMessages, type ChatThread } from './useChatMessages';

type Callback = () => void;
const observers: Callback[] = [];

class FakeResizeObserver {
  private readonly cb: Callback;
  constructor(cb: Callback) { this.cb = cb; }
  observe() { observers.push(this.cb); }
  disconnect() { const at = observers.indexOf(this.cb); if (at >= 0) observers.splice(at, 1); }
  unobserve() {}
}

const layout = { scrollHeight: 2000 };

function Harness({ open, thread = 'general' }: { open: boolean; thread?: ChatThread }) {
  const { chatEndRef, messages } = useChatMessages({ open, calmMotion: true, thread });
  // Ca în aplicație: sertarul (și derulatorul lui) există doar cât e deschis.
  if (!open) return null;
  return (
    <div className="custom-scrollbar" data-testid="scroller">
      <div>
        {messages.map((m, i) => <p key={i}>{m.content}</p>)}
        <div ref={chatEndRef} />
      </div>
    </div>
  );
}

const stored = (n: number) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `mesaj ${i}` })));
const flush = () => act(async () => { vi.advanceTimersByTime(40); });

beforeEach(() => {
  vi.useFakeTimers();
  observers.length = 0;
  layout.scrollHeight = 2000;
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get() { return layout.scrollHeight; } });
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get() { return (this as unknown as { __st?: number }).__st ?? 0; },
    set(value: number) { (this as unknown as { __st?: number }).__st = value; },
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  localStorage.clear();
  localStorage.setItem(CHAT_STORAGE_KEY, stored(30));
  localStorage.setItem(`${CHAT_STORAGE_KEY}:rezidentiat`, stored(12));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight;
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollTop;
});

const scrollerOf = (container: HTMLElement) => container.querySelector('[data-testid="scroller"]') as HTMLElement;

describe('chatul se deschide la ultimul mesaj', () => {
  it('la prima deschidere', async () => {
    const view = render(<Harness open />);
    await flush();
    expect(scrollerOf(view.container).scrollTop).toBe(2000);
  });

  it('la REDESCHIDERE cu aceleași mesaje (cazul „mă ia de sus”)', async () => {
    const view = render(<Harness open />);
    await flush();
    view.rerender(<Harness open={false} />);
    await flush();
    view.rerender(<Harness open />);
    await flush();
    expect(scrollerOf(view.container).scrollTop).toBe(2000);
  });

  it('când conținutul crește după deschidere (markdown/scheme încărcate leneș)', async () => {
    const view = render(<Harness open />);
    await flush();
    layout.scrollHeight = 3400;
    act(() => { observers.forEach((cb) => cb()); });
    expect(scrollerOf(view.container).scrollTop).toBe(3400);
  });

  it('nu te mai trage în jos după ce ai derulat singur', async () => {
    const view = render(<Harness open />);
    await flush();
    const scroller = scrollerOf(view.container);
    scroller.scrollTop = 300;
    act(() => { scroller.dispatchEvent(new Event('wheel', { bubbles: true })); });
    layout.scrollHeight = 3400;
    act(() => { observers.forEach((cb) => cb()); });
    expect(scroller.scrollTop).toBe(300);
  });

  it('la schimbarea conversației (Rezidențiat) merge la ultimul mesaj', async () => {
    const view = render(<Harness open thread="general" />);
    await flush();
    scrollerOf(view.container).scrollTop = 0;
    view.rerender(<Harness open thread="rezidentiat" />);
    await flush();
    expect(scrollerOf(view.container).scrollTop).toBe(2000);
  });

  it('observatorul se oprește după fereastra de așezare', async () => {
    render(<Harness open />);
    await flush();
    expect(observers.length).toBe(1);
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(observers.length).toBe(0);
  });
});
